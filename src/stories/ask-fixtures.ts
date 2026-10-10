/**
 * STAND-IN chats and search for Storybook and the shell's e2e (no API there): one finished chat
 * that cites a document and a meeting moment, and a search that matches file titles. Shaped
 * exactly like the API's answers, so the real screens render them. No imports beyond types (the
 * search takes the stand-in library as an argument), so Node can load it as it is.
 */
import type { Schemas } from '@/lib/api/client';

type Message = Schemas['Message'];
type Citation = Schemas['Citation'];

const AT = '2026-10-09T09:30:00.000Z';

export const STAND_IN_CITATIONS: Citation[] = [
  {
    n: 1,
    available: true,
    fileId: 'f_launch',
    kind: 'document',
    title: 'Lagos launch plan',
    page: 3,
    startMs: null,
    endMs: null,
    quote: 'Unreliable connectivity on field visits. Recording must work offline.',
  },
  {
    n: 2,
    available: true,
    fileId: 'f_weekly',
    kind: 'audio',
    title: 'Weekly product sync',
    page: null,
    startMs: 188_000,
    endMs: 230_000,
    quote: 'Then offline recording is a launch requirement, not a nice-to-have.',
  },
];

export function standInAnswer(overrides: Partial<Message> = {}): Message {
  return {
    id: 'm_answer',
    role: 'assistant',
    content:
      'The launch plan names three risks: connectivity on field visits [1], data residency questions from health partners [1], and pricing in naira. The weekly sync made offline recording a launch requirement [2].',
    status: 'done',
    model: 'private:ollama:llama3.2:3b',
    route: { kind: 'private', label: 'Private · Ollama (in your cluster)' },
    isMock: false,
    passagesOnly: false,
    hidden: { restricted: 0, confidential: 0 },
    notFound: false,
    followUps: ['Who owns the offline recording work?', 'When is the beta?'],
    error: null,
    feedback: null,
    citations: STAND_IN_CITATIONS,
    createdAt: AT,
    ...overrides,
  };
}

export const STAND_IN_CHAT: Schemas['Conversation'] = {
  id: 'c_risks',
  title: 'What are the risks for the Lagos launch',
  scope: {},
  preview: 'The launch plan names three risks: connectivity on field visits, data residency…',
  createdAt: AT,
  updatedAt: AT,
  messages: [
    {
      ...standInAnswer(),
      id: 'm_question',
      role: 'user',
      content: 'What are the risks for the Lagos launch?',
      route: null,
      model: null,
      followUps: [],
      citations: [],
    },
    standInAnswer(),
  ],
};

function summary(chat: Schemas['Conversation']): Schemas['ConversationSummary'] {
  return {
    id: chat.id,
    title: chat.title,
    scope: chat.scope,
    preview: chat.preview,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

/** Search: files whose title shares a word with the question; no passages or moments. */
function search(q: string, library: Schemas['File'][]): Schemas['SearchResults'] {
  const words = q.toLowerCase().split(/\W+/).filter(Boolean);
  const files = library
    .filter((f) => words.some((w) => f.title.toLowerCase().includes(w)))
    .map((file) => ({ file, match: 'title' as const }));
  return { mode: 'hybrid', files, passages: [], moments: [] };
}

/** The models a workspace offers in Switch model: one Private, one on the workspace's key. */
export const STAND_IN_MODELS: Schemas['AiModels'] = {
  defaultRef: 'private:ollama:llama3.2:3b',
  models: [
    {
      ref: 'private:ollama:llama3.2:3b',
      mode: 'PRIVATE',
      model: 'llama3.2:3b',
      providerLabel: 'Ollama (in your cluster)',
      keyLabel: null,
      routeLabel: 'Private · Ollama (in your cluster)',
      dataLocation: 'IN_CLUSTER',
      isMock: false,
      enabled: true,
      allowed: true,
      readsConfidential: true,
      readsRestricted: true,
    },
    {
      ref: 'byok:key1:claude-sonnet',
      mode: 'BYOK',
      model: 'claude-sonnet',
      providerLabel: 'Claude',
      keyLabel: 'Team key',
      routeLabel: 'Claude · your API key',
      dataLocation: 'THIRD_PARTY',
      isMock: false,
      enabled: true,
      allowed: true,
      readsConfidential: false,
      readsRestricted: false,
    },
  ],
};

/** The answer for any /api/v1 chat or search route, or undefined when it isn't one. */
export function standInAskRoute(
  url: URL,
  library: Schemas['File'][],
): { status: number; json?: unknown } | undefined {
  const path = url.pathname.replace(/^.*\/api\/v1\//, '');
  if (path === 'search') {
    return { status: 200, json: search(url.searchParams.get('q') ?? '', library) };
  }
  if (path === 'conversations') {
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const items = [summary(STAND_IN_CHAT)].filter(
      (c) => !q || c.title.toLowerCase().includes(q) || c.preview?.toLowerCase().includes(q),
    );
    return { status: 200, json: { items, nextCursor: null } };
  }
  if (path === `conversations/${STAND_IN_CHAT.id}`) return { status: 200, json: STAND_IN_CHAT };
  if (path === 'ai/models') return { status: 200, json: STAND_IN_MODELS };
  if (path.startsWith('conversations/')) {
    return {
      status: 404,
      json: { error: { code: 'NOT_FOUND', message: 'This chat doesn’t exist.' } },
    };
  }
  return undefined;
}
