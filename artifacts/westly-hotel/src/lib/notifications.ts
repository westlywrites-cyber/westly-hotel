import {
  collection, addDoc, doc, updateDoc, arrayUnion, serverTimestamp,
} from "firebase/firestore";
import { db, auth } from "./firebase";
import type { Role } from "./rbac";
import { formatCurrency } from "./utils";

// ══════════════════════════════════════════════════════════════════════════
// NOTIFICATION SYSTEM — single source of truth for every in-app + push
// notification in the application.
//
// ARCHITECTURE
//   • One Firestore doc per event, in `notifications`, targeted at one or
//     more ROLES (and optionally specific user ids). This scales to any
//     number of recipients without fan-out writes.
//   • Per-user read/delete state lives on the SAME doc as `readBy` /
//     `deletedBy` uid arrays (no per-user duplicate documents to keep in
//     sync). See src/hooks/useNotifications.ts for how these are consumed.
//   • Every notify() call is a single business event — callers fire it
//     once, right after their mutation succeeds, and never retry it. That
//     "one write per real event" discipline is what prevents duplicates;
//     there is deliberately no server-side dedup layer to keep this fast
//     and simple, so callers must not call notify() from retry loops or
//     effects that can re-run for the same event.
//   • notify() writes Firestore FIRST (source of truth for the in-app
//     Notification Center), then — fire-and-forget, non-blocking — asks a
//     Netlify Function to push the same message to the target users' FCM
//     device tokens, and forwards a summary line to Telegram. If either of
//     those secondary channels fails, the in-app notification still exists.
// ══════════════════════════════════════════════════════════════════════════

// Cloudflare Worker URL — hardcoded as per spec (Section 11 & 17).
const CLOUDFLARE_WORKER_URL = "https://westlyhotel.investorwestly.workers.dev/";

export type NotificationSeverity = "info" | "success" | "warning" | "critical";

export type NotificationType =
  | "new_booking" | "booking_cancelled" | "booking_modified" | "booking_approved" | "booking_rejected"
  | "check_in" | "check_out" | "walk_in"
  | "new_sale" | "payment_received" | "payment_approved" | "refund_issued" | "expense_recorded"
  | "lost_found_item" | "lost_found_claimed"
  | "housekeeping_task" | "housekeeping_task_done" | "room_status_change"
  | "maintenance_request" | "maintenance_resolved"
  | "low_inventory" | "staff_alert" | "new_review" | "contact_message" | "system_alert"
  | "laundry_request" | "laundry_ready"
  | "task_assigned" | "task_reassigned" | "task_completed" | "task_overdue"
  | "shift_assigned" | "shift_updated" | "shift_cancelled";

export interface NotifyParams {
  type: NotificationType;
  title: string;
  message: string;
  /** Roles who should see this notification in their Notification Center + push. */
  forRoles: Role[];
  /** Optional: also (or only) target specific user ids, e.g. the staff member assigned to a task. */
  forUserIds?: string[];
  /** Optional: never show this notification to the actor who caused it (defaults to current user). */
  excludeActor?: boolean;
  severity?: NotificationSeverity;
  /** In-app route the notification should navigate to when clicked. */
  link?: string;
  data?: Record<string, unknown>;
}

// ══════════════════════════════════════════════════════════════════════════
// These notification types belong to features that have been disconnected
// from Telegram (per the Supabase migration): Rooms, Lost & Found, and the
// public-website Message Inbox. Their data now lives in Firestore/Supabase
// only. Every other notification type keeps forwarding to Telegram exactly
// as before.
// ══════════════════════════════════════════════════════════════════════════
const TELEGRAM_EXCLUDED_TYPES: NotificationType[] = [
  "room_status_change",
  "lost_found_item",
  "lost_found_claimed",
  "contact_message",
];

/**
 * Core notification primitive. Every convenience wrapper below funnels
 * through this. Always: (1) save to Firestore, (2) fan out to push +
 * Telegram, best-effort, never blocking the caller's business logic.
 */
