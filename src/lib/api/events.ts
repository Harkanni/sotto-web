'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { operations } from './schema';
import { fileKeys, patchFile, refreshFiles, type FileStatus } from './files';
import { useActiveWorkspace } from './hooks';
import { liveKeys } from './live';

/** One `file` event, as sotto-api documents it in openapi.json. */
type FileEvent =
  operations['EventsController_stream']['responses'][200]['content']['application/json'];

type Listener = (event: { fileId: string; status: FileStatus }) => void;

/**
 * Whether a file event can mean a live call started or ended: a file begins arriving (a call
 * starts as one), finishes arriving or fails (the call was saved, or couldn't be), or goes away
 * (a call where nothing was heard is discarded).
 */
export function startsOrEndsArriving(change: FileEvent['change'], status: FileStatus): boolean {
  return (
    change === 'removed' || status === 'uploading' || status === 'uploaded' || status === 'failed'
  );
}
const listeners = new Set<Listener>();

/** Hear about status changes elsewhere (the upload manager toasts when a file is Ready). */
export function onFileStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Live file status (GET /events, Server-Sent Events). Mounted once in the shell: while the app
 * is open, a file moving Uploaded → Transcribing → Indexing → Ready updates every list and screen
 * showing it, with no polling. EventSource reconnects by itself; on (re)connect the file
 * caches refetch, to catch anything missed while away.
 */
export function useFileEvents() {
  const ws = useActiveWorkspace()?.id;
  const client = useQueryClient();

  useEffect(() => {
    if (!ws || typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/v1/events');
    let connected = false;

    source.addEventListener('ready', () => {
      if (connected) {
        void refreshFiles(client, ws);
        void client.invalidateQueries({ queryKey: liveKeys.active(ws) });
      }
      connected = true;
    });

    source.addEventListener('file', (message) => {
      let event: FileEvent;
      try {
        event = JSON.parse((message as MessageEvent<string>).data) as FileEvent;
      } catch {
        return;
      }
      const status = event.status.toLowerCase() as FileStatus;
      patchFile(client, ws, {
        id: event.fileId,
        status,
        progress: event.progress,
        error: event.error,
      });
      if (startsOrEndsArriving(event.change, status)) {
        // A live call starts as a file arriving and ends when it has arrived (or is discarded):
        // the Live now rows on Home and Meetings follow.
        void client.invalidateQueries({ queryKey: liveKeys.active(ws) });
      }
      if (event.change !== 'status' || status === 'ready' || status === 'failed') {
        // Titles, places and what a Ready file now has (pages, transcript, notes) come fresh.
        void client.invalidateQueries({ queryKey: fileKeys.lists(ws) });
        void client.invalidateQueries({ queryKey: fileKeys.file(ws, event.fileId) });
        void client.invalidateQueries({ queryKey: fileKeys.continue(ws) });
      }
      if (status === 'ready') {
        for (const key of [
          fileKeys.transcript(ws, event.fileId),
          fileKeys.insights(ws, event.fileId),
          fileKeys.content(ws, event.fileId),
          fileKeys.peaks(ws, event.fileId),
        ]) {
          void client.invalidateQueries({ queryKey: key });
        }
      }
      for (const listener of listeners) listener({ fileId: event.fileId, status });
    });

    return () => source.close();
  }, [ws, client]);
}
