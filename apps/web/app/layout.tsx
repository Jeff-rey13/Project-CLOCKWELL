import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { PRODUCT_NAME } from '@app/shared';
import { AppUpdate } from '@/components/AppUpdate';
import { ToastProvider } from '@/components/ui/Toast';
import { QueryProvider } from '@/lib/query-provider';
import { SessionProvider } from '@/lib/session';
import './globals.css';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: 'Attendance, leave and claims',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: PRODUCT_NAME, statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f4f5' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0c' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <ToastProvider>
          <QueryProvider>
            <SessionProvider>
              <AppUpdate />
              {children}
            </SessionProvider>
          </QueryProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
