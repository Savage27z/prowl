// Agents layout — auth-protected
'use client';

import { ReactNode } from 'react';
import AuthGuard from '@/components/AuthGuard';

export default function AgentsLayout({ children }: { children: ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
