import type { Schemas } from '@/lib/api/client';

/**
 * Stand-in Listen data for Storybook and the e2e, which run without the API: a call being
 * listened to, its transcript so far and its running notes. The lines are made up, and the
 * session says its transcriber is the mock engine, so the screen labels them "Mock". Plain data
 * with no imports beyond types, so Playwright (Node) and Storybook (browser) can both load it.
 */

type File = Schemas['File'];
type LiveSession = Schemas['LiveSession'];
type LiveSegment = Schemas['LiveSegment'];
type LiveNotes = Schemas['LiveNotes'];

export const STAND_IN_LIVE_ID = 'ls_standin';
export const STAND_IN_LIVE_STARTED = '2026-10-17T08:30:00.000Z';

/** The meeting a capture becomes: a file still arriving, so it's its sender's alone. */
export const STAND_IN_LIVE_FILE: File = {
  id: 'f_live_standin',
  kind: 'audio',
  title: 'Call, 17 Oct 09:30',
  source: 'live',
  status: 'uploading',
  progress: null,
  error: null,
  sensitivity: 'internal',
  collection: null,
  owner: { id: 'u_ada', name: 'Ada Obi' },
  pinned: false,
  tags: [],
  access: 'manage',
  mime: 'audio/wav',
  sizeBytes: 0,
  durationMs: 0,
  pageCount: null,
  createdAt: STAND_IN_LIVE_STARTED,
  updatedAt: STAND_IN_LIVE_STARTED,
  deletedAt: null,
  purgeAt: null,
};

/** What the stand-in call "says", one line per ~4 s piece of audio, round and round. */
export const STAND_IN_LIVE_LINES: readonly string[] = [
  'Morning, everyone. Let’s keep this one to twenty minutes.',
  'First, the Lagos pilot: four partners are live and one is waiting on a contract.',
  'The contract is with legal, and I expect it back on Thursday.',
  'Good. Next, the offline recorder. Field teams keep losing signal.',
  'We could keep the audio on the phone and send it once they’re back online.',
  'That works. Tunde, can you write that up by Friday?',
  'Yes, I’ll have a draft by Friday.',
  'Last thing: the November board pack needs the pilot numbers.',
  'I’ll pull them from the dashboard straight after this call.',
  'Great. Anything else? No? Thanks, everyone.',
];

/** The transcript after `count` pieces of audio: a line per piece, timed like the real thing. */
export function standInSegments(count: number, pieceMs = 4_000): LiveSegment[] {
  return Array.from({ length: count }, (_, seq) => ({
    id: `${seq}.0`,
    seq,
    idx: 0,
    startMs: seq * pieceMs,
    endMs: (seq + 1) * pieceMs - 200,
    text: STAND_IN_LIVE_LINES[seq % STAND_IN_LIVE_LINES.length]!,
    speaker: null,
  }));
}

export const STAND_IN_LIVE_NOTES: LiveNotes = {
  summary: 'A short sync on the Lagos pilot, the offline recorder and the board pack.',
  points: [
    'Four Lagos partners are live; the fifth contract is with legal, back on Thursday.',
    'Field teams lose signal: keep audio on the phone and send it when they’re back online.',
  ],
  actions: [
    { text: 'Write up the offline recorder', owner: 'Tunde' },
    { text: 'Pull the pilot numbers for the board pack', owner: null },
  ],
  routeLabel: 'Private · Stand-in model (in your cluster)',
  isMock: true,
  private: true,
};

/** A call this person is listening to, with `patch` on top. */
export function standInLiveSession(patch: Partial<LiveSession> = {}): LiveSession {
  return {
    id: STAND_IN_LIVE_ID,
    source: 'listen',
    status: 'live',
    inputs: ['mic'],
    durationMs: 0,
    nextSeq: 0,
    startedAt: STAND_IN_LIVE_STARTED,
    endedAt: null,
    startedBy: { id: 'u_ada', name: 'Ada Obi' },
    canControl: true,
    transcriber: { engine: 'mock', isMock: true },
    notes: null,
    notesAt: null,
    notesError: null,
    error: null,
    file: STAND_IN_LIVE_FILE,
    ...patch,
  };
}

/**
 * The answer for the live routes the shell reads on every screen (Home and Meetings ask what's
 * live now): nothing is, unless a test says otherwise. Undefined for anything else.
 */
export function standInLiveRoute(url: URL): { status: number; json?: unknown } | undefined {
  const path = url.pathname.replace(/^.*\/api\/v1\//, '');
  if (path === 'live-sessions') return { status: 200, json: { items: [] } };
  return undefined;
}
