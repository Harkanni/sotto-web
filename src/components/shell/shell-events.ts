'use client';

import type { Tab } from '@/lib/nav/routes';

/**
 * A few app-wide signals between parts of the shell that don't share a React parent
 * (tab bar → stacks, keyboard shortcuts → sheets and palettes).
 */
type ShellEvents = {
  /** The active tab was tapped again. */
  'tab-reselect': Tab;
  /** Open the "Add to Sotto" sheet. */
  'open-add': undefined;
  /** Open the ⌘K palette. */
  'open-palette': undefined;
  /** Open the ⌘K palette, or close it if it's open (⌘K itself). */
  'toggle-palette': undefined;
  /** Open the system file picker for documents or audio (the palette's Upload commands). */
  'pick-files': 'files' | 'audio';
  /** Open the keyboard shortcuts sheet. */
  'open-shortcuts': undefined;
};

type Handler<K extends keyof ShellEvents> = (detail: ShellEvents[K]) => void;

const handlers = new Map<keyof ShellEvents, Set<Handler<never>>>();

export function emitShellEvent<K extends keyof ShellEvents>(
  type: K,
  ...[detail]: ShellEvents[K] extends undefined ? [] : [ShellEvents[K]]
) {
  for (const handler of handlers.get(type) ?? []) (handler as Handler<K>)(detail as ShellEvents[K]);
}

export function onShellEvent<K extends keyof ShellEvents>(
  type: K,
  handler: Handler<K>,
): () => void {
  let set = handlers.get(type);
  if (!set) handlers.set(type, (set = new Set()));
  set.add(handler as Handler<never>);
  return () => set.delete(handler as Handler<never>);
}
