'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { ApiError, OfflineError, api, call, csrfTokenForWrite, type Schemas } from './client';
import { useActiveWorkspace } from './hooks';
import { useHydrationSafe } from './hydration';

/**
 * Ask and search (Phase 5): chats, streamed answers with their sources, and hybrid search. Chat
 * keys live under the workspace like files. An answer being written lives in a small store of
 * its own (`live`), so each token re-renders that one answer, never the list or the chat.
 */
export type AskScope = Schemas['AskScope'];
export type ConversationSummary = Schemas['ConversationSummary'];
export type Conversation = Schemas['Conversation'];
export type ChatMessage = Schemas['Message'];
export type Citation = Schemas['Citation'];
export type SearchResults = Schemas['SearchResults'];
export type Snippet = Schemas['Snippet'];

export const askKeys = {
  all: (ws: string) => ['api', 'w', ws, 'ask'] as const,
  lists: (ws: string) => ['api', 'w', ws, 'ask', 'list'] as const,
  list: (ws: string, q: string) => ['api', 'w', ws, 'ask', 'list', q] as const,
  chat: (ws: string, id: string) => ['api', 'w', ws, 'ask', 'chat', id] as const,
  search: (ws: string, q: string, scope: SearchScope) =>
    ['api', 'w', ws, 'search', q, scope] as const,
};

function retryable(count: number, error: Error): boolean {
  const status = (error as { status?: number }).status;
  if (typeof status === 'number' && status >= 400 && status < 500) return false;
  return count < 1;
}

// ── Chats ─────────────────────────────────────────────────────────────────────────────────

/** Your chats, newest first; `q` searches titles, questions and answers. */
export function useConversations(q = '') {
  const ws = useActiveWorkspace()?.id;
  const query = q.trim();
  return useHydrationSafe(
    useQuery({
      queryKey: askKeys.list(ws ?? '-', query),
      queryFn: () =>
        call(
          api.GET('/api/v1/conversations', {
            params: { query: { limit: 30, ...(query ? { q: query } : {}) } },
          }),
        ).then((page) => page.items),
      enabled: Boolean(ws),
      placeholderData: keepPreviousData,
      retry: retryable,
    }),
  );
}

/** A chat from whichever list holds it, without messages, so a pushed screen has a title. */
function summaryFromLists(client: QueryClient, ws: string, id: string) {
  for (const [, data] of client.getQueriesData<ConversationSummary[]>({
    queryKey: askKeys.lists(ws),
  })) {
    const hit = data?.find((c) => c.id === id);
    if (hit) return hit;
  }
  return undefined;
}

export function useConversation(id: string) {
  const ws = useActiveWorkspace()?.id;
  const client = useQueryClient();
  return useHydrationSafe(
    useQuery({
      queryKey: askKeys.chat(ws ?? '-', id),
      queryFn: () => call(api.GET('/api/v1/conversations/{id}', { params: { path: { id } } })),
      enabled: Boolean(ws),
      placeholderData: () => {
        const summary = ws ? summaryFromLists(client, ws, id) : undefined;
        return summary ? { ...summary, messages: [] } : undefined;
      },
      retry: retryable,
      // An answer saved mid-stream (reloaded while it was being written) is polled until done.
      refetchInterval: (query) =>
        query.state.data?.messages.some((m) => m.status === 'streaming') && !live.anyRunning()
          ? 1_500
          : false,
    }),
  );
}

export async function createConversation(scope: AskScope = {}): Promise<Conversation> {
  return call(api.POST('/api/v1/conversations', { body: { scope } }));
}

export function useRenameConversation() {
  const ws = useActiveWorkspace()?.id ?? '-';
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      call(api.PATCH('/api/v1/conversations/{id}', { params: { path: { id } }, body: { title } })),
    onSuccess: (updated) => {
      client.setQueryData<Conversation>(askKeys.chat(ws, updated.id), (c) =>
        c ? { ...c, title: updated.title } : c,
      );
      void client.invalidateQueries({ queryKey: askKeys.lists(ws) });
    },
  });
}

export function deleteConversation(id: string) {
  return call(api.DELETE('/api/v1/conversations/{id}', { params: { path: { id } } }));
}

export function useFeedback() {
  const ws = useActiveWorkspace()?.id ?? '-';
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }: { id: string; value: -1 | 0 | 1 }) =>
      call(
        api.POST('/api/v1/messages/{id}/feedback', { params: { path: { id } }, body: { value } }),
      ),
    onMutate: ({ id, value }) => {
      client.setQueriesData<Conversation>({ queryKey: askKeys.all(ws) }, (c) =>
        c && 'messages' in c
          ? { ...c, messages: c.messages.map((m) => (m.id === id ? { ...m, feedback: value } : m)) }
          : c,
      );
    },
  });
}

