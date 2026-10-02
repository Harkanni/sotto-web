'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Command, useCommandState } from 'cmdk';
import {
  AudioLines,
  CornerDownLeft,
  FileAudio,
  Keyboard,
  MessageCircle,
  Mic,
  Moon,
  PenLine,
  Search,
  Sparkles,
  Sun,
  SunMoon,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Dialog } from 'radix-ui';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Kbd, ModKey } from '@/components/ui/kbd';
import { toastPreview } from '@/components/ui/toaster';
import { dayAndTime, duration, relativeTime } from '@/lib/format';
import { ProgressDriver, prefersReducedMotion } from '@/lib/motion/driver';
import { springs } from '@/lib/motion/spring';
import { useActiveTab } from '@/lib/nav/hooks';
import { tabOf, type Tab } from '@/lib/nav/routes';
import { getSnapshot, navigate } from '@/lib/nav/store';
import { setThemeSmoothly } from '@/lib/prefs/theme';
import { createLocalThread } from '@/lib/sample/answer';
import type { Doc, Meeting, Thread } from '@/lib/sample/data';
import { keys, useDocs, useMeetings, useThreads } from '@/lib/sample/queries';
import { cn } from '@/lib/utils';
import { DOC_KINDS, MEETING_TINT, THREAD_TINT, ownerName } from '@/screens/parts/rows';
import { emitShellEvent, onShellEvent } from './shell-events';
import { selectTab } from './tab-bar';
import { TAB_ITEMS } from './tabs';

