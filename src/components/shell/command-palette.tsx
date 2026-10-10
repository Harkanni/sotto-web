'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Command, useCommandState } from 'cmdk';
import {
  AudioLines,
  CornerDownLeft,
  FileAudio,
  FileText,
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
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Kbd, ModKey } from '@/components/ui/kbd';
import { dayAndTime, duration, relativeTime, timestamp } from '@/lib/format';
import { ProgressDriver, prefersReducedMotion } from '@/lib/motion/driver';
import { springs } from '@/lib/motion/spring';
import { useActiveTab } from '@/lib/nav/hooks';
import { tabOf, type Tab } from '@/lib/nav/routes';
import { getSnapshot, navigate } from '@/lib/nav/store';
import { setThemeSmoothly } from '@/lib/prefs/theme';
import { messageOf } from '@/components/account/workspace-actions';
import {
  createConversation,
  streamAnswer,
  useConversations,
  useSearch,
  type ConversationSummary,
  type SearchResults,
  type Snippet,
} from '@/lib/api/ask';
import { useFiles, type FileItem } from '@/lib/api/files';
import { useActiveWorkspace } from '@/lib/api/hooks';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { documentKind } from '@/screens/parts/file-rows';
import { DOC_KINDS, MEETING_TINT, THREAD_TINT } from '@/screens/parts/rows';
import { emitShellEvent, onShellEvent } from './shell-events';
import { selectTab } from './tab-bar';
import { TAB_ITEMS } from './tabs';

