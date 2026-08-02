import { addDoc, FieldValue } from "./firestoreRest.js";
import type { Env } from "./googleAuth.js";

export async function logServerAction(
  env: Env,
  userId: string,
  userName: string,
  action: string,
  collectionName: string,
  documentId: string,
  previousValue: unknown = null,
  newValue: unknown = null,
  userRole = "super_admin"
): Promise<void> {
  try {
    await addDoc(env, "audit_logs", {
      userId,
      userName,
      userRole,
      action,
      collection: collectionName,
      documentId,
      previousValue,
      newValue,
      deviceInfo: "server-function",
      timestamp: FieldValue.serverTimestamp(),
      isDeleted: false,
    });
  } catch (error) {
    console.error("[Audit] Failed to write server-side audit log:", error);
  }
}
