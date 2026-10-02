/**
 * SAMPLE DATA — Phase 2 only. A fictional workspace ("Kestrel Labs") so every screen can be
 * built, reviewed and tested before the real API lands (accounts in Phase 3, files and
 * meetings in Phase 4, answers in Phase 5). Every screen that shows it says so.
 *
 * Times are relative to when the page loads, so the sample never looks stale.
 */

import type { Sensitivity } from '@/components/ui/badge';

export type Person = { id: string; name: string; role: string; email: string };

export type DocKind = 'memo' | 'pdf' | 'note' | 'sheet';

export type Doc = {
  id: string;
  title: string;
  kind: DocKind;
  collectionId: string;
  ownerId: string;
  sensitivity: Sensitivity;
  updatedAt: number;
  pages: number;
  sizeKb: number;
  pinned: boolean;
  summary: string;
  body: string[];
};

export type Collection = {
  id: string;
  name: string;
  description: string;
  sensitivity: Sensitivity;
};

export type MeetingStatus =
  | { state: 'ready' }
  | {
      state: 'processing';
      step: 'Uploading' | 'Transcribing' | 'Finding speakers' | 'Summarising';
      progress: number;
    };

export type TranscriptLine = { at: number; speakerId: string; text: string };
export type Chapter = { at: number; title: string };

export type Meeting = {
  id: string;
  title: string;
  startedAt: number;
  durationSec: number;
  participantIds: string[];
  status: MeetingStatus;
  pinned: boolean;
  summary: string[];
  chapters: Chapter[];
  transcript: TranscriptLine[];
};

export type ActionItem = {
  id: string;
  text: string;
  meetingId: string;
  ownerId: string;
  due: number | null;
  done: boolean;
};

export type Citation =
  { kind: 'doc'; id: string; page: number } | { kind: 'meeting'; id: string; at: number };

export type Message =
  | { role: 'user'; text: string; at: number }
  | { role: 'assistant'; text: string; at: number; citations: Citation[] };

