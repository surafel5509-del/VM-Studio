import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'FRAMEFORGE STUDIO — Create Without Limits',
  description: 'AI-powered video editing, motion graphics & creative production platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[--color-ink-950] text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
