'use client';

import { memo } from 'react';
import { LiveStatus, useElapsed } from '@/components/live/live-parts';
import { ListRow } from '@/components/ui/list';
import { timeOfDay } from '@/lib/format';
import type { LiveNowItem } from '@/lib/live/now';
import { FileIcon } from './file-rows';

const LIVE_ICON = { kind: 'audio', mime: 'audio/wav' } as const;

/** The call this device is capturing: its listening time, ticking once a second. */
function HereStatus({ phase }: { phase: Exclude<LiveNowItem['phase'], 'elsewhere'> }) {
  const elapsed = useElapsed();
  return <LiveStatus phase={phase} elapsedMs={phase === 'stopping' ? null : elapsed} />;
}

/**
 * What a call captured somewhere else says: when it started, rather than a listening time this
 * screen can't know (pauses happen on the other device).
 */
export function elsewhereLabel(item: Pick<LiveNowItem, 'source' | 'startedAt'>): string {
  if (item.source === 'bot') return 'Notetaker in the call';
  return item.startedAt ? `Live, started ${timeOfDay(Date.parse(item.startedAt))}` : 'Live';
}

/** One call happening now: the meeting it becomes, and a red dot that breathes while it's live. */
export const LiveNowRow = memo(function LiveNowRow({
  item,
  href,
  selected,
}: {
  item: LiveNowItem;
  href: string;
  selected?: boolean;
}) {
  return (
    <ListRow
      href={href}
      selected={selected}
      leading={<FileIcon file={LIVE_ICON} />}
      title={item.title}
      subtitle={
        item.phase === 'elsewhere' ? (
          <LiveStatus phase="elsewhere" elapsedMs={null} label={elsewhereLabel(item)} />
        ) : (
          <HereStatus phase={item.phase} />
        )
      }
      rowProps={{ 'data-live': item.id }}
    />
  );
});

/**
 * Calls live now, as a grouped card at the top of Meetings and Home. A capture is a file still
 * arriving, so the files lists don't show it; this is how you find your way back to it (the
 * listening strip does the same from anywhere while this device is the one listening).
 */
export function LiveNowList({
  items,
  hrefFor,
  selected,
}: {
  items: readonly LiveNowItem[];
  hrefFor: (id: string) => string;
  /** The open child screen's path (wide windows), to show its row selected. */
  selected?: string | null;
}) {
  return (
    <ul aria-label="Live now" className="overflow-hidden rounded-card bg-card">
      {items.map((item) => {
        const href = hrefFor(item.id);
        return <LiveNowRow key={item.id} item={item} href={href} selected={selected === href} />;
      })}
    </ul>
  );
}