/**
 * The ⌘K palette (brief §9): one place to find a document, meeting or chat, jump to a section,
 * run a command, or ask Sotto. ↵ opens the highlighted result; ⌘↵ asks Sotto whatever you typed.
 *
 * SAMPLE (Phase 2): it searches the titles of the sample workspace on this device. Phase 5
 * replaces the matching with hybrid search over passages and meeting moments.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  if (open && !present) setPresent(true);

  useEffect(() => onShellEvent('open-palette', () => setOpen(true)), []);
  useEffect(() => onShellEvent('toggle-palette', () => setOpen((o) => !o)), []);
  const onExited = useCallback(() => setPresent(false), []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <Dialog.Root open={present} onOpenChange={(next) => !next && setOpen(false)}>
      {present && (
        <Dialog.Portal forceMount>
          <PalettePanel open={open} onExited={onExited} onClose={close} />
        </Dialog.Portal>
      )}
    </Dialog.Root>
  );
}

function PalettePanel({
  open,
  onExited,
  onClose,
}: {
  open: boolean;
  onExited: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const driver = useRef<ProgressDriver | null>(null);
  const navigated = useRef(false);
  const [search, setSearch] = useState('');
  const searching = search.trim().length > 0;
  const docs = useDocs();
  const meetings = useMeetings();
  const threads = useThreads();

  // cmdk selects the first row it sees, which can be a command while the recent items are still
  // loading above it. Until you move the selection yourself, it stays on the first recent item.
  const [value, setValue] = useState('');
  const [moved, setMoved] = useState(false);
  const first = docs.data?.[0] ? `doc ${docs.data[0].id}` : null;
  const selected = searching || moved || !first ? value : first;

  // Drops in from just above, a touch small, and settles: quick in, quicker out.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const overlay = overlayRef.current;
    if (!panel || !overlay) return;
    if (!driver.current) {
      const reduced = prefersReducedMotion();
      driver.current = new ProgressDriver(
        [
          {
            el: panel,
            style: (p) => ({
              opacity: String(1 - p),
              transform: reduced ? 'none' : `translate3d(0,${p * -10}px,0) scale(${1 - p * 0.035})`,
            }),
          },
          { el: overlay, style: (p) => ({ opacity: String(1 - p) }) },
        ],
        1,
      );
      driver.current.set(1);
    }
    const d = driver.current;
    if (open) void d.animateTo(0, { config: springs.standard });
    else
      void d.animateTo(1, { config: springs.snappy }).then((done) => {
        if (done) onExited();
      });
  }, [open, onExited]);

  /** Leaves the palette for somewhere else in the app (the palette fades as the screen opens). */
  const go = (href: string) => {
    navigated.current = true;
    onClose();
    const from = tabOf(getSnapshot().pathname);
    // Within a tab the screen slides in as usual; another tab simply appears with it open.
    navigate(href, { intent: tabOf(href) === from ? 'forward' : 'none' });
  };

  const client = useQueryClient();
  const ask = (question: string) => {
    const text = question.trim();
    if (!text) return;
    const thread = createLocalThread(text, 'All sources');
    void client.invalidateQueries({ queryKey: keys.threads() });
    go(`/ask/${thread.id}`);
  };

  return (
    <>
      <Dialog.Overlay
        ref={overlayRef}
        forceMount
        className="fixed inset-0 z-[var(--z-palette)] bg-overlay opacity-0"
      />
      <div className="pointer-events-none fixed inset-0 z-[var(--z-palette)] flex justify-center px-4 pt-[max(var(--safe-top),min(14vh,128px))]">
        <Dialog.Content
          ref={panelRef}
          forceMount
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            // Opening something moves focus to that screen; don't drag it back to the old one.
            if (navigated.current) e.preventDefault();
          }}
          className="palette surface-elevated pointer-events-auto flex h-fit max-h-[min(560px,calc(100dvh-2*var(--safe-top)-48px))] w-full max-w-[640px] flex-col overflow-hidden rounded-[18px] shadow-menu outline-none"
          style={{ opacity: 0 }}
        >
          <Dialog.Title className="sr-only">Search and commands</Dialog.Title>
          <Command
            label="Search and commands"
            loop
            value={selected}
            onValueChange={setValue}
            filter={matchWords}
            className="flex min-h-0 flex-col"
            onPointerMove={() => {
              if (!moved) setMoved(true);
            }}
            onKeyDown={(e) => {
              if (MOVE_KEYS.has(e.key) || (e.ctrlKey && 'jknp'.includes(e.key))) setMoved(true);
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && searching) {
                e.preventDefault();
                ask(search);
              }
            }}
          >
            <div className="flex shrink-0 items-center gap-3 px-4 shadow-[inset_0_-0.5px_0_var(--separator)]">
              <Search aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Search or ask Sotto"
                className="h-14 min-w-0 flex-1 bg-transparent text-[17px] leading-[22px] tracking-[var(--tracking-body)] outline-none placeholder:text-muted-foreground"
              />
              <Kbd className="max-sm:hidden">esc</Kbd>
            </div>
            <Results
              search={search}
              docs={docs.data}
              meetings={meetings.data}
              threads={threads.data}
              loading={docs.isPending || meetings.isPending || threads.isPending}
              go={go}
              ask={ask}
              onClose={onClose}
            />
            <Footer />
          </Command>
        </Dialog.Content>
      </div>
    </>
  );
}

/** Keys that move the selection (with cmdk's Ctrl+J/K/N/P on top). */
const MOVE_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp']);

/**
 * Matches whole words by their start ("pri" finds "Pricing review notes"), not letters scattered
 * across a title, so results stay predictable. Earlier words (the title) rank higher.
 */
export function matchWords(_value: string, search: string, keywords: string[] = []) {
  const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return 1;
  const words = keywords
    .join(' ')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    words.forEach((word, i) => {
      if (word.startsWith(token)) best = Math.max(best, 1 - Math.min(i, 8) * 0.05);
      else if (token.length > 2 && word.includes(token)) best = Math.max(best, 0.3);
    });
    if (!best) return 0;
    total += best;
  }
  return total / tokens.length;
}

// ── Results ─────────────────────────────────────────────────────────────────────────────

