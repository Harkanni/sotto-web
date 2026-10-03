/**
 * SAMPLE API — the labelled sample layer. Answers from the in-memory sample workspace with a
 * realistic delay, so loading, empty and error states can be seen and tested. Profile →
 * Developer switches it to instant, slow, empty, failing or offline. Each read takes the
 * workspace's SampleScope (./scope): nothing unless the workspace loaded sample content, and
 * only the documents whose collection the API lets you see. Phases 4–5 replace these with the
 * generated OpenAPI client (src/lib/api); the query hooks keep their names.
 */

import { localThread, localThreads } from './answer';
import {
  ACTION_ITEMS,
  DOCS,
  MEETINGS,
  THREADS,
  WEEK_STATS,
  type ActionItem,
  type Doc,
  type Meeting,
  type Thread,
} from './data';
import type { SampleScope } from './scope';

export type SampleLatency = 'instant' | 'realistic' | 'slow';
export type SampleState = 'normal' | 'empty' | 'error' | 'offline';
export type SampleSettings = { latency: SampleLatency; state: SampleState };

const SETTINGS_KEY = 'sotto.dev.sample';
const DEFAULTS: SampleSettings = { latency: 'realistic', state: 'normal' };

export const SAMPLE_SETTINGS_KEY = SETTINGS_KEY;

export function parseSampleSettings(raw: string | null): SampleSettings {
  if (!raw) return DEFAULTS;
  try {
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<SampleSettings>) };
  } catch {
    return DEFAULTS;
  }
}

export function readSampleSettings(): SampleSettings {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    return parseSampleSettings(localStorage.getItem(SETTINGS_KEY));
  } catch {
    return DEFAULTS;
  }
}

/** An API error carries the request ID the error state shows for support. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly requestId: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class OfflineError extends Error {
  constructor() {
    super('You are offline');
    this.name = 'OfflineError';
  }
}

function requestId(): string {
  return 'req_' + Math.random().toString(16).slice(2, 14);
}

async function respond<T>(
  scope: SampleScope,
  value: () => T,
  { emptyValue }: { emptyValue?: T } = {},
): Promise<T> {
  const { latency, state } = readSampleSettings();
  const delay =
    latency === 'instant'
      ? 0
      : latency === 'slow'
        ? 2400 + Math.random() * 600
        : 160 + Math.random() * 380;
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  if (state === 'offline') throw new OfflineError();
  if (state === 'error') throw new ApiError('Sample API is set to fail', requestId());
  // A workspace without sample content has none of it: lists are empty, items not found.
  if (!scope.loaded) return (emptyValue === undefined ? null : emptyValue) as T;
  if (state === 'empty' && emptyValue !== undefined) return emptyValue;
  // Copies, so screens can't mutate the sample by accident.
  return structuredClone(value());
}

// ── In-memory workspace ────────────────────────────────────────────────────────────────
const deleted = new Set<string>();
const docs = DOCS.map((d) => ({ ...d }));
const meetings = MEETINGS.map((m) => ({ ...m }));
const threads = THREADS.map((t) => ({ ...t }));
const actionItems = ACTION_ITEMS.map((a) => ({ ...a }));

export type DocSort = 'recent' | 'name';

/** A sample document is visible when its collection is (and the workspace has samples). */
function visibleDoc(scope: SampleScope, d: Doc): boolean {
  return !deleted.has(d.id) && scope.visible[d.collectionId] !== undefined;
}

export function listDocs(
  scope: SampleScope,
  {
    collectionId,
    query,
    sort = 'recent',
  }: { collectionId?: string; query?: string; sort?: DocSort } = {},
): Promise<Doc[]> {
  return respond(
    scope,
    () => {
      const q = query?.trim().toLowerCase();
      const list = docs.filter(
        (d) =>
          visibleDoc(scope, d) &&
          (!collectionId || d.collectionId === collectionId) &&
          (!q || d.title.toLowerCase().includes(q) || d.summary.toLowerCase().includes(q)),
      );
      return list.sort((a, b) =>
        sort === 'name' ? a.title.localeCompare(b.title) : b.updatedAt - a.updatedAt,
      );
    },
    { emptyValue: [] },
  );
}

