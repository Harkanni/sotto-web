'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { useActiveWorkspace } from '@/lib/api/hooks';
import { liveKeys, useActiveLiveSessions, type LiveSession } from '@/lib/api/live';
import { useLiveCapture, type LiveCaptureState, type LivePhase } from './store';

/** A call happening now, as the Live now rows on Home and Meetings show it. */
export interface LiveNowItem {
  id: string;
  title: string;
  source: LiveSession['source'];
  /** What this device is doing with the call; `elsewhere` when it isn't the one capturing it. */
  phase: Exclude<LivePhase, 'idle'> | 'elsewhere';
  /** When the call started (ISO); null for one this device started a moment ago. */
  startedAt: string | null;
}

const OPEN: readonly LiveSession['status'][] = ['connecting', 'live'];

/**
 * The calls live right now, newest first: what the api lists, plus the one this device is
 * capturing, even before the list has caught up with it (Start, then back to Meetings within a
 * second). Pure, so the merge is unit-tested.
 */
export function liveNowItems(
  server: readonly LiveSession[] | undefined,
  local: Pick<LiveCaptureState, 'phase' | 'session'>,
): LiveNowItem[] {
  const mine = local.phase !== 'idle' ? local.session : null;
  const phase = local.phase === 'idle' ? 'elsewhere' : local.phase;
  const items: LiveNowItem[] = (server ?? [])
    .filter((s) => OPEN.includes(s.status))
    .map((s) => ({
      id: s.id,
      title: s.file.title,
      source: s.source,
      phase: mine?.id === s.id ? phase : 'elsewhere',
      startedAt: s.startedAt,
    }));
  if (mine && !items.some((item) => item.id === mine.id)) {
    items.unshift({ id: mine.id, title: mine.title, source: 'listen', phase, startedAt: null });
  }
  return items;
}

/**
 * The calls live now. The list refreshes itself when this device starts or stops listening
 * (the event stream says so too, a moment later, or not at all while it reconnects); calls
 * started or ended elsewhere arrive through `GET /events` (see `useFileEvents`).
 */
export function useLiveNow(): LiveNowItem[] {
  const query = useActiveLiveSessions();
  const capture = useLiveCapture();
  const client = useQueryClient();
  const ws = useActiveWorkspace()?.id;
  const localId = capture.phase === 'idle' ? null : (capture.session?.id ?? null);
  const previous = useRef(localId);

  useEffect(() => {
    // Only a change: mounting already fetches.
    if (previous.current === localId) return;
    previous.current = localId;
    if (ws) void client.invalidateQueries({ queryKey: liveKeys.active(ws) });
  }, [localId, client, ws]);

  const { phase, session } = capture;
  return useMemo(() => liveNowItems(query.data, { phase, session }), [query.data, phase, session]);
}
