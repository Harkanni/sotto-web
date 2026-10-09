'use client';

import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, MessageCircle, RotateCcw, SearchX, Trash2 } from 'lucide-react';
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { messageOf } from '@/components/account/workspace-actions';
import { AnswerActions, FollowUps } from '@/components/ask/actions';
import { AnswerText, HiddenNotice, RouteBadge, Sources } from '@/components/ask/answer';
import { Screen } from '@/components/shell/screen';
import { useLayer } from '@/components/shell/stack-context';
import { Button } from '@/components/ui/button';
import { ListRowContent } from '@/components/ui/list';
import { ActionRow } from '@/components/ui/row-actions';
import { SearchField } from '@/components/ui/search-field';
import { Skeleton } from '@/components/ui/skeleton';
import { AsyncWidget, EmptyState } from '@/components/widgets/async-widget';
import {
  askKeys,
  createConversation,
  deleteConversation,
  isPending,
  stopAnswer,
  streamAnswer,
  useConversation,
  useConversations,
  useLiveAnswer,
  useRunningInChat,
  type AskScope,
  type ChatMessage,
  type Conversation,
  type ConversationSummary,
} from '@/lib/api/ask';
import { useFile } from '@/lib/api/files';
import { useActiveWorkspace, useWorkspaceCollections } from '@/lib/api/hooks';
import { relativeTime } from '@/lib/format';
import { useIsWide } from '@/lib/hooks/use-media-query';
import { prefersReducedMotion } from '@/lib/motion/driver';
import { useChildKey, useNav } from '@/lib/nav/hooks';
import { pushPath } from '@/lib/nav/routes';
import { getSnapshot, navigate } from '@/lib/nav/store';
import { cn } from '@/lib/utils';
import { Composer, scopeLabel, scopeOf, useScopeOptions, type Mention } from './parts/composer';
import { RowsSkeleton, THREAD_TINT, TintIcon } from './parts/rows';

// ── Asking ────────────────────────────────────────────────────────────────────────────────

/** Says why a question couldn't be asked, in the API's own words. */
function askFailed(error: unknown) {
  toast(messageOf(error));
}

/**
 * Starts a chat with a scope and its first question: the chat opens at once with the question in
 * it, and the answer streams in while you watch (or later, if you go elsewhere).
 */
function useStartChat(base: string) {
  const client = useQueryClient();
  const ws = useActiveWorkspace()?.id;
  return async (question: string, scope: AskScope) => {
    if (!ws) return false;
    let chat: Conversation;
    try {
      chat = await createConversation(scope);
    } catch (error) {
      askFailed(error);
      return false;
    }
    client.setQueryData(askKeys.chat(ws, chat.id), { ...chat, title: titleOf(question) });
    navigate(pushPath(base, 'thread', chat.id));
    void streamAnswer(client, ws, { conversationId: chat.id, question }).catch(askFailed);
    return true;
  };
}

/** The title the API will give the chat, shown before it has answered. */
function titleOf(question: string): string {
  const clean = question
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[?.!]+$/, '');
  return clean.length > 60 ? `${clean.slice(0, 59).trimEnd()}…` : clean;
}

// ── The list of chats ─────────────────────────────────────────────────────────────────────

function ChatPreview({ chat }: { chat: ConversationSummary }) {
  return (
    <div className="flex flex-col gap-2 p-4">
      <p className="text-headline">{chat.title}</p>
      {chat.preview && (
        <p className="line-clamp-5 text-callout text-muted-foreground">{chat.preview}</p>
      )}
    </div>
  );
}

