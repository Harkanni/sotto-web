import { defineConfig } from '@playwright/test';

// Every Storybook story, in light and dark: renders without errors and passes axe.
// Runs against the static build: `pnpm build-storybook && pnpm test:stories`.
// STORIES_PORT moves the server off 6006, so two runs can share a machine.
const port = Number(process.env.STORIES_PORT ?? 6006);

export default defineConfig({
  testDir: 'e2e-stories',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  // Each test opens a fresh context, so the first story in every worker starts a cold browser
  // and compiles Storybook's ~2 MB of scripts. On CI, beside the end-to-end tests' own browsers,
  // a few of those first stories took over the default 30 s (flaky, passed on retry).
  timeout: process.env.CI ? 60_000 : 30_000,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `python3 -m http.server ${port} --directory storybook-static`,
    url: `http://localhost:${port}/iframe.html`,
    reuseExistingServer: !process.env.CI,
    // http.server logs every request to stderr: thousands of lines per run that buried the
    // build log. A failing story reports its own 4xx responses.
    stderr: 'ignore',
  },
});
