'use client';

import { useSyncExternalStore } from 'react';
import { ApiError, OfflineError, api, call } from '@/lib/api/client';
import { AbortedError, PartFailedError, runUpload, type Transport } from './engine';

/**
 * Every upload in this tab: what's queued, moving, paused or failed. A tiny external store
 * (useSyncExternalStore), so the + button's ring, the Add sheet's list and Home's Processing
 * widget all read the same state without re-rendering the shell.
 *
 * Files stay in memory, so an upload resumes across pauses and dropped connections, not across
 * a reload (the browser forgets the file). Two files move at a time; the rest wait their turn.
 */

export type UploadState =
  'queued' | 'uploading' | 'paused' | 'finishing' | 'done' | 'failed' | 'canceled';

export interface UploadItem {
  id: string;
  fileId: string | null;
  name: string;
  title: string;
  size: number;
  sent: number;
  kind: 'document' | 'audio';
  state: UploadState;
  /** Paused because the device went offline: resumes by itself when it's back. */
  offline: boolean;
  /** Written for people; shown under the row. */
  error: string | null;
  /** Retrying can't fix it (wrong type, too large): no Retry button. */
  final: boolean;
}

export interface AddOptions {
  collectionId?: string | null;
  source?: 'upload' | 'recording';
  /** A title for a single file (the recorder names its recording). */
  title?: string;
}

interface Entry {
  item: UploadItem;
  file: Blob;
  filename: string;
  mime: string;
  options: AddOptions;
  controller: AbortController | null;
}

const MAX_ACTIVE = 2;
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let snapshot: UploadItem[] = [];
let counter = 0;
const doneListeners = new Set<(item: UploadItem) => void>();

function emit() {
  snapshot = [...entries.values()].map((e) => e.item);
  for (const listener of listeners) listener();
}

function update(id: string, patch: Partial<UploadItem>) {
  const entry = entries.get(id);
  if (!entry) return;
  entry.item = { ...entry.item, ...patch };
  emit();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUploads(): UploadItem[] {
  return snapshot;
}

const EMPTY: UploadItem[] = [];

/** All uploads in this tab, newest first. */
export function useUploads(): UploadItem[] {
  return useSyncExternalStore(subscribe, getUploads, () => EMPTY);
}

/** Called when an upload finishes (the shell refreshes file lists then). */
export function onUploadDone(listener: (item: UploadItem) => void) {
  doneListeners.add(listener);
  return () => {
    doneListeners.delete(listener);
  };
}

/** Aggregate progress of everything still moving, 0–1, or null when nothing is. */
export function overallProgress(items: readonly UploadItem[]): number | null {
  const moving = items.filter((i) =>
    ['queued', 'uploading', 'paused', 'finishing'].includes(i.state),
  );
  if (!moving.length) return null;
  const total = moving.reduce((s, i) => s + i.size, 0) || 1;
  return moving.reduce((s, i) => s + i.sent, 0) / total;
}

// ── Transport ───────────────────────────────────────────────────────────────────────────────

class StorageHttpError extends Error {
  constructor(readonly status: number) {
    super(`Storage answered ${status}`);
    this.name = 'StorageHttpError';
  }
}

/** One part, PUT straight to storage. XHR because fetch can't report upload progress. */
export function putPart(
  url: string,
  body: Blob,
  onProgress: (sent: number) => void,
  signal: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () => {
      const etag = xhr.getResponseHeader('ETag');
      if (xhr.status >= 200 && xhr.status < 300 && etag) resolve(etag);
      // No ETag means storage's CORS doesn't expose it (see sotto-platform's storage notes).
      else reject(new StorageHttpError(xhr.status));
    };
    xhr.onerror = () => reject(new OfflineError());
    signal.addEventListener(
      'abort',
      () => {
        xhr.abort();
        reject(new AbortedError());
      },
      { once: true },
    );
    xhr.send(body);
  });
}

function transportFor(entry: Entry): Transport {
  return {
    start: () =>
      call(
        api.POST('/api/v1/uploads', {
          body: {
            filename: entry.filename,
            sizeBytes: entry.file.size,
            ...(entry.mime ? { mime: entry.mime } : {}),
            ...(entry.options.title ? { title: entry.options.title } : {}),
            ...(entry.options.collectionId ? { collectionId: entry.options.collectionId } : {}),
            source: entry.options.source ?? 'upload',
          },
        }),
      ).then((u) => ({ ...u, fileId: u.file.id })),
    resume: (fileId) =>
      call(api.GET('/api/v1/uploads/{id}', { params: { path: { id: fileId } } })).then((u) => ({
        ...u,
        fileId,
      })),
    urls: (fileId, partNumbers) =>
      call(
        api.POST('/api/v1/uploads/{id}/parts', {
          params: { path: { id: fileId } },
          body: { partNumbers },
        }),
      ).then((r) => r.parts),
    put: putPart,
    complete: async (fileId, parts) => {
      await call(
        api.POST('/api/v1/uploads/{id}/complete', {
          params: { path: { id: fileId } },
          body: { parts },
        }),
      );
    },
  };
}

// ── Scheduling ──────────────────────────────────────────────────────────────────────────────

