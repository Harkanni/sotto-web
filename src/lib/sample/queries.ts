'use client';

/**
 * TanStack Query hooks over the SAMPLE API (Phase 2). Screens use only these hooks, so swapping
 * in the real API client later changes this file, not the screens.
 */

import {
  keepPreviousData,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import * as api from './api';
import type { Doc, Meeting, Thread } from './data';

export const keys = {
  all: ['sample'] as const,
  docs: (params: Parameters<typeof api.listDocs>[0] = {}) => ['sample', 'docs', params] as const,
  doc: (id: string) => ['sample', 'doc', id] as const,
  collections: () => ['sample', 'collections'] as const,
  collection: (id: string) => ['sample', 'collection', id] as const,
  meetings: () => ['sample', 'meetings'] as const,
  meeting: (id: string) => ['sample', 'meeting', id] as const,
  threads: () => ['sample', 'threads'] as const,
  thread: (id: string) => ['sample', 'thread', id] as const,
  actionItems: () => ['sample', 'action-items'] as const,
  stats: (range: api.StatsRange) => ['sample', 'stats', range] as const,
  processing: () => ['sample', 'processing'] as const,
  continueListening: () => ['sample', 'continue-listening'] as const,
};

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

export function useDocs(params: Parameters<typeof api.listDocs>[0] = {}) {
  return useQuery({
    queryKey: keys.docs(params),
    queryFn: () => api.listDocs(params),
    // Typing in search keeps the previous results on screen instead of flashing a skeleton.
    placeholderData: keepPreviousData,
  });
}

export function useDoc(id: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: keys.doc(id),
    queryFn: () => api.getDoc(id),
    placeholderData: () => fromLists<Doc>(client, 'docs', id),
  });
}

export function useCollections() {
  return useQuery({ queryKey: keys.collections(), queryFn: api.listCollections });
}

export function useCollection(id: string) {
  return useQuery({ queryKey: keys.collection(id), queryFn: () => api.getCollection(id) });
}

export function useMeetings() {
  return useQuery({ queryKey: keys.meetings(), queryFn: api.listMeetings });
}

export function useMeeting(id: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: keys.meeting(id),
    queryFn: () => api.getMeeting(id),
    placeholderData: () => fromLists<Meeting>(client, 'meetings', id),
  });
}

export function useThreads() {
  return useQuery({ queryKey: keys.threads(), queryFn: api.listThreads });
}

export function useThread(id: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: keys.thread(id),
    queryFn: () => api.getThread(id),
    placeholderData: () => fromLists<Thread>(client, 'threads', id),
  });
}

export function useActionItems() {
  return useQuery({ queryKey: keys.actionItems(), queryFn: api.listActionItems });
}

export function useStats(range: api.StatsRange) {
  return useQuery({
    queryKey: keys.stats(range),
    queryFn: () => api.getStats(range),
    placeholderData: keepPreviousData,
  });
}

export function useProcessing() {
  return useQuery({ queryKey: keys.processing(), queryFn: api.getProcessing });
}

export function useContinueListening() {
  return useQuery({ queryKey: keys.continueListening(), queryFn: api.getContinueListening });
}

/** Re-runs every sample query, e.g. after changing the Developer settings. */
export function resetSampleQueries(client: QueryClient) {
  return client.resetQueries({ queryKey: keys.all });
}
