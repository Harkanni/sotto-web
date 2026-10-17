'use client';

import { Check, Play, RotateCw, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Screen } from '@/components/shell/screen';
import { useLayer } from '@/components/shell/stack-context';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { messageOf } from '@/components/account/workspace-actions';
import { TransferRow } from '@/components/uploads/transfers';
import { AsyncWidget, EmptyState } from '@/components/widgets/async-widget';
import {
  IN_PROGRESS,
  useActionItems,
  useContinueListening,
  useFiles,
  useRetryFile,
  type ActionItem,
  type FileItem,
} from '@/lib/api/files';
import { failureText, overallOf, stepLabel } from '@/lib/files/status';
import { timestamp } from '@/lib/format';
import { NavLink } from '@/lib/nav/link';
import { pushPath } from '@/lib/nav/routes';
import { navigate } from '@/lib/nav/store';
import { useActiveWorkspace } from '@/lib/api/hooks';
import { useConversations } from '@/lib/api/ask';
import { NOTICE_STORAGE_KEY } from '@/lib/prefs/boot-script';
import { readStored, writeStored } from '@/lib/prefs/stored';
import { accessAtLeast } from '@/lib/roles';
import { useUploads } from '@/lib/uploads/store';
import { cn } from '@/lib/utils';
import { emitShellEvent } from '@/components/shell/shell-events';
import { liveHref } from '@/components/live/listen-sheet';
import { useLiveNow } from '@/lib/live/now';
import { FileRow } from './parts/file-rows';
import { LiveNowList } from './parts/live-now';
import { ChatRow, useDeleteChat } from './ask';
import { RowsSkeleton } from './parts/rows';

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

/**
 * Says the content is made up, in workspaces that loaded sample content. Dismissed once, it
 * stays hidden: the boot script hides it before first paint, so dismissing never shifts Home.
 */
function SampleNotice() {
  const workspace = useActiveWorkspace();
  if (!workspace?.sample) return null;
  return (
    <div className="sample-notice mx-[var(--gutter)] flex lg:[column-span:all] items-start gap-3 rounded-card bg-primary-tint p-4">
      <div className="min-w-0 flex-1">
        <p className="text-headline text-primary-text">You’re exploring sample content</p>
        {/* Muted grey drops below 4.5:1 on the indigo tint; this keeps AA in both themes. */}
        <p className="mt-1 text-callout text-pretty text-foreground/75">
          These memos, meetings and chats are made up to show what Sotto does. Add your own files
          with +; sample meetings have transcripts but no audio.
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

// ── Live now ──────────────────────────────────────────────────────────────────────────

/**
 * Calls live right now, first on Home while there are any (and nothing at all otherwise: it's
 * news, not a widget with an empty state). Each opens the call on Meetings, where the live
 * screen lives whichever tab Listen started from.
 */
function LiveNow() {
  const items = useLiveNow();
  if (!items.length) return null;
  return (
    <Section title="Live now">
      <LiveNowList items={items} hrefFor={liveHref} />
    </Section>
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
      {(items) => {
        const { file, positionMs } = items[0]!;
        const total = file.durationMs ?? positionMs;
        const progress = total ? positionMs / total : 0;
        const href = pushPath(entry.key, 'meeting', file.id);
        return (
          <div className="flex items-center gap-4 p-4">
            <button
              type="button"
              aria-label={`Play ${file.title} from ${timestamp(positionMs / 1000)}`}
              // The meeting screen starts playing where you stopped.
              onClick={() => navigate(`${href}?t=${Math.floor(positionMs / 1000)}&play=1`)}
              className="pressable grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
            >
              <Play aria-hidden className="ml-0.5 size-5 fill-current" />
            </button>
            <NavLink
              href={`${href}?t=${Math.floor(positionMs / 1000)}`}
              className="min-w-0 flex-1 rounded-button outline-offset-4 active:opacity-60"
            >
              <span className="block truncate text-headline">{file.title}</span>
              <span aria-hidden className="mt-2 block h-1.5 overflow-hidden rounded-full bg-fill">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ translate: `${progress * 100 - 100}% 0` }}
                />
              </span>
              <span className="mt-1.5 flex justify-between text-footnote text-muted-foreground tabular">
                <span>{timestamp(positionMs / 1000)}</span>
                <span>{timestamp((total - positionMs) / 1000)} left</span>
              </span>
            </NavLink>
          </div>
        );
      }}
    </AsyncWidget>
  );
}

