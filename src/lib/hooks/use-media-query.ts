'use client';

import { useSyncExternalStore } from 'react';

/**
 * Subscribes to a media query. Returns `serverValue` during server rendering and hydration, then
 * the real value, so markup never mismatches. Prefer CSS for layout; use this for behaviour
 * (which gesture to run, whether a layer is inert).
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

/** ≥ 1024 px: sidebar, list and detail panes. */
export const WIDE_QUERY = '(min-width: 1024px)';
/** ≥ 768 px: sidebar instead of the tab bar. */
export const SIDEBAR_QUERY = '(min-width: 768px)';

export function useIsWide(): boolean {
  return useMediaQuery(WIDE_QUERY);
}