export function stopAnswer(id: string) {
  return call(api.POST('/api/v1/messages/{id}/stop', { params: { path: { id } } }));
}

// ── The answer being written ──────────────────────────────────────────────────────────────

export interface LiveAnswer {
  conversationId: string;
  answer: ChatMessage;
  running: boolean;
}

type Listener = () => void;

/** Answers being written, by message id, and the chat each one belongs to. */
class LiveAnswers {
  private readonly byId = new Map<string, LiveAnswer>();
  private readonly listeners = new Set<Listener>();
  private runningCount = 0;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get(id: string): LiveAnswer | undefined {
    return this.byId.get(id);
  }

  /** The answer still being written in a chat, if any. */
  inChat(conversationId: string): LiveAnswer | undefined {
    for (const a of this.byId.values()) {
      if (a.conversationId === conversationId && a.running) return a;
    }
    return undefined;
  }

  anyRunning(): boolean {
    return this.runningCount > 0;
  }

  set(id: string, next: LiveAnswer): void {
    const before = this.byId.get(id);
    if (before?.running && !next.running) this.runningCount -= 1;
    if (!before?.running && next.running) this.runningCount += 1;
    this.byId.set(id, next);
    for (const l of this.listeners) l();
  }

  drop(id: string): void {
    const before = this.byId.get(id);
    if (before?.running) this.runningCount -= 1;
    this.byId.delete(id);
    for (const l of this.listeners) l();
  }
}

export const live = new LiveAnswers();

/** One answer as it's written (null once it's saved and the chat holds it). */
export function useLiveAnswer(id: string | undefined): LiveAnswer | undefined {
  return useSyncExternalStore(
    live.subscribe,
    () => (id ? live.get(id) : undefined),
    () => undefined,
  );
}

/** The answer being written in a chat, for the Send/Stop button. */
export function useRunningInChat(conversationId: string): LiveAnswer | undefined {
  return useSyncExternalStore(
    live.subscribe,
    () => live.inChat(conversationId),
    () => undefined,
  );
}

type AnswerEvent = Schemas['AnswerEvent'];

/** Reads a `text/event-stream` body and calls `on` for each event. */
async function readEvents(response: Response, on: (event: AnswerEvent) => void): Promise<void> {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end: number;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice(6))
        .join('\n');
      if (data) on(JSON.parse(data) as AnswerEvent);
    }
  }
}

/**
 * Asks (or answers again) and follows the stream: the question and the answer appear in the
 * chat's cache at `start`; tokens and sources go to the live store; `done` writes the saved
 * answer back into the cache. Resolves when the answer is saved; throws ApiError or
 * OfflineError when the request is refused or never reaches the API.
 */
