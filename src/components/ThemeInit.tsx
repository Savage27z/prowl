// ThemeInit — reads saved theme from localStorage and applies it on mount
// Placed in root layout so it runs on every page, not just DashboardShell
'use client';

import { useEffect } from 'react';

export default function ThemeInit() {
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pw-theme');
      if (saved === 'light' || saved === 'dark') {
        document.documentElement.setAttribute('data-theme', saved);
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
    } catch { /* localStorage unavailable */ }
  }, []);

  return null;
}
