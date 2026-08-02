import { collection, doc, addDoc, updateDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { notifyStaffAlert } from "./notifications";

export interface AuditLogEntry {
  userId: string;
  userName: string;
  userRole?: string;
  action: string;
  collection: string;
  documentId: string;
  previousValue?: any;
  newValue?: any;
  deviceInfo?: string;
  timestamp?: any;
}

/**
 * Log an important action to the audit_logs collection.
 * This is non-blocking and will not throw — a failed audit log
 * should never cause a business transaction to fail.
 */
export async function logAction(
  userId: string,
  userName: string,
  action: string,
  collectionName: string,
  documentId: string,
  previousValue?: any,
  newValue?: any,
  userRole?: string
): Promise<void> {
  try {
    await addDoc(collection(db, "audit_logs"), {
      userId,
      userName,
      userRole: userRole || undefined,
      action,
      collection: collectionName,
      documentId,
      previousValue: previousValue ?? null,
      newValue: newValue ?? null,
      deviceInfo: navigator.userAgent,
      timestamp: serverTimestamp(),
      isDeleted: false,
    } satisfies Omit<AuditLogEntry, "timestamp"> & { isDeleted: boolean; timestamp: any });
  } catch (error) {
    // Audit log failures must never surface to the user or block business logic
    console.error("[Audit] Failed to write audit log:", error);
  }
}

/**
 * Soft-delete a document: marks it deleted in its collection and writes an audit log.
 * Uses a WriteBatch so both writes are atomic.
 */
export async function softDelete(
  collectionName: string,
  documentId: string,
  userId: string,
  userName: string,
  reason?: string,
  userRole?: string
): Promise<void> {
  const batch = writeBatch(db);

  // Mark deleted in-place
  const docRef = doc(db, collectionName, documentId);
  batch.update(docRef, {
    isDeleted: true,
    deletedAt: serverTimestamp(),
    deletedBy: userId,
    deletedByName: userName,
    deleteReason: reason || null,
  });

  // Archive to deletedRecords collection so Super Admin can review/restore
  const archiveRef = doc(collection(db, "deleted_records"));
  batch.set(archiveRef, {
    originalCollection: collectionName,
    originalDocumentId: documentId,
    deletedBy: userId,
    deletedByName: userName,
    deletedByRole: userRole || null,
    deletedAt: serverTimestamp(),
    reason: reason || null,
  });

  await batch.commit();

  // Log to audit trail (fire-and-forget — batch already committed)
  logAction(userId, userName, "soft_delete", collectionName, documentId, null, { reason }, userRole);

  // Record deletion is exactly the kind of staff activity management should
  // see regardless of which page it happened on — one hook here covers
  // bookings, guests, rooms, inventory, staff records, etc. all at once.
  notifyStaffAlert(
    "Record Deleted",
    `${userName} deleted a ${collectionName.replace(/_/g, " ")} record${reason ? ` — ${reason}` : ""}.`,
    "warning"
  ).catch(() => {});
}

/**
 * Restore a soft-deleted document (Super Admin only).
 */
export async function restoreRecord(
  collectionName: string,
  documentId: string,
  userId: string,
  userName: string
): Promise<void> {
  const docRef = doc(db, collectionName, documentId);
  await updateDoc(docRef, {
    isDeleted: false,
    restoredAt: serverTimestamp(),
    restoredBy: userId,
    restoredByName: userName,
  });
  await logAction(userId, userName, "restore", collectionName, documentId, { isDeleted: true }, { isDeleted: false });
}
