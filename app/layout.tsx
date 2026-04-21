import type { Metadata, Viewport } from 'next';
import './globals.css';
import BottomNav from '@/components/layout/BottomNav';
import InstallPrompt from '@/components/InstallPrompt';
import { isAuthenticated } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'FinanceTrack – Loan Manager',
  description: 'Personal loan & daily/weekly collection tracker',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'FinanceTrack',
  },
};

export const viewport: Viewport = {
  themeColor: '#065f46',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authed = await isAuthenticated();

  if (!authed) {
    return (
      <html lang="en">
        <body className="bg-slate-100 min-h-screen">{children}</body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body className="min-h-screen" style={{ background: 'var(--bg)' }}>
        <main className="pb-20 min-h-screen max-w-2xl mx-auto">
          {children}
        </main>
        <BottomNav />
        <InstallPrompt />
      </body>
    </html>
  );
}