function messageFor(error: unknown): { message: string; final: boolean } {
  if (error instanceof ApiError) {
    const final = [413, 415, 403, 404, 422].includes(error.status);
    return { message: error.message, final };
  }
  if (error instanceof OfflineError) return { message: 'You’re offline.', final: false };
  if (error instanceof PartFailedError) {
    return { message: 'Part of the file didn’t go through. Retry to send the rest.', final: false };
  }
  return { message: 'The upload stopped. Retry to continue where it left off.', final: false };
}

function pump() {
  const active = [...entries.values()].filter((e) =>
    ['uploading', 'finishing'].includes(e.item.state),
  ).length;
  const next = [...entries.values()].filter((e) => e.item.state === 'queued');
  for (const entry of next.slice(0, Math.max(0, MAX_ACTIVE - active))) void start(entry);
}

async function start(entry: Entry) {
  const id = entry.item.id;
  const controller = new AbortController();
  entry.controller = controller;
  update(id, { state: 'uploading', error: null, offline: false });
  try {
    const fileId = await runUpload({
      file: entry.file,
      transport: transportFor(entry),
      ...(entry.item.fileId ? { fileId: entry.item.fileId } : {}),
      signal: controller.signal,
      onStarted: (fileId) => update(id, { fileId }),
      onProgress: ({ sent }) => {
        const item = entries.get(id)?.item;
        if (!item) return;
        // The last bytes are confirmed by "complete": show it as finishing, not 100%.
        update(id, { sent, state: sent >= item.size ? 'finishing' : 'uploading' });
      },
    });
    update(id, { state: 'done', sent: entry.file.size, fileId });
    const done = entries.get(id)!.item;
    for (const listener of doneListeners) listener(done);
    // A finished upload leaves the list after a beat; the file carries on in Processing.
    setTimeout(() => {
      entries.delete(id);
      emit();
    }, 2_500);
  } catch (error) {
    const item = entries.get(id)?.item;
    if (!item || item.state === 'canceled') return;
    if (error instanceof AbortedError) {
      update(id, { state: 'paused' });
    } else if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      update(id, { state: 'paused', offline: true });
    } else {
      const { message, final } = messageFor(error);
      update(id, { state: 'failed', error: message, final });
    }
  } finally {
    entry.controller = null;
    pump();
  }
}

// ── Actions ─────────────────────────────────────────────────────────────────────────────────

const AUDIO = /\.(mp3|m4a|mp4|aac|wav|webm|ogg|oga|opus|flac)$/i;

export function addUploads(
  files: Iterable<File | { blob: Blob; name: string }>,
  options: AddOptions = {},
) {
  for (const raw of files) {
    const blob = raw instanceof Blob ? raw : raw.blob;
    const name = raw instanceof File ? raw.name : (raw as { name: string }).name;
    const id = `u${Date.now().toString(36)}${(counter++).toString(36)}`;
    entries.set(id, {
      item: {
        id,
        fileId: null,
        name,
        title: options.title ?? name.replace(/\.[A-Za-z0-9]{1,8}$/, ''),
        size: blob.size,
        sent: 0,
        kind: blob.type.startsWith('audio/') || AUDIO.test(name) ? 'audio' : 'document',
        state: 'queued',
        offline: false,
        error: null,
        final: false,
      },
      file: blob,
      filename: name,
      mime: blob.type,
      options,
      controller: null,
    });
  }
  emit();
  pump();
}

export function pauseUpload(id: string) {
  const entry = entries.get(id);
  if (!entry) return;
  if (entry.item.state === 'queued') update(id, { state: 'paused' });
  entry.controller?.abort();
}

export function resumeUpload(id: string) {
  const entry = entries.get(id);
  if (!entry || !['paused', 'failed'].includes(entry.item.state) || entry.item.final) return;
  update(id, { state: 'queued', error: null, offline: false });
  pump();
}

/** Stops it and tells the api to drop the parts; nothing is left behind. */
export function cancelUpload(id: string) {
  const entry = entries.get(id);
  if (!entry) return;
  const fileId = entry.item.fileId;
  update(id, { state: 'canceled' });
  entry.controller?.abort();
  entries.delete(id);
  emit();
  if (fileId) {
    void call(api.DELETE('/api/v1/uploads/{id}', { params: { path: { id: fileId } } })).catch(
      () => undefined, // already finished or gone: nothing to clean up
    );
  }
  pump();
}

export function dismissUpload(id: string) {
  if (entries.delete(id)) emit();
}

// Connection drops pause everything that's moving; it carries on when the connection is back.
if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => {
    for (const entry of entries.values()) {
      if (['uploading', 'queued'].includes(entry.item.state)) {
        update(entry.item.id, { state: 'paused', offline: true });
        entry.controller?.abort();
      }
    }
  });
  window.addEventListener('online', () => {
    for (const entry of entries.values()) {
      if (entry.item.state === 'paused' && entry.item.offline) resumeUpload(entry.item.id);
    }
  });
  // Leaving the page would lose files mid-upload: the browser asks first.
  window.addEventListener('beforeunload', (event) => {
    if (
      [...entries.values()].some((e) => ['uploading', 'queued', 'finishing'].includes(e.item.state))
    ) {
      event.preventDefault();
    }
  });
}

/** For tests and stories: start from nothing. */
export function resetUploads(items: UploadItem[] = []) {
  for (const entry of entries.values()) entry.controller?.abort();
  entries.clear();
  for (const item of items) {
    entries.set(item.id, {
      item,
      file: new Blob([]),
      filename: item.name,
      mime: '',
      options: {},
      controller: null,
    });
  }
  emit();
}