export async function notify(params: NotifyParams): Promise<void> {
  const actor = auth.currentUser;
  const docRef = await addDoc(collection(db, "notifications"), {
    type: params.type,
    title: params.title,
    message: params.message,
    severity: params.severity ?? "info",
    link: params.link ?? null,
    forRoles: params.forRoles,
    forUserIds: params.forUserIds ?? [],
    excludeUserId: params.excludeActor && actor ? actor.uid : null,
    actorId: actor?.uid ?? null,
    readBy: [],
    deletedBy: [],
    createdAt: serverTimestamp(),
  });
  // If addDoc throws, everything below is skipped — callers see the error.

  // Push notification (background/closed-app delivery) — best-effort.
  sendPushNotification(params, docRef.id).catch(() => {
    /* push failure is non-fatal; in-app notification already saved */
  });

  // Telegram forwarding — best-effort, and skipped entirely for the
  // features that have been disconnected from Telegram (see above).
  if (!TELEGRAM_EXCLUDED_TYPES.includes(params.type)) {
    sendTelegramMessage(`🏨 *${params.title}*\n${params.message}`).catch(() => {
      /* Telegram failure is non-fatal */
    });
  }
}

async function sendPushNotification(params: NotifyParams, notificationId: string): Promise<void> {
  const actor = auth.currentUser;
  if (!actor) return;
  const idToken = await actor.getIdToken();
  const response = await fetch("/api/send-push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      forRoles: params.forRoles,
      forUserIds: params.forUserIds ?? [],
      excludeUserId: params.excludeActor ? actor.uid : null,
      title: params.title,
      body: params.message,
      link: params.link ?? "/admin/dashboard",
      notificationId,
    }),
  });
  if (!response.ok) throw new Error(`send-push responded ${response.status}`);
}

/**
 * Low-level function to send a plain text message to Telegram via the
 * Cloudflare Worker. Called by notify() and can also be called directly
 * for simple status messages.
 */
export async function sendTelegramMessage(message: string): Promise<void> {
  const response = await fetch(CLOUDFLARE_WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!response.ok) {
    throw new Error(`Cloudflare Worker responded ${response.status}`);
  }
}

// Mark a single notification read by the current user.
export function markNotificationRead(notificationId: string, uid: string) {
  return updateDoc(doc(db, "notifications", notificationId), { readBy: arrayUnion(uid) });
}

// Soft-delete a notification for the current user only (doc is shared across recipients).
export function deleteNotificationForUser(notificationId: string, uid: string) {
  return updateDoc(doc(db, "notifications", notificationId), { deletedBy: arrayUnion(uid) });
}

// ══════════════════════════════════════════════════════════════════════════
// EVENT CATALOG — one wrapper per business event. Role lists follow the
// spec's role-based rules:
//   super_admin      → everything (enforced separately: super_admin always
//                       matches, see useNotifications)
//   manager          → all operational + financial + management events
//   receptionist     → bookings, check-in/out, guest & front-desk activity
//   accountant       → payments, sales, expenses, refunds, financial events
//   housekeeping     → room/cleaning/lost & found tasks assigned to them
//   staff / waiter   → only events tied to their own work (handled at the
//                       call site via forUserIds, not broad role fan-out)
// ══════════════════════════════════════════════════════════════════════════

const MGMT: Role[] = ["super_admin", "manager"];
const FRONT_DESK: Role[] = ["super_admin", "manager", "receptionist"];
const FINANCE: Role[] = ["super_admin", "manager", "accountant"];
// Operational visibility: management plus the Operations Manager, who
// oversees day-to-day activity across departments but doesn't need
// finance-only notifications (payments, expense approvals, etc.).
const OPS: Role[] = ["super_admin", "manager", "operations_manager"];

// ── Bookings ────────────────────────────────────────────────────────────
export function notifyNewBooking(guestName: string, roomType: string, checkIn: string, checkOut: string) {
  return notify({
    type: "new_booking",
    title: "New Booking Received",
    message: `${guestName} booked a ${roomType} from ${checkIn} to ${checkOut}.`,
    forRoles: FRONT_DESK,
    severity: "success",
    link: "/admin/bookings",
  });
}

