'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { timestamp } from '@/lib/format';
import {
  elapsedNow,
  getLiveCapture,
  onLiveLevel,
  subscribeLiveCapture,
  type LivePhase,
} from '@/lib/live/store';
import { cn } from '@/lib/utils';

/**
 * The live level: bars scroll left as people speak, drawn on a canvas from the capture's level
 * (no React renders per frame). It moves only because sound does, and holds still when paused,
 * like the recorder's waveform.
 */
export function LiveLevel({ live, className }: { live: boolean; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const history = useRef<number[]>([]);
  const latest = useRef(0);

  useEffect(() => onLiveLevel((level) => (latest.current = level)), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const color = getComputedStyle(canvas).color;
    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 50) return; // 20 bars a second: smooth and cheap
      last = now;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      if (live) history.current.push(latest.current);
      const bar = 3 * dpr;
      const gap = 3 * dpr;
      const count = Math.floor(canvas.width / (bar + gap));
      const values = history.current.slice(-count);
      history.current = values;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;
      values.forEach((v, i) => {
        const h = Math.max(bar, v * canvas.height);
        const x = canvas.width - (values.length - i) * (bar + gap);
        ctx.beginPath();
        ctx.roundRect(x, (canvas.height - h) / 2, bar, h, bar / 2);
        ctx.fill();
      });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [live]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn(
        'h-14 w-full',
        live ? 'text-destructive-text' : 'text-faint-foreground',
        className,
      )}
    />
  );
}

/** Listening time, ticking once a second from the capture's clock (exact across pauses). */
export function useElapsed(): number {
  const capture = useSyncExternalStore(subscribeLiveCapture, getLiveCapture, getLiveCapture);
  const [now, setNow] = useState(() =>
    typeof performance === 'undefined' ? 0 : performance.now(),
  );
  useEffect(() => {
    if (capture.countingSince === null) return;
    const id = setInterval(() => setNow(performance.now()), 1_000);
    return () => clearInterval(id);
  }, [capture.countingSince]);
  return elapsedNow(capture, capture.countingSince === null ? 0 : now);
}

/** "● Listening 12:34": a red dot (a gentle pulse while live, still when paused), and the time. */
export function LiveStatus({
  phase,
  elapsedMs,
  className,
}: {
  phase: LivePhase | 'elsewhere';
  elapsedMs: number | null;
  className?: string;
}) {
  const label =
    phase === 'paused'
      ? 'Paused'
      : phase === 'stopping'
        ? 'Saving'
        : phase === 'starting'
          ? 'Starting'
          : phase === 'elsewhere'
            ? 'Listening on another screen'
            : 'Listening';
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span
        aria-hidden
        className={cn(
          'size-2.5 shrink-0 rounded-full',
          phase === 'listening' || phase === 'elsewhere'
            ? 'live-dot bg-destructive'
            : 'bg-faint-foreground',
        )}
      />
      <span>{label}</span>
      {elapsedMs !== null && <span className="tabular">{timestamp(elapsedMs / 1000)}</span>}
    </span>
  );
}
