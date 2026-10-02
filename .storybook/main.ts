import type { StorybookConfig } from '@storybook/nextjs-vite';

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
};

export default config;
