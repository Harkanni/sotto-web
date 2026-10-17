'use client';

import { useSyncExternalStore } from 'react';
import {
  endLiveSession,
  getLiveSession,
  sendLiveChunk,
  startLiveSession,
  type LiveSession,
} from '@/lib/api/live';
import { CaptureError, LiveCapture, type LiveInput } from './capture';
import { ChunkUploader, type UploaderState } from './uploader';

/**
 * The one live capture on this device (Listen mode). It lives outside any screen, so you can
 * leave the live screen, look something up and come back while it keeps listening; the shell's
 * listening banner reads it too. Screens subscribe with `useLiveCapture()`.
 *
 *   idle → starting (permissions, then the api session) → listening ⇄ paused
 *        → stopping (last seconds sent, then End) → idle, with the saved meeting's id
 */
export type LivePhase = 'idle' | 'starting' | 'listening' | 'paused' | 'stopping';

export interface LiveCaptureState {
  phase: LivePhase;
  session: (Pick<LiveSession, 'id' | 'inputs'> & { fileId: string; title: string }) | null;
  /** Listening time, excluding pauses (ms), as of `at`; screens tick it forward themselves. */
  elapsedMs: number;
  /** performance.now() when `elapsedMs` was taken, or null while not counting. */
  countingSince: number | null;
  /** 0–1, for the waveform; updated ~20 times a second (screens should read it per frame). */
  level: number;
  upload: UploaderState | null;
  /** The shared tab stopped; the microphone carries on. */
  tabEnded: boolean;
  /** Why listening couldn't start or had to stop, in words. */
  error: string | null;
}

const IDLE: LiveCaptureState = {
  phase: 'idle',
  session: null,
  elapsedMs: 0,
  countingSince: null,
  level: 0,
  upload: null,
  tabEnded: false,
  error: null,
};

let state: LiveCaptureState = IDLE;
const listeners = new Set<() => void>();
const levelListeners = new Set<(level: number) => void>();
let capture: LiveCapture | null = null;
let uploader: ChunkUploader | null = null;
let releaseWake: (() => void) | null = null;

function set(patch: Partial<LiveCaptureState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function getLiveCapture(): LiveCaptureState {
  return state;
}

export function subscribeLiveCapture(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLiveCapture(): LiveCaptureState {
  return useSyncExternalStore(subscribeLiveCapture, getLiveCapture, () => IDLE);
}

/** The level, outside React (a waveform draws it per frame without re-rendering anything). */
export function onLiveLevel(listener: (level: number) => void): () => void {
  levelListeners.add(listener);
  return () => {
    levelListeners.delete(listener);
  };
}

/** Listening time now, from a snapshot. */
export function elapsedNow(s: LiveCaptureState, now = performance.now()): number {
  return s.elapsedMs + (s.countingSince === null ? 0 : now - s.countingSince);
}

function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function untilOnline(): Promise<void> {
  return new Promise((resolve) =>
    window.addEventListener('online', () => resolve(), { once: true }),
  );
}

/** Leaving the page would stop the microphone: the browser asks first. */
function guardUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
}

async function keepAwake(): Promise<void> {
  // A locked phone stops the microphone on some devices.
  const lock = await navigator.wakeLock?.request('screen').catch(() => null);
  releaseWake = lock ? () => void lock.release().catch(() => undefined) : null;
}

export interface StartOptions {
  tab: boolean;
  title: string;
  collectionId?: string | undefined;
}

/**
 * Starts listening: permissions first (so a refusal creates nothing), then the session, then
 * audio flows. Resolves with the session id, or throws CaptureError / ApiError for the sheet.
 */
export async function startListening(options: StartOptions): Promise<string> {
  if (state.phase !== 'idle') throw new Error('Already listening');
  set({ ...IDLE, phase: 'starting' });
  const pending: ArrayBuffer[] = [];
  let send: ((pcm: ArrayBuffer) => void) | null = null;
  const next = new LiveCapture({
    onChunk: (pcm) => (send ? send(pcm) : pending.push(pcm)),
    onLevel: (level) => {
      for (const listener of levelListeners) listener(level);
    },
    onTabEnded: () => set({ tabEnded: true }),
    onMicEnded: () => {
      set({ error: 'The microphone stopped. What was heard so far is kept: stop to save it.' });
      void pauseListening();
    },
  });
  let inputs: LiveInput[];
  try {
    inputs = await next.start({ tab: options.tab });
  } catch (error) {
    set({ ...IDLE });
    throw error;
  }
  let session: LiveSession;
  try {
    session = await startLiveSession({
      title: options.title,
      inputs,
      ...(options.collectionId ? { collectionId: options.collectionId } : {}),
    });
  } catch (error) {
    await next.stop();
    set({ ...IDLE });
    throw error;
  }
  capture = next;
  uploader = new ChunkUploader({
    send: (seq, pcm) => sendLiveChunk(session.id, seq, pcm),
    nextSeq: () =>
      getLiveSession(session.id).then(
        (s) => s.nextSeq,
        () => null,
      ),
    isOnline: online,
    untilOnline,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  uploader.subscribe((upload) => {
    set({ upload });
    if (upload.failed) set({ error: upload.failed });
  });
  send = (pcm) => uploader?.push(pcm);
  for (const pcm of pending.splice(0)) send(pcm);
  window.addEventListener('beforeunload', guardUnload);
  void keepAwake();
  set({
    phase: 'listening',
    session: {
      id: session.id,
      inputs: session.inputs,
      fileId: session.file.id,
      title: session.file.title,
    },
    elapsedMs: 0,
    countingSince: performance.now(),
    upload: uploader.state,
  });
  return session.id;
}

export function pauseListening(): void {
  if (state.phase !== 'listening') return;
  capture?.pause();
  set({ phase: 'paused', elapsedMs: elapsedNow(state), countingSince: null });
}

export function resumeListening(): void {
  if (state.phase !== 'paused') return;
  capture?.resume();
  set({ phase: 'listening', countingSince: performance.now(), error: null });
}

/**
 * Stops and saves: the last seconds go up, everything waiting is sent (it waits for the
 * network if it has to), then the api turns it into a meeting. Resolves with the meeting's file
 * id, or null if nothing was captured (the empty meeting is removed).
 */
export async function stopListening(): Promise<string | null> {
  if (state.phase !== 'listening' && state.phase !== 'paused') return null;
  const session = state.session!;
  set({ phase: 'stopping', elapsedMs: elapsedNow(state), countingSince: null });
  await capture?.stop();
  capture = null;
  await uploader?.drained();
  try {
    const ended = await endLiveSession(session.id);
    finish();
    return ended.discarded ? null : session.fileId;
  } catch (error) {
    // Still listening as far as the person can tell: they can try Stop again.
    set({
      phase: 'paused',
      error: error instanceof Error ? error.message : 'Couldn’t save. Try again.',
    });
    throw error;
  }
}

function finish(): void {
  uploader = null;
  window.removeEventListener('beforeunload', guardUnload);
  releaseWake?.();
  releaseWake = null;
  set({ ...IDLE });
}

export { CaptureError };
