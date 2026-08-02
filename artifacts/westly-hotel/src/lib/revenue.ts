import { useMemo } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useCollection } from "@/hooks/useFirebase";
import { logAction } from "@/lib/audit";
import { notifyPaymentApproved } from "@/lib/notifications";
import { toFirestoreDate } from "@/lib/utils";
import {
  format,
  startOfDay, endOfDay,
  startOfWeek, endOfWeek,
  startOfMonth, endOfMonth,
  startOfYear, endOfYear,
} from "date-fns";
import type { AdminUser } from "@/contexts/AuthContext";
import type { Role } from "@/lib/rbac";

// ══════════════════════════════════════════════════════════════════════════════
// UNIFIED REVENUE LEDGER
//
// This is the ONE place that turns the app's three income-producing
// collections — `payments` (room bookings + walk-ins), `sales` (retail /
// staff sales), and `orders` (restaurant / waiter sales) — into a single,
// consistently-shaped list of RevenueTransaction records.
//
// Every financial page (Revenue Dashboard, Payments, Financial Reports,
// Accountant dashboards, the Approvals workspace) must build its numbers by
// calling useRevenueLedger() and filtering/aggregating the result with the
// helpers below, instead of independently querying `payments`/`sales`/
// `orders` and re-implementing their own category or date logic. That
// divergence — different pages summing different fields, or forgetting to
// count `walk_in_payment` — was the root cause of the mismatched totals.
//
// A transaction only counts toward company revenue once an Accountant has
// approved it (approvalStatus === "approved"). New records are created as
// "pending" by the page that generates them (checkout, walk-in, new sale,
// new order) and only move to "approved"/"rejected" via approveTransaction/
// rejectTransaction below, which always writes to the underlying source
// document (so there is exactly one record per transaction — no duplication)
// and always leaves an audit trail.
// ══════════════════════════════════════════════════════════════════════════════

export type ApprovalStatus = "pending" | "approved" | "rejected";
export type RevenueCategory = "room" | "restaurant" | "sales" | "bar" | "laundry" | "other";
export type SourceCollection = "payments" | "sales" | "orders" | "bar_orders" | "laundry_requests";

export interface RevenueTransaction {
  id: string;
  sourceCollection: SourceCollection;
  category: RevenueCategory;
  categoryLabel: string;
  typeLabel: string;
  guestName: string;
  amount: number;
  paymentMethod: string;
  date: Date | null;
  recordedBy: string | null;
  recordedByName: string;
  approvalStatus: ApprovalStatus;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: Date | null;
  rejectedReason?: string | null;
  raw: any;
}

export const CATEGORY_LABELS: Record<RevenueCategory, string> = {
  room: "Room Revenue",
  restaurant: "Restaurant Revenue",
  sales: "Sales Revenue",
  bar: "Bar Revenue",
  laundry: "Laundry Revenue",
  other: "Other Income",
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  room_payment: "Room Payment",
  walk_in_payment: "Walk-In Payment",
  deposit: "Deposit",
  refund: "Refund",
  other: "Other",
};

function paymentCategory(type: string): RevenueCategory {
  if (type === "room_payment" || type === "walk_in_payment" || type === "deposit") return "room";
  return "other";
}

function normalizePayment(p: any): RevenueTransaction {
  const category = paymentCategory(p.type);
  return {
    id: p.id,
    sourceCollection: "payments",
    category,
    categoryLabel: CATEGORY_LABELS[category],
    typeLabel: PAYMENT_TYPE_LABELS[p.type] || p.type || "Payment",
    guestName: p.guestName || "—",
    amount: p.amount || 0,
    paymentMethod: p.paymentMethod || "—",
    date: toFirestoreDate(p.createdAt),
    recordedBy: p.recordedBy || null,
    recordedByName: p.recordedByName || "—",
    approvalStatus: (p.approvalStatus as ApprovalStatus) || "pending",
    approvedBy: p.approvedBy ?? null,
    approvedByName: p.approvedByName ?? null,
    approvedAt: toFirestoreDate(p.approvedAt),
    rejectedReason: p.rejectedReason ?? null,
    raw: p,
  };
}

function normalizeSale(s: any): RevenueTransaction {
  return {
    id: s.id,
    sourceCollection: "sales",
    category: "sales",
    categoryLabel: CATEGORY_LABELS.sales,
    typeLabel: "Retail Sale",
    guestName: s.customerName || "Walk-in customer",
    amount: s.total || 0,
    paymentMethod: s.paymentMethod || "—",
    date: toFirestoreDate(s.createdAt),
    recordedBy: s.staffId || null,
    recordedByName: s.staffName || "—",
    approvalStatus: (s.approvalStatus as ApprovalStatus) || "pending",
    approvedBy: s.approvedBy ?? null,
    approvedByName: s.approvedByName ?? null,
    approvedAt: toFirestoreDate(s.approvedAt),
    rejectedReason: s.rejectedReason ?? null,
    raw: s,
  };
}

