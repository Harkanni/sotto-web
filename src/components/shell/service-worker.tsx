'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Installs the service worker (public/sw.js) that keeps Sotto opening offline, and offers to
 * reload when a new version has been downloaded. Production only: in development it would
 * cache code that changes on every save.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const sw = navigator.serviceWorker;
    let cancelled = false;
    let reloading = false;
    let registration: ServiceWorkerRegistration | undefined;

    const reloadInto = (worker: ServiceWorker) => {
      sw.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });
      worker.postMessage({ type: 'SKIP_WAITING' });
    };

    // A waiting worker means a newer Sotto is downloaded. Reloading is yours to choose: it
    // would drop a half-written question or a scroll position.
    const offer = (worker: ServiceWorker) =>
      toast('A new version of Sotto is ready', {
        id: 'sw-update',
        duration: Infinity,
        action: { label: 'Reload', onClick: () => reloadInto(worker) },
      });

    const watch = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && sw.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          // With no controller this is the first install: nothing to replace, nothing to say.
          if (worker.state === 'installed' && sw.controller) offer(worker);
        });
      });
    };

    // An installed app can stay open for days: look for updates whenever it comes back.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void registration?.update().catch(() => {});
    };

    const register = () =>
      sw
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          if (cancelled) return;
          registration = reg;
          watch(reg);
          document.addEventListener('visibilitychange', onVisible);
        })
        .catch(() => {
          // No service worker (private mode, an old browser): the app still works online.
        });

    // After the page has loaded and gone quiet, so it never competes with the first screen.
    const idle = () => {
      if (typeof window.requestIdleCallback === 'function')
        window.requestIdleCallback(() => void register(), { timeout: 4000 });
      else setTimeout(() => void register(), 1500);
    };
    if (document.readyState === 'complete') idle();
    else window.addEventListener('load', idle, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener('load', idle);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
