/// <reference types="vite-plugin-pwa/react" />
// Service worker registration and its two messages: "Ready to work offline" after the first
// install, and "A new version is available" when an update is waiting (registerType 'prompt' in
// vite.config.ts, so an update never reloads the page under a student mid-edit).
import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from './ui';
import './update-toast.css';

/** how often an open app checks for a new version (phones keep the app open for days) */
export const UPDATE_CHECK_MS = 60 * 60 * 1000;
/** the offline-ready note goes away on its own */
export const OFFLINE_READY_MS = 6000;

/** Checks for a new service worker every UPDATE_CHECK_MS and whenever the app comes back to the foreground. */
export function watchForUpdates(reg: ServiceWorkerRegistration, everyMs = UPDATE_CHECK_MS): () => void {
  const check = () => {
    if (reg.installing || !navigator.onLine) return;
    reg.update().catch(() => {
      // offline or the server hiccuped; the next check will try again
    });
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') check();
  };
  const timer = setInterval(check, everyMs);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

export default function UpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (reg) watchForUpdates(reg);
    },
  });

  useEffect(() => {
    if (!offlineReady || needRefresh) return;
    const t = setTimeout(() => setOfflineReady(false), OFFLINE_READY_MS);
    return () => clearTimeout(t);
  }, [offlineReady, needRefresh, setOfflineReady]);

  // The live region stays mounted so screen readers announce the messages as they appear
  return (
    <div className="update-toast-region" aria-live="polite">
      {needRefresh ? (
        <div className="update-toast">
          <p className="update-toast-text">A new version is available.</p>
          <div className="update-toast-actions">
            <Button variant="ghost" small onClick={() => setNeedRefresh(false)}>
              Later
            </Button>
            {/* activates the waiting service worker, which then reloads the page */}
            <Button variant="primary" small onClick={() => void updateServiceWorker(true)}>
              Reload
            </Button>
          </div>
        </div>
      ) : offlineReady ? (
        <div className="update-toast">
          <p className="update-toast-text">Ready to work offline.</p>
          <div className="update-toast-actions">
            <Button variant="ghost" small onClick={() => setOfflineReady(false)}>
              OK
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
