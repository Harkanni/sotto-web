'use client';

/**
 * Client navigation for the app shell.
 *
 * Moving between screens is a `history.pushState`, not a Next.js route change: there is no
 * server round trip, so a push starts animating on the very next frame, and navigation keeps
 * working offline. Next.js patches pushState, so `usePathname()` stays in sync, and a reload
 * of any URL renders the same screen on the server.
 *
 * This module keeps the current location as an external store (read with useSyncExternalStore,
 * so updates render synchronously inside the tap's event), the in-app history (to tell back
 * from forward and to reuse history entries when going up a stack), and each tab's last URL
 * (switching tabs returns to where you were).
 */

import { TABS, tabOf, type Tab } from './routes';

export type NavIntent = 'forward' | 'back' | 'none';

export type NavSnapshot = {
  /** pathname + search */
  href: string;
  pathname: string;
  search: string;
  /** Position in the in-app history. */
  idx: number;
  /** How we got here: our own navigation, browser back/forward, or unknown (a reload). */
  intent: NavIntent;
  /** The browser already animated this change (Safari's swipe-back), so don't animate again. */
  uaTransition: boolean;
  /** Every tab's current URL: where each tab returns to when you switch to it. */
  tabs: Record<Tab, string>;
  /** Increments on every change. */
  seq: number;
};

type Listener = () => void;

const STORAGE_KEY = 'sotto.nav';

let snapshot: NavSnapshot | null = null;
let log: string[] = [];
let tabHrefs: Partial<Record<Tab, string>> = {};
const listeners = new Set<Listener>();
let started = false;

function hrefOf(loc: Location | URL): string {
  return loc.pathname + loc.search;
}

function splitHref(href: string): { pathname: string; search: string } {
  const q = href.indexOf('?');
  return q === -1
    ? { pathname: href, search: '' }
    : { pathname: href.slice(0, q), search: href.slice(q) };
}

function readStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as { log?: unknown; tabs?: unknown };
    if (Array.isArray(saved.log)) log = saved.log.filter((x): x is string => typeof x === 'string');
    if (saved.tabs && typeof saved.tabs === 'object') {
      for (const tab of TABS) {
        const href = (saved.tabs as Record<string, unknown>)[tab];
        if (typeof href === 'string' && tabOf(href) === tab) tabHrefs[tab] = href;
      }
    }
  } catch {
    // Private mode or corrupt data: start fresh.
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function writeStorage() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ log: log.slice(-50), tabs: tabHrefs }));
    } catch {
      // Storage full or unavailable: navigation still works, it just won't survive a reload.
    }
  }, 150);
}

function emit() {
  for (const listener of listeners) listener();
}

function tabsSnapshot(): Record<Tab, string> {
  return Object.fromEntries(TABS.map((tab) => [tab, tabHrefs[tab] ?? `/${tab}`])) as Record<
    Tab,
    string
  >;
}

function set(next: Omit<NavSnapshot, 'seq' | 'pathname' | 'search' | 'tabs'>) {
  const { pathname, search } = splitHref(next.href);
  const tab = tabOf(pathname);
  if (tab) tabHrefs[tab] = next.href;
  snapshot = { ...next, pathname, search, tabs: tabsSnapshot(), seq: (snapshot?.seq ?? 0) + 1 };
  writeStorage();
  emit();
}

function initialSnapshot(): NavSnapshot {
  if (!snapshot) {
    readStorage();
    const href = hrefOf(window.location);
    const state = window.history.state as { sottoIdx?: unknown } | null;
    const idx = typeof state?.sottoIdx === 'number' ? state.sottoIdx : 0;
    if (log[idx] !== href) log = [...log.slice(0, idx), href];
    const { pathname, search } = splitHref(href);
    const tab = tabOf(pathname);
    if (tab) tabHrefs[tab] = href;
    snapshot = {
      href,
      pathname,
      search,
      idx,
      intent: 'none',
      uaTransition: false,
      tabs: tabsSnapshot(),
      seq: 0,
    };
  }
  return snapshot;
}

function onPopState(event: PopStateEvent) {
  const current = initialSnapshot();
  const href = hrefOf(window.location);
  const state = event.state as { sottoIdx?: unknown } | null;
  const idx = typeof state?.sottoIdx === 'number' ? state.sottoIdx : null;
  const intent: NavIntent =
    idx === null ? 'none' : idx < current.idx ? 'back' : idx > current.idx ? 'forward' : 'none';
  if (idx !== null) log[idx] = href;
  set({
    href,
    idx: idx ?? current.idx,
    intent,
    // Safari animates its own edge-swipe (and Chrome its predictive back): don't animate twice.
    uaTransition:
      (event as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition === true,
  });
}

/**
 * Wires the store to the browser. Call once on the client after hydration (the app shell does).
 * Returns a cleanup for tests and hot reloads.
 */
export function startNavigation(): () => void {
  if (started) return () => {};
  started = true;
  const current = initialSnapshot();
  // Tag the entry we landed on so a later back/forward can tell which way it went.
  const state = (window.history.state ?? {}) as Record<string, unknown>;
  if (state.sottoIdx !== current.idx)
    window.history.replaceState({ ...state, sottoIdx: current.idx }, '');
  window.addEventListener('popstate', onPopState);
  return () => {
    started = false;
    window.removeEventListener('popstate', onPopState);
  };
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): NavSnapshot {
  return initialSnapshot();
}

export type NavigateOptions = {
  /** Replace the current history entry instead of adding one. */
  replace?: boolean;
  /** Which way this feels: forward (push), back (pop) or none (instant). Default forward. */
  intent?: NavIntent;
};

/** Go to an app URL. URLs outside the app shell load normally. */
export function navigate(
  href: string,
  { replace = false, intent = 'forward' }: NavigateOptions = {},
) {
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin || !tabOf(url.pathname)) {
    window.location.assign(url.href);
    return;
  }
  const target = hrefOf(url);
  const current = initialSnapshot();
  if (target === current.href) return;

  const idx = replace ? current.idx : current.idx + 1;
  log = [...log.slice(0, idx), target];
  if (replace) window.history.replaceState({ sottoIdx: idx }, '', target);
  else window.history.pushState({ sottoIdx: idx }, '', target);
  set({ href: target, idx, intent, uaTransition: false });
}

/**
 * Go up to `target` (an ancestor in the current stack, or a tab root). When the browser history
 * already holds `target` just behind us, step back through it, so the back button and browser
 * history agree; otherwise replace the current entry (going up never adds history).
 */
export function navigateUp(target: string) {
  const current = initialSnapshot();
  const tab = tabOf(current.pathname);
  for (let i = current.idx - 1; i >= 0; i--) {
    const entry = log[i];
    if (entry === undefined) break;
    const { pathname } = splitHref(entry);
    if (tabOf(pathname) !== tab) break;
    if (pathname === target) {
      window.history.go(i - current.idx);
      return;
    }
    // Only walk back through deeper screens of the same stack.
    if (!pathname.startsWith(target + '/')) break;
  }
  navigate(target, { replace: true, intent: 'back' });
}

/** The URL a tab returns to: where you left it, or its root. */
export function tabHref(tab: Tab): string {
  initialSnapshot();
  return tabHrefs[tab] ?? `/${tab}`;
}

/** Test helper: forget everything. */
export function resetNavigationForTests() {
  snapshot = null;
  log = [];
  tabHrefs = {};
  started = false;
  listeners.clear();
}