export type Thread = {
  id: string;
  title: string;
  updatedAt: number;
  scope: string;
  messages: Message[];
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** A time earlier today (never in the future, whatever the clock says), on a 5-minute mark. */
function earlierToday(hoursAgo: number): number {
  const t = Math.max(Date.now() - hoursAgo * 60 * 60_000, new Date().setHours(0, 5, 0, 0));
  return t - (t % (5 * 60_000));
}

/** End of a working day, `days` from today. */
function dayAt(days: number, hours: number): number {
  const d = new Date();
  d.setHours(hours, 0, 0, 0);
  return d.getTime() + days * 24 * 60 * 60_000;
}

export const ME = 'p_ada';

export const PEOPLE: Person[] = [
  { id: 'p_ada', name: 'Ada Okafor', role: 'Product manager', email: 'ada@kestrel.example' },
  { id: 'p_amaka', name: 'Amaka Obi', role: 'Head of product', email: 'amaka@kestrel.example' },
  { id: 'p_tunde', name: 'Tunde Bakare', role: 'Engineering lead', email: 'tunde@kestrel.example' },
  { id: 'p_sofia', name: 'Sofia Marin', role: 'Product designer', email: 'sofia@kestrel.example' },
  { id: 'p_jonas', name: 'Jonas Weber', role: 'Sales', email: 'jonas@kestrel.example' },
  { id: 'p_priya', name: 'Priya Raman', role: 'User research', email: 'priya@kestrel.example' },
  { id: 'p_kwame', name: 'Kwame Mensah', role: 'Operations', email: 'kwame@kestrel.example' },
];

export const COLLECTIONS: Collection[] = [
  {
    id: 'c_product',
    name: 'Product',
    description: 'Roadmaps, specs and research',
    sensitivity: 'internal',
  },
  {
    id: 'c_customers',
    name: 'Customers',
    description: 'Calls, questionnaires, playbooks',
    sensitivity: 'confidential',
  },
  {
    id: 'c_board',
    name: 'Board and finance',
    description: 'Board packs and forecasts',
    sensitivity: 'restricted',
  },
  { id: 'c_handbook', name: 'Handbook', description: 'How we work', sensitivity: 'public' },
];

const now = Date.now();

const PARAGRAPHS = {
  roadmap: [
    'This quarter we focus on three outcomes: first answers in under two seconds, meeting notes that need no editing, and onboarding a ten-person team in one afternoon.',
    'Answers come first. Field teams told us they stop trusting a tool the moment it guesses, so every answer must cite the page or the minute it came from, and say plainly when the sources are thin.',
    'Meetings come second. The notetaker should join on its own, capture who said what, and turn decisions into action items with owners. Editing a summary should be the exception.',
    'Onboarding comes third. A new workspace should import the team’s existing memos in one step and be useful the same day.',
    'Out of scope this quarter: public sharing, a desktop app, and integrations beyond calendar and storage.',
  ],
  pricing: [
    'We reviewed three tiers against the interviews from August. Teams under ten people care about the monthly price; larger teams care about where their data lives.',
    'Decision: keep the free tier at three members, move private AI into Team, and price Business per seat with an annual discount.',
    'Open question: whether BYOK customers should pay less. Jonas will bring two customer quotes to the next workshop.',
  ],
  launch: [
    'The Lagos launch is planned for the first week of November with five design partners from logistics and health.',
    'Risk 1: unreliable connectivity on field visits. Recording must work offline and upload when the network returns.',
    'Risk 2: data residency questions from health partners. We need a clear answer on where audio and transcripts are stored.',
    'Risk 3: pricing in naira. Paystack covers local cards; we still need a policy for exchange-rate changes.',
  ],
  generic: [
    'This document is part of the sample workspace. Its content is made up to show how Sotto lays out long-form reading: comfortable line length, generous spacing and clear hierarchy.',
    'In Phase 4, uploaded memos and PDFs replace this sample, with page numbers that answers can cite.',
  ],
};

export const DOCS: Doc[] = [
  {
    id: 'd_roadmap',
    title: 'Q4 roadmap memo',
    kind: 'memo',
    collectionId: 'c_product',
    ownerId: 'p_amaka',
    sensitivity: 'internal',
    updatedAt: now - 2 * HOUR,
    pages: 6,
    sizeKb: 84,
    pinned: true,
    summary:
      'Three outcomes for the quarter: fast cited answers, meeting notes that need no editing, same-day onboarding.',
    body: PARAGRAPHS.roadmap,
  },
  {
    id: 'd_launch',
    title: 'Lagos launch plan',
    kind: 'memo',
    collectionId: 'c_product',
    ownerId: 'p_amaka',
    sensitivity: 'confidential',
    updatedAt: now - 5 * HOUR,
    pages: 9,
    sizeKb: 120,
    pinned: false,
    summary: 'Launch with five design partners in November; three risks named with owners.',
    body: PARAGRAPHS.launch,
  },
  {
    id: 'd_pricing',
    title: 'Pricing review notes',
    kind: 'note',
    collectionId: 'c_product',
    ownerId: 'p_jonas',
    sensitivity: 'confidential',
    updatedAt: now - 1 * DAY - 3 * HOUR,
    pages: 3,
    sizeKb: 22,
    pinned: false,
    summary:
      'Free tier stays at three members; private AI moves into Team; Business priced per seat.',
    body: PARAGRAPHS.pricing,
  },
  {
    id: 'd_research',
    title: 'Interview synthesis: field teams',
    kind: 'memo',
    collectionId: 'c_product',
    ownerId: 'p_priya',
    sensitivity: 'internal',
    updatedAt: now - 2 * DAY,
    pages: 14,
    sizeKb: 310,
    pinned: false,
    summary:
      'Twelve interviews: trust comes from citations; offline recording is a must for field work.',
    body: PARAGRAPHS.generic,
  },
  {
    id: 'd_api',
    title: 'API deprecation plan',
    kind: 'memo',
    collectionId: 'c_product',
    ownerId: 'p_tunde',
    sensitivity: 'internal',
    updatedAt: now - 3 * DAY,
    pages: 4,
    sizeKb: 48,
    pinned: false,
    summary: 'v1 endpoints retire in March after a two-release overlap.',
    body: PARAGRAPHS.generic,
  },
  {
    id: 'd_security',
    title: 'Security questionnaire answers',
    kind: 'pdf',
    collectionId: 'c_customers',
    ownerId: 'p_tunde',
    sensitivity: 'confidential',
    updatedAt: now - 4 * DAY,
    pages: 18,
    sizeKb: 640,
    pinned: true,
    summary: 'Encryption at rest and in transit, data residency in London, SSO, audit logs.',
    body: PARAGRAPHS.generic,
  },
  {
    id: 'd_support',
    title: 'Support playbook',
    kind: 'pdf',
    collectionId: 'c_customers',
    ownerId: 'p_jonas',
    sensitivity: 'internal',
    updatedAt: now - 6 * DAY,
    pages: 11,
    sizeKb: 290,
    pinned: false,
    summary: 'How we answer, escalate and close support requests.',
    body: PARAGRAPHS.generic,
  },
  {
    id: 'd_board',
    title: 'Board update, September',
    kind: 'pdf',
    collectionId: 'c_board',
    ownerId: 'p_amaka',
    sensitivity: 'restricted',
    updatedAt: now - 8 * DAY,
    pages: 22,
    sizeKb: 1800,
    pinned: false,
    summary: 'Revenue, runway and hiring plan. Restricted: never sent to outside AI models.',
    body: PARAGRAPHS.generic,
  },
  {
    id: 'd_retention',
    title: 'Retention analysis Q3',
    kind: 'sheet',
    collectionId: 'c_board',
    ownerId: 'p_kwame',
    sensitivity: 'confidential',
    updatedAt: now - 9 * DAY,
    pages: 5,
    sizeKb: 150,
    pinned: false,
    summary: 'Teams that record their first meeting in week one retain twice as well.',
    body: PARAGRAPHS.generic,
  },
  {
    id: 'd_onboarding',
    title: 'New hire onboarding checklist',
    kind: 'pdf',
    collectionId: 'c_handbook',
    ownerId: 'p_kwame',
    sensitivity: 'internal',
    updatedAt: now - 12 * DAY,
    pages: 7,
    sizeKb: 96,
    pinned: false,
    summary: 'Accounts, tools and the people to meet in week one.',
    body: PARAGRAPHS.generic,
  },
  {
    id: 'd_brand',
    title: 'Brand voice guide',
    kind: 'pdf',
    collectionId: 'c_handbook',
    ownerId: 'p_sofia',
    sensitivity: 'public',
    updatedAt: now - 20 * DAY,
    pages: 16,
    sizeKb: 2400,
    pinned: false,
    summary: 'Plain words, short sentences, no exclamation marks.',
    body: PARAGRAPHS.generic,
  },
  {
    id: 'd_holidays',
    title: 'Holiday calendar 2026',
    kind: 'pdf',
    collectionId: 'c_handbook',
    ownerId: 'p_kwame',
    sensitivity: 'public',
    updatedAt: now - 40 * DAY,
    pages: 2,
    sizeKb: 40,
    pinned: false,
    summary: 'Public holidays for Lagos, London and Berlin.',
    body: PARAGRAPHS.generic,
  },
];

const WEEKLY_TRANSCRIPT: TranscriptLine[] = [
  {
    at: 12,
    speakerId: 'p_amaka',
    text: 'Let’s start with the launch. Where are we on the design partners?',
  },
  {
    at: 31,
    speakerId: 'p_ada',
    text: 'Four of five have signed. The fifth wants an answer on data residency first.',
  },
  {
    at: 58,
    speakerId: 'p_tunde',
    text: 'Audio and transcripts stay in London. I can put that in writing for them this week.',
  },
  {
    at: 96,
    speakerId: 'p_sofia',
    text: 'On the app, the Ask composer is ready for review. I’d like ten minutes with the field team.',
  },
  {
    at: 140,
    speakerId: 'p_priya',
    text: 'Two interviews mentioned offline recording again. It’s the most common request.',
  },
  {
    at: 188,
    speakerId: 'p_amaka',
    text: 'Then offline recording is a launch requirement, not a nice-to-have.',
  },
  {
    at: 230,
    speakerId: 'p_tunde',
    text: 'Agreed. It means queueing uploads on the device. Two weeks of work.',
  },
  {
    at: 268,
    speakerId: 'p_ada',
    text: 'I’ll update the launch plan and flag the risk in the board update.',
  },
];

export const MEETINGS: Meeting[] = [
  {
    id: 'm_weekly',
    title: 'Weekly product sync',
    startedAt: earlierToday(3),
    durationSec: 42 * 60,
    participantIds: ['p_amaka', 'p_ada', 'p_tunde', 'p_sofia', 'p_priya'],
    status: { state: 'ready' },
    pinned: true,
    summary: [
      'Four of five Lagos design partners have signed; the fifth is waiting on data residency.',
      'Audio and transcripts stay in London; Tunde will confirm in writing.',
      'Offline recording is now a launch requirement (about two weeks of work).',
    ],
    chapters: [
      { at: 0, title: 'Launch status' },
      { at: 96, title: 'Ask composer review' },
      { at: 140, title: 'Offline recording' },
      { at: 268, title: 'Next steps' },
    ],
    transcript: WEEKLY_TRANSCRIPT,
  },
  {
    id: 'm_crit',
    title: 'Design crit: Ask composer',
    startedAt: earlierToday(1.5),
    durationSec: 28 * 60,
    participantIds: ['p_sofia', 'p_ada', 'p_tunde'],
    status: { state: 'ready' },
    pinned: false,
    summary: [
      'Scope chips move above the composer.',
      'Send stays in thumb reach on every screen size.',
    ],
    chapters: [
      { at: 0, title: 'Walkthrough' },
      { at: 600, title: 'Open questions' },
    ],
    transcript: WEEKLY_TRANSCRIPT.slice(3, 6),
  },
  {
    id: 'm_pricing',
    title: 'Pricing workshop',
    startedAt: now - 1 * DAY,
    durationSec: 55 * 60,
    participantIds: ['p_jonas', 'p_ada', 'p_amaka', 'p_kwame'],
    status: { state: 'processing', step: 'Transcribing', progress: 0.64 },
    pinned: false,
    summary: [],
    chapters: [],
    transcript: [],
  },
  {
    id: 'm_standup',
    title: 'Engineering standup',
    startedAt: now - 40 * MIN,
    durationSec: 14 * 60,
    participantIds: ['p_tunde', 'p_ada'],
    status: { state: 'processing', step: 'Finding speakers', progress: 0.3 },
    pinned: false,
    summary: [],
    chapters: [],
    transcript: [],
  },
  {
    id: 'm_customer',
    title: 'Customer call: Bluebird Clinics',
    startedAt: now - 2 * DAY,
    durationSec: 37 * 60,
    participantIds: ['p_jonas', 'p_ada'],
    status: { state: 'ready' },
    pinned: false,
    summary: ['They need audit logs before rollout.', 'Pilot with two clinics in November.'],
    chapters: [
      { at: 0, title: 'Introductions' },
      { at: 420, title: 'Requirements' },
    ],
    transcript: WEEKLY_TRANSCRIPT.slice(0, 3),
  },
  {
    id: 'm_interview',
    title: 'Field interview #7',
    startedAt: now - 3 * DAY,
    durationSec: 34 * 60,
    participantIds: ['p_priya', 'p_ada'],
    status: { state: 'ready' },
    pinned: false,
    summary: ['Signal drops in the field; recordings must survive it.'],
    chapters: [
      { at: 0, title: 'Their day' },
      { at: 900, title: 'Pain points' },
    ],
    transcript: WEEKLY_TRANSCRIPT.slice(4, 7),
  },
  {
    id: 'm_allhands',
    title: 'All-hands, September',
    startedAt: now - 8 * DAY,
    durationSec: 61 * 60,
    participantIds: ['p_amaka', 'p_ada', 'p_tunde', 'p_sofia', 'p_jonas', 'p_priya', 'p_kwame'],
    status: { state: 'ready' },
    pinned: false,
    summary: ['Revenue up 18% on last quarter.', 'Hiring two engineers and a designer.'],
    chapters: [
      { at: 0, title: 'Numbers' },
      { at: 1500, title: 'Hiring' },
      { at: 2700, title: 'Q&A' },
    ],
    transcript: WEEKLY_TRANSCRIPT,
  },
];

export const ACTION_ITEMS: ActionItem[] = [
  {
    id: 'a_tiers',
    text: 'Send revised pricing tiers to Jonas',
    meetingId: 'm_pricing',
    ownerId: 'p_ada',
    due: dayAt(2, 17),
    done: false,
  },
  {
    id: 'a_plan',
    text: 'Update the launch plan with the offline recording risk',
    meetingId: 'm_weekly',
    ownerId: 'p_ada',
    due: dayAt(0, 17),
    done: false,
  },
  {
    id: 'a_notes',
    text: 'Share interview notes with design',
    meetingId: 'm_interview',
    ownerId: 'p_ada',
    due: null,
    done: false,
  },
  {
    id: 'a_api',
    text: 'Review the API deprecation timeline',
    meetingId: 'm_weekly',
    ownerId: 'p_ada',
    due: dayAt(4, 12),
    done: false,
  },
  {
    id: 'a_venue',
    text: 'Book a venue for the offsite',
    meetingId: 'm_allhands',
    ownerId: 'p_ada',
    due: null,
    done: true,
  },
];

export const THREADS: Thread[] = [
  {
    id: 't_risks',
    title: 'Risks for the Lagos launch',
    updatedAt: now - 25 * MIN,
    scope: 'All sources',
    messages: [
      { role: 'user', text: 'What risks did we flag for the Lagos launch?', at: now - 26 * MIN },
      {
        role: 'assistant',
        at: now - 25 * MIN,
        text: 'Three risks are on record. Connectivity on field visits, so recording has to work offline and upload later [1][2]. Data residency questions from health partners; the team confirmed audio and transcripts stay in London [2]. And pricing in naira, where exchange-rate changes still need a policy [1].',
        citations: [
          { kind: 'doc', id: 'd_launch', page: 3 },
          { kind: 'meeting', id: 'm_weekly', at: 58 },
        ],
      },
    ],
  },
  {
    id: 't_pricing',
    title: 'The pricing decision',
    updatedAt: now - 1 * DAY,
    scope: 'Product',
    messages: [
      { role: 'user', text: 'Summarise the pricing decision.', at: now - 1 * DAY },
      {
        role: 'assistant',
        at: now - 1 * DAY,
        text: 'The free tier stays at three members, private AI moves into Team, and Business is priced per seat with an annual discount [1]. Whether BYOK customers pay less is still open [1].',
        citations: [{ kind: 'doc', id: 'd_pricing', page: 1 }],
      },
    ],
  },
  {
    id: 't_security',
    title: 'Encryption at rest',
    updatedAt: now - 3 * DAY,
    scope: 'Customers',
    messages: [
      { role: 'user', text: 'Do we encrypt customer data at rest?', at: now - 3 * DAY },
      {
        role: 'assistant',
        at: now - 3 * DAY,
        text: 'Yes. Files, audio and transcripts are encrypted at rest and in transit, and stored in London [1].',
        citations: [{ kind: 'doc', id: 'd_security', page: 2 }],
      },
    ],
  },
  {
    id: 't_onboarding',
    title: 'Week one for new hires',
    updatedAt: now - 9 * DAY,
    scope: 'Handbook',
    messages: [
      { role: 'user', text: 'What does a new hire need in week one?', at: now - 9 * DAY },
      {
        role: 'assistant',
        at: now - 9 * DAY,
        text: 'Accounts for email, chat and Sotto on day one, a laptop set up by Operations, and introductions to their manager and a buddy [1].',
        citations: [{ kind: 'doc', id: 'd_onboarding', page: 1 }],
      },
    ],
  },
];

export const WEEK_STATS = {
  week: { meetings: 7, hours: 5.2, questions: 23 },
  month: { meetings: 26, hours: 19.5, questions: 88 },
  year: null,
} as const;

export function personById(id: string): Person | undefined {
  return PEOPLE.find((p) => p.id === id);
}
