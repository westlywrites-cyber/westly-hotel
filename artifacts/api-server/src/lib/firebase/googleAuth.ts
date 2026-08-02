// Replaces firebase-admin's credential bootstrap for the Node.js runtime.
// Uses the same REST approach as the Cloudflare Workers version so
// no firebase-admin SDK is needed.
import { SignJWT, importPKCS8 } from "jose";
import type { Env } from "./env.js";

export type { Env };

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/identitytoolkit",
  "https://www.googleapis.com/auth/firebase.messaging",
].join(" ");

let cachedServiceAccount: ServiceAccount | null = null;

export function getServiceAccount(env: Env): ServiceAccount {
  if (cachedServiceAccount) return cachedServiceAccount;

  const raw = env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY env var is not set. " +
        "Add the base64-encoded service account JSON as a Replit Secret."
    );
  }

  // Node 16+ exposes atob globally; for safety use Buffer fallback.
  const json =
    typeof atob === "function"
      ? atob(raw)
      : Buffer.from(raw, "base64").toString("utf-8");

  const parsed = JSON.parse(json);

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY did not decode to a valid service account JSON."
    );
  }

  cachedServiceAccount = {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    private_key: parsed.private_key,
  };
  return cachedServiceAccount;
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  if (cachedAccessToken && cachedAccessToken.expiresAt - 60 > now) {
    return cachedAccessToken.token;
  }

  const sa = getServiceAccount(env);
  const privateKey = await importPKCS8(sa.private_key, "RS256");

  const assertion = await new SignJWT({ scope: SCOPES })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed to obtain Google OAuth access token (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedAccessToken = { token: data.access_token, expiresAt: now + data.expires_in };
  return cachedAccessToken.token;
}
