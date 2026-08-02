import {
  collection, addDoc, doc, updateDoc, serverTimestamp, writeBatch,
  query, where, getDocs,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Role } from "./rbac";
import { notifyShiftAssigned, notifyShiftUpdated, notifyShiftCancelled } from "./notifications";
import { logAction } from "./audit";

// ══════════════════════════════════════════════════════════════════════════
// SHIFT SCHEDULING — data layer for the Operations Manager's Shift
// Scheduling module.
//
// MODEL: one Firestore document per shift OCCURRENCE (not one doc per
// recurring "series definition"). A recurring shift is expanded up-front
// into individual dated documents that share a `seriesId`. This keeps every
// read a plain date-range query (no client-side rule expansion needed for
// the calendar/day/week/month views or for "who's on duty now"), at the
// cost of writing more documents up front — capped by MAX_OCCURRENCES so a
// mistaken "repeat forever" can't fan out unboundedly.
// ══════════════════════════════════════════════════════════════════════════

export const MAX_OCCURRENCES = 60; // ≈ 8-12 weeks of a daily/weekly pattern
const DEFAULT_SERIES_MONTHS = 3; // if no explicit end date is given

export interface ShiftRecurrence {
  type: "none" | "daily" | "weekly";
  /** 0=Sun..6=Sat. Required when type === "weekly". */
  daysOfWeek?: number[];
  /** Inclusive end date "YYYY-MM-DD" for the series. Defaults to +3 months. */
  until?: string;
}

export interface ShiftDoc {
  id: string;
  role: Role;
  staffId: string;
  staffName: string;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  endsNextDay: boolean;
  label: string;
  notes: string | null;
  seriesId: string | null;
  status: "scheduled" | "cancelled";
  createdBy: string;
  createdByName: string;
  createdAt: unknown;
  updatedAt?: unknown;
}

export interface ShiftInput {
  role: Role;
  staffId: string;
  staffName: string;
  date: string;
  startTime: string;
  endTime: string;
  endsNextDay?: boolean;
  label: string;
  notes?: string;
  recurrence: ShiftRecurrence;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Overlap check on a rolling 48h timeline so overnight shifts compare correctly. */
export function shiftsOverlap(
  aStart: string, aEnd: string, aNext: boolean,
  bStart: string, bEnd: string, bNext: boolean
): boolean {
  const aS = toMinutes(aStart);
  let aE = toMinutes(aEnd) + (aNext ? 1440 : 0);
  if (aE <= aS) aE += 1440;
  const bS = toMinutes(bStart);
  let bE = toMinutes(bEnd) + (bNext ? 1440 : 0);
  if (bE <= bS) bE += 1440;
  return aS < bE && bS < aE;
}

function addDays(dateStr: string, days: number): Date {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Expand a start date + recurrence rule into a bounded list of "YYYY-MM-DD" occurrence dates. */
export function generateOccurrenceDates(startDate: string, recurrence: ShiftRecurrence): string[] {
  if (recurrence.type === "none") return [startDate];

  const start = new Date(`${startDate}T00:00:00`);
  const cap = addDays(startDate, 0);
  cap.setMonth(cap.getMonth() + DEFAULT_SERIES_MONTHS);
  const until = recurrence.until ? new Date(`${recurrence.until}T00:00:00`) : cap;

  const dates: string[] = [];
  let cursor = new Date(start);
  let guard = 0;
  while (cursor <= until && dates.length < MAX_OCCURRENCES && guard < 400) {
    guard++;
    if (recurrence.type === "daily") {
      dates.push(toDateKey(cursor));
    } else if (recurrence.type === "weekly") {
      const dow = cursor.getDay();
      if (!recurrence.daysOfWeek || recurrence.daysOfWeek.length === 0 || recurrence.daysOfWeek.includes(dow)) {
        dates.push(toDateKey(cursor));
      }
    }
    cursor = addDays(toDateKey(cursor), 1);
  }
  return dates;
}

/** Fetch every active (non-cancelled) shift currently on file for one staff member. */
export async function getStaffShifts(staffId: string): Promise<ShiftDoc[]> {
  const snap = await getDocs(query(collection(db, "shifts"), where("staffId", "==", staffId)));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }) as ShiftDoc)
    .filter(s => s.status !== "cancelled");
}

export interface ConflictInfo {
  date: string;
  withLabel: string;
  withTime: string;
}

/** Check a candidate set of occurrence dates/times against a staff member's existing shifts. */
export function findConflicts(
  candidateDates: string[],
  startTime: string,
  endTime: string,
  endsNextDay: boolean,
  existing: ShiftDoc[],
  excludeShiftId?: string
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];
  for (const date of candidateDates) {
    const sameDay = existing.filter(s => s.id !== excludeShiftId && s.date === date);
    for (const s of sameDay) {
      if (shiftsOverlap(startTime, endTime, endsNextDay, s.startTime, s.endTime, s.endsNextDay)) {
        conflicts.push({ date, withLabel: s.label, withTime: `${s.startTime}–${s.endTime}` });
      }
    }
  }
  return conflicts;
}

/**
 * Create a shift (or a full recurring series). Always conflict-checks first
 * and refuses to write if the staff member is already booked — callers
 * should surface `conflicts` to the Operations Manager rather than retry.
 */