export function notifyBookingCancelled(guestName: string, roomType: string, cancelledBy: string) {
  return notify({
    type: "booking_cancelled",
    title: "Booking Cancelled",
    message: `${guestName}'s ${roomType} booking was cancelled by ${cancelledBy}.`,
    forRoles: FRONT_DESK,
    severity: "warning",
    link: "/admin/bookings",
  });
}

export function notifyBookingModified(guestName: string, summary: string, modifiedBy: string) {
  return notify({
    type: "booking_modified",
    title: "Booking Modified",
    message: `${guestName}'s booking was updated (${summary}) by ${modifiedBy}.`,
    forRoles: FRONT_DESK,
    link: "/admin/bookings",
  });
}

export function notifyBookingApproval(guestName: string, approved: boolean, decidedBy: string) {
  return notify({
    type: approved ? "booking_approved" : "booking_rejected",
    title: approved ? "Booking Approved" : "Booking Rejected",
    message: `${guestName}'s room reservation was ${approved ? "approved" : "rejected"} by ${decidedBy}.`,
    forRoles: FRONT_DESK,
    severity: approved ? "success" : "warning",
    link: "/admin/room-reservations",
  });
}

// ── Check-in / check-out ───────────────────────────────────────────────
export function notifyCheckIn(guestName: string, roomNumber: string, checkedInBy: string) {
  return notify({
    type: "check_in",
    title: "Guest Checked In",
    message: `${guestName} checked into Room ${roomNumber} (by ${checkedInBy}).`,
    forRoles: [...FRONT_DESK, "operations_manager"],
    severity: "success",
    link: "/admin/checkin",
  });
}

export function notifyCheckOut(guestName: string, roomNumber: string, checkedOutBy: string) {
  return notify({
    type: "check_out",
    title: "Guest Checked Out",
    message: `${guestName} checked out of Room ${roomNumber} (by ${checkedOutBy}).`,
    forRoles: [...FRONT_DESK, "operations_manager"],
    link: "/admin/checkout",
  });
}

// ── Sales, payments, expenses ──────────────────────────────────────────
export function notifyNewSale(staffName: string, amount: number, category: string, link: string = "/admin/sales-history") {
  return notify({
    type: "new_sale",
    title: "New Sale Recorded",
    message: `${staffName} recorded a ${formatCurrency(amount)} sale in ${category}.`,
    forRoles: FINANCE,
    severity: "success",
    link,
  });
}

export function notifyPaymentReceived(guestName: string, amount: number, method: string, recordedBy: string) {
  return notify({
    type: "payment_received",
    title: "Payment Received",
    message: `${formatCurrency(amount)} (${method}) received from ${guestName}, recorded by ${recordedBy}.`,
    forRoles: [...FINANCE, "receptionist"],
    severity: "success",
    link: "/admin/payments",
  });
}

export function notifyPaymentApproved(guestName: string, amount: number, approvedBy: string) {
  return notify({
    type: "payment_approved",
    title: "Payment Approved",
    message: `${formatCurrency(amount)} payment for ${guestName} was approved by ${approvedBy}.`,
    forRoles: FINANCE,
    severity: "success",
    link: "/admin/payments",
  });
}

export function notifyRefundIssued(guestName: string, amount: number, issuedBy: string, reason?: string) {
  return notify({
    type: "refund_issued",
    title: "Refund Issued",
    message: `${formatCurrency(amount)} refunded to ${guestName} by ${issuedBy}${reason ? ` — ${reason}` : ""}.`,
    forRoles: FINANCE,
    severity: "warning",
    link: "/admin/payments",
  });
}

export function notifyLargeExpense(title: string, amount: number, recordedBy: string) {
  return notify({
    type: "expense_recorded",
    title: "Large Expense Recorded",
    message: `${title}: ${formatCurrency(amount)} — recorded by ${recordedBy}.`,
    forRoles: FINANCE,
    severity: "warning",
    link: "/admin/expenses",
  });
}

