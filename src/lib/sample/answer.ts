/**
 * SAMPLE ANSWERS — Phase 2 only. Real answers (hybrid retrieval, citations to the exact page or
 * minute) arrive in Phase 5. Until then a question gets a clearly labelled sample answer built
 * from the sample workspace, so the chat, citations and streaming can be designed and tested.
 */

import { DOCS, MEETINGS, type Citation, type Message, type Thread } from './data';

const TOPICS: { words: string[]; text: string; citations: Citation[] }[] = [
  {
    words: ['launch', 'lagos', 'risk', 'partner'],
    text: 'This is a sample answer. The launch plan names three risks: connectivity on field visits [1], data residency questions from health partners [2], and pricing in naira [1].',
    citations: [
      { kind: 'doc', id: 'd_launch', page: 3 },
      { kind: 'meeting', id: 'm_weekly', at: 58 },
    ],
  },
  {
    words: ['price', 'pricing', 'tier', 'plan', 'cost'],
    text: 'This is a sample answer. The free tier stays at three members, private AI moves into Team, and Business is priced per seat [1]. The workshop recording is still processing.',
    citations: [{ kind: 'doc', id: 'd_pricing', page: 1 }],
  },
  {
    words: ['security', 'encrypt', 'data', 'privacy', 'store'],
    text: 'This is a sample answer. Files, audio and transcripts are encrypted at rest and in transit, and stored in London [1].',
    citations: [{ kind: 'doc', id: 'd_security', page: 2 }],
  },
  {
    words: ['roadmap', 'quarter', 'priority', 'focus', 'q4'],
    text: 'This is a sample answer. The quarter focuses on fast cited answers, meeting notes that need no editing, and same-day onboarding [1].',
    citations: [{ kind: 'doc', id: 'd_roadmap', page: 1 }],
  },
];

const FALLBACK = {
  text: 'This is a sample answer. In Phase 5, Sotto searches your memos and meetings and answers with the exact page or minute it found. For now, try asking about the launch, pricing, security or the roadmap.',
  citations: [] as Citation[],
};

export function sampleAnswer(question: string): { text: string; citations: Citation[] } {
  const q = question.toLowerCase();
  return TOPICS.find((t) => t.words.some((w) => q.includes(w))) ?? FALLBACK;
}

/** Titles a new chat from its first question: "What risks did we flag…" → "Risks we flagged". */
export function titleFor(question: string): string {
  const clean = question.trim().replace(/[?.!]+$/, '');
  return clean.length > 40 ? clean.slice(0, 38).trimEnd() + '…' : clean;
}

export function citationLabel(c: Citation): string {
  if (c.kind === 'doc') {
    const doc = DOCS.find((d) => d.id === c.id);
    return `${doc?.title ?? 'Document'}, page ${c.page}`;
  }
  const meeting = MEETINGS.find((m) => m.id === c.id);
  const m = Math.floor(c.at / 60);
  const s = String(c.at % 60).padStart(2, '0');
  return `${meeting?.title ?? 'Meeting'}, ${m}:${s}`;
}

/** New chats live in memory for the session (sample workspace). */
const local = new Map<string, Thread>();

export function createLocalThread(question: string, scope: string): Thread {
  const id = `t_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  const answer = sampleAnswer(question);
  const messages: Message[] = [
    { role: 'user', text: question, at: now },
    { role: 'assistant', text: answer.text, at: now + 1, citations: answer.citations },
  ];
  const thread: Thread = { id, title: titleFor(question), updatedAt: now, scope, messages };
  local.set(id, thread);
  return thread;
}

export function appendToLocalThread(thread: Thread, question: string): Thread {
  const now = Date.now();
  const answer = sampleAnswer(question);
  const next: Thread = {
    ...thread,
    updatedAt: now,
    messages: [
      ...thread.messages,
      { role: 'user', text: question, at: now },
      { role: 'assistant', text: answer.text, at: now + 1, citations: answer.citations },
    ],
  };
  local.set(thread.id, next);
  return next;
}

export function localThread(id: string): Thread | undefined {
  return local.get(id);
}

export function localThreads(): Thread[] {
  return [...local.values()];
}
