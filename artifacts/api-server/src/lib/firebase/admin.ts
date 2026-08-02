// Caller-authorization helpers — port of the Cloudflare Workers _shared/admin.ts.
import { getDoc } from "./firestoreRest.js";
import { verifyIdToken } from "./firebaseAuthRest.js";
import type { Env } from "./googleAuth.js";

export type { Env };

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export function jsonBody(statusCode: number, body: unknown): { statusCode: number; body: unknown } {
  return { statusCode, body };
}

export async function requireSuperAdmin(env: Env, authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing Authorization header.");
  }
  const idToken = authHeader.slice("Bearer ".length);

  let decoded;
  try {
    decoded = await verifyIdToken(env, idToken);
  } catch {
    throw new HttpError(401, "Invalid or expired session. Please sign in again.");
  }

  const callerSnap = await getDoc(env, "users", decoded.uid);
  const caller = callerSnap.data();

  if (
    !callerSnap.exists ||
    caller?.role !== "super_admin" ||
    caller?.status !== "active" ||
    caller?.isDeleted
  ) {
    throw new HttpError(403, "Only an active Super Admin can perform this action.");
  }

  return { uid: decoded.uid, name: caller.name as string };
}

export async function requireActiveUser(env: Env, authHeader: string | undefined) {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing Authorization header.");
  }
  const idToken = authHeader.slice("Bearer ".length);

  let decoded;
  try {
    decoded = await verifyIdToken(env, idToken);
  } catch {
    throw new HttpError(401, "Invalid or expired session. Please sign in again.");
  }

  const callerSnap = await getDoc(env, "users", decoded.uid);
  const caller = callerSnap.data();

  if (!callerSnap.exists || caller?.status !== "active" || caller?.isDeleted) {
    throw new HttpError(403, "Only an active staff account can perform this action.");
  }

  return { uid: decoded.uid, name: caller.name as string, role: caller.role as string };
}
