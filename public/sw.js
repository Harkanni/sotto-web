/* global self, caches, fetch, URL, Response, Headers */
/**
 * Sotto's service worker (brief §9: offline app shell).
 *
 * - The app's pages: network first, so you always get the latest; with no connection (or a
 *   connection too slow to wait for), the last copy saved on this device.
 * - Build assets (/_next/static, content-hashed): cached once, forever.
 * - Icons and the web manifest: served from the cache, refreshed in the background.
 * - /api and /mail are left to the browser: the gateway sends them to other services (the api,
 *   and the demo's mailbox). Nothing that isn't Sotto's own origin is touched.
 *
 * /sw-manifest.js (generated per build) names this build's assets and version. A new build
 * changes it, the browser installs the new worker beside the old one, and the app offers to
 * reload; the old caches are deleted once the new worker takes over.
 */
self.importScripts('/sw-manifest.js');

const { version, precache } = self.SOTTO;
const STATIC = `sotto-static-${version}`;
const PAGES = `sotto-pages-${version}`;
const ASSETS = 'sotto-assets';
const SECTIONS = ['home', 'docs', 'ask', 'meetings', 'profile'];
const SHELL = '/home';
// How long a page load waits for the network before showing the saved copy instead.
const PATIENCE_MS = 3500;
// Paths the gateway routes to other services (sotto-platform deploy/demo/Caddyfile): the api,
// and Mailpit, the demo's mailbox, behind a password. The worker must not answer them: browsers
// don't show the password prompt for a response that came through a service worker, so /mail/
// loaded its 401 over and over in any browser that had opened Sotto.
const NOT_OURS = /^\/(api|mail)(\/|$)/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const assets = await caches.open(STATIC);
      await assets.addAll(precache);
      // The app shell, so a cold start without a connection still opens Sotto. Signed out, the
      // request is redirected to sign-in: that page isn't the shell, so it isn't saved as one.
      const shell = await fetch(SHELL, { credentials: 'same-origin', cache: 'no-store' });
      if (shell.ok && !shell.redirected) await (await caches.open(PAGES)).put(SHELL, shell);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC, PAGES, ASSETS]);
      for (const key of await caches.keys()) {
        if (key.startsWith('sotto-') && !keep.has(key)) await caches.delete(key);
      }
      // Page loads start their network request while the worker boots.
      await self.registration.navigationPreload?.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const type = event.data?.type;
  // The app's "Reload" on the update toast.
  if (type === 'SKIP_WAITING') void self.skipWaiting();
  // Signing out (Phase 3) forgets every saved page.
  if (type === 'CLEAR_PAGES') event.waitUntil(caches.delete(PAGES));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NOT_OURS.test(url.pathname)) return;

  if (request.mode === 'navigate') {
    // The network request starts now, in parallel with looking for a saved copy.
    const network = (async () => (await event.preloadResponse) ?? fetch(request))();
    event.respondWith(page(url, network));
    event.waitUntil(savePage(url, network));
  } else if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
  } else if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/splash/') ||
    ['/manifest.webmanifest', '/icon.svg', '/favicon.ico', '/apple-icon.png'].includes(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(event, request));
  }
});

function sectionOf(pathname) {
  const first = pathname.split('/')[1] ?? '';
  return SECTIONS.includes(first) ? first : null;
}

/** A page load: the network if it answers in time, else the saved copy, else a plain notice. */
async function page(url, network) {
  const section = sectionOf(url.pathname);
  const pages = await caches.open(PAGES);
  // Any screen of a section can start from that section's page: the app reads the rest of the
  // address itself. The exact address is best, then its section, then Home.
  const saved = async () => {
    const exact = await pages.match(url.pathname);
    if (exact || !section) return exact;
    for (const path of [`/${section}`, SHELL]) {
      const other = await pages.match(path);
      if (other) return renderedFor(other, path);
    }
    return undefined;
  };

  try {
    const fallback = await saved();
    if (!fallback) return await network;
    // With a saved copy in hand, a hanging connection doesn't get to hold the app hostage.
    const timeout = new Promise((resolve) => setTimeout(() => resolve(fallback), PATIENCE_MS));
    return await Promise.race([network.catch(() => fallback), timeout]);
  } catch {
    return (await saved()) ?? offlinePage();
  }
}

/**
 * A page saved for another address stands in for this one. It says so (self.__sottoRendered,
 * read by the nav store), so the app hydrates it as the page it is and then moves to the
 * address you asked for, instead of tripping over the difference.
 */
async function renderedFor(response, path) {
  const html = await response.text();
  const mark = `<script>self.__sottoRendered=${JSON.stringify(path).replace(/</g, '\\u003c')}</script>`;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  return new Response(html.replace('<head>', `<head>${mark}`), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Keeps the latest copy of each app page for next time (copied before the page reads it). */
function savePage(url, network) {
  return network
    .then((response) => {
      if (
        !sectionOf(url.pathname) ||
        !response.ok ||
        response.type !== 'basic' ||
        response.redirected
      )
        return;
      const copy = response.clone();
      return caches.open(PAGES).then((pages) => pages.put(url.pathname, copy));
    })
    .catch(() => {});
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) void cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request, { ignoreSearch: true });
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => hit);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  return (await refresh) ?? Response.error();
}

function offlinePage() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Offline · Sotto</title>
<style>
:root{color-scheme:light dark;font-family:-apple-system,BlinkMacSystemFont,Inter,system-ui,sans-serif}
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:light-dark(#f2f2f7,#000);color:light-dark(#000,#fff)}
main{max-width:22rem;padding:24px;text-align:center}
h1{font-size:22px;line-height:28px;margin:0 0 8px}
p{font-size:16px;line-height:22px;margin:0 0 20px;color:light-dark(#6c6c70,rgb(235 235 245/.6))}
a{display:inline-block;min-height:44px;line-height:44px;padding:0 20px;border-radius:12px;background:#5856d6;color:#fff;text-decoration:none;font-weight:600}
</style></head><body><main>
<h1>You’re offline</h1>
<p>This page isn’t saved on this device yet. Sotto opens offline once you’ve used it with a connection.</p>
<a href="/home">Try again</a>
</main></body></html>`;
  return new Response(html, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