function Results({
  search,
  docs,
  meetings,
  threads,
  loading,
  go,
  ask,
  onClose,
}: {
  search: string;
  docs: Doc[] | undefined;
  meetings: Meeting[] | undefined;
  threads: Thread[] | undefined;
  loading: boolean;
  go: (href: string) => void;
  ask: (question: string) => void;
  onClose: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const active = useActiveTab();
  const { resolvedTheme, theme, setTheme } = useTheme();
  const searching = search.trim().length > 0;

  useSlidingHighlight(listRef, highlightRef);

  // Empty: a few recent items. Searching: everything, for the filter to narrow.
  const recentDocs = searching ? docs : docs?.slice(0, 3);
  const recentMeetings = searching ? meetings : meetings?.slice(0, 2);
  const recentThreads = searching ? threads : threads?.slice(0, 2);

  // Runs a command that opens something else (a picker, a sheet) once the palette has gone.
  const thenClose = (run: () => void) => {
    run();
    onClose();
  };

  return (
    <Command.List
      ref={listRef}
      className="palette-list relative min-h-0 overflow-y-auto overscroll-contain px-2 pt-1.5 pb-2"
    >
      <div
        ref={highlightRef}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 rounded-[10px] bg-fill opacity-0"
      />
      {loading && <Command.Loading label="Loading the sample workspace">{null}</Command.Loading>}
      <Command.Empty className="px-3 pt-3 pb-1 text-subhead text-muted-foreground">
        Nothing in the sample workspace matches “{search.trim()}”.
      </Command.Empty>

      {!!recentDocs?.length && (
        <Command.Group heading={searching ? 'Documents' : 'Recent'}>
          {recentDocs.map((doc) => {
            const kind = DOC_KINDS[doc.kind];
            return (
              <Item
                key={doc.id}
                value={`doc ${doc.id}`}
                keywords={[doc.title, kind.label, ownerName(doc.ownerId)]}
                icon={<IconTile icon={kind.icon} tint={kind.tint} square />}
                title={doc.title}
                subtitle={`${kind.label}, ${ownerName(doc.ownerId)}, ${relativeTime(doc.updatedAt)}`}
                onSelect={() => go(`/docs/${doc.id}`)}
              />
            );
          })}
          {!searching &&
            recentMeetings?.map((m) => (
              <Item
                key={m.id}
                value={`meeting ${m.id}`}
                keywords={[m.title]}
                icon={<IconTile icon={AudioLines} tint={MEETING_TINT} />}
                title={m.title}
                subtitle={`${dayAndTime(m.startedAt)}, ${duration(m.durationSec)}`}
                onSelect={() => go(`/meetings/${m.id}`)}
              />
            ))}
          {!searching &&
            recentThreads?.map((t) => (
              <Item
                key={t.id}
                value={`chat ${t.id}`}
                keywords={[t.title]}
                icon={<IconTile icon={MessageCircle} tint={THREAD_TINT} />}
                title={t.title}
                subtitle={`Chat, ${relativeTime(t.updatedAt)}`}
                onSelect={() => go(`/ask/${t.id}`)}
              />
            ))}
        </Command.Group>
      )}

      {searching && !!recentMeetings?.length && (
        <Command.Group heading="Meetings">
          {recentMeetings.map((m) => (
            <Item
              key={m.id}
              value={`meeting ${m.id}`}
              keywords={[m.title, ...m.participantIds.map(ownerName)]}
              icon={<IconTile icon={AudioLines} tint={MEETING_TINT} />}
              title={m.title}
              subtitle={`${dayAndTime(m.startedAt)}, ${duration(m.durationSec)}`}
              onSelect={() => go(`/meetings/${m.id}`)}
            />
          ))}
        </Command.Group>
      )}

      {searching && !!recentThreads?.length && (
        <Command.Group heading="Chats">
          {recentThreads.map((t) => (
            <Item
              key={t.id}
              value={`chat ${t.id}`}
              keywords={[t.title]}
              icon={<IconTile icon={MessageCircle} tint={THREAD_TINT} />}
              title={t.title}
              subtitle={`Chat, ${relativeTime(t.updatedAt)}`}
              onSelect={() => go(`/ask/${t.id}`)}
            />
          ))}
        </Command.Group>
      )}

      <Command.Group heading="Go to">
        {TAB_ITEMS.map(({ tab, label, icon }) => (
          <Item
            key={tab}
            value={`go ${tab}`}
            keywords={[label, 'go to', 'open']}
            icon={<IconTile icon={icon} plain />}
            title={label}
            hint={<GoHint tab={tab} />}
            onSelect={() => {
              onClose();
              selectTab(tab, active);
            }}
          />
        ))}
      </Command.Group>

      <Command.Group heading="Commands">
        <Item
          value="upload files"
          keywords={['upload', 'add', 'import', 'pdf', 'document', 'word']}
          icon={<IconTile icon={Upload} plain />}
          title="Upload files"
          // The picker opens inside this keypress or click; browsers allow nothing later.
          onSelect={() => thenClose(() => emitShellEvent('pick-files', 'files'))}
        />
        <Item
          value="import audio"
          keywords={['audio', 'voice memo', 'recording', 'mp3', 'm4a']}
          icon={<IconTile icon={FileAudio} plain />}
          title="Import audio"
          onSelect={() => thenClose(() => emitShellEvent('pick-files', 'audio'))}
        />
        <Item
          value="record a meeting"
          keywords={['record', 'meeting', 'microphone']}
          icon={<IconTile icon={Mic} plain />}
          title="Record a meeting"
          onSelect={() =>
            thenClose(() =>
              toastPreview(
                'Recording arrives in Phase 4',
                'This sample workspace can’t record yet.',
              ),
            )
          }
        />
        <Item
          value="new note"
          keywords={['note', 'write', 'create']}
          icon={<IconTile icon={PenLine} plain />}
          title="New note"
          onSelect={() =>
            thenClose(() =>
              toastPreview(
                'Notes arrive in Phase 4',
                'This sample workspace can’t save notes yet.',
              ),
            )
          }
        />
        {resolvedTheme === 'dark' ? (
          <Item
            value="light appearance"
            keywords={['theme', 'appearance', 'light mode']}
            icon={<IconTile icon={Sun} plain />}
            title="Switch to light appearance"
            onSelect={() => thenClose(() => setThemeSmoothly('light', setTheme))}
          />
        ) : (
          <Item
            value="dark appearance"
            keywords={['theme', 'appearance', 'dark mode']}
            icon={<IconTile icon={Moon} plain />}
            title="Switch to dark appearance"
            onSelect={() => thenClose(() => setThemeSmoothly('dark', setTheme))}
          />
        )}
        {theme !== 'system' && (
          <Item
            value="system appearance"
            keywords={['theme', 'appearance', 'automatic', 'system']}
            icon={<IconTile icon={SunMoon} plain />}
            title="Match the system appearance"
            onSelect={() => thenClose(() => setThemeSmoothly('system', setTheme))}
          />
        )}
        <Item
          value="keyboard shortcuts"
          keywords={['keys', 'shortcuts', 'help', 'cheat sheet']}
          icon={<IconTile icon={Keyboard} plain />}
          title="Keyboard shortcuts"
          hint={<Kbd>?</Kbd>}
          onSelect={() => thenClose(() => emitShellEvent('open-shortcuts'))}
        />
      </Command.Group>

      {searching && (
        <Command.Group heading="Ask Sotto" forceMount>
          <Item
            value="ask sotto"
            forceMount
            icon={<IconTile icon={Sparkles} tint="bg-primary text-primary-foreground" />}
            title={`Ask “${search.trim()}”`}
            subtitle="A sample answer with sources, until Phase 5"
            hint={
              <>
                <Kbd>
                  <ModKey />
                </Kbd>
                <Kbd>↵</Kbd>
              </>
            }
            onSelect={() => ask(search)}
          />
        </Command.Group>
      )}
    </Command.List>
  );
}

function GoHint({ tab }: { tab: Tab }) {
  const letter = { home: 'H', docs: 'D', ask: 'A', meetings: 'M', profile: 'P' }[tab];
  return (
    <>
      <Kbd>G</Kbd>
      <Kbd>{letter}</Kbd>
    </>
  );
}

function Item({
  value,
  keywords,
  icon,
  title,
  subtitle,
  hint,
  forceMount,
  onSelect,
}: {
  value: string;
  keywords?: string[];
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  hint?: React.ReactNode;
  forceMount?: boolean;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value}
      keywords={[title, ...(keywords ?? [])]}
      forceMount={forceMount}
      onSelect={onSelect}
      className="group/item relative z-[1] flex min-h-11 cursor-default items-center gap-3 rounded-[10px] px-2.5 py-1.5 select-none"
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] leading-[21px]">{title}</span>
        {subtitle && (
          <span className="block truncate text-[13px] leading-[18px] text-muted-foreground">
            {subtitle}
          </span>
        )}
      </span>
      {hint && (
        <span className="flex shrink-0 items-center gap-1 group-aria-selected/item:hidden max-sm:hidden">
          {hint}
        </span>
      )}
      <CornerDownLeft
        aria-hidden
        className="hidden size-4 shrink-0 text-muted-foreground group-aria-selected/item:block max-sm:!hidden"
        strokeWidth={2}
      />
    </Command.Item>
  );
}

