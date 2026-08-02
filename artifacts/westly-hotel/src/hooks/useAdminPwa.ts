import { useEffect, useState, useCallback } from "react";

/**
 * Scopes PWA installability to the /admin section only.
 *
 * Deliberately NOT done in index.html / main.tsx: this app is a single SPA
 * that serves both the public guest site and the admin/staff panel from one
 * build, so a manifest link or service worker registered globally would
 * make the public site installable/cacheable too. Instead:
 *
 *   - The <link rel="manifest"> and theme-color <meta> tags are inserted
 *     into the document only while this hook is mounted, and removed on
 *     unmount. AdminShell (which wraps every authenticated /admin/* route
 *     via ProtectedRoute) is the only place this hook is called, so these
 *     tags only ever exist while an admin page is showing.
 *   - The service worker is registered with `scope: '/admin/'`, which is
 *     a browser-enforced boundary: a worker can only ever control pages
 *     whose URL falls under its scope, so it structurally cannot intercept
 *     requests from public pages, even if registration fires more than
 *     once or a public page is open in another tab.
 *
 * Unauthenticated admin routes (/admin/login, /admin/pin, /admin/setup)
 * intentionally do NOT use this hook — they render outside AdminShell, so
 * install prompts only ever appear after a real login.
 */
export function useAdminPwa() {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // ── Manifest + theme-color, scoped to this mount ──────────────────────
    const manifestLink = document.createElement("link");
    manifestLink.rel = "manifest";
    manifestLink.href = "/admin-manifest.webmanifest";
    manifestLink.setAttribute("data-admin-pwa", "true");
    document.head.appendChild(manifestLink);

    const themeMeta = document.createElement("meta");
    themeMeta.name = "theme-color";
    themeMeta.content = "#141924";
    themeMeta.setAttribute("data-admin-pwa", "true");
    document.head.appendChild(themeMeta);

    // ── Service worker, scoped to /admin/ ──────────────────────────────────
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/admin-sw.js", { scope: "/admin/" })
        .catch((err) => {
          // Non-fatal: the admin panel works fine without the SW, it just
          // won't be installable/offline-resilient until this succeeds.
          console.warn("[admin-pwa] service worker registration failed:", err);
        });
    }

    // ── Track whether already running as an installed app ─────────────────
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const updateInstalled = () =>
      setIsInstalled(standaloneQuery.matches || (navigator as any).standalone === true);
    updateInstalled();
    standaloneQuery.addEventListener?.("change", updateInstalled);

    // ── Capture the install prompt (Chrome/Edge/Android) ───────────────────
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };
    const onAppInstalled = () => {
      setCanInstall(false);
      setDeferredPrompt(null);
      setIsInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      manifestLink.remove();
      themeMeta.remove();
      standaloneQuery.removeEventListener?.("change", updateInstalled);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setCanInstall(false);
  }, [deferredPrompt]);

  return { canInstall, isInstalled, promptInstall };
}
