import { defineConfig } from '@playwright/test';

// Every Storybook story, in light and dark: renders without errors and passes axe.
// Runs against the static build: `pnpm build-storybook && pnpm test:stories`.
export default defineConfig({
  testDir: 'e2e-stories',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:6006',
    trace: 'retain-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'python3 -m http.server 6006 --directory storybook-static',
    url: 'http://localhost:6006/iframe.html',
    reuseExistingServer: !process.env.CI,
  },
});