// ── Processing ────────────────────────────────────────────────────────────────────────

/** A file on its way to Ready: animated bars, the step, a bar that slides; or why it failed. */
function ProcessingRow({ file, href }: { file: FileItem; href: string }) {
  const retry = useRetryFile();
  const failed = file.status === 'failed';
  const pct = Math.round(overallOf(file) * 100);
  return (
    <li className="list-row flex items-center">
      <NavLink
        href={href}
        className="flex min-w-0 flex-1 items-center gap-3 pl-4 transition-colors duration-300 active:bg-row-pressed active:delay-[40ms] active:duration-0"
      >
        <span aria-hidden className="flex h-9 w-9 shrink-0 items-end justify-center gap-[3px] pb-2">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(
                'w-[3px] origin-bottom rounded-full',
                failed
                  ? 'bg-destructive'
                  : 'bg-primary motion-safe:animate-[bars_1.1s_ease-in-out_infinite]',
              )}
              style={{ height: [10, 18, 13, 7][i], animationDelay: `${i * 120}ms` }}
            />
          ))}
        </span>
        <span className="row-main flex min-h-[60px] min-w-0 flex-1 flex-col justify-center gap-1.5 py-2.5 pr-4">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-body">{file.title}</span>
            {!failed && (
              <span className="shrink-0 text-subhead text-muted-foreground tabular">{pct}%</span>
            )}
          </span>
          {failed ? (
            <span className="line-clamp-2 text-footnote text-destructive-text">
              {failureText(file.error)}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span
                role="progressbar"
                aria-label={`${file.title}: ${stepLabel(file)}`}
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill"
              >
                {/* Slides rather than stretches: a compositor-only change that keeps the
                    rounded end round. */}
                <span
                  className="block h-full rounded-full bg-primary transition-[translate] duration-700 ease-out"
                  style={{ translate: `${pct - 100}% 0` }}
                />
              </span>
              <span className="shrink-0 text-footnote text-muted-foreground">
                {stepLabel(file)}
              </span>
            </span>
          )}
        </span>
      </NavLink>
      {failed && accessAtLeast(file.access, 'edit') && (
        <button
          type="button"
          aria-label={`Retry ${file.title}`}
          onClick={() =>
            retry.mutate(file.id, {
              onSuccess: () => toast('Retrying', { description: file.title }),
              onError: (e) => toast(messageOf(e)),
            })
          }
          className="pressable mr-2 grid size-11 shrink-0 place-items-center rounded-full text-primary-text hover:bg-primary-tint active:bg-primary-tint-strong"
        >
          <RotateCw aria-hidden className="size-5" />
        </button>
      )}
    </li>
  );
}

/**
 * What Sotto is working on: uploads leaving this device, then files moving through the
 * pipeline (live, from GET /events), then anything that failed, with Retry.
 */
