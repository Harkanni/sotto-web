import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { STAND_IN_LIVE_LINES } from '../src/stories/live-fixtures';
import { routeLiveApi, startLiveApi, type LiveApi } from './live-api';
import { open, top } from './stand-in';

/**
 * Listen mode end to end (Phase 7): Chromium's fake microphone feeds the real capture (the
 * AudioWorklet, ~4 s pieces of 16 kHz PCM16, the uploader), a stand-in api answers the Listen
 * routes (e2e/live-api.ts: the page's front door, so the transcript streams), and the person starts
 * listening, watches the transcript arrive, finds the call again from Live now, then stops and
 * lands on the saved meeting.
 */

test.use({
  permissions: ['microphone'],
  launchOptions: {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    // A fake microphone (a tone), and no permission prompt for it.
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
});

let api: LiveApi;
test.beforeEach(async () => {
  api = await startLiveApi(test.info().project.use.baseURL!);
});
test.afterEach(async () => {
  await api.close();
});

test('Listen: start, hear the call live, find it again from Live now, stop and save', async ({
  page,
  isMobile,
}) => {
  test.setTimeout(90_000);
  await open(page, '/meetings', { routes: routeLiveApi, base: api.url });

  // Add → Listen to a call → the consent reminder → Start (microphone only: tab audio needs
  // someone to pick a tab).
  await page.getByRole('button', { name: isMobile ? 'Add to Sotto' : 'New', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Add to Sotto' })
    .getByRole('button', { name: /Listen to a call/ })
    .click();
  const sheet = page.getByRole('dialog', { name: 'Listen to a call' });
  await expect(sheet.getByText('Tell everyone Sotto is listening')).toBeVisible();
  const tabAudio = sheet.getByRole('switch');
  if (await tabAudio.isVisible()) await tabAudio.click();
  await sheet.getByRole('button', { name: 'Start listening' }).click();

  // The live screen: listening, then the first line a few seconds after the first piece.
  await expect(page).toHaveURL(/\/meetings\/live\/ls_e2e$/);
  const title = api.session!.file.title;
  await expect(top(page).getByRole('heading', { name: title, level: 1 })).toBeAttached();
  await expect(top(page).getByText('Listening', { exact: true })).toBeVisible();
  await expect(top(page).getByText(STAND_IN_LIVE_LINES[0]!)).toBeVisible({ timeout: 20_000 });
  await expect(top(page).getByText('Mock', { exact: true })).toBeVisible();
  expect(api.pieces[0], 'a ~4 s piece of 16 kHz PCM16').toBeGreaterThan(3 * 32_000);

  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  // Find the call again: on a phone from Home (Live now, and the strip above the tab bar); on
  // a desktop it's beside the call in Meetings' list.
  if (isMobile) {
    await page.locator('.tab-bar a[data-tab="home"]').click();
    await expect(page).toHaveURL(/\/home$/);
    const row = top(page).getByRole('region', { name: 'Live now' }).getByRole('link');
    await expect(row).toContainText(title);
    await expect(row).toContainText('Listening');
    await expect(page.getByText('· Back to the call')).toBeVisible();
    await row.click();
    await expect(page).toHaveURL(/\/meetings\/live\/ls_e2e$/);
  } else {
    // The active tab's own row (Home renders one too, hidden).
    const row = page.locator('.tab-root[data-active] [data-live="ls_e2e"]');
    await expect(row).toContainText(title);
    await expect(row).toHaveAttribute('aria-current', 'page');
  }

  // A second piece arrives in order, then Stop: the last seconds go up, then End.
  await expect.poll(() => api.pieces.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  await expect(top(page).getByText(STAND_IN_LIVE_LINES[1]!)).toBeVisible();
  await top(page).getByRole('button', { name: 'Stop and save' }).click();

  await expect(page).toHaveURL(/\/meetings\/f_live_e2e$/);
  await expect(top(page).getByRole('heading', { name: title, level: 1 })).toBeAttached();
  await expect(page.getByText(`Saving “${title}”`)).toBeVisible();

  // What the api saw: every piece once, numbered from 0 with no gaps, all before End.
  expect(api.endedAfter).toBe(api.pieces.length);
  expect([...new Set(api.sent)]).toEqual(api.pieces.map((_, seq) => seq));
  for (const bytes of api.pieces) {
    expect(bytes % 2, 'whole 16-bit samples').toBe(0);
    expect(bytes, 'at most 15 s a piece').toBeLessThanOrEqual(15 * 32_000);
  }

  // Ended: nothing is live now.
  if (!isMobile) await expect(page.locator('.tab-root[data-active] [data-live]')).toHaveCount(0);
});
