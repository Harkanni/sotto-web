'use client';

import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Screen } from '@/components/shell/screen';
import { useLayer } from '@/components/shell/stack-context';
import { emitShellEvent } from '@/components/shell/shell-events';
import { Avatar, AvatarStack } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import { toastPreview } from '@/components/ui/toaster';
import { AsyncWidget, EmptyState } from '@/components/widgets/async-widget';
import { dayAndTime, dayGroup, duration, timestamp } from '@/lib/format';
import { useChildKey } from '@/lib/nav/hooks';
import { pushPath } from '@/lib/nav/routes';
import { useNav } from '@/lib/nav/hooks';
import { ACTION_ITEMS, personById, type Meeting } from '@/lib/sample/data';
import { useMeeting, useMeetings } from '@/lib/sample/queries';
import { cn } from '@/lib/utils';
import { AskButton, DetailWithAsk } from './parts/detail';
import { MeetingRow, RowsSkeleton } from './parts/rows';

function name(id: string) {
  return personById(id)?.name ?? 'Someone';
}

/** Meetings (brief §9): recordings by day, each opening to its player and notes. */
export function MeetingsScreen() {
  const { entry, tab } = useLayer();
  const query = useMeetings();
  const selected = useChildKey(tab, entry.key);

  return (
    <Screen title="Meetings">
      <AsyncWidget
        query={query}
        label="Meetings"
        errorTitle="Couldn’t load your meetings"
        empty={{
          illustration: 'recordings',
          title: 'No recordings yet',
          description:
            'Tap + to record your first meeting. Sotto writes the notes and the action items.',
          action: <Button onClick={() => emitShellEvent('open-add')}>Record a meeting</Button>,
        }}
        skeleton={
          <div className="px-[var(--gutter)]">
            <RowsSkeleton rows={6} round />
          </div>
        }
      >
        {(meetings) => {
          const groups = new Map<string, Meeting[]>();
          for (const m of meetings) {
            const g = dayGroup(m.startedAt);
            groups.set(g, [...(groups.get(g) ?? []), m]);
          }
          return (
            <div className="flex flex-col gap-6 pt-1">
              {[...groups].map(([group, list]) => (
                <section key={group} aria-label={group} className="px-[var(--gutter)]">
                  <h2 className="px-4 pb-1.5 text-footnote text-muted-foreground">{group}</h2>
                  <ul className="overflow-hidden rounded-card bg-card">
                    {list.map((m) => {
                      const href = pushPath(entry.key, 'meeting', m.id);
                      return (
                        <MeetingRow
                          key={m.id}
                          meeting={m}
                          href={href}
                          selected={selected === href}
                        />
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          );
        }}
      </AsyncWidget>
    </Screen>
  );
}

// ── Player (sample: no audio until Phase 4) ─────────────────────────────────────────────

function Player({
  meeting,
  position,
  onSeek,
}: {
  meeting: Meeting;
  position: number;
  onSeek: (s: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const total = meeting.durationSec;
  const progress = position / total;

  // A sample recording has no audio; "playing" advances the clock so the UI can be judged.
  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const from = position;
    let raf = 0;
    const tick = (now: number) => {
      const next = Math.min(total, from + (now - start) / 1000);
      onSeek(next);
      if (next < total) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  return (
    <section
      aria-label="Player"
      className="mx-[var(--gutter)] flex flex-col gap-3 rounded-card bg-card p-4"
    >
      <div className="flex flex-col gap-1">
        <input
          type="range"
          min={0}
          max={total}
          step={1}
          value={Math.round(position)}
          aria-label="Position"
          aria-valuetext={`${timestamp(position)} of ${timestamp(total)}`}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="scrubber h-11 w-full cursor-pointer appearance-none bg-transparent"
          style={{ '--progress': `${progress * 100}%` } as React.CSSProperties}
        />
        <div className="flex justify-between text-footnote text-muted-foreground tabular">
          <span>{timestamp(position)}</span>
          <span>−{timestamp(total - position)}</span>
        </div>
      </div>
      <div className="flex items-center justify-center gap-6">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back 15 seconds"
          onClick={() => onSeek(Math.max(0, position - 15))}
          icon={<RotateCcw aria-hidden />}
        />
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => {
            if (!playing)
              toastPreview(
                'Sample recording',
                'There’s no audio yet; playback arrives in Phase 4.',
              );
            setPlaying((p) => !p);
          }}
          className="pressable grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-fab"
        >
          {playing ? (
            <Pause aria-hidden className="size-6 fill-current" />
          ) : (
            <Play aria-hidden className="ml-1 size-6 fill-current" />
          )}
        </button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Forward 15 seconds"
          onClick={() => onSeek(Math.min(total, position + 15))}
          icon={<RotateCw aria-hidden />}
        />
      </div>
    </section>
  );
}

type Tab = 'summary' | 'transcript' | 'actions' | 'chapters';

function MeetingHeading({ meeting }: { meeting: Meeting }) {
  return (
    <header className="flex flex-col gap-2 px-[var(--gutter)] pt-1 pb-5">
      {/* Screen's own h1 (read and focused after a push) carries this title. */}
      <p aria-hidden className="text-title-2 text-balance">
        {meeting.title}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-subhead text-muted-foreground">
          {dayAndTime(meeting.startedAt)}, {duration(meeting.durationSec)}
        </span>
        <AvatarStack names={meeting.participantIds.map(name)} max={5} />
      </div>
    </header>
  );
}

function MeetingSkeleton() {
  return (
    <div className="flex flex-col gap-5 px-[var(--gutter)] [--surface:var(--background)]">
      <Skeleton className="h-[148px] rounded-card" />
      <Skeleton className="h-8 rounded-[9px]" />
      <SkeletonText lines={5} lineClassName="h-4" />
    </div>
  );
}

/** A meeting: player, then summary, transcript, action items and chapters (brief §9). */
export function MeetingScreen() {
  const { entry } = useLayer();
  const id = entry.id!;
  const query = useMeeting(id);
  const nav = useNav();
  // A citation opens the meeting at its minute (?t=58), on the transcript.
  const [startAt] = useState(() => Number(new URLSearchParams(nav.search).get('t') ?? 0) || 0);
  const [section, setSection] = useState<Tab>(startAt > 0 ? 'transcript' : 'summary');
  const [position, setPosition] = useState(startAt);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const m = query.data;

  return (
    <DetailWithAsk about={m?.title ?? 'this meeting'} base={entry.key}>
      <Screen
        title={m?.title ?? 'Meeting'}
        largeTitle={false}
        heading={
          m ? (
            <MeetingHeading meeting={m} />
          ) : query.isPending ? (
            <div
              aria-hidden
              className="flex flex-col gap-2.5 px-[var(--gutter)] pt-1 pb-5 [--surface:var(--background)]"
            >
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : undefined
        }
        actions={m && <AskButton scopeLabel={m.title} />}
      >
        <AsyncWidget
          query={query}
          label="Meeting"
          errorTitle="Couldn’t open this meeting"
          isEmpty={(d) => d === null}
          empty={{
            illustration: 'recordings',
            title: 'This recording is gone',
            description: 'It was deleted or moved.',
          }}
          skeleton={<MeetingSkeleton />}
        >
          {(meeting) =>
            meeting && (
              <div className="flex flex-col gap-5">
                {meeting.status.state === 'processing' ? (
                  <div className="mx-[var(--gutter)] rounded-card bg-card">
                    <EmptyState
                      illustration="processing"
                      title={`${meeting.status.step}…`}
                      description={`${Math.round(meeting.status.progress * 100)}% done. The transcript, summary and action items appear here when Sotto finishes.`}
                    />
                  </div>
                ) : (
                  <>
                    <Player meeting={meeting} position={position} onSeek={setPosition} />
                    <div className="px-[var(--gutter)] lg:max-w-[560px]">
                      <SegmentedControl
                        aria-label="Section"
                        value={section}
                        onValueChange={setSection}
                        segments={[
                          { value: 'summary', label: 'Summary' },
                          { value: 'transcript', label: 'Transcript' },
                          { value: 'actions', label: 'Actions' },
                          { value: 'chapters', label: 'Chapters' },
                        ]}
                      />
                    </div>
                    <div
                      key={section}
                      className="animate-[fade-in_200ms_var(--ease-out)]"
                      ref={transcriptRef}
                    >
                      {section === 'summary' && (
                        <ul className="mx-[var(--gutter)] flex flex-col gap-3 rounded-card bg-card p-4">
                          {meeting.summary.map((line) => (
                            <li key={line} className="flex gap-3 text-callout leading-[1.45]">
                              <span
                                aria-hidden
                                className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
                              />
                              {line}
                            </li>
                          ))}
                        </ul>
                      )}
                      {section === 'transcript' && (
                        <ol className="mx-[var(--gutter)] flex flex-col overflow-hidden rounded-card bg-card">
                          {meeting.transcript.map((line) => {
                            const active = position >= line.at && position < line.at + 30;
                            return (
                              <li key={line.at} className="list-row">
                                <button
                                  type="button"
                                  onClick={() => setPosition(line.at)}
                                  className={cn(
                                    'flex w-full gap-3 px-4 py-3 text-left transition-colors duration-300 active:bg-row-pressed',
                                    active && 'bg-primary-tint',
                                  )}
                                >
                                  <Avatar name={name(line.speakerId)} size={32} />
                                  <span className="min-w-0 flex-1">
                                    <span className="flex items-baseline justify-between gap-2">
                                      <span className="text-subhead font-semibold">
                                        {name(line.speakerId)}
                                      </span>
                                      <span className="text-footnote text-primary-text tabular">
                                        {timestamp(line.at)}
                                      </span>
                                    </span>
                                    <span className="mt-0.5 block prose-reading text-[17px]">
                                      {line.text}
                                    </span>
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                      {section === 'actions' && (
                        <ul className="mx-[var(--gutter)] flex flex-col overflow-hidden rounded-card bg-card">
                          {ACTION_ITEMS.filter((a) => a.meetingId === meeting.id).length === 0 ? (
                            <EmptyState
                              illustration="tasks"
                              title="No action items"
                              description="Nobody was assigned anything in this meeting."
                            />
                          ) : (
                            ACTION_ITEMS.filter((a) => a.meetingId === meeting.id).map((a) => (
                              <li key={a.id} className="list-row flex items-center gap-3 pl-4">
                                <Avatar name={name(a.ownerId)} size={32} />
                                <span className="row-main flex min-h-[56px] flex-1 flex-col justify-center py-2.5 pr-4">
                                  <span
                                    className={cn(
                                      'text-body',
                                      a.done && 'text-muted-foreground line-through',
                                    )}
                                  >
                                    {a.text}
                                  </span>
                                  <span className="text-subhead text-muted-foreground">
                                    {name(a.ownerId)}
                                  </span>
                                </span>
                              </li>
                            ))
                          )}
                        </ul>
                      )}
                      {section === 'chapters' && (
                        <ol className="mx-[var(--gutter)] flex flex-col overflow-hidden rounded-card bg-card">
                          {meeting.chapters.map((c, i) => (
                            <li key={c.at} className="list-row">
                              <button
                                type="button"
                                onClick={() => setPosition(c.at)}
                                className="flex w-full items-center gap-3 pl-4 text-left transition-colors duration-300 active:bg-row-pressed"
                              >
                                <span className="w-6 text-subhead text-muted-foreground tabular">
                                  {i + 1}
                                </span>
                                <span className="row-main flex min-h-11 flex-1 items-center justify-between gap-3 py-2.5 pr-4">
                                  <span className="text-body">{c.title}</span>
                                  <span className="text-subhead text-primary-text tabular">
                                    {timestamp(c.at)}
                                  </span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                    <p className="px-[calc(var(--gutter)+16px)] text-footnote text-muted-foreground">
                      Sample recording: the transcript and notes are made up.
                    </p>
                  </>
                )}
              </div>
            )
          }
        </AsyncWidget>
      </Screen>
    </DetailWithAsk>
  );
}
