import { getMessaging, getToken, onMessage, isSupported } from "firebase/messaging";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { app, db } from "./firebase";

// ══════════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS (Firebase Cloud Messaging)
//
// Reuses the SAME service worker AdminShell already registers at
// scope '/admin/' (see useAdminPwa.ts / public/admin-sw.js) instead of a
// second, root-scoped `firebase-messaging-sw.js` — this keeps the guest
// site completely untouched by any of this and avoids double SW files.
// ══════════════════════════════════════════════════════════════════════════

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

/**
 * Ask the browser for notification permission and, if granted, register
 * this device's FCM token against the signed-in user's profile so the
 * `send-push` Netlify function can target it later.
 * Safe to call repeatedly (e.g. on every login) — no-ops quietly if push
 * isn't supported (Safari < 16.4, private browsing, etc.) or misconfigured.
 */
export async function registerPushToken(uid: string): Promise<void> {
  try {
    if (!VAPID_KEY) return; // not configured — silently skip, in-app + Telegram still work
    if (!(await isSupported())) return;
    if (!("serviceWorker" in navigator) || !("Notification" in window)) return;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const registration = await navigator.serviceWorker.ready;
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return;

    await updateDoc(doc(db, "users", uid), { fcmTokens: arrayUnion(token) });

    // Foreground messages: FCM does NOT show a system notification while the
    // tab is focused, so surface it via the OS Notification API ourselves.
    onMessage(messaging, (payload) => {
      const title = payload.notification?.title ?? "New notification";
      const body = payload.notification?.body ?? "";
      if (Notification.permission === "granted") {
        const n = new Notification(title, { body, icon: "/admin-icons/admin-icon-192.png" });
        n.onclick = () => {
          window.focus();
          const link = payload.data?.link;
          if (link) window.location.href = link;
        };
      }
    });
  } catch {
    // Push is a nice-to-have, never let it break sign-in or the rest of the app.
  }
}
