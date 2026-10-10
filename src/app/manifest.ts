import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RPL Compass',
    short_name: 'RPL Compass',
    description:
      'AI-assisted RPL assessment — NSQF matching, per-criterion rubric scoring, live assessor consistency.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#4A0E14',
    theme_color: '#8B1E2A',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}