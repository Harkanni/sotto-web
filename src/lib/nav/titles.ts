'use client';

import { useSyncExternalStore } from 'react';

/**
 * Screen titles by stack key. Item screens learn their title only once their data loads, and the
 * screen above needs it for its back button ("‹ Q3 roadmap"), so titles live in a tiny shared
 * store rather than in React state that would re-render every layer.
 */
const titles = new Map<string, string>();
const listeners = new Set<() => void>();

export function setTitle(key: string, title: string) {
  if (titles.get(key) === title) return;
  titles.set(key, title);
  for (const listener of listeners) listener();
}

export function getTitle(key: string): string | undefined {
  return titles.get(key);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTitle(key: string | null | undefined, fallback: string): string {
  return useSyncExternalStore(
    subscribe,
    () => (key ? (titles.get(key) ?? fallback) : fallback),
    () => fallback,
  );
}