export async function createShift(
  input: ShiftInput,
  createdBy: { id: string; name: string }
): Promise<{ ok: true; count: number } | { ok: false; conflicts: ConflictInfo[] }> {
  const dates = generateOccurrenceDates(input.date, input.recurrence);
  const existing = await getStaffShifts(input.staffId);
  const conflicts = findConflicts(dates, input.startTime, input.endTime, !!input.endsNextDay, existing);
  if (conflicts.length > 0) return { ok: false, conflicts };

  const seriesId = input.recurrence.type !== "none" ? crypto.randomUUID() : null;

  // Firestore batches cap at 500 writes; MAX_OCCURRENCES (60) keeps us well under that.
  const batch = writeBatch(db);
  const refs: ReturnType<typeof doc>[] = [];
  for (const date of dates) {
    const ref = doc(collection(db, "shifts"));
    refs.push(ref);
    batch.set(ref, {
      role: input.role,
      staffId: input.staffId,
      staffName: input.staffName,
      date,
      startTime: input.startTime,
      endTime: input.endTime,
      endsNextDay: !!input.endsNextDay,
      label: input.label,
      notes: input.notes || null,
      seriesId,
      status: "scheduled",
      createdBy: createdBy.id,
      createdByName: createdBy.name,
      createdAt: serverTimestamp(),
    });
  }
  await batch.commit();

  await logAction(createdBy.id, createdBy.name, "shift_created", "shifts", refs[0].id,
    null, { staffName: input.staffName, date: input.date, count: dates.length }, "operations_manager");

  const dateSummary = dates.length > 1 ? `${dates[0]} → ${dates[dates.length - 1]} (${dates.length} shifts)` : dates[0];
  notifyShiftAssigned([input.staffId], [input.staffName], input.label, dateSummary, input.startTime, input.endTime, createdBy.name)
    .catch(() => {});

  return { ok: true, count: dates.length };
}

/** Edit a single shift occurrence — time, staff assignment, label, or notes. */
export async function updateShiftInstance(
  shift: ShiftDoc,
  updates: Partial<Pick<ShiftDoc, "staffId" | "staffName" | "startTime" | "endTime" | "endsNextDay" | "label" | "notes">>,
  updatedBy: { id: string; name: string }
): Promise<{ ok: true } | { ok: false; conflicts: ConflictInfo[] }> {
  const merged = { ...shift, ...updates };
  const staffId = merged.staffId;
  const existing = await getStaffShifts(staffId);
  const conflicts = findConflicts([merged.date], merged.startTime, merged.endTime, merged.endsNextDay, existing, shift.id);
  if (conflicts.length > 0) return { ok: false, conflicts };

  await updateDoc(doc(db, "shifts", shift.id), {
    ...updates,
    updatedAt: serverTimestamp(),
    updatedBy: updatedBy.id,
    updatedByName: updatedBy.name,
  });
  await logAction(updatedBy.id, updatedBy.name, "shift_updated", "shifts", shift.id, shift, merged, "operations_manager");

  const reassigned = updates.staffId && updates.staffId !== shift.staffId;
  if (reassigned) {
    notifyShiftAssigned([merged.staffId], [merged.staffName], merged.label, merged.date, merged.startTime, merged.endTime, updatedBy.name).catch(() => {});
  } else {
    notifyShiftUpdated([merged.staffId], merged.label, merged.date, updatedBy.name).catch(() => {});
  }
  return { ok: true };
}

/** Cancel a single shift occurrence. */
export async function cancelShiftInstance(shift: ShiftDoc, cancelledBy: { id: string; name: string }): Promise<void> {
  await updateDoc(doc(db, "shifts", shift.id), {
    status: "cancelled",
    updatedAt: serverTimestamp(),
    updatedBy: cancelledBy.id,
    updatedByName: cancelledBy.name,
  });
  await logAction(cancelledBy.id, cancelledBy.name, "shift_cancelled", "shifts", shift.id, { status: shift.status }, { status: "cancelled" }, "operations_manager");
  notifyShiftCancelled([shift.staffId], shift.label, shift.date, cancelledBy.name).catch(() => {});
}

/** Cancel every future occurrence (date >= fromDate) in a recurring series. */
export async function cancelShiftSeries(
  seriesShifts: ShiftDoc[],
  fromDate: string,
  cancelledBy: { id: string; name: string }
): Promise<void> {
  const toCancel = seriesShifts.filter(s => s.date >= fromDate && s.status !== "cancelled");
  if (toCancel.length === 0) return;
  const batch = writeBatch(db);
  for (const s of toCancel) {
    batch.update(doc(db, "shifts", s.id), {
      status: "cancelled", updatedAt: serverTimestamp(),
      updatedBy: cancelledBy.id, updatedByName: cancelledBy.name,
    });
  }
  await batch.commit();
  await logAction(cancelledBy.id, cancelledBy.name, "shift_series_cancelled", "shifts", toCancel[0].id,
    null, { count: toCancel.length }, "operations_manager");
  const byStaff = new Map<string, string>();
  toCancel.forEach(s => byStaff.set(s.staffId, s.label));
  byStaff.forEach((label, staffId) => notifyShiftCancelled([staffId], label, fromDate, cancelledBy.name).catch(() => {}));
}

/** Is this shift currently in progress, given "now"? Handles overnight shifts. */
export function isOnDutyNow(shift: ShiftDoc, now: Date): boolean {
  if (shift.status === "cancelled") return false;
  const todayKey = toDateKey(now);
  const yesterdayKey = toDateKey(addDays(todayKey, -1));
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (shift.date === todayKey) {
    const start = toMinutes(shift.startTime);
    let end = toMinutes(shift.endTime) + (shift.endsNextDay ? 1440 : 0);
    if (end <= start) end += 1440;
    return nowMinutes >= start && nowMinutes < Math.min(end, 1440) || (shift.endsNextDay && nowMinutes < toMinutes(shift.endTime));
  }
  // A shift that started yesterday and rolls into today.
  if (shift.date === yesterdayKey && shift.endsNextDay) {
    return nowMinutes < toMinutes(shift.endTime);
  }
  return false;
}
