'use client';

import { useIsClient } from '@/lib/prefs/stored';

/**
 * During hydration a query reads as "not loaded yet", exactly as it did on the server.
 *
 * Each tab hydrates in its own <Activity> boundary, often after the session gate has already
 * fetched /me or a list into the cache. Without this, that boundary's first client render
 * would show data the server's HTML didn't have, and React would throw the HTML away. With it,
 * the first render matches, and the data appears on the very next one (no network wait).
 */
export function useHydrationSafe<T extends { data: unknown }>(result: T): T {
  const hydrated = useIsClient();
  if (hydrated) return result;
  return {
    ...result,
    data: undefined,
    status: 'pending',
    isPending: true,
    isSuccess: false,
    isError: false,
    isPlaceholderData: false,
  };
}
