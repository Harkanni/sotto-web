/**
 * The app's navigation model: five tabs, each with its own stack of screens, all encoded in the
 * URL. A path is read left to right into a stack, so a deep link rebuilds the whole stack (back
 * works straight away) and the URL alone decides what is on screen.
 *
 *   /docs                         → [Docs]
 *   /docs/d_42                    → [Docs, Document d_42]           a tab's own items: /<tab>/<id>
 *   /docs/collection/c_1/doc/d_42 → [Docs, Collection c_1, Document d_42]
 *   /home/meeting/m_7             → [Home, Meeting m_7]            any kind can be pushed anywhere
 *   /profile/appearance           → [Profile, Appearance]          named screens
 *
 * Pure and framework-free, so it is unit-tested directly (test/routes.test.ts).
 */

export const TABS = ['home', 'docs', 'ask', 'meetings', 'profile'] as const;
export type Tab = (typeof TABS)[number];

/** Kinds of item screen that can be pushed onto any tab's stack: `/<kind>/<id>`. */
export const ITEM_KINDS = ['doc', 'collection', 'meeting', 'thread'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Named screens, and the tabs they may appear in. */
export const NAMED_SCREENS = {
  account: 'profile',
  appearance: 'profile',
  workspace: 'profile',
  members: 'profile',
  ai: 'profile',
  usage: 'profile',
  audit: 'profile',
  about: 'profile',
  developer: 'profile',
  'widget-states': 'profile',
  components: 'profile',
} as const satisfies Record<string, Tab>;
export type NamedScreen = keyof typeof NAMED_SCREENS;

export type ScreenKind = Tab | ItemKind | NamedScreen | 'not-found';

/**
 * How a screen uses a wide window (≥ 1024 px): `list` screens fill the list pane, `detail`
 * screens the detail pane beside it, and `full` screens take both. On phones every screen is
 * full-width and pushed.
 */
export type PaneRole = 'list' | 'detail' | 'full';

export type StackEntry = {
  /** The path up to and including this screen; unique within the stack. */
  key: string;
  kind: ScreenKind;
  /** The item id for item screens. */
  id?: string;
  role: PaneRole;
};

/** A tab's own item kind: `/docs/<id>` is a document, `/meetings/<id>` a meeting. */
const OWN_KIND: Partial<Record<Tab, ItemKind>> = {
  docs: 'doc',
  meetings: 'meeting',
  ask: 'thread',
};

const ROLE: Record<ScreenKind, PaneRole> = {
  home: 'full',
  docs: 'list',
  ask: 'list',
  meetings: 'list',
  profile: 'list',
  collection: 'list',
  doc: 'detail',
  meeting: 'detail',
  thread: 'detail',
  account: 'detail',
  appearance: 'detail',
  workspace: 'detail',
  members: 'detail',
  ai: 'detail',
  usage: 'detail',
  audit: 'detail',
  about: 'detail',
  developer: 'detail',
  'widget-states': 'detail',
  components: 'detail',
  'not-found': 'detail',
};

/** Default titles. Item screens replace them with the item's name once it loads. */
export const DEFAULT_TITLE: Record<ScreenKind, string> = {
  home: 'Home',
  docs: 'Docs',
  ask: 'Ask',
  meetings: 'Meetings',
  profile: 'Profile',
  collection: 'Collection',
  doc: 'Document',
  meeting: 'Meeting',
  thread: 'Chat',
  account: 'Account',
  appearance: 'Appearance',
  workspace: 'Workspace',
  members: 'Members',
  ai: 'AI settings',
  usage: 'Usage and billing',
  audit: 'Audit log',
  about: 'About',
  developer: 'Developer',
  'widget-states': 'Widget states',
  components: 'Components',
  'not-found': 'Not found',
};

export function isTab(value: string | undefined): value is Tab {
  return value !== undefined && (TABS as readonly string[]).includes(value);
}

function isItemKind(value: string): value is ItemKind {
  return (ITEM_KINDS as readonly string[]).includes(value);
}

function isNamedScreen(value: string): value is NamedScreen {
  return Object.hasOwn(NAMED_SCREENS, value);
}

/** Splits a pathname into clean segments ("/docs/d_1/" → ["docs", "d_1"]). */
function segmentsOf(pathname: string): string[] {
  return pathname
    .split('?')[0]!
    .split('#')[0]!
    .split('/')
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
}

/** The tab a path belongs to, or null for paths outside the app (/status, /sign-in …). */
export function tabOf(pathname: string): Tab | null {
  const first = segmentsOf(pathname)[0];
  return isTab(first) ? first : null;
}

function pathOf(segments: string[]): string {
  return '/' + segments.map(encodeURIComponent).join('/');
}

/**
 * Reads a path into its stack of screens. Anything after the last valid screen becomes a single
 * "not found" screen on top, so a bad link still has a working back button.
 */
export function parseStack(pathname: string): StackEntry[] {
  const segs = segmentsOf(pathname);
  const tab = segs[0];
  if (!isTab(tab)) return [];

  const entries: StackEntry[] = [{ key: `/${tab}`, kind: tab, role: ROLE[tab] }];
  let i = 1;
  while (i < segs.length) {
    const seg = segs[i]!;
    const next = segs[i + 1];
    let kind: ScreenKind;
    let id: string | undefined;
    let consumed: number;

    if (isItemKind(seg) && next !== undefined) {
      kind = seg;
      id = next;
      consumed = 2;
    } else if (isNamedScreen(seg) && NAMED_SCREENS[seg] === tab) {
      kind = seg;
      consumed = 1;
    } else if (i === 1 && OWN_KIND[tab] && !isItemKind(seg) && !isNamedScreen(seg)) {
      kind = OWN_KIND[tab]!;
      id = seg;
      consumed = 1;
    } else {
      entries.push({ key: pathOf(segs), kind: 'not-found', role: ROLE['not-found'] });
      return entries;
    }

    i += consumed;
    entries.push({ key: pathOf(segs.slice(0, i)), kind, id, role: ROLE[kind] });
  }
  return entries;
}

/** The path of the screen below the top one, or null at a tab's root. */
export function parentOf(pathname: string): string | null {
  const stack = parseStack(pathname);
  return stack.length > 1 ? stack[stack.length - 2]!.key : null;
}

/**
 * The path that pushes an item onto the stack at `from`. A tab's own items use the short form
 * at depth one (`/docs/d_1`); everything else uses `/<kind>/<id>`.
 */
export function pushPath(from: string, kind: ItemKind, id: string): string {
  const stack = parseStack(from);
  const top = stack[stack.length - 1];
  const base = top?.key ?? from;
  const tab = tabOf(from);
  if (tab && stack.length === 1 && OWN_KIND[tab] === kind)
    return `${base}/${encodeURIComponent(id)}`;
  return `${base}/${kind}/${encodeURIComponent(id)}`;
}

/** How two stacks relate, which decides the transition between them. */
export type StackChange =
  | { type: 'same' }
  | { type: 'push'; common: number }
  | { type: 'pop'; common: number }
  | { type: 'replace'; common: number };

export function compareStacks(from: StackEntry[], to: StackEntry[]): StackChange {
  let common = 0;
  while (common < from.length && common < to.length && from[common]!.key === to[common]!.key) {
    common++;
  }
  if (common === from.length && common === to.length) return { type: 'same' };
  if (common === from.length) return { type: 'push', common };
  if (common === to.length) return { type: 'pop', common };
  return { type: 'replace', common };
}
