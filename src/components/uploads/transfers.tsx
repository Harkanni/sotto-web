'use client';

import { FileAudio, FileText, Pause, Play, RotateCw, X } from 'lucide-react';
import { memo } from 'react';
import { fileSize } from '@/lib/format';
import {
  cancelUpload,
  dismissUpload,
  pauseUpload,
  resumeUpload,
  type UploadItem,
} from '@/lib/uploads/store';
import { cn } from '@/lib/utils';

/**
 * A ring that fills as uploads move: around the + button and the sidebar's New icon, so
 * progress is visible from every screen without a banner. `progress` is 0–1, or null to hide.
 * The arc's length is set directly (no CSS transition): it moves with the bytes, and nothing
 * animates on its own.
 */
export function ProgressRing({
  progress,
  size,
  stroke = 3,
  className,
}: {
  progress: number | null;
  size: number;
  stroke?: number;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      data-visible={progress !== null || undefined}
      className={cn(
        'pointer-events-none -rotate-90 opacity-0 transition-opacity duration-[var(--duration-base)] ease-out data-visible:opacity-100',
        className,
      )}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className="stroke-current opacity-25"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={`${Math.max(0.02, progress ?? 0)} 1`}
        className="stroke-current"
      />
    </svg>
  );
}

function stateLine(item: UploadItem): string {
  const sent = `${fileSize(Math.round(item.sent / 1024))} of ${fileSize(Math.round(item.size / 1024))}`;
  switch (item.state) {
    case 'queued':
      return 'Waiting';
    case 'uploading':
      return sent;
    case 'finishing':
      return 'Finishing';
    case 'paused':
      return item.offline ? 'Paused while you’re offline' : `Paused, ${sent}`;
    case 'done':
      return 'Uploaded';
    case 'failed':
      return item.error ?? 'Didn’t upload';
    default:
      return '';
  }
}

const IconButton = ({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    onClick={onClick}
    className="pressable grid size-11 shrink-0 place-items-center rounded-full text-primary-text hover:bg-primary-tint active:bg-primary-tint-strong"
  >
    {children}
  </button>
);

/** One upload: name, a bar that slides as bytes move, what's happening, and its controls. */
export const TransferRow = memo(function TransferRow({ item }: { item: UploadItem }) {
  const pct = item.size ? Math.round((item.sent / item.size) * 100) : 0;
  const failed = item.state === 'failed';
  const Icon = item.kind === 'audio' ? FileAudio : FileText;
  return (
    <li className="list-row flex items-center gap-3 pl-4" data-state={item.state}>
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-[9px] bg-primary-tint text-primary-text"
      >
        <Icon className="size-5" strokeWidth={2} />
      </span>
      <span className="row-main flex min-h-[60px] min-w-0 flex-1 items-center gap-1 py-2 pr-2">
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="truncate text-body">{item.title}</span>
          <span
            role="progressbar"
            aria-label={`${item.title}: ${stateLine(item)}`}
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            className={cn('h-1.5 overflow-hidden rounded-full bg-fill', failed && 'hidden')}
          >
            {/* Slides rather than stretches: a compositor-only change. */}
            <span
              className={cn(
                'block h-full rounded-full transition-[translate] duration-300 ease-out',
                item.state === 'paused' ? 'bg-faint-foreground' : 'bg-primary',
              )}
              style={{ translate: `${pct - 100}% 0` }}
            />
          </span>
          <span
            className={cn(
              'truncate text-footnote tabular',
              failed ? 'text-destructive-text' : 'text-muted-foreground',
            )}
          >
            {stateLine(item)}
          </span>
        </span>
        {(item.state === 'uploading' || item.state === 'queued') && (
          <IconButton label={`Pause ${item.title}`} onClick={() => pauseUpload(item.id)}>
            <Pause aria-hidden className="size-5 fill-current" />
          </IconButton>
        )}
        {item.state === 'paused' && !item.offline && (
          <IconButton label={`Resume ${item.title}`} onClick={() => resumeUpload(item.id)}>
            <Play aria-hidden className="ml-0.5 size-5 fill-current" />
          </IconButton>
        )}
        {failed && !item.final && (
          <IconButton label={`Retry ${item.title}`} onClick={() => resumeUpload(item.id)}>
            <RotateCw aria-hidden className="size-5" />
          </IconButton>
        )}
        {item.state !== 'done' && item.state !== 'finishing' && (
          <IconButton
            label={failed && item.final ? `Dismiss ${item.title}` : `Cancel ${item.title}`}
            onClick={() => (failed && item.final ? dismissUpload(item.id) : cancelUpload(item.id))}
          >
            <X aria-hidden className="size-5 text-muted-foreground" />
          </IconButton>
        )}
      </span>
    </li>
  );
});

/** The uploads in this tab, as a grouped list (the Add sheet and Home's Processing use it). */
export function TransferList({ items, className }: { items: UploadItem[]; className?: string }) {
  if (!items.length) return null;
  return (
    <ul aria-label="Uploads" className={cn('overflow-hidden rounded-card', className)}>
      {items.map((item) => (
        <TransferRow key={item.id} item={item} />
      ))}
    </ul>
  );
}
