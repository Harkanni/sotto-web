import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';

/**
 * Phase 3's done-when flow against a real API (PLAN, Milestones row 3): someone signs up, creates
 * a workspace with the sample content and invites a colleague; the colleague accepts by email
 * and can't see the restricted collection until the owner grants it; then they can, read-only.
 * On iPhone and desktop, through the same screens people use, with axe on the account screens.
 *
 * Needs the API (with Postgres and Redis) behind the web app's /api and Mailpit catching email:
 * locally `pnpm dev` here and in sotto-api with Mailpit running, or CI's `accounts` job. Skipped
 * unless ACCOUNTS_E2E=1.
 */

test.skip(!process.env.ACCOUNTS_E2E, 'Needs the API and Mailpit (ACCOUNTS_E2E=1)');
// One story, told in order; each step needs the one before.
test.describe.configure({ mode: 'serial' });

const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025';

type MailpitList = { messages: { ID: string; To: { Address: string }[]; Created: string }[] };

/** The first link in the newest email to `to` since `after` whose URL matches `pattern`. */
async function emailedLink(to: string, after: Date, pattern: RegExp): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/messages`)).json()) as MailpitList;
    for (const message of list.messages) {
      if (!message.To.some((t) => t.Address === to) || new Date(message.Created) < after) continue;
      const { Text } = (await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as {
        Text: string;
      };
      const url = /(https?:\/\/\S+)/.exec(Text)?.[1]?.replace(/[)>\].,]+$/, '');
      if (url && pattern.test(url)) return url;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No email to ${to} with a link matching ${pattern}`);
}

/** Asks for a sign-in link on the sign-in page and follows it from the email. */
async function signInByEmail(page: Page, email: string) {
  const sent = new Date(Date.now() - 1000);
  const field = page.getByLabel('Email', { exact: true });
  await field.fill(email);
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await expect(page.getByText(email).first()).toBeVisible();
  await page.goto(await emailedLink(email, sent, /magic-link/));
}

/** The screen on top of the active tab. */
const top = (page: Page) => page.locator('.tab-root[data-active] .stack-layer').last();

async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: text }).first()).toBeVisible();
}

async function axe(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const violations = results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
  expect(violations, `axe on ${label}`).toEqual([]);
}

/** A browser of its own for each person, sized like this project's device. */
async function newPage(browser: Browser, info: TestInfo): Promise<Page> {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL } = info.project.use;
  const context = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    baseURL,
  });
  return context.newPage();
}

const run = `${Date.now().toString(36)}`;
let owner: Page;
let colleague: Page;
let ownerEmail: string;
let colleagueEmail: string;
let boardHref: string;

test.beforeAll(async ({ browser }, info) => {
  const device = info.project.name;
  ownerEmail = `owner-${device}-${run}@e2e.sotto.test`;
  colleagueEmail = `colleague-${device}-${run}@e2e.sotto.test`;
  owner = await newPage(browser, info);
  colleague = await newPage(browser, info);
});

test.afterAll(async () => {
  await owner?.context().close();
  await colleague?.context().close();
});

test('someone signs up and creates a workspace with sample content', async () => {
  await owner.goto('/home');
  await expect(owner).toHaveURL(/\/sign-in$/);
  await signInByEmail(owner, ownerEmail);

  // New people land in onboarding.
  await expect(owner).toHaveURL(/\/welcome/);
  await owner.getByLabel('Your name').fill('Ada Obi');
  await owner.getByRole('button', { name: 'Continue' }).click();
  await owner.getByLabel('Workspace name').fill('Kestrel Labs');
  await owner.getByRole('button', { name: 'Create workspace' }).click();

  await expect(owner.getByRole('heading', { name: 'Invite your team' })).toBeVisible();
  await owner.getByLabel('Email').fill(colleagueEmail);
  await owner.getByRole('radio', { name: 'Member' }).click();
  await owner.getByRole('button', { name: 'Send invite' }).click();
  await expect(owner.getByRole('list', { name: 'Invites sent' })).toContainText(colleagueEmail);
  await owner.getByRole('button', { name: 'Continue' }).click();

  // Phase 6: where questions are answered. Private needs nothing set up.
  await expect(
    owner.getByRole('heading', { name: 'Where should questions be answered?' }),
  ).toBeVisible();
  await axe(owner, 'onboarding: AI mode');
  await owner.getByRole('button', { name: /Private \(recommended\)/ }).click();

  await owner.getByRole('button', { name: /Explore with sample content/ }).click();
  await expect(owner).toHaveURL(/\/home$/);
  await expect(top(owner).getByText('You’re exploring sample content')).toBeVisible();
});

