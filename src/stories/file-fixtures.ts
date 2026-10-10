import type { Schemas } from '@/lib/api/client';

/**
 * A stand-in library for Storybook and the shell E2E, which run without the API: a few memos
 * and two meetings in the sample collections, with one transcript and its notes. Plain data with
 * no imports beyond types, so Playwright (Node) and Storybook (browser) can both load it.
 */

type File = Schemas['File'];
const at = '2026-10-01T09:00:00.000Z';

const base = {
  source: 'sample',
  status: 'ready',
  progress: null,
  error: null,
  owner: { id: 'u_ada', name: 'Ada Obi' },
  pinned: false,
  tags: [] as string[],
  access: 'manage',
  createdAt: at,
  updatedAt: at,
  deletedAt: null,
  purgeAt: null,
} satisfies Partial<File>;

const product = { id: 'col_product', name: 'Product', restricted: false };
const customers = { id: 'col_customers', name: 'Customers', restricted: false };

const memo = (id: string, title: string, extra: Partial<File> = {}): File => ({
  ...base,
  id,
  kind: 'document',
  title,
  sensitivity: 'internal',
  collection: product,
  mime: 'text/markdown',
  sizeBytes: 1_400,
  durationMs: null,
  pageCount: null,
  ...extra,
});

const meeting = (id: string, title: string, minutes: number, extra: Partial<File> = {}): File => ({
  ...base,
  id,
  kind: 'audio',
  title,
  sensitivity: 'internal',
  collection: product,
  mime: 'audio/webm',
  sizeBytes: 0,
  durationMs: minutes * 60_000,
  pageCount: null,
  ...extra,
});

export const STAND_IN_FILES: File[] = [
  memo('f_roadmap', 'Q4 roadmap memo', { pinned: true }),
  memo('f_launch', 'Lagos launch plan', { sensitivity: 'confidential' }),
  memo('f_pricing', 'Pricing review notes', { sensitivity: 'confidential' }),
  memo('f_security', 'Security questionnaire answers', {
    collection: customers,
    mime: 'application/pdf',
    pageCount: 4,
  }),
  meeting('f_weekly', 'Weekly product sync', 6, { pinned: true }),
  meeting('f_crit', 'Design crit: Ask composer', 4),
];

export const STAND_IN_TRANSCRIPT: Schemas['Transcript'] = {
  language: 'en',
  engine: 'sample',
  isMock: false,
  matches: null,
  segments: [
    [12_000, 'Amaka', 'Let’s start with the launch. Where are we on the design partners?'],
    [31_000, 'Ada', 'Four of five have signed. The fifth wants an answer on data residency first.'],
    [58_000, 'Tunde', 'Audio and transcripts stay in London. I can put that in writing this week.'],
  ].map(([startMs, speaker, text], idx) => ({
    idx,
    startMs: startMs as number,
    endMs: (startMs as number) + 15_000,
    speaker: speaker as string,
    text: text as string,
  })),
};

export const STAND_IN_INSIGHTS: Schemas['MeetingInsights'] = {
  summary:
    'Four of five Lagos design partners have signed; the fifth is waiting on data residency.',
  decisions: ['Offline recording is a launch requirement.'],
  actionItems: [
    { text: 'Confirm data residency in writing', owner: 'Tunde', due: 'this week', atMs: 58_000 },
  ],
  openQuestions: [],
  chapters: [
    { title: 'Launch status', startMs: 0 },
    { title: 'Next steps', startMs: 58_000 },
  ],
  model: 'sample',
  isMock: false,
  createdAt: at,
};

export const STAND_IN_CONTENT: Schemas['DocumentContent'] = {
  paged: false,
  pages: [{ page: 1, text: '# Q4 roadmap\n\nThis quarter we focus on three outcomes.' }],
};

/** GET /files with its filters applied, the way the API answers. */
export function standInFilePage(url: URL): Schemas['FilePage'] {
  const kind = url.searchParams.get('kind');
  const collection = url.searchParams.get('collection');
  const q = url.searchParams.get('q')?.toLowerCase();
  const trash = url.searchParams.get('trash') === 'true';
  const items = trash
    ? []
    : STAND_IN_FILES.filter(
        (f) =>
          (!kind || f.kind === kind) &&
          (!collection || f.collection?.id === collection) &&
          (!q || f.title.toLowerCase().includes(q)),
      );
  return { items, nextCursor: null };
}

/**
 * The answer for any /api/v1 file route, or undefined when it isn't one. `peaks` and `download`
 * are 404 / 409 like a sample meeting (no audio); `events` has nothing to say.
 */
export function standInFileRoute(url: URL): { status: number; json?: unknown } | undefined {
  const path = url.pathname.replace(/^.*\/api\/v1\//, '');
  if (path === 'files') return { status: 200, json: standInFilePage(url) };
  if (path === 'continue-listening') return { status: 200, json: [] };
  if (path === 'action-items') return { status: 200, json: [] };
  if (path === 'events') return { status: 204 };
  const match = /^files\/([^/]+)(?:\/(\w+))?$/.exec(path);
  if (!match) return undefined;
  const [, id, sub] = match;
  const file = STAND_IN_FILES.find((f) => f.id === id);
  if (!file) return { status: 404, json: { error: { code: 'NOT_FOUND', message: 'Not found' } } };
  if (!sub) return { status: 200, json: file };
  if (sub === 'transcript') return { status: 200, json: STAND_IN_TRANSCRIPT };
  if (sub === 'insights') return { status: 200, json: STAND_IN_INSIGHTS };
  if (sub === 'content') return { status: 200, json: STAND_IN_CONTENT };
  if (sub === 'position') return { status: 204 };
  return { status: 404, json: { error: { code: 'NOT_FOUND', message: 'Not found' } } };
}
