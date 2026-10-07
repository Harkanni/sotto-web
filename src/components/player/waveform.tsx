'use client';

import { memo, useEffect, useMemo, useRef } from 'react';
import { timestamp } from '@/lib/format';
import { cn } from '@/lib/utils';

const BARS = 72;

/** Folds any number of peaks into BARS values (the loudest in each slice), 0–1. */
export function resample(peaks: readonly number[] | null | undefined, bars = BARS): number[] {
  if (!peaks?.length) return [];
  const out: number[] = [];
  for (let i = 0; i < bars; i++) {
    const from = Math.floor((i * peaks.length) / bars);
    const to = Math.max(from + 1, Math.floor(((i + 1) * peaks.length) / bars));
    let max = 0;
    for (let j = from; j < to; j++) max = Math.max(max, peaks[j] ?? 0);
    out.push(max);
  }
  return out;
}

function Bars({ values, className }: { values: number[]; className?: string }) {
  return (
    <span aria-hidden className={cn('absolute inset-0 flex items-center gap-[2px]', className)}>
      {values.map((v, i) => (
        <span
          key={i}
          className="min-w-[2px] flex-1 rounded-full bg-current"
          style={{ height: `${Math.max(8, Math.round(v * 100))}%` }}
        />
      ))}
    </span>
  );
}

/**
 * The player's scrubber: the recording's waveform, played part in indigo, with a playhead.
 * Moves every frame without React: the played part is revealed by two opposing translates
 * (compositor only), driven by `onFrame`. A native range input covers it, so dragging, tapping
 * and the keyboard all work and screen readers hear the position. Without peaks (sample
 * meetings, older files) it's a plain track.
 */
export const WaveformScrubber = memo(function WaveformScrubber({
  peaks,
  duration,
  position,
  onFrame,
  onSeek,
  disabled,
  label,
}: {
  peaks: readonly number[] | null | undefined;
  duration: number;
  /** For the times under it and the input's value (four times a second is enough). */
  position: number;
  onFrame: (listener: (seconds: number) => void) => () => void;
  onSeek: (seconds: number) => void;
  disabled?: boolean;
  label: string;
}) {
  const values = useMemo(() => {
    const bars = resample(peaks);
    // No waveform: an even, quiet track so the scrubber reads the same.
    return bars.length ? bars : new Array<number>(BARS).fill(0.18);
  }, [peaks]);
  const reveal = useRef<HTMLSpanElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const head = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const apply = (seconds: number) => {
      const p = duration > 0 ? Math.min(1, Math.max(0, seconds / duration)) : 0;
      const hidden = (1 - p) * 100;
      if (reveal.current) reveal.current.style.translate = `-${hidden}% 0`;
      if (counter.current) counter.current.style.translate = `${hidden}% 0`;
      if (head.current) head.current.style.translate = `${p * 100}% 0`;
    };
    apply(position);
    return onFrame(apply);
    // `position` seeds the first frame; frames take over after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFrame, duration]);

  return (
    <div className="flex flex-col gap-1">
      <div className={cn('relative h-12', disabled && 'opacity-60')}>
        <Bars values={values} className="text-fill-strong" />
        {/* Played part: a window sliding right over bars sliding left by the same amount. */}
        <span
          ref={reveal}
          aria-hidden
          className="absolute inset-0 overflow-hidden will-change-transform"
        >
          <span ref={counter} className="absolute inset-0 will-change-transform">
            <Bars values={values} className="text-primary" />
          </span>
        </span>
        <span
          ref={head}
          aria-hidden
          className="pointer-events-none absolute inset-0 will-change-transform"
        >
          <span className="absolute top-0 -left-px h-full w-[3px] rounded-full bg-foreground/80 shadow-[0_0_0_2px_var(--card)]" />
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.round(duration))}
          step={1}
          value={Math.round(position)}
          disabled={disabled}
          aria-label={label}
          aria-valuetext={`${timestamp(position)} of ${timestamp(duration)}`}
          onChange={(e) => onSeek(Number(e.currentTarget.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
        />
      </div>
      <div className="flex justify-between text-footnote text-muted-foreground tabular">
        <span>{timestamp(position)}</span>
        <span>−{timestamp(Math.max(0, duration - position))}</span>
      </div>
    </div>
  );
});
