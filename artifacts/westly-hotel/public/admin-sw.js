/**
 * Westly Hotel — Admin/Staff PWA service worker.
 *
 * SCOPE: registered by AdminShell with { scope: '/admin/' } — see
 * src/hooks/useAdminPwa.ts. A service worker can only ever control pages
 * that fall within its registration scope, so this worker never sees a
 * fetch/navigate event from the public site (/, /rooms, /booking, etc).
 * Guests never load this file and are never affected by it.
 *
 * STRATEGY (deliberately conservative — this is a live hotel-ops app):
 *   - Navigations (/admin/*):        network-first, cached fallback for
 *                                     offline/flaky-connection resilience.
 *   - Hashed static assets (/assets/*): cache-first (they're immutable —
 *                                     Netlify already sends long max-age).
 *   - Everything else (Firestore/RTDB SDK calls are cross-origin and never
 *     reach this file; same-origin API calls like /.netlify/functions/* and
 *     any non-GET request): always network, never cached. Live hotel data
 *     (rooms, bookings, orders, payments) must never be served stale.
 */

const CACHE_VERSION = "admin-shell-v1";
const ADMIN_SCOPE = "/admin/";

// ── Push notifications (Firebase Cloud Messaging) ───────────────────────────
// This worker doubles as the FCM service worker: src/lib/push.ts passes this
// exact registration to getToken(), so background/closed-app pushes are
// delivered here instead of needing a second, separately-scoped SW file.
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAVDs54B8LaDTbgTBYufwMCtL4PeR3Ewj4",
  authDomain: "westly-hotel.firebaseapp.com",
  projectId: "westly-hotel",
  storageBucket: "westly-hotel.firebasestorage.app",
  messagingSenderId: "463072974738",
  appId: "1:463072974738:web:a99931d0f3d06c5dd6534b",
});

try {
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || "Westly Hotel";
    const body = payload.notification?.body || "";
    const link = (payload.data && payload.data.link) || "/admin/dashboard";
    self.registration.showNotification(title, {
      body,
      icon: "/admin-icons/admin-icon-192.png",
      badge: "/admin-icons/admin-icon-192.png",
      data: { link },
      tag: payload.data?.notificationId || undefined,
    });
  });
} catch (err) {
  // Non-fatal: worker still serves the PWA shell even if messaging init fails.
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/admin/dashboard";
  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = allClients.find((c) => c.url.includes(ADMIN_SCOPE));
      if (existing) {
        existing.focus();
        existing.navigate(link);
      } else {
        clients.openWindow(link);
      }
    })()
  );
});

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("admin-shell-") && key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

// Same-origin paths that must NEVER be cached, even though they're
// same-origin GET/POST requests a controlled /admin/* page might issue.
function isNeverCache(url) {
  return (
    url.pathname.startsWith("/.netlify/functions/") ||
    url.pathname === "/admin-sw.js" ||
    url.pathname === "/admin-manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only ever act on same-origin, GET requests. Everything else (Firebase/
  // Firestore/RTDB calls, Cloudflare Worker notifications, POSTs to
  // Netlify functions) passes straight through untouched.
  if (request.method !== "GET" || !isSameOrigin(url)) return;
  if (isNeverCache(url)) return;

  // Belt-and-suspenders: even though this worker's scope is /admin/, only
  // ever apply custom handling to requests actually under that scope.
  const isAdminNavigation =
    request.mode === "navigate" && url.pathname.startsWith(ADMIN_SCOPE);
  const isHashedAsset = url.pathname.startsWith("/assets/");

  if (isAdminNavigation) {
    event.respondWith(networkFirst(request));
  } else if (isHashedAsset) {
    event.respondWith(cacheFirst(request));
  }
  // Anything else same-origin (e.g. /favicon.svg, /robots.txt) is left to
  // the browser's normal network handling — not intercepted.
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // Last resort: cached admin dashboard shell, so an installed app at
    // least opens to something recognizable while offline.
    const fallback = await cache.match("/admin/dashboard");
    if (fallback) return fallback;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}
