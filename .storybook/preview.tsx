import { withThemeByDataAttribute } from '@storybook/addon-themes';
import type { Decorator, Preview } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LucideProvider } from 'lucide-react';
import { ThemeProvider } from 'next-themes';
import '../src/styles/globals.css';

// Each story gets a fresh cache, so one story's sample data never leaks into another.
const withProviders: Decorator = (Story, context) => {
  const theme = (context.globals.theme as string | undefined) ?? 'light';
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 } } })}
    >
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
    backgrounds: { disable: true },
    controls: { expanded: true },
    a11y: { test: 'error' },
  },
};

export default preview;
