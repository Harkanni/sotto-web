import { defineConfig, devices } from '@playwright/test';

// Runs against the production build. The API isn't running in this job, so the page must show
// a graceful "unreachable" state rather than crash.
// WEB_PORT moves the app off 3000 so several CI builds can share a host (Jenkins slots).
const port = Number(process.env.WEB_PORT ?? 3000);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    // A machine without Playwright's own browsers (the agent sandbox) points at its Chromium.
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    // iPhone viewport, touch and mobile UA, rendered by Chromium (WebKit's CI deps are slow and
    // flaky to install). Safari-specific checks get their own job later.
    { name: 'iphone', use: { ...devices['iPhone 15'], browserName: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // The standalone server, as in the image (`next start` doesn't support standalone output).
    command: `sh scripts/serve-standalone.sh ${port}`,
    url: `http://localhost:${port}/healthz`,
    reuseExistingServer: !process.env.CI,
    env: { API_URL: 'http://127.0.0.1:9' },
  },
});
