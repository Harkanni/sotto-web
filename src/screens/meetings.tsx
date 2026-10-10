'use client';

import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Player } from '@/components/player/player';
import { useAudio } from '@/components/player/use-audio';
import { WaveformScrubber } from '@/components/player/waveform';
import { Screen } from '@/components/shell/screen';
import { emitShellEvent } from '@/components/shell/shell-events';
import { useLayer } from '@/components/shell/stack-context';
import { Avatar } from '@/components/ui/avatar';
import { Badge, SensitivityBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchField } from '@/components/ui/search-field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import { AsyncWidget, EmptyState } from '@/components/widgets/async-widget';
import {
  useFile,
  useFiles,
  useInsights,
  usePeaks,
  useTranscript,
  useTranscriptMatches,
  type FileItem,
  type Insights,
  type Transcript,
} from '@/lib/api/files';
import { prefersReducedMotion } from '@/lib/motion/driver';
import { dayAndTime, dayGroup, duration, timestamp } from '@/lib/format';
import { useChildKey, useNav } from '@/lib/nav/hooks';
import { pushPath } from '@/lib/nav/routes';
import { useCanAdd } from '@/lib/uploads/permissions';
import { cn } from '@/lib/utils';
import { NotReady } from './doc';
import { AskButton, DetailWithAsk } from './parts/detail';
import { useFileActions } from './parts/file-actions';
import { RecordingRow } from './parts/file-rows';
import { MoreMenu } from './parts/more-menu';
import { RowsSkeleton } from './parts/rows';