function normalizeOrder(o: any): RevenueTransaction {
  return {
    id: o.id,
    sourceCollection: "orders",
    category: "restaurant",
    categoryLabel: CATEGORY_LABELS.restaurant,
    typeLabel: "Restaurant Order",
    guestName: o.customerName || (o.roomNumber ? `Room ${o.roomNumber}` : o.tableNumber ? `Table ${o.tableNumber}` : "Guest"),
    amount: o.total || 0,
    paymentMethod: o.paymentMethod || "—",
    date: toFirestoreDate(o.createdAt),
    recordedBy: o.waiterId || null,
    recordedByName: o.waiterName || "—",
    approvalStatus: (o.approvalStatus as ApprovalStatus) || "pending",
    approvedBy: o.approvedBy ?? null,
    approvedByName: o.approvedByName ?? null,
    approvedAt: toFirestoreDate(o.approvedAt),
    rejectedReason: o.rejectedReason ?? null,
    raw: o,
  };
}

function normalizeBarOrder(o: any): RevenueTransaction {
  return {
    id: o.id,
    sourceCollection: "bar_orders",
    category: "bar",
    categoryLabel: CATEGORY_LABELS.bar,
    typeLabel: "Bar Sale",
    guestName: o.customerName || (o.roomNumber ? `Room ${o.roomNumber}` : o.tableNumber ? `Table ${o.tableNumber}` : "Guest"),
    amount: o.total || 0,
    paymentMethod: o.paymentMethod || "—",
    date: toFirestoreDate(o.createdAt),
    recordedBy: o.barAttendantId || null,
    recordedByName: o.barAttendantName || "—",
    approvalStatus: (o.approvalStatus as ApprovalStatus) || "pending",
    approvedBy: o.approvedBy ?? null,
    approvedByName: o.approvedByName ?? null,
    approvedAt: toFirestoreDate(o.approvedAt),
    rejectedReason: o.rejectedReason ?? null,
    raw: o,
  };
}

function normalizeLaundry(l: any): RevenueTransaction {
  return {
    id: l.id,
    sourceCollection: "laundry_requests",
    category: "laundry",
    categoryLabel: CATEGORY_LABELS.laundry,
    typeLabel: "Laundry Service",
    guestName: l.guestName || (l.roomNumber ? `Room ${l.roomNumber}` : "Guest"),
    amount: l.charge || 0,
    paymentMethod: l.paymentMethod || "—",
    date: toFirestoreDate(l.createdAt),
    recordedBy: l.laundryValetId || null,
    recordedByName: l.laundryValetName || "—",
    approvalStatus: (l.approvalStatus as ApprovalStatus) || "pending",
    approvedBy: l.approvedBy ?? null,
    approvedByName: l.approvedByName ?? null,
    approvedAt: toFirestoreDate(l.approvedAt),
    rejectedReason: l.rejectedReason ?? null,
    raw: l,
  };
}

/**
 * Subscribes to payments, sales, orders, bar sales, and laundry charges in
 * real time and returns them merged into one sorted, normalized ledger.
 * This is the single source of truth every financial page should build on.
 */
export function useRevenueLedger() {
  const { data: payments, loading: l1, error: e1 } = useCollection<any>("payments");
  const { data: sales, loading: l2, error: e2 } = useCollection<any>("sales");
  const { data: orders, loading: l3, error: e3 } = useCollection<any>("orders");
  const { data: barOrders, loading: l4, error: e4 } = useCollection<any>("bar_orders");
  const { data: laundry, loading: l5, error: e5 } = useCollection<any>("laundry_requests");

  const transactions = useMemo<RevenueTransaction[]>(() => {
    const list = [
      ...payments.filter((p: any) => !p.isDeleted).map(normalizePayment),
      ...sales.filter((s: any) => !s.isDeleted).map(normalizeSale),
      // A kitchen-cancelled order never generated revenue and never needs
      // approval — it's excluded entirely, the same way a voided sale would be.
      ...orders.filter((o: any) => !o.isDeleted && o.status !== "cancelled").map(normalizeOrder),
      ...barOrders.filter((o: any) => !o.isDeleted && o.status !== "cancelled").map(normalizeBarOrder),
      // A laundry request only becomes revenue once it's actually charged —
      // requests still awaiting a charge amount are excluded, the same way
      // an unpriced draft order would be.
      ...laundry.filter((l: any) => !l.isDeleted && l.status !== "cancelled" && (l.charge || 0) > 0).map(normalizeLaundry),
    ];
    list.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
    return list;
  }, [payments, sales, orders, barOrders, laundry]);

  return { transactions, loading: l1 || l2 || l3 || l4 || l5, error: e1 || e2 || e3 || e4 || e5 };
}

export const approvedOnly = (txns: RevenueTransaction[]) => txns.filter(t => t.approvalStatus === "approved");
export const pendingOnly = (txns: RevenueTransaction[]) => txns.filter(t => t.approvalStatus === "pending");
export const rejectedOnly = (txns: RevenueTransaction[]) => txns.filter(t => t.approvalStatus === "rejected");

