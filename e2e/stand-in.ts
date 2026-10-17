import { test, type Page } from '@playwright/test';
import { standInAskRoute } from '../src/stories/ask-fixtures';
import { STAND_IN_FILES, standInFileRoute } from '../src/stories/file-fixtures';
import { standInLiveRoute } from '../src/stories/live-fixtures';

/**
 * The shell's own behaviour, independent of accounts: the API isn't running in this job, so a
 * stand-in session cookie gets past the sign-in redirect and the few account endpoints the
 * shell reads answer with a stand-in owner whose workspace loaded the sample content (which is
 * what makes the labelled sample layer show). e2e/accounts.spec.ts covers the real sign-in
 * against a running API.
 */
const SAMPLE = {
  product: 'col_product',
  customers: 'col_customers',
  board: 'col_board',
  handbook: 'col_handbook',
};
const STAND_IN = {
  me: {
    user: {
      id: 'u_e2e',
      email: 'ada@kestrel.test',
      name: 'Ada Obi',
      image: null,
      handedness: 'right',
    },
    workspace: {
      id: 'w_e2e',
      name: 'Kestrel Labs',
      role: 'owner',
      sample: { collections: SAMPLE, filesLoaded: true },
    },
    csrfToken: 'e2e',
  },
  collections: Object.entries({
    col_board: 'Board and finance',
    col_customers: 'Customers',
    col_handbook: 'Handbook',
    col_product: 'Product',
  }).map(([id, name]) => ({
    id,
    name,
    restricted: id === 'col_board',
    access: 'manage',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
  })),
  workspaces: [{ id: 'w_e2e', name: 'Kestrel Labs', role: 'owner', active: true, members: 1 }],
};

export async function standInApi(page: Page) {
  for (const [path, body] of Object.entries(STAND_IN)) {
    await page.route(`**/api/v1/${path}`, (route) => route.fulfill({ json: body }));
  }
  // Files, meetings, chats, search and live calls (none): the shared stand-in library
  // (src/stories/*-fixtures).
  const standInRoute = (url: URL) =>
    standInAskRoute(url, STAND_IN_FILES) ?? standInFileRoute(url) ?? standInLiveRoute(url);
  await page.route(
    (url) => standInRoute(url) !== undefined,
    (route) => {
      const answer = standInRoute(new URL(route.request().url()))!;
      return route.fulfill({ status: answer.status, json: answer.json });
    },
  );
}

/**
 * Opens `path` signed in as the stand-in owner. `routes` adds a test's own stand-ins after the
 * shell's (Playwright tries the newest route first, so they win); `base` opens the app through
 * another address (the Listen e2e's front door).
 */
export async function open(
  page: Page,
  path: string,
  { routes, base }: { routes?: (page: Page) => Promise<void>; base?: string } = {},
) {
  await standInApi(page);
  await routes?.(page);
  const url = base ?? test.info().project.use.baseURL;
  await page.context().addCookies([{ name: 'sotto.session_token', value: 'e2e-shell', url }]);
  await page.goto(base ? new URL(path, base).href : path);
  // Instant sample data, so tests never wait on the simulated latency.
  await page.evaluate(() =>
    localStorage.setItem(
      'sotto.dev.sample',
      JSON.stringify({ latency: 'instant', state: 'normal' }),
    ),
  );
  await page.goto(base ? new URL(path, base).href : path);
  await page.locator('.tab-root[data-active] .stack-layer').last().waitFor();
}

/** The screen on top of the active tab. */
export const top = (page: Page) => page.locator('.tab-root[data-active] .stack-layer').last();
