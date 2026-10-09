'use client';

import { AudioLines, EyeOff, FileText, Lock, NotebookPen, Sparkles } from 'lucide-react';
import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatMessage, Citation } from '@/lib/api/ask';
import { timestamp } from '@/lib/format';
import { prefersReducedMotion } from '@/lib/motion/driver';
import { NavLink } from '@/lib/nav/link';
import { pushPath } from '@/lib/nav/routes';
import { cn } from '@/lib/utils';

// ── Where a source opens ──────────────────────────────────────────────────────────────────

/** "page 3", "12:34" or "" — where a cited passage sits in its file. */
export function placeOf(c: Pick<Citation, 'page' | 'startMs'>): string {
  if (c.page !== null) return `page ${c.page}`;
  if (c.startMs !== null) return timestamp(c.startMs / 1000);
  return '';
}

/**
 * Opens the source at the exact spot (BRIEF §4): a meeting playing from the moment, a document
 * at the page with the passage highlighted. Pushed on the current stack, so Back returns here.
 */
export function sourceHref(base: string, c: Citation): string | null {
  if (!c.available || !c.fileId) return null;
  if (c.kind === 'audio') {
    return `${pushPath(base, 'meeting', c.fileId)}?t=${Math.floor((c.startMs ?? 0) / 1000)}&play=1`;
  }
  const params = new URLSearchParams();
  if (c.page !== null) params.set('page', String(c.page));
  // The passage's opening words find it on the page; the whole passage would make a long URL.
  if (c.quote) params.set('hl', c.quote.replace(/\s+/g, ' ').trim().slice(0, 120));
  const query = params.toString();
  return `${pushPath(base, 'doc', c.fileId)}${query ? `?${query}` : ''}`;
}

// ── Streaming reveal ──────────────────────────────────────────────────────────────────────

/**
 * Text that arrives in bursts, shown at an even pace: each frame reveals a share of what's
 * waiting, so a burst glides in and a trickle keeps up. Settled text (a saved answer) shows at
 * once, as does everything under reduced motion. One state update per frame at most.
 */