// ── Lost & found ────────────────────────────────────────────────────────
export function notifyLostFoundItem(itemName: string, roomNumber: string, submittedBy: string) {
  return notify({
    type: "lost_found_item",
    title: "Lost & Found Item Logged",
    message: `${itemName} found in Room ${roomNumber} by ${submittedBy}.`,
    forRoles: [...OPS, "housekeeping"],
    link: "/admin/lost-found",
  });
}

export function notifyLostFoundClaimed(itemName: string, guestName: string, handledBy: string) {
  return notify({
    type: "lost_found_claimed",
    title: "Lost & Found Item Claimed",
    message: `${itemName} was returned to ${guestName} (by ${handledBy}).`,
    forRoles: OPS,
    severity: "success",
    link: "/admin/lost-found",
  });
}

// ── Housekeeping & rooms ────────────────────────────────────────────────
export function notifyHousekeepingTask(roomNumber: string, taskType: string, assignedBy: string) {
  return notify({
    type: "housekeeping_task",
    title: "New Housekeeping Task",
    message: `${taskType} requested for Room ${roomNumber} by ${assignedBy}.`,
    forRoles: [...OPS, "housekeeping"],
    link: "/admin/housekeeping",
  });
}

export function notifyHousekeepingDone(roomNumber: string, completedBy: string) {
  return notify({
    type: "housekeeping_task_done",
    title: "Housekeeping Task Completed",
    message: `Room ${roomNumber} was cleaned/serviced by ${completedBy}.`,
    forRoles: OPS,
    severity: "success",
    link: "/admin/housekeeping",
  });
}

export function notifyRoomStatusChange(roomNumber: string, newStatus: string, changedBy: string) {
  return notify({
    type: "room_status_change",
    title: "Room Status Changed",
    message: `Room ${roomNumber} marked "${newStatus}" by ${changedBy}.`,
    forRoles: [...FRONT_DESK, "housekeeping", "operations_manager"],
    severity: newStatus === "out_of_order" ? "warning" : "info",
    link: "/admin/rooms",
  });
}

// ── Maintenance ─────────────────────────────────────────────────────────
export function notifyMaintenanceRequest(roomOrArea: string, issue: string, reportedBy: string) {
  return notify({
    type: "maintenance_request",
    title: "New Maintenance Request",
    message: `${issue} reported for ${roomOrArea} by ${reportedBy}.`,
    forRoles: OPS,
    severity: "warning",
    link: "/admin/maintenance",
  });
}

export function notifyNewLaundryRequest(guestOrRoom: string, itemCount: number, submittedBy: string) {
  return notify({
    type: "laundry_request",
    title: "New Laundry Request",
    message: `${submittedBy} logged a laundry request (${itemCount} item${itemCount === 1 ? "" : "s"}) for ${guestOrRoom}.`,
    forRoles: [...OPS, "laundry_valet"],
    severity: "info",
    link: "/admin/laundry",
  });
}

export function notifyLaundryReady(guestOrRoom: string, handledBy: string) {
  return notify({
    type: "laundry_ready",
    title: "Laundry Ready for Collection",
    message: `Laundry for ${guestOrRoom} is ready for collection/delivery (${handledBy}).`,
    forRoles: [...OPS, "receptionist"],
    severity: "success",
    link: "/admin/laundry",
  });
}

export function notifyMaintenanceResolved(roomOrArea: string, resolvedBy: string) {
  return notify({
    type: "maintenance_resolved",
    title: "Maintenance Request Resolved",
    message: `Maintenance issue at ${roomOrArea} resolved by ${resolvedBy}.`,
    forRoles: OPS,
    severity: "success",
    link: "/admin/maintenance",
  });
}

// ── Task assignment (Operations Manager) ──────────────────────────────
export function notifyTaskAssigned(taskTitle: string, assignedToIds: string[], assignedToNames: string[], assignedBy: string, priority: string) {
  return notify({
    type: "task_assigned",
    title: "New Task Assigned",
    message: `${assignedBy} assigned you: "${taskTitle}" (${priority} priority).`,
    forRoles: [],
    forUserIds: assignedToIds,
    severity: priority === "urgent" || priority === "high" ? "warning" : "info",
    link: "/admin/my-tasks",
  });
}

