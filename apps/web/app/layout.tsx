import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { PRODUCT_NAME } from '@app/shared';
import { ToastProvider } from '@/components/ui/Toast';
import { SessionProvider } from '@/lib/session';
import './globals.css';

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: 'Attendance, leave and claims',
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
          <SessionProvider>{children}</SessionProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