/**
 * The ⌘K palette (brief §9): one place to find a document, meeting or chat, jump to a section,
 * run a command, or ask Sotto. ↵ opens the highlighted result; ⌘↵ asks Sotto whatever you typed.
 *
 * Typing searches the workspace (GET /search: files by title and content, passages, meeting
 * moments; hybrid, with your access in the query) and your chats; results come ranked from the
 * server, so cmdk's own filtering is off and only the commands are matched here.
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
  // Results follow the typing a beat behind, so each keystroke stays instant.
  const term = useDeferredValue(search.trim());
  const docs = useFiles({ kind: 'document', sort: 'recent' });
  const meetings = useFiles({ kind: 'audio', sort: 'recent' });
  const chats = useConversations(term);
  const found = useSearch(term, {}, searching);

  // cmdk selects the first row it sees, which can be a command while the recent items are still
  // loading above it. Until you move the selection yourself, it stays on the first recent item.
  const [value, setValue] = useState('');
  const [moved, setMoved] = useState(false);
  const first = docs.data?.[0] ? `doc ${docs.data[0].id}` : null;
  // While searching, the best result stays selected as results arrive (they come ranked).
  const results = searching ? found.data : undefined;
  const best = results?.files[0]
    ? `file ${results.files[0].file.id}`
    : results?.passages[0]
      ? `passage ${results.passages[0].chunkId}`
      : results?.moments[0]
        ? `moment ${results.moments[0].chunkId}`
        : searching && chats.data?.[0]
          ? `chat ${chats.data[0].id}`
          : null;
  const selected = moved ? value : ((searching ? best : first) ?? value);

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
  const ws = useActiveWorkspace()?.id;
  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || !ws) return;
    try {
      const chat = await createConversation({});
      go(`/ask/${chat.id}`);
      void streamAnswer(client, ws, { conversationId: chat.id, question: text }).catch((e) =>
        toast(messageOf(e)),
      );
    } catch (error) {
      toast(messageOf(error));
    }
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
          data-closing={!open || undefined}
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
            shouldFilter={false}
            className="flex min-h-0 flex-col"
            onPointerMove={() => {
              if (!moved) setMoved(true);
            }}
            onKeyDown={(e) => {
              if (MOVE_KEYS.has(e.key) || (e.ctrlKey && 'jknp'.includes(e.key))) setMoved(true);
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && searching) {
                e.preventDefault();
                void ask(search);
              }
            }}
          >
            <div className="flex shrink-0 items-center gap-3 px-4 shadow-[inset_0_-0.5px_0_var(--separator)]">
              <Search aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              <Command.Input
                value={search}
                onValueChange={(next) => {
                  setSearch(next);
                  // A new search starts back at its best result.
                  setMoved(false);
                }}
                placeholder="Search or ask Sotto"
                className="h-14 min-w-0 flex-1 bg-transparent text-[17px] leading-[22px] tracking-[var(--tracking-body)] outline-none placeholder:text-muted-foreground"
              />
              <Kbd className="max-sm:hidden">esc</Kbd>
            </div>
            <Results
              search={search}
              docs={docs.data}
              meetings={meetings.data}
              chats={chats.data}
              found={searching ? found.data : undefined}
              loading={searching ? found.isPending : docs.isPending || meetings.isPending}
              go={go}
              ask={(q) => void ask(q)}
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
  chats,
  found,
  loading,
  go,
  ask,
  onClose,
}: {
  search: string;
  docs: FileItem[] | undefined;
  meetings: FileItem[] | undefined;
  chats: ConversationSummary[] | undefined;
  found: SearchResults | undefined;
  loading: boolean;
  go: (href: string) => void;
  ask: (question: string) => void;
  onClose: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const active = useActiveTab();
  const { resolvedTheme, theme, setTheme } = useTheme();
  const q = search.trim();
  const searching = q.length > 0;
  /** Commands and sections are matched here; files and passages come ranked from the server. */
  const shows = (...words: string[]) => !searching || matchWords('', q, words) > 0;

  useSlidingHighlight(listRef, highlightRef);

  // Runs a command that opens something else (a picker, a sheet) once the palette has gone.
  const thenClose = (run: () => void) => {
    run();
    onClose();
  };

  const fileHref = (f: { id: string; kind: string }) =>
    f.kind === 'audio' ? `/meetings/${f.id}` : `/docs/${f.id}`;
  const anything =
    !searching ||
    Boolean(
      found?.files.length || found?.passages.length || found?.moments.length || chats?.length,
    );

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
      {loading && <Command.Loading label="Searching">{null}</Command.Loading>}
      {searching && !loading && !anything && (
        <p className="px-3 pt-3 pb-1 text-subhead text-muted-foreground">
          Nothing in your library matches “{q}”. Ask Sotto instead (⌘↵).
        </p>
      )}

      {!searching && (!!docs?.length || !!meetings?.length || !!chats?.length) && (
        <Command.Group heading="Recent">
          {docs?.slice(0, 3).map((doc) => {
            const { key, label } = documentKind(doc);
            const kind = DOC_KINDS[key];
            const owner = doc.owner?.name ?? 'Someone';
            return (
              <Item
                key={doc.id}
                value={`doc ${doc.id}`}
                icon={<IconTile icon={kind.icon} tint={kind.tint} square />}
                title={doc.title}
                subtitle={`${label}, ${owner}, ${relativeTime(new Date(doc.updatedAt).getTime())}`}
                onSelect={() => go(`/docs/${doc.id}`)}
              />
            );
          })}
          {meetings?.slice(0, 2).map((m) => (
            <Item
              key={m.id}
              value={`meeting ${m.id}`}
              icon={<IconTile icon={AudioLines} tint={MEETING_TINT} />}
              title={m.title}
              subtitle={[
                dayAndTime(new Date(m.createdAt).getTime()),
                m.durationMs ? duration(m.durationMs / 1000) : null,
              ]
                .filter(Boolean)
                .join(', ')}
              onSelect={() => go(`/meetings/${m.id}`)}
            />
          ))}
          {chats?.slice(0, 2).map((c) => (
            <Item
              key={c.id}
              value={`chat ${c.id}`}
              icon={<IconTile icon={MessageCircle} tint={THREAD_TINT} />}
              title={c.title}
              subtitle={`Chat, ${relativeTime(new Date(c.updatedAt).getTime())}`}
              onSelect={() => go(`/ask/${c.id}`)}
            />
          ))}
        </Command.Group>
      )}

      {searching && !!found?.files.length && (
        <Command.Group heading="Files">
          {found.files.map(({ file, match }) => {
            const audio = file.kind === 'audio';
            const kind = audio ? null : DOC_KINDS[documentKind(file).key];
            return (
              <Item
                key={file.id}
                value={`file ${file.id}`}
                icon={
                  audio ? (
                    <IconTile icon={AudioLines} tint={MEETING_TINT} />
                  ) : (
                    <IconTile icon={kind!.icon} tint={kind!.tint} square />
                  )
                }
                title={file.title}
                subtitle={[
                  file.collection?.name ?? null,
                  match === 'content' ? 'Mentions it' : null,
                  relativeTime(new Date(file.updatedAt).getTime()),
                ]
                  .filter(Boolean)
                  .join(', ')}
                onSelect={() => go(fileHref(file))}
              />
            );
          })}
        </Command.Group>
      )}

      {searching && !!found?.passages.length && (
        <Command.Group heading="Passages">
          {found.passages.map((p) => {
            const params = new URLSearchParams();
            if (p.page !== null) params.set('page', String(p.page));
            params.set('hl', p.snippet.text.replace(/^…/, '').slice(0, 120));
            return (
              <Item
                key={p.chunkId}
                value={`passage ${p.chunkId}`}
                icon={<IconTile icon={FileText} plain />}
                title={`${p.file.title}${p.page !== null ? `, page ${p.page}` : ''}`}
                subtitle={<Highlighted snippet={p.snippet} />}
                onSelect={() => go(`/docs/${p.file.id}?${params}`)}
              />
            );
          })}
        </Command.Group>
      )}

      {searching && !!found?.moments.length && (
        <Command.Group heading="Meeting moments">
          {found.moments.map((m) => (
            <Item
              key={m.chunkId}
              value={`moment ${m.chunkId}`}
              icon={<IconTile icon={AudioLines} plain />}
              title={`${m.file.title}, ${timestamp(m.startMs / 1000)}`}
              subtitle={<Highlighted snippet={m.snippet} />}
              onSelect={() => go(`/meetings/${m.file.id}?t=${Math.floor(m.startMs / 1000)}&play=1`)}
            />
          ))}
        </Command.Group>
      )}

      {searching && !!chats?.length && (
        <Command.Group heading="Chats">
          {chats.slice(0, 4).map((c) => (
            <Item
              key={c.id}
              value={`chat ${c.id}`}
              icon={<IconTile icon={MessageCircle} tint={THREAD_TINT} />}
              title={c.title}
              subtitle={c.preview ?? `Chat, ${relativeTime(new Date(c.updatedAt).getTime())}`}
              onSelect={() => go(`/ask/${c.id}`)}
            />
          ))}
        </Command.Group>
      )}

      {TAB_ITEMS.some(({ label }) => shows(label, 'go to', 'open')) && (
        <Command.Group heading="Go to">
          {TAB_ITEMS.filter(({ label }) => shows(label, 'go to', 'open')).map(
            ({ tab, label, icon }) => (
              <Item
                key={tab}
                value={`go ${tab}`}
                icon={<IconTile icon={icon} plain />}
                title={label}
                hint={<GoHint tab={tab} />}
                onSelect={() => {
                  onClose();
                  selectTab(tab, active);
                }}
              />
            ),
          )}
        </Command.Group>
      )}

      <Command.Group heading="Commands">
        {shows('upload files', 'upload', 'add', 'import', 'pdf', 'document', 'word') && (
          <Item
            value="upload files"
            icon={<IconTile icon={Upload} plain />}
            title="Upload files"
            // The picker opens inside this keypress or click; browsers allow nothing later.
            onSelect={() => thenClose(() => emitShellEvent('pick-files', 'files'))}
          />
        )}
        {shows('import audio', 'audio', 'voice memo', 'recording', 'mp3', 'm4a') && (
          <Item
            value="import audio"
            icon={<IconTile icon={FileAudio} plain />}
            title="Import audio"
            onSelect={() => thenClose(() => emitShellEvent('pick-files', 'audio'))}
          />
        )}
        {shows('record a meeting', 'record', 'meeting', 'microphone') && (
          <Item
            value="record a meeting"
            icon={<IconTile icon={Mic} plain />}
            title="Record a meeting"
            onSelect={() => thenClose(() => emitShellEvent('open-recorder'))}
          />
        )}
        {shows('new note', 'note', 'write', 'create') && (
          <Item
            value="new note"
            icon={<IconTile icon={PenLine} plain />}
            title="New note"
            onSelect={() => thenClose(() => emitShellEvent('open-note', { fileId: null }))}
          />
        )}
        {resolvedTheme === 'dark'
          ? shows('switch to light appearance', 'theme', 'light mode') && (
              <Item
                value="light appearance"
                icon={<IconTile icon={Sun} plain />}
                title="Switch to light appearance"
                onSelect={() => thenClose(() => setThemeSmoothly('light', setTheme))}
              />
            )
          : shows('switch to dark appearance', 'theme', 'dark mode') && (
              <Item
                value="dark appearance"
                icon={<IconTile icon={Moon} plain />}
                title="Switch to dark appearance"
                onSelect={() => thenClose(() => setThemeSmoothly('dark', setTheme))}
              />
            )}
        {theme !== 'system' && shows('match the system appearance', 'theme', 'automatic') && (
          <Item
            value="system appearance"
            icon={<IconTile icon={SunMoon} plain />}
            title="Match the system appearance"
            onSelect={() => thenClose(() => setThemeSmoothly('system', setTheme))}
          />
        )}
        {shows('keyboard shortcuts', 'keys', 'help', 'cheat sheet') && (
          <Item
            value="keyboard shortcuts"
            icon={<IconTile icon={Keyboard} plain />}
            title="Keyboard shortcuts"
            hint={<Kbd>?</Kbd>}
            onSelect={() => thenClose(() => emitShellEvent('open-shortcuts'))}
          />
        )}
      </Command.Group>

      {searching && (
        <Command.Group heading="Ask Sotto">
          <Item
            value="ask sotto"
            icon={<IconTile icon={Sparkles} tint="bg-primary text-primary-foreground" />}
            title={`Ask “${q}”`}
            subtitle="An answer from your library, with its sources"
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

/** A snippet with the words that matched in bold, the rest muted. */
function Highlighted({ snippet }: { snippet: Snippet }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  snippet.highlights.forEach(([start = 0, end = 0], i) => {
    if (start > at) parts.push(snippet.text.slice(at, start));
    parts.push(
      <mark key={i} className="bg-transparent font-semibold text-foreground">
        {snippet.text.slice(start, end)}
      </mark>,
    );
    at = end;
  });
  parts.push(snippet.text.slice(at));
  return <>{parts}</>;
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
  subtitle?: React.ReactNode;
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
          <span className="line-clamp-2 text-[13px] leading-[18px] text-muted-foreground">
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
        Searches titles, documents and meetings, only what you can open.
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
