'use client';

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { SendOutcome } from '@/lib/live/uploader';
import { ApiError, api, call, csrfTokenForWrite, type Schemas } from './client';
import { fileKeys } from './files';
import { useActiveWorkspace } from './hooks';
import { useHydrationSafe } from './hydration';

/**
 * Listen mode's API (Phase 7): live sessions, their audio, and the live transcript and notes
 * over Server-Sent Events. A live capture is private to the person listening until it's saved
 * (it's a file still arriving), so these screens only ever show your own captures.
 */
export type LiveSession = Schemas['LiveSession'];
export type LiveSegment = Schemas['LiveSegment'];
export type LiveNotes = Schemas['LiveNotes'];

export const liveKeys = {
  all: (ws: string) => ['api', 'w', ws, 'live'] as const,
  active: (ws: string) => ['api', 'w', ws, 'live', 'active'] as const,
  session: (ws: string, id: string) => ['api', 'w', ws, 'live', 'one', id] as const,
  /** Filled only by the event stream (it replays the transcript on connect). */
  segments: (ws: string, id: string) => ['api', 'w', ws, 'live', 'segments', id] as const,
};

/** What the notes say when they can't be written; one sentence each, with what to do. */
export const NOTES_ERROR: Record<string, string> = {
  no_model: 'Notes need an AI model. An admin can choose one in AI settings.',
  model_unavailable: 'The default AI model can’t be used right now. Check AI settings.',
  restricted_private_only:
    'Restricted meetings only get notes from a Private model, and the default runs outside Sotto.',
  confidential_not_allowed:
    'Confidential meetings don’t go to the default model. An admin can allow it in AI settings.',
  quota: 'This workspace has used its AI allowance for the month.',
  unreadable: 'The model’s notes couldn’t be read. They’ll be tried again in a few minutes.',
  failed: 'Notes couldn’t be written just now. They’ll be tried again in a few minutes.',
};

/** What a live problem means for the person listening (the capture carries on). */
export const LIVE_ERROR: Record<string, string> = {
  transcriber_unreachable: 'The live transcript is paused: transcription isn’t answering.',
  transcriber_failed: 'Part of the live transcript is missing. The saved meeting will have it all.',
  engine_outside:
    'Restricted meetings are only transcribed inside Sotto. The live transcript is off for this one.',
  save_failed: 'The meeting couldn’t be saved. The audio is kept; try Stop again in a minute.',
};

export function useLiveSession(id: string) {
  const ws = useActiveWorkspace()?.id;
  return useHydrationSafe(
    useQuery({
      queryKey: liveKeys.session(ws ?? '-', id),
      queryFn: () =>
        call(api.GET('/api/v1/live-sessions/{id}', { params: { path: { id } } })).catch(
          (error: unknown) => {
            if (error instanceof ApiError && error.status === 404) return null;
            throw error;
          },
        ),
      enabled: Boolean(ws),
      retry: (count, error) => !(error instanceof ApiError) && count < 2,
    }),
  );
}

export function useActiveLiveSessions(enabled = true) {
  const ws = useActiveWorkspace()?.id;
  return useHydrationSafe(
    useQuery({
      queryKey: liveKeys.active(ws ?? '-'),
      queryFn: async () => (await call(api.GET('/api/v1/live-sessions'))).items,
      enabled: Boolean(ws) && enabled,
    }),
  );
}

/** Lines in order, each once (the stream may resend after a reconnect). */
export function mergeSegments(
  current: readonly LiveSegment[],
  incoming: readonly LiveSegment[],
): LiveSegment[] {
  const byId = new Map(current.map((s) => [s.id, s]));
  for (const s of incoming) byId.set(s.id, s);
  return [...byId.values()].sort((a, b) => a.seq - b.seq || a.idx - b.idx);
}

function patchSession(
  client: QueryClient,
  ws: string,
  id: string,
  patch: Partial<LiveSession>,
): void {
  client.setQueryData<LiveSession | null>(liveKeys.session(ws, id), (old) =>
    old ? { ...old, ...patch } : old,
  );
}

/**
 * The live transcript and notes for one session, kept in the query cache by its event stream.
 * EventSource reconnects by itself and sends Last-Event-ID, so the api replays only what was
 * missed. Returns the lines so far and whether the stream is connected.
 */