export function useSmoothText(text: string, streaming: boolean): string {
  const [shown, setShown] = useState(() => (streaming ? 0 : text.length));
  const target = useRef(text);
  useLayoutEffect(() => {
    target.current = text;
  });

  useEffect(() => {
    if (!streaming || prefersReducedMotion()) return;
    let at = 0;
    let raf = 0;
    const tick = () => {
      const goal = target.current.length;
      const backlog = goal - at;
      if (backlog > 0) {
        // A sixth of the backlog per frame, at least two characters: ~0.1 s behind the stream.
        at = Math.min(goal, at + Math.max(2, Math.ceil(backlog / 6)));
        setShown(at);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [streaming]);

  // Settled text, or reduced motion: all of it (the saved text may differ by a trim).
  if (!streaming || prefersReducedMotion()) return text;
  return text.slice(0, shown);
}

// ── Answer text ───────────────────────────────────────────────────────────────────────────

type Block = { kind: 'p'; lines: string[] } | { kind: 'ul' | 'ol'; items: string[] };

const BULLET = /^\s*(?:[-*•]\s+)/;
const NUMBERED = /^\s*\d+[.)]\s+/;

/** Paragraphs and lists: the little Markdown a grounded answer uses. */
export function blocksOf(text: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of text.split(/\n{2,}/)) {
    const lines = chunk.split('\n').filter((l) => l.trim());
    let para: string[] = [];
    let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;
    const flushPara = () => {
      if (para.length) blocks.push({ kind: 'p', lines: para });
      para = [];
    };
    const flushList = () => {
      if (list) blocks.push(list);
      list = null;
    };
    for (const line of lines) {
      const kind = BULLET.test(line) ? 'ul' : NUMBERED.test(line) ? 'ol' : null;
      if (kind) {
        flushPara();
        if (!list || list.kind !== kind) {
          flushList();
          list = { kind, items: [] };
        }
        list.items.push(line.replace(kind === 'ul' ? BULLET : NUMBERED, ''));
      } else {
        flushList();
        para.push(line.trim());
      }
    }
    flushPara();
    flushList();
  }
  return blocks;
}

function Inline({
  text,
  citations,
  base,
}: {
  text: string;
  citations: Map<number, Citation>;
  base: string;
}) {
  // [n] markers become chips; **bold** stays bold; nothing else is interpreted.
  const parts = text.split(/(\[\d+\]|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        const cite = /^\[(\d+)\]$/.exec(part);
        if (cite) {
          const c = citations.get(Number(cite[1]));
          return c ? <CitationChip key={i} citation={c} base={base} /> : null;
        }
        const bold = /^\*\*([^*]+)\*\*$/.exec(part);
        if (bold)
          return (
            <strong key={i} className="font-semibold">
              {bold[1]}
            </strong>
          );
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

export const CitationChip = memo(function CitationChip({
  citation: c,
  base,
}: {
  citation: Citation;
  base: string;
}) {
  const href = sourceHref(base, c);
  const chip =
    'relative mx-0.5 inline-grid h-5 min-w-5 -translate-y-0.5 place-items-center rounded-full px-1.5 align-middle text-[12px] leading-none font-semibold before:absolute before:-inset-3 before:content-[""]';
  if (!href) {
    return (
      <span
        className={cn(chip, 'bg-fill text-muted-foreground')}
        aria-label={`Source ${c.n}: no longer available to you`}
      >
        {c.n}
      </span>
    );
  }
  const where = placeOf(c);
  return (
    <NavLink
      href={href}
      aria-label={`Source ${c.n}: ${c.title}${where ? `, ${where}` : ''}`}
      className={cn(
        chip,
        'bg-primary-tint-strong text-primary-text transition-[scale] duration-150 active:scale-90',
        'animate-[fade-in_200ms_var(--ease-out)]',
      )}
    >
      {c.n}
    </NavLink>
  );
});

/** An answer's text with its citations as chips. `streaming` paces it in smoothly. */
export function AnswerText({
  text,
  citations,
  base,
  streaming = false,
  className,
}: {
  text: string;
  citations: Citation[];
  base: string;
  streaming?: boolean;
  className?: string;
}) {
  const shown = useSmoothText(text, streaming);
  const byN = new Map(citations.map((c) => [c.n, c]));
  const blocks = blocksOf(shown);
  return (
    <div className={cn('prose-reading flex flex-col gap-3 text-foreground', className)}>
      {blocks.map((b, i) =>
        b.kind === 'p' ? (
          <p key={i}>
            {b.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Inline text={line} citations={byN} base={base} />
              </Fragment>
            ))}
          </p>
        ) : (
          <List key={i} ordered={b.kind === 'ol'}>
            {b.items.map((item, j) => (
              <li key={j} className="pl-1">
                <Inline text={item} citations={byN} base={base} />
              </li>
            ))}
          </List>
        ),
      )}
      {streaming && <Caret />}
    </div>
  );
}

function List({ ordered, children }: { ordered: boolean; children: React.ReactNode }) {
  const className = cn('flex flex-col gap-1.5 pl-5', ordered ? 'list-decimal' : 'list-disc');
  return ordered ? (
    <ol className={className}>{children}</ol>
  ) : (
    <ul className={className}>{children}</ul>
  );
}

/** A soft pulse where the next words will appear. Still under reduced motion. */
function Caret() {
  return (
    <span
      aria-hidden
      className="-mt-2 inline-block h-[18px] w-[3px] rounded-full bg-primary-text motion-safe:animate-[caret_1s_var(--ease-in-out)_infinite]"
    />
  );
}

// ── Sources ───────────────────────────────────────────────────────────────────────────────

function SourceIcon({ kind }: { kind: Citation['kind'] }) {
  const Icon = kind === 'audio' ? AudioLines : kind === 'note' ? NotebookPen : FileText;
  return <Icon aria-hidden className="size-[18px] text-muted-foreground" strokeWidth={1.9} />;
}

/** The numbered sources under an answer; each opens at its page or moment. */
export const Sources = memo(function Sources({
  citations,
  base,
  passages = false,
}: {
  citations: Citation[];
  base: string;
  /** Passages-only answers show each passage's text, since there's no answer to read. */
  passages?: boolean;
}) {
  if (!citations.length) return null;
  return (
    <ol
      aria-label="Sources"
      className="flex animate-[fade-in_240ms_var(--ease-out)] flex-col overflow-hidden rounded-card bg-card shadow-card"
    >
      {citations.map((c) => {
        const href = sourceHref(base, c);
        const where = placeOf(c);
        const body = (
          <>
            <span className="mt-[11px] grid size-6 shrink-0 place-items-center rounded-full bg-primary-tint-strong text-[12px] font-semibold text-primary-text">
              {c.n}
            </span>
            <span className="row-main flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-0.5 py-2.5 pr-4">
              {c.available ? (
                <>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <SourceIcon kind={c.kind} />
                    <span className="truncate text-callout font-medium">{c.title}</span>
                    {where && (
                      <span className="shrink-0 text-subhead text-muted-foreground tabular-nums">
                        · {where}
                      </span>
                    )}
                  </span>
                  {passages && c.quote && (
                    <span className="line-clamp-3 text-subhead text-muted-foreground">
                      {c.quote}
                    </span>
                  )}
                </>
              ) : (
                <span className="flex items-center gap-1.5 text-callout text-muted-foreground">
                  <EyeOff aria-hidden className="size-4" />
                  No longer available to you
                </span>
              )}
            </span>
          </>
        );
        return (
          <li key={c.n} className="list-row">
            {href ? (
              <NavLink
                href={href}
                className="flex items-start gap-3 pl-4 transition-colors duration-300 active:bg-row-pressed active:delay-[40ms] active:duration-0"
              >
                {body}
              </NavLink>
            ) : (
              <div className="flex items-start gap-3 pl-4">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
});

// ── Where the answer came from ────────────────────────────────────────────────────────────

/**
 * The data-route badge (BRIEF §3): every answer says where it was made. Mocks and answers
 * without a model say so too.
 */
export function RouteBadge({ message }: { message: ChatMessage }) {
  const label = message.route?.label ?? 'Sotto';
  const external = message.route?.kind === 'managed' || message.route?.kind === 'byok';
  return (
    <div className="flex min-h-6 items-center gap-1.5 text-footnote text-muted-foreground">
      <Sparkles aria-hidden className="size-4 shrink-0 text-primary-text" />
      <span className="truncate">{label}</span>
      {message.isMock && (
        <span className="shrink-0 rounded-full bg-fill px-2 py-0.5 text-caption">Mock</span>
      )}
      {!external && message.route?.kind === 'private' && (
        <Lock aria-label="Stayed in your cluster" className="size-3.5 shrink-0" />
      )}
    </div>
  );
}

/** "2 restricted sources hidden": what the answering model wasn't allowed to read. */
export function HiddenNotice({ hidden }: { hidden: ChatMessage['hidden'] }) {
  const parts = [
    hidden.restricted ? `${hidden.restricted} restricted` : null,
    hidden.confidential ? `${hidden.confidential} confidential` : null,
  ].filter(Boolean);
  if (!parts.length) return null;
  const total = hidden.restricted + hidden.confidential;
  return (
    <p className="flex items-start gap-2 rounded-card bg-card-nested px-3 py-2.5 text-subhead text-muted-foreground">
      <EyeOff aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        {parts.join(' and ')} {total === 1 ? 'source' : 'sources'} hidden from this model. Private
        mode, which can read them, arrives with AI settings.
      </span>
    </p>
  );
}
