'use client';

import type { ReactNode } from 'react';
import { AuthGate, AppShell } from '@/components/shell/AppShell';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <AppShell>{children}</AppShell>
    </AuthGate>
  );
}