const ChatRow = memo(function ChatRow({
  chat,
  href,
  selected,
  onDelete,
}: {
  chat: ConversationSummary;
  href: string;
  selected?: boolean;
  onDelete: (chat: ConversationSummary) => void;
}) {
  return (
    <ActionRow
      label={chat.title}
      actions={[
        {
          id: 'delete',
          label: 'Delete',
          icon: Trash2,
          destructive: true,
          swipe: 'trailing',
          tone: 'red',
          onSelect: () => onDelete(chat),
        },
      ]}
      preview={<ChatPreview chat={chat} />}
      onOpen={() => navigate(href)}
    >
      <ListRowContent
        href={href}
        selected={selected}
        leading={<TintIcon icon={MessageCircle} tint={THREAD_TINT} />}
        title={chat.title}
        subtitle={chat.preview ?? undefined}
        detail={
          <span className="text-subhead">{relativeTime(new Date(chat.updatedAt).getTime())}</span>
        }
        chevron={false}
        rowProps={{ 'data-item': chat.id }}
      />
    </ActionRow>
  );
});

/**
 * Delete never asks (brief §9): the chat leaves the list at once and is deleted when the toast
 * closes, so Undo just puts it back.
 */
function useDeleteChat(listKey: string) {
  const client = useQueryClient();
  const ws = useActiveWorkspace()?.id ?? '-';
  return useCallback(
    (chat: ConversationSummary) => {
      const lists = askKeys.lists(ws);
      const before = client.getQueriesData<ConversationSummary[]>({ queryKey: lists });
      client.setQueriesData<ConversationSummary[]>({ queryKey: lists }, (list) =>
        list?.filter((c) => c.id !== chat.id),
      );
      // Deleting the chat that's open beside the list closes it.
      if (getSnapshot().pathname.includes(encodeURIComponent(chat.id))) navigate(listKey);
      let settled = false;
      const commit = () => {
        if (settled) return;
        settled = true;
        deleteConversation(chat.id)
          .then(() => client.removeQueries({ queryKey: askKeys.chat(ws, chat.id) }))
          .catch((error: unknown) => {
            for (const [key, data] of before) client.setQueryData(key, data);
            toast(messageOf(error));
          });
      };
      toast(`Deleted “${chat.title}”`, {
        action: {
          label: 'Undo',
          onClick: () => {
            settled = true;
            for (const [key, data] of before) client.setQueryData(key, data);
          },
        },
        onAutoClose: commit,
        onDismiss: commit,
      });
    },
    [client, ws, listKey],
  );
}

/** Ask (brief §9): your chats, searchable, and the composer at the bottom with scope chips. */
export function AskScreen() {
  const { entry, tab } = useLayer();
  const nav = useNav();
  const [search, setSearch] = useState('');
  const query = useConversations(search);
  const selected = useChildKey(tab, entry.key);
  const [scope, setScope] = useState('all');
  const [mentions, setMentions] = useState<Mention[]>([]);
  const options = useScopeOptions();
  const startChat = useStartChat(entry.key);
  const onDelete = useDeleteChat(entry.key);
  // The list pane on wide windows is narrow: a short prompt keeps the composer one line tall.
  const wide = useIsWide();

  // /ask?about=<file>: the Ask button on a document or meeting (phones) asks about that file.
  const about = useMemo(() => new URLSearchParams(nav.search).get('about'), [nav.search]);
  const aboutFile = useFile(about ?? '-', Boolean(about)).data;
  const [picked, setPicked] = useState<string | null>(null);
  if (aboutFile && picked !== aboutFile.id) {
    setPicked(aboutFile.id);
    setMentions([{ id: aboutFile.id, title: aboutFile.title, kind: aboutFile.kind }]);
  }

  const ask = (question: string) => {
    void startChat(question, scopeOf(scope, mentions)).then((ok) => ok && setMentions([]));
  };

  return (
    <Screen
      title="Ask"
      header={
        <div className="pb-3">
          <SearchField
            value={search}
            onValueChange={setSearch}
            placeholder="Search chats"
            className="px-[var(--gutter)]"
          />
        </div>
      }
      footer={
        <Composer
          onSend={ask}
          scope={scope}
          onScopeChange={setScope}
          scopes={options}
          mentions={mentions}
          onMentionsChange={setMentions}
          placeholder={wide ? 'Ask a question' : undefined}
        />
      }
    >
      <AsyncWidget
        query={query}
        label="Recent chats"
        errorTitle="Couldn’t load your chats"
        empty={
          search.trim()
            ? {
                illustration: 'chats',
                title: 'No chats match',
                description: `Nothing you’ve asked mentions “${search.trim()}”.`,
              }
            : {
                illustration: 'chats',
                title: 'Ask your team’s memory',
                description:
                  'Answers cite the page or the minute they came from. Try “What did we decide about pricing?”',
              }
        }
        skeleton={
          <div className="px-[var(--gutter)]">
            <RowsSkeleton rows={4} round />
          </div>
        }
      >
        {(chats) => (
          <section aria-label="Recent chats" className="px-[var(--gutter)]">
            <h2 className="px-4 pb-1.5 text-footnote text-muted-foreground">
              {search.trim() ? 'Matching chats' : 'Recent'}
            </h2>
            <ul className="overflow-hidden rounded-card bg-card">
              {chats.map((c) => {
                const href = pushPath(entry.key, 'thread', c.id);
                return (
                  <ChatRow
                    key={c.id}
                    chat={c}
                    href={href}
                    selected={selected === href}
                    onDelete={onDelete}
                  />
                );
              })}
            </ul>
          </section>
        )}
      </AsyncWidget>
    </Screen>
  );
}