function IconTile({
  icon: Icon,
  tint,
  square,
  plain,
}: {
  icon: LucideIcon;
  tint?: string;
  square?: boolean;
  plain?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-[30px] shrink-0 place-items-center',
        square ? 'rounded-[8px]' : 'rounded-full',
        plain ? 'text-muted-foreground' : tint,
      )}
    >
      <Icon className={plain ? 'size-5' : 'size-[17px]'} strokeWidth={plain ? 1.75 : 2} />
    </span>
  );
}

function Footer() {
  const searching = useCommandState((s) => s.search.trim().length > 0);
  return (
    <div className="flex shrink-0 items-center gap-4 px-4 py-2.5 text-footnote text-muted-foreground shadow-[inset_0_0.5px_0_var(--separator)]">
      <span className="min-w-0 flex-1 truncate">
        Searching titles in the sample workspace. Full search arrives in Phase 5.
      </span>
      <span className="flex shrink-0 items-center gap-1.5 max-sm:hidden">
        <Kbd>↵</Kbd> Open
      </span>
      {searching && (
        <span className="flex shrink-0 items-center gap-1.5 max-sm:hidden">
          <Kbd>
            <ModKey />
          </Kbd>
          <Kbd>↵</Kbd> Ask
        </span>
      )}
    </div>
  );
}

