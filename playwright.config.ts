import { defineConfig, devices } from '@playwright/test';

// Runs against the production build. The API isn't running in this job, so the page must show
// a graceful "unreachable" state rather than crash.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [
    // iPhone viewport, touch and mobile UA, rendered by Chromium (WebKit's CI deps are slow and
    // flaky to install). Safari-specific checks get their own job later.
    { name: 'iphone', use: { ...devices['iPhone 15'], browserName: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm start',
    url: 'http://localhost:3000/healthz',
    reuseExistingServer: !process.env.CI,
    env: { API_URL: 'http://127.0.0.1:9' },
  },
});
