'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Check, Play, X } from 'lucide-react';
import { useState } from 'react';
import { Screen } from '@/components/shell/screen';
import { useLayer } from '@/components/shell/stack-context';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { toastPreview } from '@/components/ui/toaster';
import { AsyncWidget } from '@/components/widgets/async-widget';
import { dueLabel, timestamp } from '@/lib/format';
import { NavLink } from '@/lib/nav/link';
import { pushPath } from '@/lib/nav/routes';
import { navigate } from '@/lib/nav/store';
import * as api from '@/lib/sample/api';
import {
  keys,
  useActionItems,
  useContinueListening,
  useDocs,
  useProcessing,
  useStats,
  useThreads,
} from '@/lib/sample/queries';
import { NOTICE_STORAGE_KEY } from '@/lib/prefs/boot-script';
import { writeStored } from '@/lib/prefs/stored';
import { cn } from '@/lib/utils';
import { emitShellEvent } from '@/components/shell/shell-events';
import { DocRow, RowsSkeleton, ThreadRow } from './parts/rows';

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <div className="flex min-h-8 items-end justify-between px-[calc(var(--gutter)+4px)]">
        <h2 className="text-title-3">{title}</h2>
        {action}
      </div>
      <div className="px-[var(--gutter)]">{children}</div>
    </section>
  );
}

function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <NavLink
      href={href}
      intent="none"
      aria-label={label}
      className="-mr-2 flex h-11 items-center rounded-button px-2 text-callout text-primary-text active:opacity-50"
    >
      See all
    </NavLink>
  );
}

// ── Sample notice ────────────────────────────────────────────────────────────────────────

function SampleNotice() {
  // Server-rendered; the boot script hides it before first paint once dismissed (no shift).
  return (
    <div className="sample-notice mx-[var(--gutter)] flex lg:[column-span:all] items-start gap-3 rounded-card bg-primary-tint p-4">
      <div className="min-w-0 flex-1">
        <p className="text-headline text-primary-text">You’re exploring a sample workspace</p>
        <p className="mt-1 text-callout text-muted-foreground">
          Kestrel Labs and everything in it is made up to show the design. Your own workspace
          arrives in Phase 3.
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          document.documentElement.dataset.sampleNotice = 'dismissed';
          writeStored(NOTICE_STORAGE_KEY, 'dismissed');
        }}
        className="-mt-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground active:opacity-50"
      >
        <X aria-hidden className="size-5" />
      </button>
    </div>
  );
}

// ── Continue listening ─────────────────────────────────────────────────────────────────