// ── One chat ──────────────────────────────────────────────────────────────────────────────

/**
 * Keeps an answer being written in view while you're at the bottom, but only until your
 * question reaches the top of the screen: from there you read from the start, as you would a
 * page. Scroll up yourself and it stops following. Watches the conversation's size, not tokens.
 */
function useStickToBottom(ref: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    const scroller = el?.closest<HTMLElement>('.screen');
    if (!el || !scroller) return;
    let atBottom = true;
    const onScroll = () => {
      atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 96;
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(() => {
      if (!atBottom) return;
      const bottom = scroller.scrollHeight - scroller.clientHeight;
      const questions = el.querySelectorAll<HTMLElement>('[data-question]');
      const last = questions[questions.length - 1];
      let top = bottom;
      if (last) {
        const bar = scroller.querySelector<HTMLElement>('.navbar')?.offsetHeight ?? 0;
        const at =
          last.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top +
          scroller.scrollTop;
        top = Math.min(bottom, at - bar - 12);
      }
      if (top > scroller.scrollTop) scroller.scrollTop = top;
    });
    observer.observe(el);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [ref]);

  /** After you ask: bring the question and the coming answer into view. */
  return () => {
    const scroller = ref.current?.closest<HTMLElement>('.screen');
    scroller?.scrollTo({
      top: scroller.scrollHeight,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  };
}

function UserMessage({ text }: { text: string }) {
  return (
    <div data-question className="flex justify-end">
      <p className="max-w-[85%] rounded-[20px] rounded-br-[6px] bg-primary px-4 py-2.5 text-body break-words whitespace-pre-wrap text-primary-foreground">
        {text}
      </p>
    </div>
  );
}

/** While retrieval runs and before the first words: a quiet, honest progress line. */
function Thinking() {
  return (
    <div
      role="status"
      className="flex h-[22px] items-center gap-2 text-callout text-muted-foreground"
    >
      <span aria-hidden className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-primary-text motion-safe:animate-[spinner-pulse_1.1s_var(--ease-in-out)_infinite]"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
      Looking through your memos and meetings
    </div>
  );
}

const AssistantMessage = memo(function AssistantMessage({
  message,
  question,
  base,
  scope,
  isLast,
  regenerating,
  onAgain,
  onAsk,
}: {
  message: ChatMessage;
  question: string;
  base: string;
  scope: string;
  isLast: boolean;
  regenerating: boolean;
  onAgain: (id: string) => void;
  onAsk: (question: string) => void;
}) {
  const live = useLiveAnswer(message.id);
  const m = live?.running ? live.answer : message;
  const streaming = m.status === 'streaming';
  const thinking = streaming && !m.content && !m.citations.length;
  const failed = m.status === 'failed';

  return (
    <article aria-busy={streaming || undefined} aria-label="Answer" className="flex flex-col gap-3">
      {m.route ? <RouteBadge message={m} /> : null}
      {thinking && <Thinking />}

      {m.passagesOnly ? (
        !streaming && (
          <p className="text-callout text-muted-foreground">
            {m.citations.length
              ? 'No AI model is set up on this server yet, so here are the passages that match best.'
              : `Nothing in ${scope} matches this. Try other words, or ask across all sources.`}
          </p>
        )
      ) : m.notFound && !m.content && !streaming ? (
        <p className="flex items-start gap-2 text-callout text-muted-foreground">
          <SearchX aria-hidden className="mt-0.5 size-4 shrink-0" />
          Nothing in {scope} answers this, so there’s nothing to cite. Try other words, or ask
          across all sources.
        </p>
      ) : (
        m.content && (
          <AnswerText
            text={m.content}
            citations={m.citations}
            base={base}
            streaming={streaming}
            className={m.notFound ? 'text-muted-foreground' : undefined}
          />
        )
      )}

      {m.status === 'stopped' && <p className="text-footnote text-muted-foreground">Stopped</p>}
      {failed && (
        <div className="flex flex-col items-start gap-2 rounded-card bg-card px-4 py-3 shadow-card">
          <p className="flex items-start gap-2 text-callout text-destructive-text">
            <AlertCircle aria-hidden className="mt-0.5 size-[18px] shrink-0" />
            {m.error?.message ?? 'This answer stopped part-way.'}
          </p>
          <Button
            variant="ghost"
            className="-ml-3"
            icon={<RotateCcw aria-hidden />}
            loading={regenerating}
            onClick={() => onAgain(m.id)}
          >
            Try again
          </Button>
        </div>
      )}

      <HiddenNotice hidden={m.hidden} />
      {(m.passagesOnly ? !streaming : !thinking) && (
        <Sources citations={m.citations} base={base} passages={m.passagesOnly} />
      )}
      {!streaming && !failed && !isPending(m) && (
        <AnswerActions
          message={m}
          question={question}
          base={base}
          regenerating={regenerating}
          onRegenerate={() => onAgain(m.id)}
        />
      )}
      {isLast && !streaming && !failed && <FollowUps questions={m.followUps} onAsk={onAsk} />}
    </article>
  );
});

/** A chat's messages: questions on the right, answers with their sources below them. */
export function ConversationView({
  chat,
  base,
  regenerating,
  onAgain,
  onAsk,
}: {
  chat: Conversation;
  base: string;
  regenerating: string | null;
  onAgain: (id: string) => void;
  onAsk: (question: string) => void;
}) {
  const collections = useWorkspaceCollections().data;
  const scope = scopeLabel(chat.scope, collections);
  const where = scope === 'All sources' ? 'your library' : scope;
  const lastAnswer = chat.messages.findLast((m) => m.role === 'assistant');
  return (
    // One reading column (~70 characters) however wide the pane.
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6 px-[var(--gutter)] pt-2 pb-4">
      {chat.messages.map((m, i) => {
        if (m.role === 'user') return <UserMessage key={m.id} text={m.content} />;
        const question = chat.messages.slice(0, i).findLast((x) => x.role === 'user')?.content;
        return (
          <AssistantMessage
            key={m.id}
            message={m}
            question={question ?? chat.title}
            base={base}
            scope={where}
            isLast={m === lastAnswer}
            regenerating={regenerating === m.id}
            onAgain={onAgain}
            onAsk={onAsk}
          />
        );
      })}
    </div>
  );
}

/** Asks follow-ups, answers again and stops, for one chat. */
function useChatActions(id: string | null, onAsked?: () => void) {
  const client = useQueryClient();
  const ws = useActiveWorkspace()?.id ?? '-';
  const running = useRunningInChat(id ?? '-');
  const [regenerating, setRegenerating] = useState<string | null>(null);
  return {
    running,
    regenerating,
    ask: (question: string) => {
      if (!id) return;
      onAsked?.();
      void streamAnswer(client, ws, { conversationId: id, question }).catch(askFailed);
    },
    again: (messageId: string) => {
      if (!id) return;
      setRegenerating(messageId);
      void streamAnswer(client, ws, { conversationId: id, again: messageId })
        .catch(askFailed)
        .finally(() => setRegenerating(null));
    },
    stop: () => {
      if (running && !isPending(running.answer)) {
        void stopAnswer(running.answer.id).catch(askFailed);
      }
    },
  };
}

function ConversationSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-[var(--gutter)] pt-2" aria-hidden>
      <div className="flex justify-end">
        <Skeleton className="h-11 w-3/5 rounded-[20px]" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

/** One chat: the conversation, its sources, and the composer to follow up. */
export function ThreadScreen() {
  const { entry } = useLayer();
  const id = entry.id!;
  const query = useConversation(id);
  const listRef = useRef<HTMLDivElement>(null);
  const toBottom = useStickToBottom(listRef);
  const { running, regenerating, ask, again, stop } = useChatActions(id, toBottom);
  const chat = query.data;

  return (
    <Screen
      title={chat?.title || 'New chat'}
      surface="grouped"
      footer={
        <Composer
          onSend={ask}
          placeholder="Ask a follow-up"
          running={Boolean(running)}
          onStop={stop}
        />
      }
    >
      <div ref={listRef}>
        <AsyncWidget
          query={query}
          label="Conversation"
          errorTitle="Couldn’t load this chat"
          isEmpty={(c) => c === null}
          empty={{
            illustration: 'chats',
            title: 'This chat was deleted',
            description: 'Start a new one from Ask.',
          }}
          skeleton={<ConversationSkeleton />}
        >
          {(c) =>
            query.isPlaceholderData && !c.messages.length ? (
              <ConversationSkeleton />
            ) : (
              <ConversationView
                chat={c}
                base={entry.key}
                regenerating={regenerating}
                onAgain={again}
                onAsk={ask}
              />
            )
          }
        </AsyncWidget>
      </div>
    </Screen>
  );
}

// ── Beside a document or meeting ──────────────────────────────────────────────────────────

/**
 * The resizable Ask panel beside a document or meeting on wide windows (brief §9). Its chat is
 * scoped to that file; the first question starts it.
 */
export function AskPanel({ about, fileId, base }: { about: string; fileId: string; base: string }) {
  const client = useQueryClient();
  const ws = useActiveWorkspace()?.id;
  const [chatId, setChatId] = useState<string | null>(null);
  const query = useConversation(chatId ?? '-', Boolean(chatId));
  const scrollRef = useRef<HTMLDivElement>(null);
  const { running, regenerating, ask, again, stop } = useChatActions(chatId, () =>
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }),
  );

  const first = async (question: string) => {
    if (!ws) return;
    try {
      const chat = await createConversation({ fileIds: [fileId] });
      client.setQueryData(askKeys.chat(ws, chat.id), chat);
      setChatId(chat.id);
      void streamAnswer(client, ws, { conversationId: chat.id, question }).catch(askFailed);
    } catch (error) {
      askFailed(error);
    }
  };

  const chat = chatId ? query.data : null;
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-11 shrink-0 items-center px-4 shadow-[inset_0_-0.5px_0_var(--separator)]">
        <h2 className="truncate text-headline">Ask about {about}</h2>
      </div>
      <div ref={scrollRef} className={cn('min-h-0 flex-1 overflow-y-auto py-3')}>
        {chat ? (
          <ConversationView
            chat={chat}
            base={base}
            regenerating={regenerating}
            onAgain={again}
            onAsk={ask}
          />
        ) : (
          <EmptyState
            illustration="chats"
            title="Ask about this"
            description="Answers come from this file only, and cite the exact page or minute."
          />
        )}
      </div>
      <Composer
        className="shrink-0 pb-3"
        placeholder={`Ask about ${about}`}
        running={Boolean(running)}
        onStop={stop}
        onSend={(q) => (chatId ? ask(q) : void first(q))}
      />
    </div>
  );
}
