'use client';

import { ArrowUp, AudioLines, AtSign, FileText, NotebookPen, Square, X } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AskScope } from '@/lib/api/ask';
import { useFiles, type FileItem } from '@/lib/api/files';
import { useWorkspaceCollections } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';
import { ChipGroup } from './chips';

/** A file picked with @. */
export type Mention = { id: string; title: string; kind: FileItem['kind'] };

/** The fixed scopes; the workspace's collections follow them as `c:<id>`. */
export const SCOPES = [
  { value: 'all', label: 'All sources' },
  { value: 'documents', label: 'Documents' },
  { value: 'meetings', label: 'Meetings' },
] as const;

/** Scope chips: everything, documents, meetings, then each collection you can open. */
export function useScopeOptions(): { value: string; label: string }[] {
  const collections = useWorkspaceCollections().data;
  return useMemo(
    () => [...SCOPES, ...(collections ?? []).map((c) => ({ value: `c:${c.id}`, label: c.name }))],
    [collections],
  );
}

/** What a chip value and the picked files mean to the API. */
export function scopeOf(value: string, mentions: Mention[] = []): AskScope {
  if (mentions.length) return { fileIds: mentions.map((m) => m.id) };
  if (value === 'documents' || value === 'meetings') return { kind: value };
  if (value.startsWith('c:')) return { collectionId: value.slice(2) };
  return {};
}

/** A chat's scope, said plainly ("Product", "Meetings", "2 files"). */
export function scopeLabel(scope: AskScope, collections?: { id: string; name: string }[]): string {
  if (scope.fileIds?.length) {
    return scope.fileIds.length === 1 ? '1 file' : `${scope.fileIds.length} files`;
  }
  if (scope.collectionId) {
    return collections?.find((c) => c.id === scope.collectionId)?.name ?? 'A collection';
  }
  if (scope.kind === 'documents') return 'Documents';
  if (scope.kind === 'meetings') return 'Meetings';
  return 'All sources';
}

function MentionIcon({ kind, className }: { kind: Mention['kind']; className?: string }) {
  const Icon = kind === 'audio' ? AudioLines : kind === 'note' ? NotebookPen : FileText;
  return <Icon aria-hidden className={className} strokeWidth={1.9} />;
}

/** The "@word" being typed just before the caret, if any. */
function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const match = /(^|\s)@([^\s@]{0,40})$/.exec(text.slice(0, caret));
  if (!match) return null;
  return { start: caret - match[2]!.length - 1, query: match[2]! };
}

/**
 * Ask's composer (brief §9): scope chips above a growing text field, Send in thumb reach. Type @
 * to pick specific files to ask about. While an answer is being written Send becomes Stop. Text
 * is 17 px so iOS doesn't zoom; Enter sends, Shift+Enter adds a line.
 */
export function Composer({
  onSend,
  scope,
  onScopeChange,
  scopes,
  mentions,
  onMentionsChange,
  running = false,
  onStop,
  placeholder = 'Ask about your memos and meetings',
  autoFocus,
  className,
}: {
  onSend: (text: string) => void;
  scope?: string;
  onScopeChange?: (scope: string) => void;
  scopes?: { value: string; label: string }[];
  /** Files picked with @; omit to turn @-mentions off. */
  mentions?: Mention[];
  onMentionsChange?: (mentions: Mention[]) => void;
  running?: boolean;
  onStop?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  // An @ picker closed with Escape stays closed for that @.
  const [dismissed, setDismissed] = useState<number | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = text.trim().length > 0 && !running;
  const mentioning = mentions !== undefined && onMentionsChange !== undefined;
  const typed = mentioning ? mentionQuery(text, caret) : null;
  const picking = typed && typed.start !== dismissed ? typed : null;

  // Grow with the text up to six lines, then scroll. An empty field measures its placeholder,
  // so a new placeholder (narrower windows get a shorter one) measures again too.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 22 * 6 + 16)}px`;
  }, [text, placeholder]);

  const send = () => {
    const value = text.trim();
    if (!value || running) return;
    onSend(value);
    setText('');
  };

  const pick = (file: FileItem) => {
    if (!picking || !mentions || !onMentionsChange) return;
    const before = text.slice(0, picking.start);
    const after = text.slice(caret);
    const next = `${before}${after}`.replace(/\s{2,}/g, ' ');
    setText(next);
    if (!mentions.some((m) => m.id === file.id)) {
      onMentionsChange([...mentions, { id: file.id, title: file.title, kind: file.kind }]);
    }
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(before.length, before.length);
      setCaret(before.length);
    });
  };

  return (
    <div className={cn('relative flex flex-col gap-2 pt-2 pb-2', className)}>
      {mentioning && mentions!.length > 0 ? (
        <MentionChips mentions={mentions!} onChange={onMentionsChange!} />
      ) : (
        scope !== undefined &&
        onScopeChange && (
          <ChipGroup
            aria-label="Search in"
            value={scope}
            onValueChange={onScopeChange}
            options={scopes ?? [...SCOPES]}
          />
        )
      )}
      <form
        className="relative mx-[var(--gutter)] flex items-end gap-2 rounded-[22px] bg-card py-1 pr-1 pl-4 shadow-[0_0_0_0.5px_var(--separator),0_2px_10px_rgb(0_0_0/0.06)]"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {picking && (
          <MentionPicker
            query={picking.query}
            exclude={mentions ?? []}
            onPick={pick}
            onClose={() => setDismissed(picking.start)}
            inputRef={ref}
          />
        )}
        <textarea
          ref={ref}
          rows={1}
          value={text}
          autoFocus={autoFocus}
          enterKeyHint="send"
          aria-label="Question"
          aria-autocomplete={mentioning ? 'list' : undefined}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            // The @ picker listens first and claims the keys it uses.
            if (e.defaultPrevented) return;
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          className="max-h-[148px] min-h-11 flex-1 resize-none bg-transparent py-[11px] text-[17px] leading-[22px] tracking-[var(--tracking-body)] outline-none placeholder:text-muted-foreground"
        />
        {mentioning && !text && !running && (
          <button
            type="button"
            aria-label="Pick files to ask about"
            onClick={() => {
              setText('@');
              setCaret(1);
              requestAnimationFrame(() => ref.current?.focus());
            }}
            className="pressable relative mb-[3px] grid size-[38px] shrink-0 place-items-center rounded-full text-muted-foreground before:absolute before:-inset-[3px] before:content-['']"
          >
            <AtSign aria-hidden className="size-5" />
          </button>
        )}
        {running ? (
          <button
            type="button"
            aria-label="Stop the answer"
            onClick={onStop}
            className="pressable relative mb-[3px] grid size-[38px] shrink-0 place-items-center rounded-full bg-foreground text-background before:absolute before:-inset-[3px] before:content-['']"
          >
            <Square aria-hidden className="size-3.5 fill-current" strokeWidth={0} />
          </button>
        ) : (
          <button
            type="submit"
            aria-label="Send"
            disabled={!canSend}
            className={cn(
              'pressable relative mb-[3px] grid size-[38px] shrink-0 place-items-center rounded-full',
              "before:absolute before:-inset-[3px] before:content-['']",
              canSend ? 'bg-primary text-primary-foreground' : 'bg-fill text-faint-foreground',
            )}
          >
            <ArrowUp aria-hidden className="size-5" strokeWidth={2.5} />
          </button>
        )}
      </form>
    </div>
  );
}

