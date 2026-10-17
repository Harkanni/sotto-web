// Smoothness harness: frame timing of the app shell's motion on an emulated iPhone at a CPU
// throttle (4x by default, roughly a mid-range phone). Every step should cost one or two frames
// (≤ 33 ms between frames) and make no network request. The one exception (Phase 4): opening a
// file nobody has opened yet loads its body (pages, transcript), started on pointer-down so the
// push never waits for it; those show in the "body" column and aren't counted against the step.
//
//   pnpm build && pnpm start          # in one terminal (the production build)
//   pnpm smoothness [throttle] [--shots]
//
// Env: BASE_URL (default http://localhost:3000), CHROMIUM_PATH (a local Chromium, optional).
import { chromium, devices } from '@playwright/test';
// Node strips the types on load; the e2e and Storybook use the same stand-in library.
import { standInAskRoute } from '../src/stories/ask-fixtures.ts';
import { STAND_IN_FILES, standInFileRoute } from '../src/stories/file-fixtures.ts';
import { standInLiveRoute } from '../src/stories/live-fixtures.ts';

const args = process.argv.slice(2);
const throttle = Number(args.find((a) => /^\d+$/.test(a)) ?? 4);
const shots = args.includes('--shots');
const base = process.env.BASE_URL ?? 'http://localhost:3000';

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const iphone = { ...devices['iPhone 15'] };
delete iphone.defaultBrowserType;
const ctx = await browser.newContext(iphone);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
const requests = [];
page.on('request', (r) => requests.push(r.url()));
const cdp = await ctx.newCDPSession(page);

// The shell needs a session (Phase 3): a stand-in cookie gets past the sign-in redirect, and
// the account endpoints the shell reads answer with an owner whose workspace has the sample
// content, as in e2e/shell.spec.ts. No API needed.
const sample = {
  product: 'col_product',
  customers: 'col_customers',
  board: 'col_board',
  handbook: 'col_handbook',
};
const standIn = {
  me: {
    user: {
      id: 'u_h',
      email: 'ada@kestrel.test',
      name: 'Ada Obi',
      image: null,
      handedness: 'right',
    },
    workspace: { id: 'w_h', name: 'Kestrel Labs', role: 'owner', sample: { collections: sample } },
    csrfToken: 'harness',
  },
  collections: Object.entries(sample).map(([key, id]) => ({
    id,
    name: key[0].toUpperCase() + key.slice(1),
    restricted: key === 'board',
    access: 'manage',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
  })),
  workspaces: [{ id: 'w_h', name: 'Kestrel Labs', role: 'owner', active: true, members: 1 }],
};
for (const [path, body] of Object.entries(standIn)) {
  await page.route(`**/api/v1/${path}`, (route) => route.fulfill({ json: body }));
}
// Files (Phase 4), chats and search (Phase 5): the stand-in library, answered without an API.
// A call is live (Phase 7), so Home and Meetings show Live now with its breathing dot.
const standInRoute = (url) =>
  standInAskRoute(url, STAND_IN_FILES) ??
  standInFileRoute(url) ??
  standInLiveRoute(url, { live: true });
await page.route(
  (url) => standInRoute(url) !== undefined,
  (route) => {
    const answer = standInRoute(new URL(route.request().url()));
    return route.fulfill({ status: answer.status, json: answer.json });
  },
);
await ctx.addCookies([{ name: 'sotto.session_token', value: 'harness', url: base }]);

await page.goto(`${base}/docs`, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  // The installed app's edge swipe, and instant sample data (latency would hide frame costs).
  localStorage.setItem('sotto.swipe', 'on');
  localStorage.setItem('sotto.dev.sample', JSON.stringify({ latency: 'instant', state: 'normal' }));
});
await page.reload({ waitUntil: 'networkidle' });
// Let the shell wake the other tabs and warm the item screens at idle, as it would while
// someone reads the first screen (SETTLE_MS shortens it, to measure a cold start).
await page.waitForTimeout(Number(process.env.SETTLE_MS ?? 9000));
await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });

