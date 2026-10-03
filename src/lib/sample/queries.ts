'use client';

/**
 * TanStack Query hooks over the SAMPLE API (the labelled sample layer). Screens use only these
 * hooks, so swapping in the real API client later changes this file, not the screens. Each
 * query first resolves the workspace's SampleScope from /me and /collections (cached), so a
 * workspace without sample content is empty and restricted collections hide their files.
 */

import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import * as api from './api';
import type { Doc, Meeting, Thread } from './data';
import { useHydrationSafe } from '@/lib/api/hydration';
import { resolveScope } from './scope';

export const keys = {
  all: ['sample'] as const,
  docs: (params: DocParams = {}) => ['sample', 'docs', params] as const,
  doc: (id: string) => ['sample', 'doc', id] as const,
  docCounts: () => ['sample', 'doc-counts'] as const,
  meetings: () => ['sample', 'meetings'] as const,
  meeting: (id: string) => ['sample', 'meeting', id] as const,
  threads: () => ['sample', 'threads'] as const,
  thread: (id: string) => ['sample', 'thread', id] as const,
  actionItems: () => ['sample', 'action-items'] as const,
  stats: (range: api.StatsRange) => ['sample', 'stats', range] as const,
  processing: () => ['sample', 'processing'] as const,
  continueListening: () => ['sample', 'continue-listening'] as const,
};

type DocParams = NonNullable<Parameters<typeof api.listDocs>[1]>;

/** Finds an item already loaded by a list, so a pushed screen can show it instantly. */
function fromLists<T extends { id: string }>(
  client: QueryClient,
  prefix: string,
  id: string,
): T | undefined {
  for (const [, data] of client.getQueriesData<T[]>({ queryKey: ['sample', prefix] })) {
    const hit = Array.isArray(data) ? data.find((x) => x.id === id) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

export function useDocs(params: DocParams = {}) {
  const client = useQueryClient();
  return useHydrationSafe(
    useQuery({
      queryKey: keys.docs(params),
      queryFn: async () => api.listDocs(await resolveScope(client), params),
      // Typing in search keeps the previous results on screen instead of flashing a skeleton.
      placeholderData: keepPreviousData,
    }),
  );
}

export function useDoc(id: string) {
  const client = useQueryClient();
  return useHydrationSafe(
    useQuery({
      queryKey: keys.doc(id),
      queryFn: async () => api.getDoc(await resolveScope(client), id),
      placeholderData: () => fromLists<Doc>(client, 'docs', id),
    }),
  );
}

/** How many sample files each sample collection holds, for the collection cards in Docs. */
export function useDocCounts() {
  const client = useQueryClient();
  return useHydrationSafe(
    useQuery({
      queryKey: keys.docCounts(),
      queryFn: async () => api.docCounts(await resolveScope(client)),
    }),
  );
}

export function useMeetings() {
  const client = useQueryClient();
  return useHydrationSafe(
    useQuery({
      queryKey: keys.meetings(),
      queryFn: async () => api.listMeetings(await resolveScope(client)),
    }),
  );
}

export function useMeeting(id: string) {
  const client = useQueryClient();
  return useHydrationSafe(
    useQuery({
      queryKey: keys.meeting(id),
      queryFn: async () => api.getMeeting(await resolveScope(client), id),
      placeholderData: () => fromLists<Meeting>(client, 'meetings', id),
    }),
  );
}

export function useThreads() {
  const client = useQueryClient();
  return useHydrationSafe(
    useQuery({
      queryKey: keys.threads(),
      queryFn: async () => api.listThreads(await resolveScope(client)),
    }),
  );
}

export function useThread(id: string) {
  const client = useQueryClient();
  return useHydrationSafe(
    useQuery({
      queryKey: keys.thread(id),
      queryFn: async () => api.getThread(await resolveScope(client), id),
      placeholderData: () => fromLists<Thread>(client, 'threads', id),
    }),
  );
}

export function useActionItems() {
  const client = useQueryClient();
  return useHydrationSafe(
    useQuery({
      queryKey: keys.actionItems(),
      queryFn: async () => api.listActionItems(await resolveScope(client)),
    }),
  );
}

export function useStats(range: api.StatsRange) {
  const client = useQueryClient();
  return useHydrationSafe(
    useQuery({
      queryKey: keys.stats(range),
      queryFn: async () => api.getStats(await resolveScope(client), range),
      placeholderData: keepPreviousData,
    }),
  );
}

export function useProcessing() {
  const client = useQueryClient();
  return useHydrationSafe(
    useQuery({
      queryKey: keys.processing(),
      queryFn: async () => api.getProcessing(await resolveScope(client)),
    }),
  );
}

export function useContinueListening() {
  const client = useQueryClient();
  return useHydrationSafe(
    useQuery({
      queryKey: keys.continueListening(),
      queryFn: async () => api.getContinueListening(await resolveScope(client)),
    }),
  );
}

/** Re-runs every sample query, e.g. after changing the Developer settings. */
export function resetSampleQueries(client: QueryClient) {
  return client.resetQueries({ queryKey: keys.all });
}
