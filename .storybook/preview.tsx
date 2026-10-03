import { withThemeByDataAttribute } from '@storybook/addon-themes';
import type { Decorator, Preview } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LucideProvider } from 'lucide-react';
import { ThemeProvider } from 'next-themes';
import { setSampleScopeOverride } from '../src/lib/sample/scope';
import { STORY_SAMPLE_SCOPE, seedStoryAccount } from '../src/stories/fixtures';
import '../src/styles/globals.css';

// Storybook has no API: the sample layer shows everything, and each story's cache starts with
// a stand-in account (src/stories/fixtures.ts).
setSampleScopeOverride(STORY_SAMPLE_SCOPE);

function storyClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  seedStoryAccount(client);
  return client;
}

// Each story gets a fresh cache, so one story's sample data never leaks into another.
const withProviders: Decorator = (Story, context) => {
  const theme = (context.globals.theme as string | undefined) ?? 'light';
  return (
    <QueryClientProvider client={storyClient()}>
      {/* Components read the theme through next-themes, forced to the toolbar's choice. */}
      <ThemeProvider attribute="data-theme" forcedTheme={theme} disableTransitionOnChange>
        <LucideProvider strokeWidth={1.75}>
          <Story />
        </LucideProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

const preview: Preview = {
  decorators: [
    withProviders,
    withThemeByDataAttribute({
      themes: { light: 'light', dark: 'dark' },
      defaultTheme: 'light',
      attributeName: 'data-theme',
    }),
  ],
  parameters: {
    layout: 'centered',
    // The sizes Sotto is designed for (brief §9): phone, tablet, desktop.
    viewport: {
      options: {
        iphone15: {
          name: 'iPhone 15',
          styles: { width: '393px', height: '852px' },
          type: 'mobile',
        },
        ipadAir: {
          name: 'iPad Air',
          styles: { width: '820px', height: '1180px' },
          type: 'tablet',
        },
        desktop: {
          name: 'Desktop',
          styles: { width: '1440px', height: '900px' },
          type: 'desktop',
        },
      },
    },
    backgrounds: { disable: true },
    controls: { expanded: true },
    a11y: { test: 'error' },
  },
};

export default preview;