export function getDoc(scope: SampleScope, id: string): Promise<Doc | null> {
  return respond(scope, () => docs.find((d) => d.id === id && visibleDoc(scope, d)) ?? null);
}

/** How many sample documents each sample collection holds ("c_product" → 5). */
export function docCounts(scope: SampleScope): Promise<Record<string, number>> {
  return respond(
    scope,
    () => {
      const counts: Record<string, number> = {};
      for (const d of docs) {
        if (visibleDoc(scope, d)) counts[d.collectionId] = (counts[d.collectionId] ?? 0) + 1;
      }
      return counts;
    },
    { emptyValue: {} },
  );
}

export function listMeetings(scope: SampleScope): Promise<Meeting[]> {
  return respond(
    scope,
    () => meetings.filter((m) => !deleted.has(m.id)).sort((a, b) => b.startedAt - a.startedAt),
    { emptyValue: [] },
  );
}

export function getMeeting(scope: SampleScope, id: string): Promise<Meeting | null> {
  return respond(scope, () => meetings.find((m) => m.id === id && !deleted.has(id)) ?? null);
}

/**
 * Chats. Questions asked in this browser (./answer) are yours, so they show in any workspace;
 * the sample chats only with sample content.
 */
export async function listThreads(scope: SampleScope): Promise<Thread[]> {
  const sample = await respond(scope, () => threads.filter((t) => !deleted.has(t.id)), {
    emptyValue: [],
  });
  return [...structuredClone(localThreads()), ...sample]
    .filter((t) => !deleted.has(t.id))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getThread(scope: SampleScope, id: string): Promise<Thread | null> {
  if (deleted.has(id)) return null;
  const local = localThread(id);
  if (local) return structuredClone(local);
  return respond(scope, () => threads.find((t) => t.id === id) ?? null);
}

export function listActionItems(scope: SampleScope): Promise<ActionItem[]> {
  return respond(scope, () => actionItems.filter((a) => !deleted.has(a.id)), { emptyValue: [] });
}

export type StatsRange = 'week' | 'month' | 'year';

export function getStats(scope: SampleScope, range: StatsRange) {
  return respond(scope, () => WEEK_STATS[range], { emptyValue: null });
}

export function getProcessing(scope: SampleScope) {
  return respond(
    scope,
    () => meetings.filter((m) => m.status.state === 'processing' && !deleted.has(m.id)),
    { emptyValue: [] },
  );
}

export function getContinueListening(scope: SampleScope) {
  return respond(
    scope,
    () => {
      const meeting = meetings.find((m) => m.id === 'm_allhands' && !deleted.has(m.id));
      return meeting ? { meeting, positionSec: 23 * 60 + 10 } : null;
    },
    { emptyValue: null },
  );
}

// ── Mutations (instant: sample data lives in memory) ───────────────────────────────────
export type ItemKind = 'doc' | 'meeting' | 'thread';

export function deleteItem(id: string) {
  deleted.add(id);
}

export function restoreItem(id: string) {
  deleted.delete(id);
}

export function setPinned(kind: ItemKind, id: string, pinned: boolean) {
  const list: { id: string; pinned?: boolean }[] =
    kind === 'doc' ? docs : kind === 'meeting' ? meetings : [];
  const item = list.find((x) => x.id === id);
  if (item) item.pinned = pinned;
}

export function moveDoc(id: string, collectionId: string) {
  const doc = docs.find((d) => d.id === id);
  if (doc) doc.collectionId = collectionId;
}

export function docCollection(id: string): string | undefined {
  return docs.find((d) => d.id === id)?.collectionId;
}

export function setActionItemDone(id: string, done: boolean) {
  const item = actionItems.find((a) => a.id === id);
  if (item) item.done = done;
}

export function renameItem(kind: ItemKind, id: string, title: string) {
  const list: { id: string; title: string }[] =
    kind === 'doc' ? docs : kind === 'meeting' ? meetings : threads;
  const item = list.find((x) => x.id === id);
  if (item) item.title = title;
}
