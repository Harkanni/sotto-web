'use client';

import { useSyncExternalStore } from 'react';

/**
 * Small per-device preferences kept in localStorage (handedness, review settings), read with
 * useSyncExternalStore so every reader updates together and server markup uses the default.
 */

const EVENT = 'sotto:stored';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode: the choice lasts for this page only.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** The raw stored string (or null), with `serverValue` during server render and hydration. */
export function useStored(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => readStored(key),
    () => null,
  );
}

const noop = () => () => {};

/** False during server render and hydration, true after: for client-only details. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
