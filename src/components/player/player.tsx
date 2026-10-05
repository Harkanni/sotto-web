'use client';

import { Check, Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { menuContent, menuItem } from '@/components/ui/row-actions';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { SPEEDS, type AudioControls, type Speed } from './use-audio';
import { WaveformScrubber } from './waveform';

function speedLabel(rate: number) {
  return `${rate}×`;
}

/** 0.75–2×, as a menu with a check on the current speed (the menu-picker pattern). */
function SpeedMenu({ rate, onChange }: { rate: Speed; onChange: (rate: Speed) => void }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Playback speed, ${speedLabel(rate)}`}
          className="pressable grid h-11 min-w-11 place-items-center rounded-full px-2 text-callout font-semibold text-primary-text tabular hover:bg-primary-tint active:bg-primary-tint-strong"
        >
          {speedLabel(rate)}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className={menuContent}
        >
          <DropdownMenu.Label className="px-3 pt-1.5 pb-1 text-footnote text-muted-foreground">
            Speed
          </DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={String(rate)}
            onValueChange={(v) => onChange(Number(v) as Speed)}
          >
            {SPEEDS.map((s) => (
              <DropdownMenu.RadioItem key={s} value={String(s)} className={menuItem}>
                <span className="flex-1 tabular">{speedLabel(s)}</span>
                <DropdownMenu.ItemIndicator>
                  <Check aria-hidden className="size-5 text-primary-text" strokeWidth={2.25} />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * The player card: waveform scrubber, then the controls in thumb reach (brief §9): back 15 s,
 * play and pause, forward 15 s, and speed.
 */
export const Player = memo(function Player({
  audio,
  peaks,
  title,
}: {
  audio: AudioControls;
  peaks: readonly number[] | null | undefined;
  title: string;
}) {
  const { state } = audio;
  return (
    <section
      aria-label="Player"
      className="mx-[var(--gutter)] flex flex-col gap-3 rounded-card bg-card p-4"
    >
      <WaveformScrubber
        peaks={peaks}
        duration={state.duration}
        position={state.position}
        onFrame={audio.onFrame}
        onSeek={audio.seek}
        label={`Position in ${title}`}
      />
      {state.error && (
        <p
          role="alert"
          className="flex items-center justify-between gap-3 text-footnote text-destructive-text"
        >
          {state.error}
          <Button variant="ghost" onClick={() => void audio.retry()}>
            Retry
          </Button>
        </p>
      )}
      <div className="grid grid-cols-[44px_1fr_44px] items-center">
        <span aria-hidden />
        <div className="flex items-center justify-center gap-6">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back 15 seconds"
            aria-keyshortcuts="ArrowLeft"
            onClick={() => audio.skip(-15)}
            icon={<RotateCcw aria-hidden />}
          />
          <button
            type="button"
            aria-label={state.playing ? 'Pause' : 'Play'}
            aria-keyshortcuts="Space"
            onClick={audio.toggle}
            className="pressable grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-fab"
          >
            {state.buffering && state.playing ? (
              <Spinner size={22} />
            ) : state.playing ? (
              <Pause aria-hidden className="size-6 fill-current" />
            ) : (
              <Play aria-hidden className="ml-1 size-6 fill-current" />
            )}
          </button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Forward 15 seconds"
            aria-keyshortcuts="ArrowRight"
            onClick={() => audio.skip(15)}
            icon={<RotateCw aria-hidden />}
          />
        </div>
        <span className={cn('justify-self-end')}>
          <SpeedMenu rate={state.rate} onChange={audio.setRate} />
        </span>
      </div>
    </section>
  );
});
