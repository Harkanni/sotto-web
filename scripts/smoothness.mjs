// Smoothness harness: frame timing of the app shell's motion on an emulated iPhone at a CPU
// throttle (4x by default, roughly a mid-range phone). Every step should cost one or two frames
// (≤ 33 ms between frames) and make no network request.
//
//   pnpm build && pnpm start          # in one terminal (the production build)
//   pnpm smoothness [throttle] [--shots]
//
// Env: BASE_URL (default http://localhost:3000), CHROMIUM_PATH (a local Chromium, optional).
import { chromium, devices } from '@playwright/test';

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

await page.goto(`${base}/docs`, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  // The installed app's edge swipe, and instant sample data (latency would hide frame costs).
  localStorage.setItem('sotto.swipe', 'on');
  localStorage.setItem('sotto.dev.sample', JSON.stringify({ latency: 'instant', state: 'normal' }));
});
await page.reload({ waitUntil: 'networkidle' });
// Let the shell wake the other tabs at idle, as it would while someone reads the first screen.
await page.waitForTimeout(4500);
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
  const network = requests
    .slice(before)
    .filter((u) => !u.includes('/_next/static/') && !/icon|favicon/.test(u));
  results.push({ label, ...r, network: network.length });
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

await measure('push a document', () => page.tap(`${docs} a[href="/docs/d_launch"]`));
await measure('back button', () => page.tap(`${docs} [data-back]`));
await measure('push another', () => page.tap(`${docs} a[href="/docs/d_pricing"]`));
await measure('switch to Home (first visit)', () => page.tap('.tab-bar a[data-tab="home"]'));
await measure('switch back to Docs', () => page.tap('.tab-bar a[data-tab="docs"]'));
await measure('re-tap Docs (pop to root)', () => page.tap('.tab-bar a[data-tab="docs"]'));
await measure('push, then browser back', async () => {
  await page.tap(`${docs} a[href="/docs/d_research"]`);
  await page.waitForTimeout(700);
  await page.goBack({ waitUntil: 'commit' });
});
await measure('browser forward', () => page.goForward({ waitUntil: 'commit' }));
await measure('edge swipe back (commit)', () => swipe(6, 260, 220), 900);
await measure('push', () => page.tap(`${docs} a[href="/docs/d_api"]`));
await measure('edge swipe back (cancel)', () => swipe(6, 80, 400), 900);
await measure(
  'back during a push',
  async () => {
    await page.tap(`${docs} [data-back]`);
    await page.waitForTimeout(700);
    await page.tap(`${docs} a[href="/docs/d_security"]`);
    await page.waitForTimeout(90);
    await page.evaluate(() => history.back());
  },
  1000,
);
await browser.close();

console.log(`\nCPU throttle ${throttle}x, iPhone 15 viewport\n`);
console.log('step'.padEnd(32), 'worst frame', ' >2 frames', ' handler', ' network');
for (const r of results) {
  console.log(
    r.label.padEnd(32),
    `${r.maxDelta} ms`.padStart(11),
    String(r.janky).padStart(10),
    (r.handler === null ? '-' : `${r.handler} ms`).padStart(8),
    String(r.network).padStart(8),
  );
}
const slow = results.filter((r) => r.maxDelta > 34 || r.network > 0);
console.log(
  slow.length
    ? `\n${slow.length} step(s) over two frames or touching the network.`
    : '\nEvery step within two frames, with no network requests.',
);
if (errors.length) console.log(`\nErrors:\n${errors.join('\n')}`);
