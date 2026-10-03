'use client';

import type { QueryClient } from '@tanstack/react-query';
import {
  apiKeys,
  fetchCollections,
  fetchMe,
  useActiveWorkspace,
  useWorkspaceCollections,
  type Collection,
} from '@/lib/api/hooks';

/**
 * Which part of the labelled sample layer this workspace shows (Phase 3; Phase 4 makes the
 * files real). Nothing, unless the workspace loaded sample content; then only the documents
 * whose collection the API lets you see, so a restricted sample collection hides its files.
 */
export type SampleScope = {
  loaded: boolean;
  /** Sample collection id ("c_board") → the real collection's id, for the ones you can see. */
  visible: Record<string, string>;
};

export const EMPTY_SCOPE: SampleScope = { loaded: false, visible: {} };

/** The sample keys the API names ("board") are the web's collection ids without "c_". */
export function sampleIdOf(key: string): string {
  return `c_${key}`;
}

let override: SampleScope | null = null;

/**
 * Storybook and unit tests show the sample workspace without an API. Never used by the app.
 */
export function setSampleScopeOverride(scope: SampleScope | null) {
  override = scope;
}

/**
 * Resolves the scope from /me and /collections, reusing whatever the cache already holds.
 * Errors (offline, signed out) pass through, so sample widgets show their own error states.
 */
export async function resolveScope(client: QueryClient): Promise<SampleScope> {
  if (override) return override;
  const me = await client.fetchQuery({ queryKey: apiKeys.me, queryFn: fetchMe, staleTime: 60_000 });
  const workspace = me.workspace;
  if (!workspace?.sample) return EMPTY_SCOPE;
  const collections = await client.fetchQuery({
    queryKey: apiKeys.collections(workspace.id),
    queryFn: fetchCollections,
    staleTime: 30_000,
  });
  const seen = new Set(collections.map((c) => c.id));
  const visible: Record<string, string> = {};
  for (const [key, id] of Object.entries(workspace.sample.collections)) {
    if (seen.has(id)) visible[sampleIdOf(key)] = id;
  }
  return { loaded: true, visible };
}

/**
 * The workspace's sample collections you can see, as the real collections they are (their
 * current names and restriction), keyed by sample id. Empty without sample content.
 */
export function useSampleCollections(): { sampleId: string; collection: Collection }[] {
  const sample = useActiveWorkspace()?.sample;
  const collections = useWorkspaceCollections().data;
  if (!sample || !collections) return [];
  const byId = new Map(collections.map((c) => [c.id, c]));
  return Object.entries(sample.collections).flatMap(([key, id]) => {
    const collection = byId.get(id);
    return collection ? [{ sampleId: sampleIdOf(key), collection }] : [];
  });
}