export function notifyTaskReassigned(taskTitle: string, assignedToIds: string[], assignedBy: string) {
  return notify({
    type: "task_reassigned",
    title: "Task Reassigned to You",
    message: `${assignedBy} reassigned "${taskTitle}" to you.`,
    forRoles: [],
    forUserIds: assignedToIds,
    severity: "info",
    link: "/admin/my-tasks",
  });
}

export function notifyTaskCompleted(taskTitle: string, completedBy: string, assignedBy: string | null) {
  return notify({
    type: "task_completed",
    title: "Task Completed",
    message: `${completedBy} completed: "${taskTitle}".`,
    forRoles: OPS,
    forUserIds: assignedBy ? [assignedBy] : [],
    severity: "success",
    link: "/admin/tasks",
  });
}

// ── Shift scheduling (Operations Manager) ──────────────────────────────
export function notifyShiftAssigned(staffIds: string[], staffNames: string[], label: string, date: string, startTime: string, endTime: string, assignedBy: string) {
  return notify({
    type: "shift_assigned",
    title: "New Shift Scheduled",
    message: `${assignedBy} scheduled you for "${label}" on ${date}, ${startTime}–${endTime}.`,
    forRoles: [],
    forUserIds: staffIds,
    severity: "info",
    link: "/admin/my-tasks",
    data: { staffNames, date, startTime, endTime },
  });
}

export function notifyShiftUpdated(staffIds: string[], label: string, date: string, updatedBy: string) {
  return notify({
    type: "shift_updated",
    title: "Shift Updated",
    message: `${updatedBy} updated your "${label}" shift on ${date}.`,
    forRoles: [],
    forUserIds: staffIds,
    severity: "info",
    link: "/admin/my-tasks",
  });
}

export function notifyShiftCancelled(staffIds: string[], label: string, date: string, cancelledBy: string) {
  return notify({
    type: "shift_cancelled",
    title: "Shift Cancelled",
    message: `${cancelledBy} cancelled your "${label}" shift on ${date}.`,
    forRoles: [],
    forUserIds: staffIds,
    severity: "warning",
    link: "/admin/my-tasks",
  });
}

// ── Inventory ───────────────────────────────────────────────────────────
export function notifyLowInventory(itemName: string, quantity: number, unit: string) {
  return notify({
    type: "low_inventory",
    title: "Low Inventory Alert",
    message: `${itemName} is low: only ${quantity} ${unit} remaining.`,
    forRoles: [...MGMT, "accountant"],
    severity: "warning",
    link: "/admin/inventory",
  });
}

// ── Reviews & contact ───────────────────────────────────────────────────
export function notifyNewReview(name: string, rating: number | null) {
  return notify({
    type: "new_review",
    title: "New Guest Review Awaiting Approval",
    message: `${name} left a ${rating ? `${rating}-star ` : ""}review — review it on the Guest Reviews page.`,
    forRoles: MGMT,
    link: "/admin/reviews",
  });
}

export function notifyContactMessage(name: string, email: string, subject: string, messageBody: string) {
  const preview = messageBody.length > 140 ? `${messageBody.slice(0, 140)}…` : messageBody;
  return notify({
    type: "contact_message",
    title: "New Contact Inquiry",
    message: `From: ${name} <${email}>\nSubject: ${subject}\n\n${preview}`,
    forRoles: FRONT_DESK,
    link: "/admin/messages",
  });
}

// ── Staff / system ──────────────────────────────────────────────────────
/** Generic "needs management attention" alert — approvals, deletions, unusual activity, etc. */
export function notifyStaffAlert(title: string, message: string, severity: NotificationSeverity = "warning") {
  return notify({ type: "staff_alert", title, message, forRoles: MGMT, severity, link: "/admin/audit-log" });
}

export function notifySystemAlert(title: string, message: string, severity: NotificationSeverity = "critical") {
  return notify({ type: "system_alert", title, message, forRoles: ["super_admin"], severity, link: "/admin/dashboard" });
}
