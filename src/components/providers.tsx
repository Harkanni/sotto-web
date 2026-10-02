'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is fresh for 30 s; switching tabs or screens within that window never refetches.
        staleTime: 30_000,
        // One quiet retry, then the widget shows its error state with a Retry button.
        retry: 1,
        retryDelay: 600,
        // Try the network even when the browser claims to be offline: navigator.onLine is often
        // wrong. A failure then shows the widget's offline state instead of hanging.
        networkMode: 'offlineFirst',
      },
    },
  });
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="sotto.theme"
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
