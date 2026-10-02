'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Screen } from '@/components/shell/screen';
import { useLayer } from '@/components/shell/stack-context';
import { AsyncWidget, EmptyState } from '@/components/widgets/async-widget';
import { NavLink } from '@/lib/nav/link';
import { useChildKey } from '@/lib/nav/hooks';
import { pushPath } from '@/lib/nav/routes';
import { navigate } from '@/lib/nav/store';
import {
  appendToLocalThread,
  citationLabel,
  createLocalThread,
  localThread,
} from '@/lib/sample/answer';
import type { Citation, Message, Thread } from '@/lib/sample/data';
import { keys, useThread, useThreads } from '@/lib/sample/queries';
import { cn } from '@/lib/utils';
import { Composer, SCOPES } from './parts/composer';
import { RowsSkeleton, ThreadRow } from './parts/rows';

function scopeLabel(value: string) {
  return SCOPES.find((s) => s.value === value)?.label ?? value;
}

/** Where a citation opens: the document page or the meeting minute, pushed on this stack. */
function citationHref(base: string, c: Citation) {
  return c.kind === 'doc'
    ? `${pushPath(base, 'doc', c.id)}?page=${c.page}`
    : `${pushPath(base, 'meeting', c.id)}?t=${c.at}`;
}

/** Reveals an answer word by word, the way a streamed answer will arrive in Phase 5. */
function useStreamed(text: string, stream: boolean) {
  const [count, setCount] = useState(() => (stream ? 0 : Infinity));
  useEffect(() => {
    if (!stream) return;
    const words = text.split(' ').length;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      // ~28 words a second, a comfortable reading pace.
      const n = Math.min(words, Math.floor(((now - start) / 1000) * 28) + 1);
      setCount(n);
      if (n < words) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, stream]);
  if (count === Infinity) return { shown: text, done: true };
  const words = text.split(' ');
  return { shown: words.slice(0, count).join(' '), done: count >= words.length };
}

function AnswerText({
  text,
  citations,
  base,
}: {
  text: string;
  citations: Citation[];
  base: string;
}) {
  // "[1]" markers become tappable chips that open the exact source.
  const parts = text.split(/(\[\d+\])/g);
  return (
    <p className="prose-reading text-foreground">
      {parts.map((part, i) => {
        const match = /^\[(\d+)\]$/.exec(part);
        if (!match) return <span key={i}>{part}</span>;
        const n = Number(match[1]);
        const c = citations[n - 1];
        if (!c) return null;
        return (
          <NavLink
            key={i}
            href={citationHref(base, c)}
            aria-label={`Source ${n}: ${citationLabel(c)}`}
            className="relative mx-0.5 inline-grid h-5 min-w-5 -translate-y-0.5 place-items-center rounded-full bg-primary-tint-strong px-1.5 align-middle text-[12px] leading-none font-semibold text-primary-text before:absolute before:-inset-3 before:content-['']"
          >
            {n}
          </NavLink>
        );
      })}
    </p>
  );
}

