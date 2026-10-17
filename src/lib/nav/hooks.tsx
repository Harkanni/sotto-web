'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { createContext, use, useState, useSyncExternalStore } from 'react';
import { TABS, childKey, tabOf, type Tab } from './routes';
import { getSnapshot, subscribe, type NavSnapshot } from './store';

const ServerSnapshot = createContext<NavSnapshot | null>(null);

/**
 * Captures the URL the server rendered, for server rendering and hydration. Kept stable on
 * purpose: after the first render the nav store is the source of truth, and Next.js's own
 * (slightly later) URL updates must not re-render the shell a second time.
 */
export function NavProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [snapshot] = useState<NavSnapshot>(() => {
    const query = searchParams.toString();
    const search = query ? `?${query}` : '';
    const tab = tabOf(pathname);
    return {
      href: pathname + search,
      pathname,
      search,
      idx: 0,
      intent: 'none',
      uaTransition: false,
      tabs: tabsFor(tab, pathname + search),
      seq: 0,
    };
  });
  return <ServerSnapshot value={snapshot}>{children}</ServerSnapshot>;
}

function tabsFor(active: Tab | null, href: string): Record<Tab, string> {
  return Object.fromEntries(TABS.map((t) => [t, t === active ? href : `/${t}`])) as Record<
    Tab,
    string
  >;
}

const FALLBACK: NavSnapshot = {
  href: '/home',
  pathname: '/home',
  search: '',
  idx: 0,
  intent: 'none',
  uaTransition: false,
  tabs: tabsFor('home', '/home'),
  seq: 0,
};

let renderedElsewhere: NavSnapshot | null = null;

/**
 * What the HTML on screen was rendered for. Normally the current URL. Offline, the service
 * worker may answer with a page saved for another address of the same section (it marks it
 * with `__sottoRendered`); hydrating that page as itself, then moving to the real address,
 * avoids a hydration mismatch.
 */
function hydrationSnapshot(): NavSnapshot {
  const rendered = (window as Window & { __sottoRendered?: unknown }).__sottoRendered;
  const current = getSnapshot();
  if (typeof rendered !== 'string' || rendered === current.href) return current;
  if (!renderedElsewhere) {
    const tab = tabOf(rendered);
    renderedElsewhere = {
      ...FALLBACK,
      href: rendered,
      pathname: rendered,
      tabs: tabsFor(tab, rendered),
    };
  }
  return renderedElsewhere;
}

/** The current app location. Updates synchronously when navigating. */
export function useNav(): NavSnapshot {
  const server = use(ServerSnapshot) ?? FALLBACK;
  return useSyncExternalStore(subscribe, getSnapshot, () =>
    // On the client the store already reads window.location, which matches what the server
    // rendered, so hydration can use it directly and skip a second render.
    typeof window === 'undefined' ? server : hydrationSnapshot(),
  );
}

/** The tab on screen. */
export function useActiveTab(): Tab {
  const { pathname } = useNav();
  return tabOf(pathname) ?? 'home';
}

/**
 * The key of the screen pushed on top of `key` in its tab, if any — for highlighting the open
 * item in a list pane. Re-renders only when that changes, not on every navigation.
 */
export function useChildKey(tab: Tab, key: string): string | null {
  const select = () => childKey(getSnapshot().tabs[tab], key);
  return useSyncExternalStore(subscribe, select, () => null);
}
