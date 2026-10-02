import { expect, test } from '@playwright/test';

test('the root opens the app', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/home$/);
});

test('status page renders and degrades gracefully without the API', async ({ page }) => {
  await page.goto('/status');
  await expect(page.getByRole('heading', { level: 1, name: 'Building in the open' })).toBeVisible();
  await expect(page.getByText('Not reachable yet')).toBeVisible();
});

test('status rows are comfortable tap targets', async ({ page }) => {
  await page.goto('/status');
  const row = page.getByRole('listitem').first();
  const box = await row.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test('liveness probe answers', async ({ request }) => {
  const response = await request.get('/healthz');
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual({ status: 'ok' });
});

test('security headers are set', async ({ request }) => {
  const response = await request.get('/status');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['x-powered-by']).toBeUndefined();
});
