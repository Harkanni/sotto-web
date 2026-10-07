import type { FileItem, FileStatus } from '@/lib/api/files';

/**
 * How a file's progress and problems read (brief §4: Uploaded → Transcribing → Indexing → Ready,
 * or Failed with Retry). The api sends codes; these are the words people see.
 */
export function stepLabel(file: Pick<FileItem, 'status' | 'kind'>): string {
  switch (file.status) {
    case 'uploading':
      return 'Uploading';
    case 'uploaded':
      return 'Waiting to start';
    case 'transcribing':
      return 'Transcribing';
    case 'indexing':
      return file.kind === 'audio' ? 'Writing notes' : 'Reading';
    case 'ready':
      return 'Ready';
    case 'failed':
      return 'Failed';
  }
}

/** Steps in order, for a progress ring that never runs backwards. */
const ORDER: Record<FileStatus, number> = {
  uploading: 0,
  uploaded: 0.08,
  transcribing: 0.1,
  indexing: 0.85,
  ready: 1,
  failed: 1,
};

/** Overall progress, 0–1: transcription fills most of the bar for recordings, reading for documents. */
export function overallOf(file: Pick<FileItem, 'status' | 'kind' | 'progress'>): number {
  if (file.status === 'transcribing') return 0.1 + 0.75 * (file.progress ?? 0);
  if (file.status === 'indexing' && file.kind !== 'audio') return 0.5;
  return ORDER[file.status];
}

const FAILURES: Record<string, string> = {
  unreadable:
    'Sotto couldn’t read this file. It may be damaged; try saving it again and re-uploading.',
  encrypted: 'This PDF has a password. Remove it, then upload the file again.',
  no_text: 'This PDF has no text to read; it’s probably a scan. Reading scans isn’t available yet.',
  unsupported: 'Sotto can’t read this kind of file.',
  too_large: 'This document is too large to read. Split it into smaller files.',
  storage_missing: 'The upload didn’t finish. Upload the file again.',
  embedding_unavailable: 'Sotto’s indexing service didn’t answer. Retry in a moment.',
  embedding_not_private:
    'Indexing is set up to use an outside service, which Sotto never does. Ask an admin.',
  audio_unreadable:
    'Sotto couldn’t play this recording. It may be damaged or in an unusual format.',
  audio_empty: 'This recording is empty.',
  restricted_engine:
    'Restricted recordings are only transcribed inside your workspace’s servers, and this server’s transcription runs elsewhere. Ask an admin.',
  transcription_failed: 'Transcription stopped part way. Retry it.',
};

export function failureText(code: string | null): string {
  return (code && FAILURES[code]) || 'Something went wrong while processing. Retry it.';
}