test('the owner sees the invite waiting and the restricted collection', async () => {
  await owner.goto('/profile/members');
  await expect(top(owner).getByRole('button', { name: new RegExp(colleagueEmail) })).toBeVisible();
  await axe(owner, 'Members');

  await owner.goto('/docs');
  const board = top(owner).getByRole('link', { name: /Board and finance/ });
  await expect(board).toContainText('Restricted');
  boardHref = (await board.getAttribute('href'))!;
  expect(boardHref).toMatch(/\/docs\/collection\/\w+/);
});

test('the colleague accepts the invite by email', async () => {
  await colleague.goto(await emailedLink(colleagueEmail, new Date(0), /\/invite\//));
  await colleague.getByRole('button', { name: 'Sign in to join' }).click();
  await expect(colleague).toHaveURL(/\/sign-in\?/);
  // The invite's address is filled in for them.
  await expect(colleague.getByLabel('Email', { exact: true })).toHaveValue(colleagueEmail);
  const sent = new Date(Date.now() - 1000);
  await colleague.getByRole('button', { name: 'Continue with email' }).click();
  await colleague.goto(await emailedLink(colleagueEmail, sent, /magic-link/));

  await colleague.getByLabel('Your name').fill('Tunde Bakare');
  await colleague.getByRole('button', { name: 'Continue' }).click();
  await colleague.getByRole('button', { name: 'Join Kestrel Labs' }).click();
  await expect(colleague).toHaveURL(/\/home$/);
});

test('a member can’t see the restricted collection, or reach it by link', async () => {
  await colleague.goto('/docs');
  const collections = top(colleague).getByRole('region', { name: 'Collections' });
  await expect(collections.getByRole('link', { name: /Product/ })).toBeVisible();
  await expect(collections.getByRole('link', { name: /Board and finance/ })).toHaveCount(0);

  await colleague.goto(boardHref);
  await expect(top(colleague).getByText('This collection isn’t here')).toBeVisible();

  // Members don't manage people or read the audit log.
  await colleague.goto('/profile');
  await expect(top(colleague).getByRole('link', { name: /Members/ })).toHaveCount(0);
  await expect(top(colleague).getByRole('link', { name: /Audit log/ })).toHaveCount(0);
});

test('the owner grants the colleague access to the restricted collection', async () => {
  await owner.goto(boardHref);
  await top(owner).getByRole('button', { name: 'Collection actions' }).click();
  await owner.getByRole('menuitem', { name: 'Who has access' }).click();
  const sheet = owner.getByRole('dialog');
  await expect(sheet.getByText('Admins and owners')).toBeVisible();
  await axe(owner, 'Who has access');

  await sheet.getByRole('button', { name: 'Add a person' }).click();
  await owner.getByRole('menuitem', { name: /Tunde Bakare/ }).click();
  await expect(sheet.getByText('Tunde Bakare')).toBeVisible();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expectToast(owner, 'Access updated');
});

test('with the grant, the colleague sees the collection, read-only', async () => {
  await colleague.goto('/docs');
  const collections = top(colleague).getByRole('region', { name: 'Collections' });
  await expect(collections.getByRole('link', { name: /Board and finance/ })).toBeVisible();

  await colleague.goto(boardHref);
  await expect(top(colleague).getByText('You can view')).toBeVisible();
  // View access: no rename, no delete, no access list.
  await expect(top(colleague).getByRole('button', { name: 'Collection actions' })).toHaveCount(0);
});

test('the audit log records it all', async () => {
  await owner.goto('/profile/audit');
  const log = top(owner).getByRole('region', { name: 'Audit entries' });
  await expect(log).toContainText(`Invited ${colleagueEmail}`);
  await expect(log).toContainText('Joined as a member');
  await expect(log).toContainText('Board and finance');
  await axe(owner, 'Audit log');
});
