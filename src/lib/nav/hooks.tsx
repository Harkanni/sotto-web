'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { createContext, use, useState, useSyncExternalStore } from 'react';
import { TABS, tabOf, type Tab } from './routes';
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

/** The current app location. Updates synchronously when navigating. */
export function useNav(): NavSnapshot {
  const server = use(ServerSnapshot) ?? FALLBACK;
  return useSyncExternalStore(subscribe, getSnapshot, () =>
    // On the client the store already reads window.location, which matches what the server
    // rendered, so hydration can use it directly and skip a second render.
    typeof window === 'undefined' ? server : getSnapshot(),
  );
}

/** The tab on screen. */
export function useActiveTab(): Tab {
  const { pathname } = useNav();
  return tabOf(pathname) ?? 'home';
}
