import { defineConfig } from '@playwright/test';

// Every Storybook story, in light and dark: renders without errors and passes axe.
// Runs against the static build: `pnpm build-storybook && pnpm test:stories`.
// STORIES_PORT moves the server off 6006 so several CI builds can share a host.
const port = Number(process.env.STORIES_PORT ?? 6006);

export default defineConfig({
  testDir: 'e2e-stories',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
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
  },
});
