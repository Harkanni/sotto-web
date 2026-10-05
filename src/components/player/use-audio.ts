'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fileLink, useSavePosition } from '@/lib/api/files';

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export type Speed = (typeof SPEEDS)[number];

export interface AudioState {
  playing: boolean;
  /** Seconds; updated four times a second for text (times, transcript highlight). */
  position: number;
  duration: number;
  rate: Speed;
  /** Waiting for data (start, a seek, a slow connection). */
  buffering: boolean;
  /** Couldn't load or play; words for people. */
  error: string | null;
}

type FrameListener = (seconds: number) => void;

/**
 * A recording's audio (brief §4): play and pause, 15-second skips, 0.75–2× speed, lock-screen
 * controls (Media Session), and the remembered position behind Continue listening.
 *
 * The audio streams from storage through a short-lived link, fetched when the screen opens and
 * fetched again if it expires mid-listen (the position and play state carry over). Positions
 * reach React four times a second; the scrubber subscribes to every frame instead (`onFrame`)
 * and moves on the compositor, so playing never re-renders the screen sixty times a second.
 */
export function useAudio(options: {
  fileId: string;
  title: string;
  album: string;
  /** Known length in seconds, before the audio's own metadata loads. */
  durationHint: number;
  startAt: number;
  autoplay: boolean;
  /** False for recordings without audio (sample meetings). */
  enabled: boolean;
}) {
  const { fileId, enabled } = options;
  const audio = useRef<HTMLAudioElement | null>(null);
  const frameListeners = useRef(new Set<FrameListener>());
  const [state, setState] = useState<AudioState>({
    playing: false,
    position: options.startAt,
    duration: options.durationHint,
    rate: 1,
    buffering: false,
    error: null,
  });
  const save = useSavePosition(fileId, enabled);
  const resumeAfterRefresh = useRef<{ at: number; play: boolean } | null>(null);
  const startAt = useRef(options.startAt);
  const autoplay = useRef(options.autoplay);

  const emitFrame = useCallback((seconds: number) => {
    for (const listener of frameListeners.current) listener(seconds);
  }, []);

  /** Loads (or reloads) the short-lived link; the element keeps its other settings. */
  const load = useCallback(async () => {
    const el = audio.current;
    if (!el) return;
    try {
      const { url } = await fileLink(fileId, true);
      el.src = url;
      el.load();
    } catch {
      setState((s) => ({
        ...s,
        error: 'Couldn’t load the recording. Check your connection and try again.',
      }));
    }
  }, [fileId]);

  useEffect(() => {
    if (!enabled) return;
    const el = new Audio();
    el.preload = 'metadata';
    audio.current = el;

    let raf = 0;
    let lastText = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      emitFrame(el.currentTime);
      if (now - lastText > 250) {
        lastText = now;
        setState((s) =>
          Math.abs(s.position - el.currentTime) > 0.05 ? { ...s, position: el.currentTime } : s,
        );
      }
    };
    const startLoop = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    };
    const stopLoop = () => cancelAnimationFrame(raf);

    const on = (type: string, fn: () => void) => el.addEventListener(type, fn);
    on('loadedmetadata', () => {
      const pending = resumeAfterRefresh.current;
      resumeAfterRefresh.current = null;
      const at = pending?.at ?? startAt.current;
      if (at > 0) el.currentTime = Math.min(at, el.duration || at);
      setState((s) => ({
        ...s,
        duration: Number.isFinite(el.duration) && el.duration > 0 ? el.duration : s.duration,
        position: el.currentTime,
        error: null,
      }));
      emitFrame(el.currentTime);
      if (pending?.play || autoplay.current) {
        autoplay.current = false;
        // Browsers may refuse to play without a tap (iOS after a navigation): stay paused.
        void el.play().catch(() => undefined);
      }
    });
    on('play', () => {
      setState((s) => ({ ...s, playing: true }));
      startLoop();
    });
    on('pause', () => {
      setState((s) => ({ ...s, playing: false, position: el.currentTime }));
      stopLoop();
      emitFrame(el.currentTime);
      save(el.currentTime * 1000, true);
    });
    on('ended', () => save(0, true));
    on('waiting', () => setState((s) => ({ ...s, buffering: true })));
    on('playing', () => setState((s) => ({ ...s, buffering: false })));
    on('canplay', () => setState((s) => ({ ...s, buffering: false })));
    on('seeked', () => {
      emitFrame(el.currentTime);
      setState((s) => ({ ...s, position: el.currentTime }));
    });
    on('timeupdate', () => save(el.currentTime * 1000));
    on('ratechange', () => setState((s) => ({ ...s, rate: el.playbackRate as Speed })));
    on('error', () => {
      // Usually an expired link after a long pause: fetch a fresh one and carry on from here.
      if (el.src && !resumeAfterRefresh.current) {
        resumeAfterRefresh.current = { at: el.currentTime, play: !el.paused };
        void load();
      } else {
        setState((s) => ({ ...s, error: 'This recording can’t be played here.' }));
      }
    });

    // After this effect returns: the link arrives asynchronously anyway.
    void Promise.resolve().then(load);

    // Leaving the screen or the app saves where you were.
    const leave = () => {
      if (el.currentTime > 0) save(el.currentTime * 1000, true);
    };
    window.addEventListener('pagehide', leave);
    return () => {
      leave();
      window.removeEventListener('pagehide', leave);
      stopLoop();
      el.pause();
      el.removeAttribute('src');
      el.load();
      audio.current = null;
    };
  }, [enabled, emitFrame, load, save]);

  const play = useCallback(() => void audio.current?.play().catch(() => undefined), []);
  const pause = useCallback(() => audio.current?.pause(), []);
  const toggle = useCallback(() => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  }, []);
  const seek = useCallback(
    (seconds: number) => {
      const el = audio.current;
      const clamped = Math.max(0, Math.min(seconds, el?.duration || state.duration || seconds));
      if (el) el.currentTime = clamped;
      emitFrame(clamped);
      setState((s) => ({ ...s, position: clamped }));
    },
    [emitFrame, state.duration],
  );
  const skip = useCallback(
    (delta: number) => seek((audio.current?.currentTime ?? state.position) + delta),
    [seek, state.position],
  );
  const setRate = useCallback((rate: Speed) => {
    if (audio.current) audio.current.playbackRate = rate;
    setState((s) => ({ ...s, rate }));
  }, []);

  // Lock screen, headphones and the OS media controls (Media Session API).
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({
      title: options.title,
      artist: 'Sotto',
      album: options.album,
      artwork: [{ src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', play],
      ['pause', pause],
      ['seekbackward', (d) => skip(-(d.seekOffset ?? 15))],
      ['seekforward', (d) => skip(d.seekOffset ?? 15)],
      ['seekto', (d) => d.seekTime !== undefined && seek(d.seekTime)],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // An action this browser doesn't support: the others still work.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // ignore
        }
      }
      session.metadata = null;
    };
  }, [enabled, options.title, options.album, play, pause, skip, seek]);

  // The lock screen's own scrubber.
  useEffect(() => {
    if (!enabled || !('mediaSession' in navigator) || !state.duration) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: state.duration,
        playbackRate: state.rate,
        position: Math.min(state.position, state.duration),
      });
    } catch {
      // Some browsers reject a position state before metadata loads.
    }
  }, [enabled, state.duration, state.rate, state.position]);

  const onFrame = useCallback((listener: FrameListener) => {
    frameListeners.current.add(listener);
    return () => {
      frameListeners.current.delete(listener);
    };
  }, []);

  return { state, play, pause, toggle, seek, skip, setRate, onFrame, retry: load };
}

export type AudioControls = ReturnType<typeof useAudio>;
