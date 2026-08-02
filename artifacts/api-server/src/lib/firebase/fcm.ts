// FCM v1 multicast helper — direct port of the Cloudflare Workers version.
import { getAccessToken, getServiceAccount, type Env } from "./googleAuth.js";

interface FcmMessage {
  notification?: { title: string; body: string };
  data?: Record<string, string>;
  webpush?: {
    fcmOptions?: { link?: string };
    notification?: { icon?: string };
  };
}

interface SendResponse {
  success: boolean;
  shouldPruneToken: boolean;
}

interface MulticastResult {
  successCount: number;
  failureCount: number;
  responses: SendResponse[];
}

// Token errors that mean the token is permanently invalid and should be pruned.
const PRUNE_ERROR_CODES = new Set([
  "UNREGISTERED",
  "INVALID_ARGUMENT",
]);

export async function sendEachForMulticast(
  env: Env,
  tokens: string[],
  message: FcmMessage
): Promise<MulticastResult> {
  if (tokens.length === 0) return { successCount: 0, failureCount: 0, responses: [] };

  const sa = getServiceAccount(env);
  const token = await getAccessToken(env);
  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  const responses = await Promise.all(
    tokens.map(async (registrationToken): Promise<SendResponse> => {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { ...message, token: registrationToken } }),
      });
      if (res.ok) return { success: true, shouldPruneToken: false };
      const errJson = await res.json().catch(() => ({})) as { error?: { details?: Array<{ "@type"?: string; errorCode?: string }> } };
      const fcmError = (errJson?.error?.details ?? []).find(
        (d) => d["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError"
      );
      const errorCode = fcmError?.errorCode;
      return { success: false, shouldPruneToken: !!errorCode && PRUNE_ERROR_CODES.has(errorCode) };
    })
  );

  const successCount = responses.filter((r) => r.success).length;
  return { successCount, failureCount: responses.length - successCount, responses };
}