/** Meetings (brief §9): recordings by day, each opening to its player, transcript and notes. */
export function MeetingsScreen() {
  const { entry, tab } = useLayer();
  const query = useFiles({ kind: 'audio', sort: 'recent' });
  const selected = useChildKey(tab, entry.key);
  const canAdd = useCanAdd();

  return (
    <Screen title="Meetings">
      <AsyncWidget
        query={query}
        label="Meetings"
        errorTitle="Couldn’t load your meetings"
        empty={{
          illustration: 'recordings',
          title: 'No recordings yet',
          description: canAdd
            ? 'Record your next meeting, or import audio. Sotto writes the transcript and the notes.'
            : 'Recordings appear here when someone in your workspace adds them.',
          action: canAdd ? (
            <Button onClick={() => emitShellEvent('open-recorder')}>Record a meeting</Button>
          ) : undefined,
        }}
        skeleton={
          <div className="px-[var(--gutter)]">
            <RowsSkeleton rows={6} round />
          </div>
        }
      >
        {(meetings) => {
          const groups = new Map<string, FileItem[]>();
          for (const m of meetings) {
            const g = dayGroup(new Date(m.createdAt).getTime());
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
                        <RecordingRow
                          key={m.id}
                          file={m}
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

// ── Meeting ─────────────────────────────────────────────────────────────────────────────

type Section = 'summary' | 'transcript' | 'actions' | 'chapters';

function MeetingHeading({ file }: { file: FileItem }) {
  return (
    <header className="flex flex-col gap-2 px-[var(--gutter)] pt-1 pb-5">
      {/* Screen's own h1 (read and focused after a push) carries this title. */}
      <p aria-hidden className="text-title-2 text-balance">
        {file.title}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-subhead text-muted-foreground">
          {dayAndTime(new Date(file.createdAt).getTime())}
          {file.durationMs ? `, ${duration(file.durationMs / 1000)}` : ''}
        </span>
        {file.owner && (
          <span className="flex items-center gap-1.5 text-subhead">
            <Avatar name={file.owner.name} size={24} />
            {file.owner.name}
          </span>
        )}
        <SensitivityBadge level={file.sensitivity} />
        {file.source === 'sample' && <Badge>Sample</Badge>}
        {file.collection && (
          <span className="text-subhead text-muted-foreground">in {file.collection.name}</span>
        )}
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

/** A note under a section: plain words about where something came from. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 px-[calc(var(--gutter)+16px)] text-footnote text-muted-foreground">
      <Info aria-hidden className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Index of the line playing at `ms`: the last one that started at or before it. */
export function activeLine(segments: readonly { startMs: number }[], ms: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid]!.startMs <= ms) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

function Highlighted({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <mark key={i} className="rounded-[3px] bg-primary-tint-strong px-0.5 text-foreground">
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

const TranscriptLine = memo(function TranscriptLine({
  line,
  active,
  match,
  term,
  onSeek,
}: {
  line: Transcript['segments'][number];
  active: boolean;
  match: boolean;
  term: string;
  onSeek: ((seconds: number) => void) | null;
}) {
  const text = (
    <span className="block prose-reading text-[17px]">
      <Highlighted text={line.text} term={match ? term : ''} />
    </span>
  );
  // With speaker labels: avatar, name and time over the line. Without them (diarization is off
  // by default): a time gutter on the left, so the transcript reads as one column.
  const body = line.speaker ? (
    <>
      <Avatar name={line.speaker} size={32} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-subhead font-semibold">{line.speaker}</span>
          <span className="text-footnote text-primary-text tabular">
            {timestamp(line.startMs / 1000)}
          </span>
        </span>
        <span className="mt-0.5 block">{text}</span>
      </span>
    </>
  ) : (
    <>
      <span className="w-11 shrink-0 pt-[3px] text-footnote text-primary-text tabular">
        {timestamp(line.startMs / 1000)}
      </span>
      <span className="min-w-0 flex-1">{text}</span>
    </>
  );
  const cls = cn(
    'flex w-full gap-3 px-4 py-3 text-left transition-colors duration-300',
    active && 'bg-primary-tint',
  );
  return (
    <li
      className="list-row [content-visibility:auto] [contain-intrinsic-size:auto_76px]"
      data-line={line.idx}
    >
      {onSeek ? (
        <button
          type="button"
          aria-current={active || undefined}
          aria-label={`${line.speaker ? `${line.speaker}, ` : ''}${timestamp(line.startMs / 1000)}: ${line.text}`}
          onClick={() => onSeek(line.startMs / 1000)}
          className={cn(cls, 'active:bg-row-pressed')}
        >
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
});

/**
 * The transcript (brief §4): follows the playback (the playing line is tinted and kept in view),
 * tap a line to play from it, and search within it with the matches stepped through in order.
 * Scrolling yourself pauses the following for a few seconds.
 */
function TranscriptView({
  file,
  position,
  onSeek,
  playing,
  landAt = 0,
}: {
  file: FileItem;
  position: number;
  onSeek: ((seconds: number) => void) | null;
  playing: boolean;
  /** Seconds a citation opened the meeting at: that line is shown first, tinted. */
  landAt?: number;
}) {
  const query = useTranscript(file.id, true);
  const [search, setSearch] = useState('');
  const term = useDeferredValue(search.trim());
  const found = useTranscriptMatches(file.id, term).data;
  const matches = useMemo(() => found ?? [], [found]);
  // The cursor belongs to one search term; a new term starts at its first match.
  const [at, setAt] = useState({ term: '', index: 0 });
  const cursor = at.term === term ? at.index : 0;
  const setCursor = (index: number) => setAt({ term, index });
  const listRef = useRef<HTMLOListElement>(null);
  const userScrolledAt = useRef(0);
  const segments = query.data?.segments;
  // Until playback moves, the line a citation pointed at is the current one.
  const at0 = playing || position > 0 ? position : landAt;
  const active = segments ? activeLine(segments, at0 * 1000) : -1;
  const matchSet = useMemo(() => new Set(matches), [matches]);

  // Your own scrolling wins over following for a moment.
  useEffect(() => {
    const mark = () => {
      userScrolledAt.current = performance.now();
    };
    window.addEventListener('wheel', mark, { passive: true });
    window.addEventListener('touchmove', mark, { passive: true });
    return () => {
      window.removeEventListener('wheel', mark);
      window.removeEventListener('touchmove', mark);
    };
  }, []);

  useEffect(() => {
    if (!playing || active < 0 || term) return;
    if (performance.now() - userScrolledAt.current < 4_000) return;
    listRef.current?.querySelector(`[data-line="${segments?.[active]?.idx}"]`)?.scrollIntoView({
      block: 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [active, playing, term, segments]);

  // Opened at a moment (a citation): centre that line once the transcript arrives.
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || !landAt || active < 0 || !segments) return;
    landed.current = true;
    listRef.current
      ?.querySelector(`[data-line="${segments[active]?.idx}"]`)
      ?.scrollIntoView({ block: 'center' });
  }, [landAt, active, segments]);

  const goTo = (i: number) => {
    if (!matches.length) return;
    const next = (i + matches.length) % matches.length;
    setCursor(next);
    listRef.current
      ?.querySelector(`[data-line="${matches[next]}"]`)
      ?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  return (
    <AsyncWidget
      query={query}
      label="Transcript"
      errorTitle="Couldn’t load the transcript"
      isEmpty={(t) => t.segments.length === 0}
      empty={{
        illustration: 'recordings',
        title: 'No speech found',
        description: 'Sotto didn’t hear anyone talking in this recording.',
      }}
      skeleton={
        <div className="mx-[var(--gutter)] [--surface:var(--background)]">
          <SkeletonText lines={6} lineClassName="h-4" />
        </div>
      }
    >
      {(transcript) => (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1 px-[var(--gutter)]">
            <SearchField
              value={search}
              onValueChange={setSearch}
              placeholder="Search transcript"
              className="min-w-0 flex-1"
            />
            {term && (
              <span className="flex shrink-0 items-center">
                <span
                  className="px-1 text-footnote text-muted-foreground tabular"
                  aria-live="polite"
                >
                  {matches.length ? `${cursor + 1} of ${matches.length}` : 'No matches'}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Previous match"
                  disabled={!matches.length}
                  onClick={() => goTo(cursor - 1)}
                  icon={<ChevronUp aria-hidden />}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Next match"
                  disabled={!matches.length}
                  onClick={() => goTo(cursor + 1)}
                  icon={<ChevronDown aria-hidden />}
                />
              </span>
            )}
          </div>
          {transcript.isMock && (
            <Note>A placeholder transcript from the mock engine: these lines weren’t said.</Note>
          )}
          <ol
            ref={listRef}
            className="mx-[var(--gutter)] flex flex-col overflow-hidden rounded-card bg-card"
          >
            {transcript.segments.map((line, i) => (
              <TranscriptLine
                key={line.idx}
                line={line}
                active={i === active && !term}
                match={matchSet.has(line.idx)}
                term={term}
                onSeek={onSeek}
              />
            ))}
          </ol>
        </div>
      )}
    </AsyncWidget>
  );
}

function NotesFootnote({ notes }: { notes: Insights }) {
  if (notes.model === 'sample') return <Note>Sample notes, written for the sample workspace.</Note>;
  if (notes.isMock)
    return (
      <Note>
        Basic notes: picked out of the transcript by simple rules, not written by AI. A private AI
        model on this server would write full notes.
      </Note>
    );
  return (
    <Note>
      Written by {notes.model.split(':').slice(1).join(':') || notes.model}, running privately.
    </Note>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((line, i) => (
        <li key={i} className="flex gap-3 text-callout leading-[1.45]">
          <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
          {line}
        </li>
      ))}
    </ul>
  );
}

function SummaryView({ notes }: { notes: Insights }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="mx-[var(--gutter)] flex flex-col gap-4 rounded-card bg-card p-4">
        <p className="text-callout leading-[1.45]">{notes.summary}</p>
        {notes.decisions.length > 0 && (
          <section aria-label="Decisions" className="flex flex-col gap-2">
            <h3 className="text-footnote text-muted-foreground">Decisions</h3>
            <Bullets items={notes.decisions} />
          </section>
        )}
        {notes.openQuestions.length > 0 && (
          <section aria-label="Open questions" className="flex flex-col gap-2">
            <h3 className="text-footnote text-muted-foreground">Open questions</h3>
            <Bullets items={notes.openQuestions} />
          </section>
        )}
      </div>
      <NotesFootnote notes={notes} />
    </div>
  );
}

function ActionsView({ notes, onSeek }: { notes: Insights; onSeek: ((s: number) => void) | null }) {
  if (!notes.actionItems.length) {
    return (
      <div className="mx-[var(--gutter)] rounded-card bg-card">
        <EmptyState
          illustration="tasks"
          title="No action items"
          description="Nobody was given anything to do in this meeting."
        />
      </div>
    );
  }
  return (
    <ul className="mx-[var(--gutter)] flex flex-col overflow-hidden rounded-card bg-card">
      {notes.actionItems.map((a, i) => {
        const content = (
          <>
            {a.owner ? (
              <Avatar name={a.owner} size={32} />
            ) : (
              <span className="size-8 shrink-0 rounded-full bg-fill" aria-hidden />
            )}
            <span className="row-main flex min-h-[56px] min-w-0 flex-1 flex-col justify-center py-2.5 pr-4">
              <span className="text-body">{a.text}</span>
              <span className="text-subhead text-muted-foreground">
                {[a.owner ?? 'No owner named', a.due && `due ${a.due}`].filter(Boolean).join(' · ')}
              </span>
            </span>
            {a.atMs !== null && (
              <span className="shrink-0 pr-4 text-footnote text-primary-text tabular">
                {timestamp(a.atMs / 1000)}
              </span>
            )}
          </>
        );
        return (
          <li key={i} className="list-row">
            {onSeek && a.atMs !== null ? (
              <button
                type="button"
                onClick={() => onSeek(a.atMs! / 1000)}
                className="flex w-full items-center gap-3 pl-4 text-left transition-colors duration-300 active:bg-row-pressed"
              >
                {content}
              </button>
            ) : (
              <div className="flex items-center gap-3 pl-4">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ChaptersView({
  notes,
  onSeek,
  position,
}: {
  notes: Insights;
  onSeek: ((s: number) => void) | null;
  position: number;
}) {
  const current = activeLine(notes.chapters, position * 1000);
  return (
    <ol className="mx-[var(--gutter)] flex flex-col overflow-hidden rounded-card bg-card">
      {notes.chapters.map((c, i) => {
        const content = (
          <>
            <span className="w-6 text-subhead text-muted-foreground tabular">{i + 1}</span>
            <span className="row-main flex min-h-11 flex-1 items-center justify-between gap-3 py-2.5 pr-4">
              <span className={cn('text-body', i === current && onSeek && 'font-semibold')}>
                {c.title}
              </span>
              <span className="text-subhead text-primary-text tabular">
                {timestamp(c.startMs / 1000)}
              </span>
            </span>
          </>
        );
        return (
          <li key={i} className="list-row">
            {onSeek ? (
              <button
                type="button"
                aria-current={i === current || undefined}
                onClick={() => onSeek(c.startMs / 1000)}
                className="flex w-full items-center gap-3 pl-4 text-left transition-colors duration-300 active:bg-row-pressed"
              >
                {content}
              </button>
            ) : (
              <div className="flex items-center gap-3 pl-4">{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function NotesSection({
  file,
  section,
  position,
  onSeek,
}: {
  file: FileItem;
  section: Exclude<Section, 'transcript'>;
  position: number;
  onSeek: ((s: number) => void) | null;
}) {
  const query = useInsights(file.id, true);
  return (
    <AsyncWidget
      query={query}
      label="Notes"
      errorTitle="Couldn’t load the notes"
      isEmpty={(n) => (section === 'chapters' ? n.chapters.length === 0 : false)}
      empty={{
        illustration: 'recordings',
        title: 'No chapters',
        description: 'This meeting was too short to split into chapters.',
      }}
      skeleton={
        <div className="mx-[var(--gutter)] [--surface:var(--background)]">
          <SkeletonText lines={5} lineClassName="h-4" />
        </div>
      }
    >
      {(notes) =>
        section === 'summary' ? (
          <SummaryView notes={notes} />
        ) : section === 'actions' ? (
          <ActionsView notes={notes} onSeek={onSeek} />
        ) : (
          <ChaptersView notes={notes} onSeek={onSeek} position={position} />
        )
      }
    </AsyncWidget>
  );
}

/** Space, ← and → while this meeting is the screen in front (not while typing). */
function usePlayerKeys(
  rootRef: React.RefObject<HTMLElement | null>,
  audio: { toggle: () => void; skip: (d: number) => void },
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable], [role="menu"], [role="dialog"]'))
        return;
      const front = document.querySelector('.tab-root[data-active] .stack-layer:last-of-type');
      if (!rootRef.current || !front?.contains(rootRef.current)) return;
      if (e.key === ' ') {
        e.preventDefault();
        audio.toggle();
      } else if (e.key === 'ArrowLeft' && !e.metaKey && !e.ctrlKey) {
        audio.skip(-15);
      } else if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey) {
        audio.skip(15);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rootRef, audio, enabled]);
}

/** A meeting: player, then summary, transcript, action items and chapters (brief §9). */
export function MeetingScreen() {
  const { entry, parent } = useLayer();
  const id = entry.id!;
  const query = useFile(id);
  const nav = useNav();
  const actionsFor = useFileActions();
  // A citation or Continue listening opens the meeting at its moment (?t=58), on the transcript.
  const [params] = useState(() => new URLSearchParams(nav.search));
  const startAt = Number(params.get('t') ?? 0) || 0;
  const [section, setSection] = useState<Section>(startAt > 0 ? 'transcript' : 'summary');
  const file = query.data ?? null;
  const ready = file?.status === 'ready';
  const hasAudio = Boolean(file && file.source !== 'sample');
  const rootRef = useRef<HTMLDivElement>(null);

  const audio = useAudio({
    fileId: id,
    title: file?.title ?? 'Meeting',
    album: file?.collection?.name ?? 'Sotto',
    durationHint: (file?.durationMs ?? 0) / 1000,
    startAt,
    autoplay: params.get('play') === '1',
    enabled: ready && hasAudio,
  });
  const peaks = usePeaks(id, ready && hasAudio).data?.peaks;
  const seek = hasAudio
    ? (seconds: number) => {
        audio.seek(seconds);
        audio.play();
      }
    : null;
  usePlayerKeys(rootRef, audio, ready && hasAudio);

  return (
    <DetailWithAsk about={file?.title ?? 'this meeting'} fileId={id} base={entry.key}>
      <Screen
        title={file?.title ?? 'Meeting'}
        largeTitle={false}
        heading={
          file ? (
            <MeetingHeading file={file} />
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
        actions={
          file && (
            <>
              <AskButton scopeLabel={file.title} fileId={file.id} />
              <MoreMenu actions={actionsFor(file, entry.key)} />
            </>
          )
        }
      >
        <div ref={rootRef}>
          <AsyncWidget
            query={query}
            label="Meeting"
            errorTitle="Couldn’t open this meeting"
            isEmpty={(f) => !f || f.deletedAt !== null}
            empty={{
              illustration: 'recordings',
              title: 'This recording is gone',
              description: 'It was deleted, or moved somewhere you can’t open.',
              action: parent ? (
                <Button variant="secondary" onClick={() => history.back()}>
                  Go back
                </Button>
              ) : undefined,
            }}
            skeleton={<MeetingSkeleton />}
          >
            {(f) =>
              f &&
              (f.status !== 'ready' ? (
                <NotReady file={f} />
              ) : (
                <div className="flex flex-col gap-5">
                  {hasAudio ? (
                    <Player audio={audio} peaks={peaks} title={f.title} />
                  ) : (
                    <section
                      aria-label="Player"
                      className="mx-[var(--gutter)] flex flex-col gap-3 rounded-card bg-card p-4"
                    >
                      <WaveformScrubber
                        peaks={null}
                        duration={(f.durationMs ?? 0) / 1000}
                        position={0}
                        onFrame={() => () => undefined}
                        onSeek={() => undefined}
                        disabled
                        label="Position (no audio)"
                      />
                      <p className="text-center text-footnote text-muted-foreground">
                        Sample meeting: the transcript and notes are here, the audio isn’t.
                      </p>
                    </section>
                  )}
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
                  <div key={section} className="animate-[fade-in_200ms_var(--ease-out)]">
                    {section === 'transcript' ? (
                      <TranscriptView
                        file={f}
                        position={audio.state.position}
                        onSeek={seek}
                        playing={audio.state.playing}
                        landAt={startAt}
                      />
                    ) : (
                      <NotesSection
                        file={f}
                        section={section}
                        position={audio.state.position}
                        onSeek={seek}
                      />
                    )}
                  </div>
                </div>
              ))
            }
          </AsyncWidget>
        </div>
      </Screen>
    </DetailWithAsk>
  );
}
