import { signInWithCustomToken, setPersistence, browserSessionPersistence } from "firebase/auth";
import { auth } from "./firebase";
import type { AdminUser } from "@/contexts/AuthContext";

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verifies a shared-device PIN and, on success, signs the browser into a
 * real Firebase Auth session for that user.
 *
 * The actual lookup happens server-side (netlify/functions/verify-pin.ts)
 * via the Admin SDK, which is required — a client-side Firestore query for
 * "who has this PIN" can never succeed before the visitor is authenticated,
 * since the security rules correctly require isSignedIn() to list /users.
 * That mismatch was the cause of every PIN attempt failing with "Access
 * Denied" — including valid ones — before this fix.
 *
 * On success the server returns a Firebase custom token, which is exchanged
 * here for a session via signInWithCustomToken. That's what actually resolves
 * both the login failure AND the underlying issue it was a symptom of: without
 * a real Firebase Auth session, request.auth is null for every subsequent
 * Firestore read/write a PIN-logged-in user makes, so every other
 * "Missing or insufficient permissions" error a shared-device user hit
 * elsewhere in the app traces back to this same root cause.
 *
 * Throws with a user-facing message on any rejection (wrong PIN, inactive
 * account, ineligible role, etc.) — callers should catch and display it.
 */
export async function verifyPin(pin: string): Promise<AdminUser> {
  const res = await fetch("/api/verify-pin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok || !payload?.customToken || !payload?.user) {
    throw new Error(payload?.error || "Invalid PIN.");
  }

  // Shared-device safety: a PIN session should not survive closing the tab
  // or browser the way a normal email/password login persists across
  // restarts — session-only persistence clears it automatically.
  await setPersistence(auth, browserSessionPersistence);
  await signInWithCustomToken(auth, payload.customToken);

  return payload.user as AdminUser;
}