/**
 * One highlight that slides between results as the selection moves (arrow keys or the
 * pointer), instead of rows blinking on and off. When typing re-sorts the list it jumps there.
 */
function useSlidingHighlight(
  listRef: React.RefObject<HTMLDivElement | null>,
  highlightRef: React.RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    const list = listRef.current;
    const highlight = highlightRef.current;
    if (!list || !highlight) return;
    let raf = 0;
    let slide = false;
    let shown = false;
    const place = () => {
      raf = 0;
      const item = list.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"]');
      if (!item) {
        highlight.style.opacity = '0';
        shown = false;
        return;
      }
      const animate = slide && shown && !prefersReducedMotion();
      highlight.style.transition = animate
        ? 'transform 150ms var(--ease-out), height 150ms var(--ease-out)'
        : 'none';
      highlight.style.transform = `translate3d(0,${item.offsetTop}px,0)`;
      highlight.style.height = `${item.offsetHeight}px`;
      highlight.style.opacity = '1';
      shown = true;
    };
    const observer = new MutationObserver((records) => {
      // Only a selection change slides; added, removed or re-sorted rows jump.
      const selectionOnly = records.every((r) => r.type === 'attributes');
      if (raf) slide = slide && selectionOnly;
      else {
        slide = selectionOnly;
        raf = requestAnimationFrame(place);
      }
    });
    observer.observe(list, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-selected'],
    });
    raf = requestAnimationFrame(place);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [listRef, highlightRef]);
}
