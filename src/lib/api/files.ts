'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import { ApiError, api, call, type Schemas } from './client';
import { useActiveWorkspace } from './hooks';
import { useHydrationSafe } from './hydration';

/**
 * Files, meetings and documents from the API (Phase 4). Keys live under the workspace, so a
 * workspace switch never shows the last one's files for a frame; live status events
 * (./events.ts) patch these caches in place.
 */
export type FileItem = Schemas['File'];
export type FileStatus = Schemas['FileStatus'];
export type FileKind = Schemas['FileKind'];
export type Sensitivity = Schemas['Sensitivity'];
export type Transcript = Schemas['Transcript'];
export type Insights = Schemas['MeetingInsights'];
export type DocumentContent = Schemas['DocumentContent'];

export type FileListParams = {
  collection?: string;
  kind?: FileKind;
  q?: string;
  trash?: boolean;
  pinned?: boolean;
  sort?: 'recent' | 'name';
};

export const fileKeys = {
  all: (ws: string) => ['api', 'w', ws, 'files'] as const,
  lists: (ws: string) => ['api', 'w', ws, 'files', 'list'] as const,
  list: (ws: string, params: FileListParams) => ['api', 'w', ws, 'files', 'list', params] as const,
  file: (ws: string, id: string) => ['api', 'w', ws, 'files', 'one', id] as const,
  content: (ws: string, id: string) => ['api', 'w', ws, 'files', 'content', id] as const,
  transcript: (ws: string, id: string) => ['api', 'w', ws, 'files', 'transcript', id] as const,
  /** Line numbers matching a search; never the same key as the transcript (different shape). */
  matches: (ws: string, id: string, q: string) =>
    ['api', 'w', ws, 'files', 'transcript', id, 'matches', q] as const,
  insights: (ws: string, id: string) => ['api', 'w', ws, 'files', 'insights', id] as const,
  peaks: (ws: string, id: string) => ['api', 'w', ws, 'files', 'peaks', id] as const,
  continue: (ws: string) => ['api', 'w', ws, 'files', 'continue'] as const,
};

/** Statuses a file passes through on its way to Ready (the Processing widget shows them). */
export const IN_PROGRESS: readonly FileStatus[] = ['uploaded', 'transcribing', 'indexing'];

/** Doesn't retry what retrying can't fix. */
function retryable(count: number, error: Error): boolean {
  const status = (error as { status?: number }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) return false;
  return count < 1;
}

/**
 * The first 100 files that match. Libraries this size fit on a phone screen many times over;
 * paging further arrives with search (Phase 5) if a workspace outgrows it.
 */
export function fetchFiles(params: FileListParams) {
  return call(
    api.GET('/api/v1/files', {
      params: {
        query: {
          limit: 100,
          sort: params.sort ?? 'recent',
          ...(params.collection ? { collection: params.collection } : {}),
          ...(params.kind ? { kind: params.kind } : {}),
          ...(params.q?.trim() ? { q: params.q.trim() } : {}),
          ...(params.trash ? { trash: 'true' as const } : {}),
          ...(params.pinned !== undefined ? { pinned: String(params.pinned) as 'true' } : {}),
        },
      },
    }),
  ).then((page) => page.items);
}

export function useFiles(params: FileListParams = {}, enabled = true) {
  const ws = useActiveWorkspace()?.id;
  return useHydrationSafe(
    useQuery({
      queryKey: fileKeys.list(ws ?? '-', params),
      queryFn: () => fetchFiles(params),
      enabled: Boolean(ws) && enabled,
      // Typing in search keeps the previous results on screen instead of flashing a skeleton.
      placeholderData: keepPreviousData,
      retry: retryable,
    }),
  );
}

