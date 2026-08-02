// Replaces firebase-admin Auth for Node.js — same logic as the Cloudflare Workers version.
import { SignJWT, importPKCS8, jwtVerify, createRemoteJWKSet } from "jose";
import { getAccessToken, getServiceAccount, type Env } from "./googleAuth.js";

const IDENTITY_TOOLKIT_BASE = "https://identitytoolkit.googleapis.com/v1";

const jwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/[email protected]")
);

export interface DecodedIdToken {
  uid: string;
  [claim: string]: unknown;
}

export async function verifyIdToken(env: Env, idToken: string): Promise<DecodedIdToken> {
  const sa = getServiceAccount(env);
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: `https://securetoken.google.com/${sa.project_id}`,
    audience: sa.project_id,
  });
  if (!payload.sub) throw new Error("ID token missing subject claim.");
  return { ...payload, uid: payload.sub };
}

export async function createCustomToken(
  env: Env,
  uid: string,
  claims?: Record<string, unknown>
): Promise<string> {
  const sa = getServiceAccount(env);
  const privateKey = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ uid, claims: claims ?? {} })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(
      "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit"
    )
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);
}

function mapAuthError(msg?: string): string | undefined {
  if (!msg) return undefined;
  const map: Record<string, string> = {
    EMAIL_EXISTS: "An account with this email address already exists.",
    INVALID_EMAIL: "The email address is not valid.",
    WEAK_PASSWORD: "Password must be at least 6 characters.",
    USER_NOT_FOUND: "No user found with that ID.",
    INVALID_ID_TOKEN: "Invalid or expired session.",
    TOO_MANY_ATTEMPTS_TRY_LATER: "Too many attempts. Please wait before trying again.",
  };
  const code = msg.split(" : ")[0].trim();
  return map[code] ?? msg;
}

export async function createUser(
  env: Env,
  input: { email: string; password: string; displayName?: string }
): Promise<{ uid: string }> {
  const sa = getServiceAccount(env);
  const token = await getAccessToken(env);

  const res = await fetch(`${IDENTITY_TOOLKIT_BASE}/accounts:signUp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
      targetProjectId: sa.project_id,
      returnSecureToken: false,
    }),
  });
  const json = await res.json().catch(() => ({})) as { localId?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(mapAuthError(json?.error?.message) ?? "Failed to create user.");
  return { uid: json.localId as string };
}

export async function updateUser(
  env: Env,
  uid: string,
  updates: { password?: string; disabled?: boolean }
): Promise<void> {
  const sa = getServiceAccount(env);
  const token = await getAccessToken(env);

  const body: Record<string, unknown> = {
    localId: uid,
    targetProjectId: sa.project_id,
  };
  if (updates.password !== undefined) body.password = updates.password;
  if (updates.disabled !== undefined) body.disableUser = updates.disabled;

  const res = await fetch(`${IDENTITY_TOOLKIT_BASE}/accounts:update`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(mapAuthError(json?.error?.message) ?? "Failed to update user.");
  }
}