function ContinueListening() {
  const { entry } = useLayer();
  const query = useContinueListening();
  return (
    <AsyncWidget
      query={query}
      label="Continue listening"
      errorTitle="Couldn’t load your last recording"
      isEmpty={(d) => d === null}
      empty={{
        illustration: 'recordings',
        title: 'Nothing to resume',
        description: 'Recordings you start listening to show up here.',
      }}
      skeleton={
        <div className="flex items-center gap-4 rounded-card bg-card p-4">
          <Skeleton className="size-12 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-1.5 w-full rounded-full" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        </div>
      }
      className="rounded-card bg-card"
    >
      {(data) => {
        if (!data) return null;
        const { meeting, positionSec } = data;
        const progress = positionSec / meeting.durationSec;
        return (
          <div className="flex items-center gap-4 p-4">
            <button
              type="button"
              aria-label={`Play ${meeting.title}`}
              onClick={() =>
                toastPreview('Playback arrives in Phase 4', 'Sample recordings have no audio yet.')
              }
              className="pressable grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
            >
              <Play aria-hidden className="ml-0.5 size-5 fill-current" />
            </button>
            <NavLink
              href={pushPath(entry.key, 'meeting', meeting.id)}
              className="min-w-0 flex-1 rounded-button outline-offset-4 active:opacity-60"
            >
              <span className="block truncate text-headline">{meeting.title}</span>
              <span aria-hidden className="mt-2 block h-1.5 overflow-hidden rounded-full bg-fill">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${progress * 100}%` }}
                />
              </span>
              <span className="mt-1.5 flex justify-between text-footnote text-muted-foreground tabular">
                <span>{timestamp(positionSec)}</span>
                <span>{timestamp(meeting.durationSec - positionSec)} left</span>
              </span>
            </NavLink>
          </div>
        );
      }}
    </AsyncWidget>
  );
}

// ── Processing ────────────────────────────────────────────────────────────────────────

function Processing() {
  const { entry } = useLayer();
  const query = useProcessing();
  return (
    <AsyncWidget
      query={query}
      label="Processing"
      errorTitle="Couldn’t load what’s processing"
      empty={{
        illustration: 'processing',
        title: 'All caught up',
        description: 'New recordings and files show their progress here while Sotto works on them.',
      }}
      skeleton={<RowsSkeleton rows={2} round />}
      className="overflow-hidden rounded-card bg-card"
    >
      {(items) => (
        <ul>
          {items.map((m) => {
            const status = m.status.state === 'processing' ? m.status : null;
            const pct = Math.round((status?.progress ?? 1) * 100);
            return (
              <li key={m.id} className="list-row">
                <NavLink
                  href={pushPath(entry.key, 'meeting', m.id)}
                  className="flex items-center gap-3 pl-4 transition-colors duration-300 active:bg-row-pressed active:delay-[40ms] active:duration-0"
                >
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-end justify-center gap-[3px] pb-2"
                  >
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className="w-[3px] origin-bottom rounded-full bg-primary motion-safe:animate-[bars_1.1s_ease-in-out_infinite]"
                        style={{ height: [10, 18, 13, 7][i], animationDelay: `${i * 120}ms` }}
                      />
                    ))}
                  </span>
                  <span className="row-main flex min-h-[60px] flex-1 flex-col justify-center gap-1.5 py-2.5 pr-4">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-body">{m.title}</span>
                      <span className="shrink-0 text-subhead text-muted-foreground tabular">
                        {pct}%
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span
                        role="progressbar"
                        aria-label={`${m.title}: ${status?.step}`}
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill"
                      >
                        {/* Slides rather than stretches: a compositor-only change that keeps
                            the rounded end round. */}
                        <span
                          className="block h-full rounded-full bg-primary transition-[translate] duration-700 ease-out"
                          style={{ translate: `${pct - 100}% 0` }}
                        />
                      </span>
                      <span className="shrink-0 text-footnote text-muted-foreground">
                        {status?.step}
                      </span>
                    </span>
                  </span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      )}
    </AsyncWidget>
  );
}

// ── Action items ──────────────────────────────────────────────────────────────────────

function CheckCircle({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-[26px] shrink-0 place-items-center rounded-full border-2 transition-[background-color,border-color,scale] duration-[var(--duration-standard)] ease-standard',
        checked
          ? 'scale-100 border-primary bg-primary text-primary-foreground'
          : 'border-faint-foreground',
      )}
    >
      <Check
        className={cn(
          'size-4 transition-[opacity,scale] duration-200',
          checked ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
        )}
        strokeWidth={3}
      />
    </span>
  );
}

function ActionItems() {
  const client = useQueryClient();
  const query = useActionItems();
  const [justDone, setJustDone] = useState<Set<string>>(new Set());

  const toggle = (id: string, done: boolean) => {
    api.setActionItemDone(id, done);
    setJustDone((prev) => {
      const next = new Set(prev);
      if (done) next.add(id);
      else next.delete(id);
      return next;
    });
    // Leave a finished item visible (struck through) for a moment, then tidy it away.
    if (done)
      setTimeout(() => void client.invalidateQueries({ queryKey: keys.actionItems() }), 1400);
  };

  return (
    <AsyncWidget
      query={query}
      label="My action items"
      errorTitle="Couldn’t load your action items"
      isEmpty={(items) => items.filter((a) => !a.done).length === 0 && justDone.size === 0}
      empty={{
        illustration: 'tasks',
        title: 'No action items',
        description: 'When a meeting assigns you something, it lands here with a due date.',
      }}
      skeleton={<RowsSkeleton rows={3} round />}
      className="overflow-hidden rounded-card bg-card"
    >
      {(items) => (
        <ul>
          {items
            .filter((a) => !a.done || justDone.has(a.id))
            .map((a) => {
              const checked = a.done || justDone.has(a.id);
              return (
                <li key={a.id} className="list-row">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => toggle(a.id, !checked)}
                    className="flex w-full items-center gap-3 pl-4 text-left transition-colors duration-300 select-none active:bg-row-pressed active:delay-[40ms] active:duration-0"
                  >
                    <CheckCircle checked={checked} />
                    <span className="row-main flex min-h-[56px] flex-1 flex-col justify-center py-2.5 pr-4">
                      <span
                        className={cn(
                          'text-body transition-colors duration-300',
                          checked &&
                            'text-muted-foreground line-through decoration-faint-foreground',
                        )}
                      >
                        {a.text}
                      </span>
                      {a.due && (
                        <span
                          className={cn(
                            'text-subhead',
                            dueLabel(a.due) === 'Due today' && !checked
                              ? 'text-destructive-text'
                              : 'text-muted-foreground',
                          )}
                        >
                          {dueLabel(a.due)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </AsyncWidget>
  );
}

// ── Recent files and chats ───────────────────────────────────────────────────────────

function RecentFiles() {
  const { entry } = useLayer();
  const query = useDocs({ sort: 'recent' });
  return (
    <AsyncWidget
      query={query}
      label="Recent files"
      errorTitle="Couldn’t load recent files"
      empty={{
        illustration: 'docs',
        title: 'No files yet',
        description: 'Upload a memo or a PDF and ask about it straight away.',
        action: (
          <Button variant="secondary" onClick={() => emitShellEvent('open-add')}>
            Add a file
          </Button>
        ),
      }}
      skeleton={<RowsSkeleton rows={4} />}
    >
      {(docs) => (
        <ul className="overflow-hidden rounded-card bg-card">
          {docs.slice(0, 4).map((doc) => (
            <DocRow key={doc.id} doc={doc} href={pushPath(entry.key, 'doc', doc.id)} />
          ))}
        </ul>
      )}
    </AsyncWidget>
  );
}

function RecentChats() {
  const { entry } = useLayer();
  const query = useThreads();
  return (
    <AsyncWidget
      query={query}
      label="Recent chats"
      errorTitle="Couldn’t load recent chats"
      empty={{
        illustration: 'chats',
        title: 'No questions yet',
        description:
          'Ask anything about your team’s memos and meetings. Answers cite their sources.',
        action: (
          <Button onClick={() => navigate('/ask', { intent: 'none' })}>Ask a question</Button>
        ),
      }}
      skeleton={<RowsSkeleton rows={3} round />}
    >
      {(threads) => (
        <ul className="overflow-hidden rounded-card bg-card">
          {threads.slice(0, 3).map((t) => (
            <ThreadRow key={t.id} thread={t} href={pushPath(entry.key, 'thread', t.id)} />
          ))}
        </ul>
      )}
    </AsyncWidget>
  );
}

// ── This week (time-filtered) ────────────────────────────────────────────────────────

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[10px] bg-card-nested px-3 py-2.5">
      <span className="text-title-2 tabular">{value}</span>
      <span className="text-footnote text-muted-foreground">{label}</span>
    </div>
  );
}

function ThisWeek() {
  const [range, setRange] = useState<api.StatsRange>('week');
  const query = useStats(range);
  return (
    <div className="flex flex-col gap-3 rounded-card bg-card p-4">
      <SegmentedControl
        aria-label="Period"
        value={range}
        onValueChange={setRange}
        segments={[
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
        ]}
      />
      <AsyncWidget
        query={query}
        label="Activity"
        errorTitle="Couldn’t load activity"
        isEmpty={(s) => s === null}
        empty={{
          illustration: 'period',
          title: 'No data for this period',
          description: 'Sotto started counting this month.',
          action: (
            <Button variant="secondary" onClick={() => setRange('month')}>
              Show this month
            </Button>
          ),
        }}
        skeleton={
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[68px] rounded-[10px]" />
            ))}
          </div>
        }
      >
        {(stats) =>
          stats && (
            <div
              className={cn(
                'grid grid-cols-3 gap-2 transition-opacity',
                query.isPlaceholderData && 'opacity-60',
              )}
            >
              <Stat value={String(stats.meetings)} label="Meetings" />
              <Stat value={`${stats.hours}`} label="Hours recorded" />
              <Stat value={String(stats.questions)} label="Questions" />
            </div>
          )
        }
      </AsyncWidget>
    </div>
  );
}

export function HomeScreen() {
  // Brief §9 order. Wide windows flow the same widgets into two columns, keeping that order.
  return (
    <Screen title="Home">
      <div className="flex flex-col gap-7 pt-2 lg:mx-auto lg:block lg:max-w-[1180px] lg:columns-2 lg:gap-x-2 lg:px-2 [&>*]:break-inside-avoid lg:[&>*]:mb-7">
        <SampleNotice />
        <Section title="Continue listening">
          <ContinueListening />
        </Section>
        <Section title="Processing">
          <Processing />
        </Section>
        <Section title="My action items">
          <ActionItems />
        </Section>
        <Section title="Recent files" action={<SeeAll href="/docs" label="See all files" />}>
          <RecentFiles />
        </Section>
        <Section title="Recent chats" action={<SeeAll href="/ask" label="See all chats" />}>
          <RecentChats />
        </Section>
        <Section title="Activity">
          <ThisWeek />
        </Section>
      </div>
    </Screen>
  );
}
