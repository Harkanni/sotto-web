'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Activity, startTransition, useEffect, useState } from 'react';
import { fileQueries } from '@/lib/api/files';
import { parseStack, pushPath, type ItemKind, type StackEntry, type Tab } from '@/lib/nav/routes';
import { LayerContext, type LayerInfo } from './stack-context';

/** One screen of each kind that opens from a list, and where its first item comes from. */
const KINDS: {
  tab: Tab;
  kind: ItemKind;
  list: readonly unknown[];
  pick?: (item: { kind?: string }) => boolean;
}[] = [
  { tab: 'docs', kind: 'doc', list: ['api'], pick: (f) => f.kind === 'document' },
  { tab: 'meetings', kind: 'meeting', list: ['api'], pick: (f) => f.kind === 'audio' },
  { tab: 'ask', kind: 'thread', list: ['sample', 'threads'] },
];

const noop = () => {};

/**
 * The first time a kind of screen opens, its code runs cold: the browser compiles it while it
 * renders, so the very first push of a document, meeting or chat is slower than every one after.
 * Once the app is idle (and the tabs have woken and loaded their lists), this renders one of
 * each in a hidden <Activity>: React builds it at idle priority with no effects, no layout and
 * nothing on screen, so the first real push runs warm.
 */
export function ScreenWarmup({
  renderScreen,
}: {
  renderScreen: (entry: StackEntry) => React.ReactNode;
}) {
  const client = useQueryClient();
  const [layers, setLayers] = useState<LayerInfo[]>([]);

  useEffect(() => {
    let idle: number | undefined;
    const warm = () => {
      const found: LayerInfo[] = [];
      const loading: Promise<unknown>[] = [];
      for (const { tab, kind, list, pick } of KINDS) {
        // Files lists live under ['api', 'w', <workspace>, 'files', 'list', …]; chats are samples.
        const hit = client
          .getQueriesData<{ id: string; kind?: string; status?: string }[]>({ queryKey: list })
          .filter(([key]) => !pick || key.includes('files'))
          .map(([key, data]) => {
            const item = Array.isArray(data)
              ? data.find((x) => (!pick || pick(x)) && (!x.status || x.status === 'ready'))
              : undefined;
            return item ? { item, ws: String(key[2]) } : undefined;
          })
          .find(Boolean);
        if (!hit) continue;
        const first = hit.item;
        // A hidden <Activity> runs no effects, so its queries never fetch: load the body first,
        // or the warm render is a skeleton and the first push still renders the reader cold.
        if (kind === 'doc')
          loading.push(client.prefetchQuery(fileQueries.content(hit.ws, first.id)));
        if (kind === 'meeting') {
          loading.push(client.prefetchQuery(fileQueries.transcript(hit.ws, first.id)));
          loading.push(client.prefetchQuery(fileQueries.insights(hit.ws, first.id)));
        }
        const stack = parseStack(pushPath(`/${tab}`, kind, first.id));
        const entry = stack[stack.length - 1]!;
        found.push({ tab, entry, depth: 1, parent: stack[0]!, registerScroller: noop });
      }
      void Promise.allSettled(loading).then(() => startTransition(() => setLayers(found)));
    };
    // After the shell has woken the tabs (from 1.5 s, one at a time) and they've loaded.
    const timer = setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function')
        idle = window.requestIdleCallback(warm, { timeout: 4000 });
      else warm();
    }, 5000);
    return () => {
      clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback?.(idle);
    };
  }, [client]);

  if (!layers.length) return null;
  return (
    <Activity mode="hidden" name="warmup">
      {layers.map((layer) => (
        <LayerContext key={layer.entry.key} value={layer}>
          {renderScreen(layer.entry)}
        </LayerContext>
      ))}
    </Activity>
  );
}