/** The files picked with @, each removable; they replace the scope chips while there are any. */
function MentionChips({
  mentions,
  onChange,
}: {
  mentions: Mention[];
  onChange: (mentions: Mention[]) => void;
}) {
  return (
    <div
      role="list"
      aria-label="Asking about"
      className="flex gap-2 overflow-x-auto px-[var(--gutter)] py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {mentions.map((m) => (
        <span
          key={m.id}
          role="listitem"
          className="flex h-9 max-w-[220px] shrink-0 animate-[menu-in_180ms_var(--ease-out)] items-center gap-1.5 rounded-full bg-primary pr-1 pl-3 text-[15px] leading-5 font-medium text-primary-foreground"
        >
          <MentionIcon kind={m.kind} className="size-4 shrink-0" />
          <span className="truncate">{m.title}</span>
          <button
            type="button"
            aria-label={`Remove ${m.title}`}
            onClick={() => onChange(mentions.filter((x) => x.id !== m.id))}
            className="pressable relative grid size-7 shrink-0 place-items-center rounded-full before:absolute before:-inset-2 before:content-[''] hover:bg-white/15"
          >
            <X aria-hidden className="size-4" strokeWidth={2.25} />
          </button>
        </span>
      ))}
    </div>
  );
}

/**
 * The @ picker: files whose title matches what follows the @, in a menu above the field. Arrow
 * keys move, Enter or Tab picks, Escape closes; the field keeps focus throughout.
 */
function MentionPicker({
  query,
  exclude,
  onPick,
  onClose,
  inputRef,
}: {
  query: string;
  exclude: Mention[];
  onPick: (file: FileItem) => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const files = useFiles({ q: query, sort: 'recent' }).data;
  const options = (files ?? [])
    .filter((f) => f.status === 'ready' && !exclude.some((m) => m.id === f.id))
    .slice(0, 6);
  const [active, setActive] = useState(0);
  const id = useId();
  const index = Math.min(active, Math.max(0, options.length - 1));

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.setAttribute('aria-controls', id);
    el.setAttribute('aria-expanded', 'true');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActive((i) => (options.length ? (i + step + options.length) % options.length : 0));
      } else if ((e.key === 'Enter' || e.key === 'Tab') && options[index]) {
        e.preventDefault();
        onPick(options[index]!);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      el.removeAttribute('aria-controls');
      el.setAttribute('aria-expanded', 'false');
    };
  }, [inputRef, id, options, index, onPick, onClose]);

  return (
    <div
      id={id}
      role="listbox"
      aria-label="Files to ask about"
      className="material-thick absolute inset-x-0 bottom-[calc(100%+8px)] z-[var(--z-popover)] flex origin-bottom animate-[menu-in_180ms_var(--ease-out)] flex-col overflow-hidden rounded-menu p-1 shadow-menu"
    >
      {options.length ? (
        options.map((f, i) => (
          <button
            key={f.id}
            type="button"
            role="option"
            aria-selected={i === index}
            // Keeps focus (and the iOS keyboard) in the field.
            onPointerDown={(e) => e.preventDefault()}
            onPointerMove={() => setActive(i)}
            onClick={() => onPick(f)}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-[9px] px-3 text-left',
              i === index && 'bg-fill',
            )}
          >
            <MentionIcon kind={f.kind} className="size-[18px] shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-callout">{f.title}</span>
            {f.collection && (
              <span className="max-w-[40%] shrink-0 truncate text-footnote text-muted-foreground">
                {f.collection.name}
              </span>
            )}
          </button>
        ))
      ) : (
        <p className="px-3 py-2.5 text-subhead text-muted-foreground">
          {files ? `No files called “${query}”` : 'Finding files…'}
        </p>
      )}
    </div>
  );
}