/** Finds a file a list already loaded, so a pushed screen shows it at once. */
export function fileFromLists(client: QueryClient, ws: string, id: string): FileItem | undefined {
  for (const [, data] of client.getQueriesData<FileItem[]>({ queryKey: fileKeys.lists(ws) })) {
    const hit = Array.isArray(data) ? data.find((f) => f.id === id) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

export function useFile(id: string) {
  const ws = useActiveWorkspace()?.id;
  const client = useQueryClient();
  return useHydrationSafe(
    useQuery({
      queryKey: fileKeys.file(ws ?? '-', id),
      // Gone, or never yours to see: the screen says so instead of offering a Retry.
      queryFn: () =>
        call(api.GET('/api/v1/files/{id}', { params: { path: { id } } })).catch(
          (error: unknown) => {
            if (error instanceof ApiError && error.status === 404) return null;
            throw error;
          },
        ),
      enabled: Boolean(ws),
      placeholderData: () => (ws ? (fileFromLists(client, ws, id) ?? undefined) : undefined),
      retry: retryable,
    }),
  );
}

export function useFileContent(id: string, enabled: boolean) {
  const ws = useActiveWorkspace()?.id;
  return useHydrationSafe(
    useQuery({
      queryKey: fileKeys.content(ws ?? '-', id),
      queryFn: () => call(api.GET('/api/v1/files/{id}/content', { params: { path: { id } } })),
      enabled: Boolean(ws) && enabled,
      staleTime: Infinity, // a document's text doesn't change once read
      retry: retryable,
    }),
  );
}

export function useTranscript(id: string, enabled: boolean) {
  const ws = useActiveWorkspace()?.id;
  return useHydrationSafe(
    useQuery({
      queryKey: fileKeys.transcript(ws ?? '-', id),
      queryFn: () =>
        call(api.GET('/api/v1/files/{id}/transcript', { params: { path: { id }, query: {} } })),
      enabled: Boolean(ws) && enabled,
      staleTime: Infinity,
      retry: retryable,
    }),
  );
}

/** Lines matching `q` in a transcript (server-side, so long meetings stay cheap). */
export function useTranscriptMatches(id: string, q: string) {
  const ws = useActiveWorkspace()?.id;
  const term = q.trim();
  return useQuery({
    queryKey: fileKeys.matches(ws ?? '-', id, term),
    queryFn: () =>
      call(
        api.GET('/api/v1/files/{id}/transcript', {
          params: { path: { id }, query: { q: term } },
        }),
      ).then((t) => t.matches ?? []),
    enabled: Boolean(ws) && term.length > 0,
    placeholderData: keepPreviousData,
    retry: retryable,
  });
}

export function useInsights(id: string, enabled: boolean) {
  const ws = useActiveWorkspace()?.id;
  return useHydrationSafe(
    useQuery({
      queryKey: fileKeys.insights(ws ?? '-', id),
      queryFn: () => call(api.GET('/api/v1/files/{id}/insights', { params: { path: { id } } })),
      enabled: Boolean(ws) && enabled,
      retry: retryable,
    }),
  );
}

export function usePeaks(id: string, enabled: boolean) {
  const ws = useActiveWorkspace()?.id;
  return useQuery({
    queryKey: fileKeys.peaks(ws ?? '-', id),
    queryFn: () =>
      call(api.GET('/api/v1/files/{id}/peaks', { params: { path: { id } } })).catch(
        (error: unknown) => {
          // No waveform (sample meetings, older files): the player draws a plain track.
          if (error instanceof ApiError && error.status === 404) return null;
          throw error;
        },
      ),
    enabled: Boolean(ws) && enabled,
    staleTime: Infinity,
    retry: retryable,
  });
}

export function useContinueListening() {
  const ws = useActiveWorkspace()?.id;
  return useHydrationSafe(
    useQuery({
      queryKey: fileKeys.continue(ws ?? '-'),
      queryFn: () => call(api.GET('/api/v1/continue-listening')),
      enabled: Boolean(ws),
      retry: retryable,
    }),
  );
}

/** A short-lived link to the original; `inline` streams it (the player), otherwise it's saved. */
export function fileLink(id: string, inline: boolean) {
  return call(
    api.GET('/api/v1/files/{id}/download', {
      params: { path: { id }, query: { inline: inline ? 'true' : 'false' } },
    }),
  );
}

// ── Changes ─────────────────────────────────────────────────────────────────────────────────

/** Replaces one file everywhere it's cached (lists and detail), without a refetch. */
export function patchFile(
  client: QueryClient,
  ws: string,
  file: Partial<FileItem> & { id: string },
) {
  client.setQueriesData<FileItem[]>({ queryKey: fileKeys.lists(ws) }, (list) =>
    Array.isArray(list) ? list.map((f) => (f.id === file.id ? { ...f, ...file } : f)) : list,
  );
  client.setQueryData<FileItem | null>(fileKeys.file(ws, file.id), (f) =>
    f ? { ...f, ...file } : f,
  );
}

/** Takes a file out of every cached list at once (trash, delete, move away). */
export function dropFile(client: QueryClient, ws: string, id: string) {
  client.setQueriesData<FileItem[]>({ queryKey: fileKeys.lists(ws) }, (list) =>
    Array.isArray(list) ? list.filter((f) => f.id !== id) : list,
  );
}

export function refreshFiles(client: QueryClient, ws: string) {
  return client.invalidateQueries({ queryKey: fileKeys.all(ws) });
}

export function useUpdateFile() {
  const client = useQueryClient();
  const ws = useActiveWorkspace()?.id ?? '-';
  return useMutation({
    mutationFn: ({ id, ...body }: Schemas['UpdateFile'] & { id: string }) =>
      call(api.PATCH('/api/v1/files/{id}', { params: { path: { id } }, body })),
    onMutate: ({ id, title, pinned, tags }) => {
      // Rename, pin and tags show at once; the answer confirms them.
      patchFile(client, ws, {
        id,
        ...(title !== undefined ? { title } : {}),
        ...(pinned !== undefined ? { pinned } : {}),
        ...(tags !== undefined ? { tags } : {}),
      });
    },
    onSuccess: (file) => {
      patchFile(client, ws, file);
      void client.invalidateQueries({ queryKey: fileKeys.lists(ws) });
    },
    onError: () => void refreshFiles(client, ws),
  });
}

export function useTrashFile() {
  const client = useQueryClient();
  const ws = useActiveWorkspace()?.id ?? '-';
  return useMutation({
    mutationFn: (id: string) =>
      call(api.DELETE('/api/v1/files/{id}', { params: { path: { id } } })),
    onMutate: (id) => dropFile(client, ws, id),
    onSettled: () => refreshFiles(client, ws),
  });
}

export function useRestoreFile() {
  const client = useQueryClient();
  const ws = useActiveWorkspace()?.id ?? '-';
  return useMutation({
    mutationFn: (id: string) =>
      call(api.POST('/api/v1/files/{id}/restore', { params: { path: { id } } })),
    onMutate: (id) => dropFile(client, ws, id),
    onSettled: () => refreshFiles(client, ws),
  });
}

export function useDeleteForever() {
  const client = useQueryClient();
  const ws = useActiveWorkspace()?.id ?? '-';
  return useMutation({
    mutationFn: (id: string) =>
      call(api.DELETE('/api/v1/files/{id}/permanent', { params: { path: { id } } })),
    onMutate: (id) => dropFile(client, ws, id),
    onSettled: () => refreshFiles(client, ws),
  });
}

export function useRetryFile() {
  const client = useQueryClient();
  const ws = useActiveWorkspace()?.id ?? '-';
  return useMutation({
    mutationFn: (id: string) =>
      call(api.POST('/api/v1/files/{id}/retry', { params: { path: { id } } })),
    onSuccess: (file) => patchFile(client, ws, file),
  });
}

/**
 * Saves where you are in a recording: at most every 10 seconds while playing, and at once on
 * pause or when the screen goes away (sendBeacon can't carry the CSRF header, so a keepalive
 * fetch does).
 */
export function useSavePosition(id: string, enabled: boolean) {
  const last = useRef({ saved: -1, at: 0 });
  const ws = useActiveWorkspace()?.id;
  const client = useQueryClient();

  const save = useCallback(
    (positionMs: number, force = false) => {
      if (!enabled || !ws) return;
      const ms = Math.max(0, Math.round(positionMs));
      const now = Date.now();
      if (!force && (now - last.current.at < 10_000 || Math.abs(ms - last.current.saved) < 2_000))
        return;
      if (force && ms === last.current.saved) return;
      last.current = { saved: ms, at: now };
      void call(
        api.PUT('/api/v1/files/{id}/position', {
          params: { path: { id } },
          body: { positionMs: ms },
          // Outlives the page: a save on the way out still lands.
          keepalive: true,
        } as never),
      )
        .then(() => client.invalidateQueries({ queryKey: fileKeys.continue(ws) }))
        .catch(() => undefined); // a missed save only costs a few seconds of "where was I"
    },
    [enabled, ws, id, client],
  );

  return save;
}

export type ActionItem = Schemas['ActionItems'][number];

/** Action items from recent meetings (the api marks the ones whose owner is plausibly you). */
export function useActionItems() {
  const ws = useActiveWorkspace()?.id;
  return useHydrationSafe(
    useQuery({
      queryKey: ['api', 'w', ws ?? '-', 'files', 'action-items'] as const,
      queryFn: () => call(api.GET('/api/v1/action-items')),
      enabled: Boolean(ws),
      retry: retryable,
    }),
  );
}
