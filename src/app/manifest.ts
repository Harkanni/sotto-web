import type { MetadataRoute } from 'next';

// Installable PWA (brief §9). Icons are generated from assets/brand by `pnpm generate:assets`.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Sotto',
    short_name: 'Sotto',
    description: 'Private AI for your team’s memos and meetings.',
    start_url: '/home',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#F2F2F7',
    theme_color: '#F2F2F7',
    categories: ['productivity', 'business'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Ask', url: '/ask', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      {
        name: 'Meetings',
        url: '/meetings',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