function Processing() {
  const { entry } = useLayer();
  const query = useFiles({ sort: 'recent' });
  const uploads = useUploads();
  const working = useMemo(
    () => (query.data ?? []).filter((f) => IN_PROGRESS.includes(f.status) || f.status === 'failed'),
    [query.data],
  );
  const moving = uploads.filter((u) => u.state !== 'done');
  const showUploads = moving.length > 0;

  if (query.data && !working.length && !showUploads) {
    return (
      <div className="rounded-card bg-card">
        <EmptyState
          illustration="processing"
          title="All caught up"
          description="New recordings and files show their progress here while Sotto works on them."
        />
      </div>
    );
  }
  return (
    <AsyncWidget
      query={query}
      label="Processing"
      errorTitle="Couldn’t load what’s processing"
      isEmpty={() => false}
      empty={{ illustration: 'processing', title: '', description: '' }}
      skeleton={<RowsSkeleton rows={2} round />}
      className="overflow-hidden rounded-card bg-card"
    >
      {() => (
        <ul aria-label="Processing">
          {moving.map((item) => (
            <TransferRow key={item.id} item={item} />
          ))}
          {working.slice(0, 6).map((file) => (
            <ProcessingRow
              key={file.id}
              file={file}
              href={pushPath(entry.key, file.kind === 'audio' ? 'meeting' : 'doc', file.id)}
            />
          ))}
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

const TICKS_KEY = 'sotto.action-items.done';

/** Which action items you ticked. Kept on this device until action items are stored (later). */
function useTicks(): [Set<string>, (key: string, done: boolean) => void] {
  const [ticks, setTicks] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(readStored(TICKS_KEY) ?? '[]') as string[]);
    } catch {
      return new Set();
    }
  });
  const set = (key: string, done: boolean) =>
    setTicks((prev) => {
      const next = new Set(prev);
      if (done) next.add(key);
      else next.delete(key);
      writeStored(TICKS_KEY, JSON.stringify([...next].slice(-500)));
      return next;
    });
  return [ticks, set];
}

const itemKey = (a: ActionItem) => `${a.meeting.id}:${a.text}`;

/**
 * Action items from recent meetings: yours (the owner named matches you) first, then
 * everyone's. Ticking one keeps it struck through for a moment, then tidies it away.
 */