export function sumAmount(txns: RevenueTransaction[]): number {
  return txns.reduce((s, t) => s + (t.amount || 0), 0);
}

export function sumByCategory(txns: RevenueTransaction[]): Record<RevenueCategory, number> {
  const out: Record<RevenueCategory, number> = { room: 0, restaurant: 0, sales: 0, bar: 0, laundry: 0, other: 0 };
  for (const t of txns) out[t.category] += t.amount || 0;
  return out;
}

export function inRange(txns: RevenueTransaction[], start: Date, end: Date): RevenueTransaction[] {
  return txns.filter(t => t.date && t.date >= start && t.date <= end);
}

export type DateRangePreset = "today" | "week" | "month" | "year" | "custom";

export function resolveDateRange(preset: DateRangePreset, reference: Date, customStart?: Date, customEnd?: Date): { start: Date; end: Date } {
  switch (preset) {
    case "today": return { start: startOfDay(reference), end: endOfDay(reference) };
    case "week": return { start: startOfWeek(reference), end: endOfWeek(reference) };
    case "month": return { start: startOfMonth(reference), end: endOfMonth(reference) };
    case "year": return { start: startOfYear(reference), end: endOfYear(reference) };
    case "custom": return { start: customStart ? startOfDay(customStart) : startOfMonth(reference), end: customEnd ? endOfDay(customEnd) : endOfDay(reference) };
  }
}

export interface DailyRecord {
  date: string; // yyyy-MM-dd
  label: string;
  roomRevenue: number;
  restaurantRevenue: number;
  salesRevenue: number;
  barRevenue: number;
  laundryRevenue: number;
  otherRevenue: number;
  totalRevenue: number;
  transactionCount: number;
  pending: number;
  approved: number;
  rejected: number;
}

/**
 * Groups a set of transactions by calendar day (using each transaction's own
 * date), producing the per-day breakdown the Accountant's daily records view
 * needs — approved revenue by category plus pending/approved/rejected counts.
 */
export function groupByDay(txns: RevenueTransaction[]): DailyRecord[] {
  const byDay = new Map<string, RevenueTransaction[]>();
  for (const t of txns) {
    if (!t.date) continue;
    const key = format(t.date, "yyyy-MM-dd");
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(t);
  }
  const rows: DailyRecord[] = [];
  for (const [key, dayTxns] of byDay.entries()) {
    const approved = approvedOnly(dayTxns);
    const byCat = sumByCategory(approved);
    rows.push({
      date: key,
      label: format(new Date(key + "T00:00:00"), "MMM d, yyyy"),
      roomRevenue: byCat.room,
      restaurantRevenue: byCat.restaurant,
      salesRevenue: byCat.sales,
      barRevenue: byCat.bar,
      laundryRevenue: byCat.laundry,
      otherRevenue: byCat.other,
      totalRevenue: sumAmount(approved),
      transactionCount: dayTxns.length,
      pending: pendingOnly(dayTxns).length,
      approved: approved.length,
      rejected: rejectedOnly(dayTxns).length,
    });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  return rows;
}

/**
 * Approve a pending (or previously-rejected) transaction. Writes directly to
 * the underlying source document — payments/{id}, sales/{id}, or orders/{id}
 * — so there is exactly one record of the transaction, and every page reading
 * that collection sees the update in real time via onSnapshot.
 */
export async function approveTransaction(txn: RevenueTransaction, adminUser: AdminUser, role: Role | null) {
  const ref = doc(db, txn.sourceCollection, txn.id);
  await updateDoc(ref, {
    approvalStatus: "approved",
    approvedBy: adminUser.id,
    approvedByName: adminUser.name,
    approvedAt: serverTimestamp(),
    rejectedReason: null,
  });
  await logAction(
    adminUser.id, adminUser.name, "payment_approved", txn.sourceCollection, txn.id,
    { approvalStatus: txn.approvalStatus }, { approvalStatus: "approved", amount: txn.amount }, role ?? undefined
  );
  notifyPaymentApproved(txn.guestName, txn.amount, adminUser.name).catch(() => {});
}

/**
 * Reject a pending transaction with an optional reason. Rejected transactions
 * are excluded from revenue everywhere but remain visible in the full
 * transaction history for audit purposes.
 */
export async function rejectTransaction(txn: RevenueTransaction, adminUser: AdminUser, role: Role | null, reason?: string) {
  const ref = doc(db, txn.sourceCollection, txn.id);
  await updateDoc(ref, {
    approvalStatus: "rejected",
    approvedBy: adminUser.id,
    approvedByName: adminUser.name,
    approvedAt: serverTimestamp(),
    rejectedReason: reason || null,
  });
  await logAction(
    adminUser.id, adminUser.name, "payment_rejected", txn.sourceCollection, txn.id,
    { approvalStatus: txn.approvalStatus }, { approvalStatus: "rejected", reason: reason || null, amount: txn.amount }, role ?? undefined
  );
}
