// Dashboard layout — wraps all /dashboard/* pages with authentication
'use client';

import { ReactNode } from 'react';
import AuthGuard from '@/components/AuthGuard';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