function AssistantMessage({
  message,
  base,
  stream,
}: {
  message: Extract<Message, { role: 'assistant' }>;
  base: string;
  stream: boolean;
}) {
  const { shown, done } = useStreamed(message.text, stream);
  return (
    <div className="flex flex-col gap-3" aria-busy={!done || undefined}>
      <div className="flex items-center gap-2 text-footnote text-muted-foreground">
        <Sparkles aria-hidden className="size-4 text-primary-text" />
        <span>Sample answer</span>
      </div>
      <AnswerText text={shown} citations={message.citations} base={base} />
      {done && message.citations.length > 0 && (
        <ol
          className="flex animate-[fade-in_240ms_var(--ease-out)] flex-col overflow-hidden rounded-card bg-card"
          aria-label="Sources"
        >
          {message.citations.map((c, i) => (
            <li key={i} className="list-row">
              <NavLink
                href={citationHref(base, c)}
                className="flex items-center gap-3 pl-4 transition-colors duration-300 active:bg-row-pressed active:delay-[40ms] active:duration-0"
              >
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-tint-strong text-[12px] font-semibold text-primary-text">
                  {i + 1}
                </span>
                <span className="row-main flex min-h-11 flex-1 items-center py-2.5 pr-4 text-callout">
                  {citationLabel(c)}
                </span>
              </NavLink>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] rounded-[20px] rounded-br-[6px] bg-primary px-4 py-2.5 text-body text-primary-foreground">
        {text}
      </p>
    </div>
  );
}

export function Conversation({
  thread,
  base,
  freshFrom,
}: {
  thread: Thread;
  base: string;
  freshFrom: number;
}) {
  return (
    <div className="flex flex-col gap-6 px-[var(--gutter)] pt-2">
      {thread.messages.map((m, i) =>
        m.role === 'user' ? (
          <UserMessage key={i} text={m.text} />
        ) : (
          <AssistantMessage key={i} message={m} base={base} stream={m.at >= freshFrom} />
        ),
      )}
    </div>
  );
}

/** Ask (brief §9): recent chats, and the composer at the bottom with scope chips above it. */
export function AskScreen() {
  const { entry, tab } = useLayer();
  const client = useQueryClient();
  const query = useThreads();
  const selected = useChildKey(tab, entry.key);
  const [scope, setScope] = useState('all');

  const ask = (question: string) => {
    const thread = createLocalThread(question, scopeLabel(scope));
    void client.invalidateQueries({ queryKey: keys.threads() });
    navigate(pushPath(entry.key, 'thread', thread.id));
  };

  return (
    <Screen title="Ask" footer={<Composer onSend={ask} scope={scope} onScopeChange={setScope} />}>
      <AsyncWidget
        query={query}
        label="Recent chats"
        errorTitle="Couldn’t load your chats"
        empty={{
          illustration: 'chats',
          title: 'Ask your team’s memory',
          description:
            'Answers cite the page or the minute they came from. Try “What did we decide about pricing?”',
        }}
        skeleton={
          <div className="px-[var(--gutter)]">
            <RowsSkeleton rows={4} round />
          </div>
        }
      >
        {(threads) => (
          <section aria-label="Recent chats" className="px-[var(--gutter)]">
            <h2 className="px-4 pb-1.5 text-footnote text-muted-foreground">Recent</h2>
            <ul className="overflow-hidden rounded-card bg-card">
              {threads.map((t) => {
                const href = pushPath(entry.key, 'thread', t.id);
                return <ThreadRow key={t.id} thread={t} href={href} selected={selected === href} />;
              })}
            </ul>
          </section>
        )}
      </AsyncWidget>
    </Screen>
  );
}

/** One chat: the conversation, its sources, and the composer to follow up. */
export function ThreadScreen() {
  const { entry } = useLayer();
  const id = entry.id!;
  const client = useQueryClient();
  const query = useThread(id);
  const [mountedAt] = useState(() => Date.now() - 3000);
  const [thread, setThread] = useState<Thread | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const current = thread ?? query.data ?? null;

  const followUp = (question: string) => {
    const base = localThread(id) ?? current;
    if (!base) return;
    setThread(appendToLocalThread(base, question));
    void client.invalidateQueries({ queryKey: keys.threads() });
    requestAnimationFrame(() =>
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }),
    );
  };

  return (
    <Screen
      title={current?.title ?? 'Chat'}
      surface="grouped"
      footer={<Composer onSend={followUp} placeholder="Ask a follow-up" />}
    >
      <AsyncWidget
        query={query}
        label="Conversation"
        errorTitle="Couldn’t load this chat"
        isEmpty={(t) => t === null}
        empty={{
          illustration: 'chats',
          title: 'This chat was deleted',
          description: 'Start a new one from Ask.',
        }}
        skeleton={
          <div className="px-[var(--gutter)] pt-4">
            <RowsSkeleton rows={2} />
          </div>
        }
      >
        {() =>
          current ? <Conversation thread={current} base={entry.key} freshFrom={mountedAt} /> : null
        }
      </AsyncWidget>
      <div ref={endRef} />
    </Screen>
  );
}

/**
 * The resizable Ask panel beside a document or meeting on wide windows (brief §9). Scoped to
 * that item; answers are samples until Phase 5.
 */
export function AskPanel({ about, base }: { about: string; base: string }) {
  const [thread, setThread] = useState<Thread | null>(null);
  const [mountedAt] = useState(() => Date.now());
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-11 shrink-0 items-center px-4 shadow-[inset_0_-0.5px_0_var(--separator)]">
        <h2 className="truncate text-headline">Ask about {about}</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-3">
        {thread ? (
          <Conversation thread={thread} base={base} freshFrom={mountedAt} />
        ) : (
          <EmptyState
            illustration="chats"
            title="Ask about this"
            description="Answers come from this item first, and cite the exact page or minute."
          />
        )}
      </div>
      <Composer
        className={cn('shrink-0 pb-3')}
        placeholder={`Ask about ${about}`}
        onSend={(q) =>
          setThread((t) => (t ? appendToLocalThread(t, q) : createLocalThread(q, about)))
        }
      />
    </div>
  );
}
