/**
 * SAMPLE API — Phase 2 only. Answers from the in-memory sample workspace with a realistic delay,
 * so loading, empty and error states can be seen and tested. Profile → Developer switches it to
 * instant, slow, empty, failing or offline. Phase 3 onwards replaces each function with the
 * generated OpenAPI client (src/lib/api); the query hooks keep their names.
 */

import { localThread, localThreads } from './answer';
import {
  ACTION_ITEMS,
  COLLECTIONS,
  DOCS,
  MEETINGS,
  THREADS,
  WEEK_STATS,
  type ActionItem,
  type Collection,
  type Doc,
  type Meeting,
  type Thread,
} from './data';

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

async function respond<T>(value: () => T, { emptyValue }: { emptyValue?: T } = {}): Promise<T> {
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

export function listDocs({
  collectionId,
  query,
  sort = 'recent',
}: { collectionId?: string; query?: string; sort?: DocSort } = {}): Promise<Doc[]> {
  return respond(
    () => {
      const q = query?.trim().toLowerCase();
      const list = docs.filter(
        (d) =>
          !deleted.has(d.id) &&
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

export function getDoc(id: string): Promise<Doc | null> {
  return respond(() => docs.find((d) => d.id === id && !deleted.has(id)) ?? null);
}

export function listCollections(): Promise<(Collection & { count: number })[]> {
  return respond(
    () =>
      COLLECTIONS.map((c) => ({
        ...c,
        count: docs.filter((d) => d.collectionId === c.id && !deleted.has(d.id)).length,
      })),
    { emptyValue: [] },
  );
}

export function getCollection(id: string): Promise<Collection | null> {
  return respond(() => COLLECTIONS.find((c) => c.id === id) ?? null);
}

export function listMeetings(): Promise<Meeting[]> {
  return respond(
    () => meetings.filter((m) => !deleted.has(m.id)).sort((a, b) => b.startedAt - a.startedAt),
    { emptyValue: [] },
  );
}

export function getMeeting(id: string): Promise<Meeting | null> {
  return respond(() => meetings.find((m) => m.id === id && !deleted.has(id)) ?? null);
}

export function listThreads(): Promise<Thread[]> {
  return respond(
    () =>
      [...localThreads(), ...threads]
        .filter((t) => !deleted.has(t.id))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    { emptyValue: [] },
  );
}

export function getThread(id: string): Promise<Thread | null> {
  return respond(() => {
    if (deleted.has(id)) return null;
    return localThread(id) ?? threads.find((t) => t.id === id) ?? null;
  });
}

export function listActionItems(): Promise<ActionItem[]> {
  return respond(() => actionItems.filter((a) => !deleted.has(a.id)), { emptyValue: [] });
}

export type StatsRange = 'week' | 'month' | 'year';

export function getStats(range: StatsRange) {
  return respond(() => WEEK_STATS[range], { emptyValue: null });
}

export function getProcessing() {
  return respond(
    () => meetings.filter((m) => m.status.state === 'processing' && !deleted.has(m.id)),
    { emptyValue: [] },
  );
}

export function getContinueListening() {
  return respond(
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
