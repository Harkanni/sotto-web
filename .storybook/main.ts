import type { StorybookConfig } from '@storybook/nextjs-vite';
import { mergeConfig, type UserConfig } from 'vite';

/**
 * Logs that say nothing about Storybook's static build, and buried real problems in CI's log:
 * - MODULE_LEVEL_DIRECTIVE: libraries and our components mark client components with
 *   "use client"; Next needs it, a client-only bundle doesn't. One warning per file (~120).
 * - PLUGIN_TIMINGS: which plugin took how long (react-docgen); not actionable per build.
 */
const QUIET = new Set(['MODULE_LEVEL_DIRECTIVE', 'PLUGIN_TIMINGS']);

const quietBuild: UserConfig = {
  build: {
    // The preview bundle holds every story and axe: a test fixture, never shipped to users, so
    // the 500 kB chunk warning doesn't apply.
    chunkSizeWarningLimit: 4096,
    rolldownOptions: {
      onLog(level, log, handler) {
        if (log.code && QUIET.has(log.code)) return;
        handler(level, log);
      },
    },
  },
};

/**
 * Storybook (brief §8): every component and every state, in light and dark (the toolbar's
 * theme switch sets data-theme, exactly as the app does). `pnpm storybook` to browse,
 * `pnpm test:stories` to check every story renders cleanly and passes axe in both themes.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-themes'],
  framework: { name: '@storybook/nextjs-vite', options: {} },
  staticDirs: [{ from: '../src/app/fonts', to: '/fonts' }],
  core: { disableTelemetry: true },
  viteFinal: (vite) => mergeConfig(vite, quietBuild),
};

export default config;