function ActionItems() {
  const { entry } = useLayer();
  const query = useActionItems();
  const [ticks, tick] = useTicks();
  const [justDone, setJustDone] = useState<Set<string>>(new Set());

  const toggle = (key: string, done: boolean) => {
    setJustDone((prev) => new Set(prev).add(key));
    tick(key, done);
    if (done)
      setTimeout(
        () =>
          setJustDone((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          }),
        1400,
      );
  };

  const open = (items: ActionItem[]) =>
    items
      .filter((a) => !ticks.has(itemKey(a)) || justDone.has(itemKey(a)))
      .sort((a, b) => Number(b.mine) - Number(a.mine))
      .slice(0, 6);

  return (
    <AsyncWidget
      query={query}
      label="Action items"
      errorTitle="Couldn’t load action items"
      isEmpty={(items) => open(items).length === 0}
      empty={{
        illustration: 'tasks',
        title: 'No action items',
        description: 'When a meeting assigns something, it lands here.',
      }}
      skeleton={<RowsSkeleton rows={3} round />}
      className="overflow-hidden rounded-card bg-card"
    >
      {(items) => (
        <>
          <ul>
            {open(items).map((a) => {
              const key = itemKey(a);
              const checked = ticks.has(key);
              return (
                <li key={key} className="list-row flex items-center">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    aria-label={a.text}
                    onClick={() => toggle(key, !checked)}
                    className="grid min-h-[56px] shrink-0 place-items-center pr-1 pl-4 select-none active:opacity-60"
                  >
                    <CheckCircle checked={checked} />
                  </button>
                  <NavLink
                    href={`${pushPath(entry.key, 'meeting', a.meeting.id)}${a.atMs !== null ? `?t=${Math.floor(a.atMs / 1000)}` : ''}`}
                    className="row-main flex min-h-[56px] min-w-0 flex-1 flex-col justify-center py-2.5 pr-4 pl-2 transition-colors duration-300 active:bg-row-pressed"
                  >
                    <span
                      className={cn(
                        'text-body transition-colors duration-300',
                        checked && 'text-muted-foreground line-through decoration-faint-foreground',
                      )}
                    >
                      {a.text}
                    </span>
                    <span className="truncate text-subhead text-muted-foreground">
                      {[a.mine ? 'You' : a.owner, a.due && `due ${a.due}`, a.meeting.title]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
          <p className="px-4 pt-1 pb-3 text-footnote text-muted-foreground">
            Ticks are kept on this device.
          </p>
        </>
      )}
    </AsyncWidget>
  );
}

// ── Recent files and chats ───────────────────────────────────────────────────────────

function RecentFiles() {
  const { entry } = useLayer();
  const query = useFiles({ sort: 'recent' });
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
      {(files) => (
        <ul className="overflow-hidden rounded-card bg-card">
          {files.slice(0, 4).map((file) => (
            <FileRow
              key={file.id}
              file={file}
              href={pushPath(entry.key, file.kind === 'audio' ? 'meeting' : 'doc', file.id)}
            />
          ))}
        </ul>
      )}
    </AsyncWidget>
  );
}

function RecentChats() {
  const { entry } = useLayer();
  const query = useConversations();
  const onDelete = useDeleteChat(entry.key);
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
      {(chats) => (
        <ul className="overflow-hidden rounded-card bg-card">
          {chats.slice(0, 3).map((c) => (
            <ChatRow
              key={c.id}
              chat={c}
              href={pushPath(entry.key, 'thread', c.id)}
              onDelete={onDelete}
            />
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

type Range = 'week' | 'month' | 'year';
const RANGE_DAYS: Record<Range, number> = { week: 7, month: 30, year: 365 };

/** Meetings recorded and hours of audio in the period, from the files themselves. */
function ThisWeek() {
  const [range, setRange] = useState<Range>('week');
  const query = useFiles({ kind: 'audio', sort: 'recent' });
  // "This week" is measured from when Home opened; a render never reads the clock.
  const [now] = useState(Date.now);
  const since = now - RANGE_DAYS[range] * 86_400_000;
  const stats = useMemo(() => {
    const meetings = (query.data ?? []).filter(
      (f) => f.status === 'ready' && new Date(f.createdAt).getTime() >= since,
    );
    const hours = meetings.reduce((sum, f) => sum + (f.durationMs ?? 0), 0) / 3_600_000;
    return { meetings: meetings.length, hours };
  }, [query.data, since]);

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
        isEmpty={() => stats.meetings === 0}
        empty={{
          illustration: 'period',
          title: 'No data for this period',
          description: 'Meetings you record or import are counted here.',
          action:
            range !== 'year' ? (
              <Button variant="secondary" onClick={() => setRange('year')}>
                Show this year
              </Button>
            ) : undefined,
        }}
        skeleton={
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[68px] rounded-[10px]" />
            ))}
          </div>
        }
      >
        {() => (
          <div className="grid grid-cols-3 gap-2">
            <Stat value={String(stats.meetings)} label="Meetings" />
            <Stat
              value={stats.hours < 10 ? stats.hours.toFixed(1) : String(Math.round(stats.hours))}
              label="Hours recorded"
            />
            {/* Counting questions arrives with Ask (Phase 5). */}
            <Stat value="–" label="Questions" />
          </div>
        )}
      </AsyncWidget>
    </div>
  );
}

export function HomeScreen() {
  // Brief §9 order. Wide windows flow the same widgets into two columns, keeping that order.
  return (
    <Screen
      title="Home"
      header={
        // Phones search from here (brief §9); wider windows have the sidebar's field and ⌘K.
        <div className="px-[var(--gutter)] pb-3 md:hidden">
          <label className="relative flex h-9 items-center gap-1.5 rounded-input bg-fill pl-2 text-muted-foreground before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']">
            <Search aria-hidden className="size-[18px] shrink-0" strokeWidth={2} />
            {/* Focus moves straight into search, which has its own field and results. */}
            <input
              type="search"
              aria-label="Search memos, meetings and chats"
              aria-haspopup="dialog"
              placeholder="Search memos, meetings and chats"
              value=""
              onChange={() => undefined}
              onFocus={(e) => {
                e.currentTarget.blur();
                emitShellEvent('open-palette');
              }}
              className="h-full min-w-0 flex-1 bg-transparent text-[17px] leading-[22px] tracking-[var(--tracking-body)] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
      }
    >
      <div className="flex flex-col gap-7 pt-2 lg:mx-auto lg:block lg:max-w-[1180px] lg:columns-2 lg:gap-x-2 lg:px-2 [&>*]:break-inside-avoid lg:[&>*]:mb-7">
        <SampleNotice />
        <LiveNow />
        <Section title="Continue listening">
          <ContinueListening />
        </Section>
        <Section title="Processing">
          <Processing />
        </Section>
        <Section title="Action items">
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
