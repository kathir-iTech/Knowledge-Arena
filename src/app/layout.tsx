import type { Metadata, Viewport } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import { connection } from 'next/server';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { ClientLayout } from '@/components/ClientLayout';
import { Toaster } from "@/components/ui/toaster"
import { FirebaseClientProvider } from '@/firebase';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Quorena',
  description: 'Turn any lesson into a live quiz. Teachers upload a PDF, students join with a room code, and everyone sees the leaderboard update in real time.',
  applicationName: 'Quorena',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
  },
  appleWebApp: {
    capable: true,
    title: 'Quorena',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#8B1E2A',
};

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const playfairDisplay = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair-display',
  display: 'swap',
});


export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Per-request dynamic rendering (audit Phase 1 — CSP nonce must match the
  // header the middleware injects on the response). connection() forces this
  // layout to render at request time so Next's inline bootstrap/hydration
  // scripts carry the same nonce the CSP header demands. Without this the
  // framework scripts get no nonce and the hardened policy would block them.
  await connection();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={cn("font-body antialiased", inter.variable, playfairDisplay.variable)}>
        <FirebaseClientProvider>
          <AuthProvider>
            <ClientLayout>{children}</ClientLayout>
          </AuthProvider>
        </FirebaseClientProvider>
        <Toaster />
      </body>
    </html>
  );
}
