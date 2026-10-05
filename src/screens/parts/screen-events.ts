'use client';

import type { Sensitivity } from '@/lib/api/files';

/** Requests from row actions to the sheets that handle them (move, rename, label, tags). */
type ScreenEvents = {
  move: { id: string; title: string; collectionId: string | null };
  rename: { kind: 'doc' | 'meeting' | 'thread'; id: string; title: string };
  label: { id: string; title: string; sensitivity: Sensitivity };
  tags: { id: string; title: string; tags: string[] };
};

type Handler<K extends keyof ScreenEvents> = (detail: ScreenEvents[K]) => void;
const handlers = new Map<keyof ScreenEvents, Set<Handler<never>>>();

export function emitScreenEvent<K extends keyof ScreenEvents>(type: K, detail: ScreenEvents[K]) {
  for (const handler of handlers.get(type) ?? []) (handler as Handler<K>)(detail);
}

export function onScreenEvent<K extends keyof ScreenEvents>(type: K, handler: Handler<K>) {
  let set = handlers.get(type);
  if (!set) handlers.set(type, (set = new Set()));
  set.add(handler as Handler<never>);
  return () => {
    set.delete(handler as Handler<never>);
  };
}
