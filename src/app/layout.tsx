import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Providers } from '@/components/providers';
import { BOOT_SCRIPT } from '@/lib/prefs/boot-script';
import { startupImages } from '@/lib/pwa/splash';
import '@/styles/globals.css';

// Apple devices render SF through -apple-system; everyone else gets Inter (brief §8). Inter is
// self-hosted (a Latin subset of the variable font, OFL). It isn't preloaded: Apple devices
// never request it, and swap keeps text visible on the rest while it loads.
const inter = localFont({
  src: './fonts/InterVariable.woff2',
  variable: '--font-inter',
  weight: '100 900',
  display: 'swap',
  preload: false,
  adjustFontFallback: 'Arial',
});

export const metadata: Metadata = {
  title: { default: 'Sotto', template: '%s · Sotto' },
  description: 'Private AI for your team’s memos and meetings.',
  applicationName: 'Sotto',
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: 'Sotto',
    statusBarStyle: 'black-translucent',
    // One per iPhone and iPad size, light and dark (public/splash, from pnpm generate:assets).
    startupImage: startupImages(),
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Android: the keyboard shrinks the layout, so the composer stays above it. iOS ignores this
  // and the composer follows visualViewport instead (src/lib/hooks/use-keyboard-inset.ts).
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f2f7' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Sets platform and handedness before first paint, so nothing jumps. */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