await page.evaluate(() => {
  window.__frames = [];
  window.__events = [];
  const loop = (t) => {
    window.__frames.push(t);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  new PerformanceObserver((list) => {
    for (const e of list.getEntries())
      window.__events.push({
        name: e.name,
        duration: e.duration,
        processing: e.processingEnd - e.processingStart,
      });
  }).observe({ type: 'event', durationThreshold: 16, buffered: false });
});

const results = [];
async function measure(label, action, settle = 800) {
  await page.evaluate(() => {
    window.__frames = [];
    window.__events = [];
  });
  const before = requests.length;
  await action();
  await page.waitForTimeout(settle);
  const r = await page.evaluate(() => {
    const f = window.__frames;
    const deltas = f.slice(1).map((t, i) => t - f[i]);
    const input = window.__events.filter((e) =>
      ['click', 'pointerup', 'pointerdown', 'touchend', 'keydown'].includes(e.name),
    );
    return {
      maxDelta: Math.round(Math.max(0, ...deltas)),
      janky: deltas.filter((d) => d > 34).length,
      // The longest input handler (React's render and commit run inside it).
      handler: input.length ? Math.round(Math.max(...input.map((e) => e.processing))) : null,
      path: location.pathname,
    };
  });
  const fetched = requests
    .slice(before)
    .filter((u) => !u.includes('/_next/static/') && !/icon|favicon/.test(u));
  // A screen's body, loaded on intent or as it opens, never awaited by the push: a file's
  // pages or transcript, a live call and its event stream.
  const isBody = (u) =>
    /\/api\/v1\/files\/[^/?]+\/(content|transcript|insights|peaks)$/.test(u) ||
    /\/api\/v1\/live-sessions\/[^/?]+(\/events)?$/.test(u);
  results.push({
    label,
    ...r,
    network: fetched.filter((u) => !isBody(u)).length,
    body: fetched.filter(isBody).length,
  });
  if (shots) await page.screenshot({ path: `smoothness-${label.replace(/\W+/g, '-')}.png` });
}

const docs = '.tab-root[data-tab="docs"] .stack-layer:last-of-type';
async function swipe(fromX, toX, ms) {
  const y = 400;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: fromX, y }],
  });
  const steps = Math.max(2, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const x = fromX + ((toX - fromX) * i) / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

await measure('push a document', () => page.tap(`${docs} a[href="/docs/f_launch"]`));
await measure('back button', () => page.tap(`${docs} [data-back]`));
await measure('push another', () => page.tap(`${docs} a[href="/docs/f_pricing"]`));
await measure('switch to Home (first visit)', () => page.tap('.tab-bar a[data-tab="home"]'));
await measure('switch back to Docs', () => page.tap('.tab-bar a[data-tab="docs"]'));
await measure('re-tap Docs (pop to root)', () => page.tap('.tab-bar a[data-tab="docs"]'));
await measure('push, then browser back', async () => {
  await page.tap(`${docs} a[href="/docs/f_roadmap"]`);
  await page.waitForTimeout(700);
  await page.goBack({ waitUntil: 'commit' });
});
await measure('browser forward', () => page.goForward({ waitUntil: 'commit' }));
await measure('edge swipe back (commit)', () => swipe(6, 260, 220), 900);
await measure('push', () => page.tap(`${docs} a[href="/docs/f_security"]`));
await measure('edge swipe back (cancel)', () => swipe(6, 80, 400), 900);
await measure(
  'back during a push',
  async () => {
    await page.tap(`${docs} [data-back]`);
    await page.waitForTimeout(700);
    await page.tap(`${docs} a[href="/docs/f_launch"]`);
    await page.waitForTimeout(90);
    await page.evaluate(() => history.back());
  },
  1000,
);
// Phase 7: a call is live. Meetings shows it on top (a breathing dot: an opacity loop on the
// compositor), its row opens the live screen, and Home shows it first.
const meetings = '.tab-root[data-tab="meetings"] .stack-layer:last-of-type';
await measure('switch to Meetings (a call live)', () =>
  page.tap('.tab-bar a[data-tab="meetings"]'),
);
await measure('push the live call', () => page.tap(`${meetings} a[data-live]`), 1000);
await measure('back from the live call', () => page.tap(`${meetings} [data-back]`));
await measure('switch to Home (Live now)', () => page.tap('.tab-bar a[data-tab="home"]'));
await browser.close();

console.log(`\nCPU throttle ${throttle}x, iPhone 15 viewport\n`);
console.log('step'.padEnd(32), 'worst frame', ' >2 frames', ' handler', ' network', '   body');
for (const r of results) {
  console.log(
    r.label.padEnd(32),
    `${r.maxDelta} ms`.padStart(11),
    String(r.janky).padStart(10),
    (r.handler === null ? '-' : `${r.handler} ms`).padStart(8),
    String(r.network).padStart(8),
    String(r.body).padStart(7),
  );
}
const slow = results.filter((r) => r.maxDelta > 34 || r.network > 0);
console.log(
  slow.length
    ? `\n${slow.length} step(s) over two frames or touching the network.`
    : '\nEvery step within two frames, with no network requests.',
);
if (errors.length) console.log(`\nErrors:\n${errors.join('\n')}`);
