import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { standInAskRoute } from '../src/stories/ask-fixtures';
import { STAND_IN_FILES, standInFileRoute } from '../src/stories/file-fixtures';

/**
 * The app shell against brief §9: tabs keep their stacks, screens push and pop, the + sheet
 * opens, the palette works with the keyboard, every main screen passes axe, and every control
 * on a phone is a 44 px target.
 */

const SCREENS = [
  '/home',
  '/docs',
  '/docs/f_launch',
  '/ask',
  '/ask/c_risks',
  '/meetings',
  '/meetings/f_crit',
  '/profile',
  '/profile/appearance',
];

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

async function standInApi(page: Page) {
  for (const [path, body] of Object.entries(STAND_IN)) {
    await page.route(`**/api/v1/${path}`, (route) => route.fulfill({ json: body }));
  }
  // Files, meetings, chats and search: the shared stand-in library (src/stories/*-fixtures).
  const standInRoute = (url: URL) => standInAskRoute(url, STAND_IN_FILES) ?? standInFileRoute(url);
  await page.route(
    (url) => standInRoute(url) !== undefined,
    (route) => {
      const answer = standInRoute(new URL(route.request().url()))!;
      return route.fulfill({ status: answer.status, json: answer.json });
    },
  );
}

async function open(page: Page, path: string) {
  await standInApi(page);
  await page
    .context()
    .addCookies([
      { name: 'sotto.session_token', value: 'e2e-shell', url: 'http://localhost:3000' },
    ]);
  await page.goto(path);
  // Instant sample data, so tests never wait on the simulated latency.
  await page.evaluate(() =>
    localStorage.setItem(
      'sotto.dev.sample',
      JSON.stringify({ latency: 'instant', state: 'normal' }),
    ),
  );
  await page.goto(path);
  await page.locator('.tab-root[data-active] .stack-layer').last().waitFor();
}

/** The screen on top of the active tab. */
const top = (page: Page) => page.locator('.tab-root[data-active] .stack-layer').last();

test.describe('phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'Phone layout only');

  test('tabs keep their stacks; re-tapping a tab pops to its root', async ({ page }) => {
    await open(page, '/docs');
    await top(page).locator('a[href="/docs/f_launch"]').first().click();
    await expect(page).toHaveURL(/\/docs\/f_launch$/);
    await expect(
      top(page).getByRole('heading', { name: 'Lagos launch plan', level: 1 }),
    ).toBeAttached();

    await page.locator('.tab-bar a[data-tab="home"]').click();
    await expect(page).toHaveURL(/\/home$/);
    await page.locator('.tab-bar a[data-tab="docs"]').click();
    await expect(page).toHaveURL(/\/docs\/f_launch$/);

    await page.locator('.tab-bar a[data-tab="docs"]').click();
    await expect(page).toHaveURL(/\/docs$/);
  });

  test('back returns to the list, and the browser back button agrees', async ({ page }) => {
    await open(page, '/meetings');
    await top(page).locator('a[href="/meetings/f_crit"]').first().click();
    await expect(page).toHaveURL(/\/meetings\/f_crit$/);
    await top(page).locator('[data-back]').click();
    await expect(page).toHaveURL(/\/meetings$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/meetings\/f_crit$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/meetings$/);
  });

  test('the + button opens "Add to Sotto"', async ({ page }) => {
    await open(page, '/home');
    await page.getByRole('button', { name: 'Add to Sotto' }).click();
    const sheet = page.getByRole('dialog', { name: 'Add to Sotto' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: /Upload files/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });

  test('every control is at least 44 px', async ({ page }) => {
    for (const path of SCREENS) {
      await open(page, path);
      const small = await page.evaluate(() => {
        const roots = [
          document.querySelector('.tab-root[data-active] .stack-layer:last-of-type'),
          document.querySelector('.tab-bar'),
        ].filter((r): r is Element => r !== null);
        const out: string[] = [];
        for (const root of roots) {
          for (const el of root.querySelectorAll<HTMLElement>(
            'a[href], button, [role="button"], [role="radio"], [role="switch"], summary, label',
          )) {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (!r.width || cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue;
            if (Number(cs.opacity) === 0) continue;
            // A transparent ::before can extend a small visual to a full hit area.
            const before = getComputedStyle(el, '::before');
            const extended = before.content !== 'none' && before.position === 'absolute';
            const w = extended
              ? r.width - parseFloat(before.left) - parseFloat(before.right)
              : r.width;
            const h = extended
              ? r.height - parseFloat(before.top) - parseFloat(before.bottom)
              : r.height;
            if (el.tagName === 'LABEL' && !el.querySelector('input')) continue;
            if (w < 43.5 || h < 43.5)
              out.push(`${el.outerHTML.slice(0, 80)} ${Math.round(w)}×${Math.round(h)}`);
          }
        }
        return out;
      });
      expect(small, path).toEqual([]);
    }
  });
});

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop layout only');

  test('⌘K finds a document and opens it beside the list', async ({ page }) => {
    await open(page, '/home');
    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog', { name: 'Search and commands' });
    await expect(palette).toBeVisible();
    await page.keyboard.type('pricing');
    await expect(palette.locator('[cmdk-item][aria-selected="true"]')).toContainText(
      'Pricing review notes',
    );
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/docs\/f_pricing$/);
    await expect(palette).toBeHidden();
  });

  test('keyboard shortcuts: ? for the sheet, G then M for Meetings', async ({ page }) => {
    await open(page, '/home');
    await page.keyboard.press('Shift+Slash');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('g');
    await page.keyboard.press('m');
    await expect(page).toHaveURL(/\/meetings$/);
  });
});

test('a citation opens its source at the cited page, with the passage marked', async ({ page }) => {
  await open(page, '/ask/c_risks');
  const answer = page.getByRole('article', { name: 'Answer' }).last();
  await expect(answer.getByText('Private · Ollama (in your cluster)')).toBeVisible();
  await answer
    .getByRole('link', { name: /^Source 1: Lagos launch plan, page 3/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/doc\/f_launch\?page=3&hl=/);
  await expect(top(page).getByRole('heading', { name: 'Lagos launch plan' }).first()).toBeVisible();
  // Back returns to the answer.
  await page.goBack();
  await expect(page).toHaveURL(/\/ask\/c_risks$/);
});

test('a meeting citation opens the meeting at its moment', async ({ page }) => {
  await open(page, '/ask/c_risks');
  await page
    .getByRole('article', { name: 'Answer' })
    .last()
    .getByRole('link', { name: /^Source 2: Weekly product sync, 3:08/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/meeting\/f_weekly\?t=188&play=1/);
});

test('main screens pass axe (WCAG 2.1 AA)', async ({ page }) => {
  for (const path of SCREENS) {
    await open(page, path);
    await page.waitForTimeout(400);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // Hidden tabs and covered screens stay in the DOM, skipped by content-visibility.
      .include('.tab-root[data-active] .stack-layer:last-of-type')
      .analyze();
    expect(
      results.violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
      ),
      path,
    ).toEqual([]);
  }
});