export async function streamAnswer(
  client: QueryClient,
  ws: string,
  input: { conversationId: string; question: string } | { conversationId: string; again: string },
): Promise<ChatMessage | null> {
  const path =
    'again' in input
      ? `/api/v1/messages/${input.again}/regenerate`
      : `/api/v1/conversations/${input.conversationId}/messages`;
  const key = askKeys.chat(ws, input.conversationId);
  const patchChat = (fn: (messages: ChatMessage[]) => ChatMessage[]) =>
    client.setQueryData<Conversation>(key, (c) => (c ? { ...c, messages: fn(c.messages) } : c));

  // The question shows the moment it's sent, with the answer thinking under it; `start`
  // replaces both with the saved rows.
  const temp = { question: `pending-q-${Date.now()}`, answer: `pending-a-${Date.now()}` };
  if ('question' in input) {
    patchChat((messages) => [
      ...messages,
      pendingMessage(temp.question, 'user', input.question),
      pendingMessage(temp.answer, 'assistant', ''),
    ]);
    live.set(temp.answer, {
      conversationId: input.conversationId,
      answer: pendingMessage(temp.answer, 'assistant', ''),
      running: true,
    });
  }
  const dropPending = () => {
    live.drop(temp.answer);
    patchChat((messages) => messages.filter((m) => m.id !== temp.question && m.id !== temp.answer));
  };

  const token = await csrfTokenForWrite();
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
        ...(token ? { 'x-csrf-token': token } : {}),
      },
      body: 'question' in input ? JSON.stringify({ content: input.question }) : undefined,
    });
  } catch {
    dropPending();
    throw new OfflineError();
  }
  if (!response.ok) {
    dropPending();
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: string; message?: string; requestId?: string };
    } | null;
    throw new ApiError(
      body?.error?.message ?? 'Couldn’t ask that. Try again.',
      response.status,
      body?.error?.code ?? 'ERROR',
      body?.error?.requestId,
    );
  }

  let answerId = '';
  let saved: ChatMessage | null = null;

  try {
    await readEvents(response, (event) => {
      if (event.type === 'start') {
        answerId = event.answer.id;
        live.drop(temp.answer);
        live.set(answerId, {
          conversationId: input.conversationId,
          answer: event.answer,
          running: true,
        });
        patchChat((messages) => {
          const kept = messages.filter(
            (m) => m.id !== event.answer.id && m.id !== temp.question && m.id !== temp.answer,
          );
          // Answering again keeps the answer where it was; a new one goes at the end.
          const at = messages.findIndex((m) => m.id === event.answer.id);
          if (!event.question && at !== -1) {
            return messages.map((m) => (m.id === event.answer.id ? event.answer : m));
          }
          return [...kept, ...(event.question ? [event.question] : []), event.answer];
        });
        return;
      }
      const current = live.get(answerId);
      if (!current) return;
      if (event.type === 'token') {
        live.set(answerId, {
          ...current,
          answer: { ...current.answer, content: current.answer.content + event.text },
        });
      } else if (event.type === 'cite') {
        live.set(answerId, {
          ...current,
          answer: { ...current.answer, citations: [...current.answer.citations, event.citation] },
        });
      } else if (event.type === 'done') {
        saved = event.answer;
        patchChat((messages) => messages.map((m) => (m.id === event.answer.id ? event.answer : m)));
        live.set(answerId, { ...current, answer: event.answer, running: false });
      } else if (event.type === 'error') {
        const failed: ChatMessage = {
          ...current.answer,
          status: 'failed',
          error: { code: event.code, message: event.message },
        };
        patchChat((messages) => messages.map((m) => (m.id === failed.id ? failed : m)));
        live.set(answerId, { ...current, answer: failed, running: false });
      }
    });
  } finally {
    if (!answerId) dropPending();
    const current = answerId ? live.get(answerId) : undefined;
    if (current?.running) {
      // The stream broke before the end: the answer carries on on the server; reload it.
      live.set(answerId, { ...current, running: false });
      void client.invalidateQueries({ queryKey: key });
    }
    void client.invalidateQueries({ queryKey: askKeys.lists(ws) });
  }
  return saved;
}

/** A placeholder message until the server's rows arrive. */
function pendingMessage(id: string, role: 'user' | 'assistant', content: string): ChatMessage {
  return {
    id,
    role,
    content,
    status: role === 'user' ? 'done' : 'streaming',
    model: null,
    route: null,
    isMock: false,
    passagesOnly: false,
    hidden: { restricted: 0, confidential: 0 },
    notFound: false,
    followUps: [],
    error: null,
    feedback: null,
    citations: [],
    createdAt: new Date().toISOString(),
  };
}

/** True for the placeholders above: no actions on them yet. */
export function isPending(message: Pick<ChatMessage, 'id'>): boolean {
  return message.id.startsWith('pending-');
}

// ── Search ────────────────────────────────────────────────────────────────────────────────

export type SearchScope = { collection?: string; kind?: 'documents' | 'meetings' };

export function fetchSearch(q: string, scope: SearchScope = {}) {
  return call(api.GET('/api/v1/search', { params: { query: { q, ...scope } } }));
}

/** Hybrid search, for the palette and the search screen. Keeps the last results while typing. */
export function useSearch(q: string, scope: SearchScope = {}, enabled = true) {
  const ws = useActiveWorkspace()?.id;
  const query = q.trim();
  return useHydrationSafe(
    useQuery({
      queryKey: askKeys.search(ws ?? '-', query, scope),
      queryFn: () => fetchSearch(query, scope),
      enabled: Boolean(ws) && enabled && query.length > 0,
      placeholderData: keepPreviousData,
      staleTime: 30_000,
      retry: retryable,
    }),
  );
}

// ── Notes ─────────────────────────────────────────────────────────────────────────────────

export type Note = Schemas['Note'];

export function createNote(body: Schemas['CreateNote']): Promise<Note> {
  return call(api.POST('/api/v1/notes', { body }));
}

export function updateNote(id: string, body: Schemas['UpdateNote']): Promise<Note> {
  return call(api.PATCH('/api/v1/notes/{id}', { params: { path: { id } }, body }));
}

export function useNote(id: string, enabled = true) {
  const ws = useActiveWorkspace()?.id;
  return useHydrationSafe(
    useQuery({
      queryKey: ['api', 'w', ws ?? '-', 'notes', id],
      queryFn: () => call(api.GET('/api/v1/notes/{id}', { params: { path: { id } } })),
      enabled: Boolean(ws) && enabled,
      retry: retryable,
    }),
  );
}