export function useLiveStream(id: string, enabled = true) {
  const ws = useActiveWorkspace()?.id;
  const client = useQueryClient();
  const [connected, setConnected] = useState(false);
  const segments = useQuery({
    queryKey: liveKeys.segments(ws ?? '-', id),
    queryFn: () => [] as LiveSegment[],
    enabled: false,
    staleTime: Infinity,
    initialData: [] as LiveSegment[],
  }).data;

  useEffect(() => {
    if (!ws || !enabled || typeof EventSource === 'undefined') return;
    const source = new EventSource(`/api/v1/live-sessions/${encodeURIComponent(id)}/events`);
    const key = liveKeys.segments(ws, id);
    let batch: LiveSegment[] = [];
    let frame = 0;
    // Lines arrive in bursts (a replay sends the whole call): one cache write per frame.
    const flush = () => {
      frame = 0;
      const lines = batch;
      batch = [];
      client.setQueryData<LiveSegment[]>(key, (old) => mergeSegments(old ?? [], lines));
    };
    const parse = <T>(message: Event): T | null => {
      try {
        return JSON.parse((message as MessageEvent<string>).data) as T;
      } catch {
        return null;
      }
    };
    source.addEventListener('open', () => setConnected(true));
    source.addEventListener('error', () => setConnected(false));
    source.addEventListener('session', (message) => {
      const session = parse<LiveSession & { discarded?: boolean }>(message);
      if (!session) return;
      if (session.discarded) {
        client.setQueryData(liveKeys.session(ws, id), null);
        return;
      }
      if (session.file) {
        client.setQueryData(liveKeys.session(ws, id), session);
        if (session.status === 'ended') {
          void client.invalidateQueries({ queryKey: fileKeys.lists(ws) });
          void client.invalidateQueries({ queryKey: liveKeys.active(ws) });
        }
      }
    });
    source.addEventListener('segment', (message) => {
      const line = parse<LiveSegment>(message);
      if (!line) return;
      batch.push(line);
      frame ||= requestAnimationFrame(flush);
    });
    source.addEventListener('notes', (message) => {
      const data = parse<Pick<LiveSession, 'notes' | 'notesAt' | 'notesError'>>(message);
      if (data) patchSession(client, ws, id, data);
    });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      source.close();
      setConnected(false);
    };
  }, [ws, id, enabled, client]);

  return { segments, connected };
}

// ── Writes (the capture controller calls these; screens use the controller) ──────────────────

export function startLiveSession(body: Schemas['StartLive']) {
  return call(api.POST('/api/v1/live-sessions', { body }));
}

export function getLiveSession(id: string) {
  return call(api.GET('/api/v1/live-sessions/{id}', { params: { path: { id } } }));
}

export function endLiveSession(id: string) {
  return call(api.POST('/api/v1/live-sessions/{id}/end', { params: { path: { id } } }));
}

export function refreshLiveNotes(id: string) {
  return call(api.POST('/api/v1/live-sessions/{id}/notes', { params: { path: { id } } }));
}

export function openLiveChat(id: string) {
  return call(api.POST('/api/v1/live-sessions/{id}/ask', { params: { path: { id } } }));
}

/**
 * Sends one numbered chunk (raw PCM16) and says what the uploader should do next. Binary bodies
 * don't fit the JSON client, so this is a plain fetch with the same CSRF header.
 */
export async function sendLiveChunk(
  id: string,
  seq: number,
  pcm: ArrayBuffer,
): Promise<SendOutcome> {
  let response: Response;
  try {
    const token = await csrfTokenForWrite();
    response = await fetch(`/api/v1/live-sessions/${encodeURIComponent(id)}/audio?seq=${seq}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'content-type': 'application/octet-stream',
        accept: 'application/json',
        ...(token ? { 'x-csrf-token': token } : {}),
      },
      body: pcm,
    });
  } catch {
    return { ok: false, kind: 'retry' };
  }
  if (response.ok) {
    const body = (await response.json().catch(() => null)) as { nextSeq?: number } | null;
    return { ok: true, nextSeq: body?.nextSeq ?? seq + 1 };
  }
  const body = (await response.json().catch(() => null)) as {
    error?: { code?: string; message?: string };
  } | null;
  const code = body?.error?.code;
  if (response.status === 409 && code === 'CHUNK_GAP') return { ok: false, kind: 'gap' };
  if (response.status === 404 || (response.status === 409 && code !== 'LIVE_TOO_LONG')) {
    return { ok: false, kind: 'ended' };
  }
  if (response.status === 429 || response.status >= 500) return { ok: false, kind: 'retry' };
  if (response.status === 401) {
    return {
      ok: false,
      kind: 'fatal',
      message: 'You were signed out. Sign in again to keep listening.',
    };
  }
  return {
    ok: false,
    kind: 'fatal',
    message: body?.error?.message ?? 'Sotto stopped taking audio for this meeting.',
  };
}
