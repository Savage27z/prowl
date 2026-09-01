// Memory layout — auth-protected
'use client';

import { ReactNode } from 'react';
import AuthGuard from '@/components/AuthGuard';

export default function MemoryLayout({ children }: { children: ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
