'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.4" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5 21 21" />
    </svg>
  );
}

const NAV_ITEMS: { label: string; href: string; badge?: string }[] = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Cases', href: '/cases' },
  { label: 'Patterns', href: '/patterns' },
  { label: 'Sibyl Memory', href: '/memory' },
  { label: 'Agents', href: '/agents' },
  { label: 'Payouts', href: '/payouts' },
];

export default function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--color-accent-100, #fff3e4)',
      padding: 'clamp(18px, 3vw, 46px)', fontFamily: 'var(--font-body)',
      color: 'var(--color-text)',
    }}>
      <div style={{
        maxWidth: 1400, margin: '0 auto', display: 'grid',
        gridTemplateColumns: '246px minmax(0, 1fr)',
        borderRadius: 'var(--radius-lg)', background: '#f3f2f2',
        border: '1px solid var(--color-divider)',
        boxShadow: '0 12px 32px color-mix(in srgb, #2d2b2b 22%, transparent)',
        overflow: 'hidden', minHeight: 'calc(100vh - clamp(36px, 6vw, 92px))',
      }}>

        {/* ═══ SIDEBAR ═══ */}
        <aside style={{
          background: 'var(--color-surface, #eae9e9)',
          borderRight: '1px solid var(--color-divider)',
          display: 'flex', flexDirection: 'column',
          padding: 'var(--space-6) var(--space-4)',
        }}>
          {/* Logo */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
            <SearchIcon />
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 17, letterSpacing: '0.2em', textTransform: 'uppercase' }}>Prowl</span>
          </Link>

          {/* Profile */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: 'var(--space-8, 37px)' }}>
            <span style={{
              width: 68, height: 68, borderRadius: 999,
              border: '1px solid var(--color-accent)',
              display: 'grid', placeContent: 'center',
              fontFamily: 'var(--font-heading)', fontSize: 24,
              color: 'var(--color-accent-700)', background: 'var(--color-accent-100)',
            }}>RG</span>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 17, marginTop: 'var(--space-3)' }}>Robert Grant</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-accent-700)', marginTop: 3 }}>Lead investigator</div>
          </div>

          {/* Nav */}
          <nav style={{ marginTop: 'var(--space-8, 37px)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
              return (
                <Link key={item.label} href={item.href} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '9px 10px', borderRadius: 'var(--radius-md)', fontSize: '13.5px',
                  textDecoration: 'none',
                  color: active ? 'var(--color-accent-700)' : 'var(--color-text)',
                  background: active ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'transparent',
                  transition: 'background 0.25s',
                }}>
                  <span>{item.label}</span>
                  {item.badge && (
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '9.5px',
                      color: 'var(--color-accent-700)',
                      border: '1px solid var(--color-accent-300)',
                      borderRadius: 999, padding: '1px 7px',
                    }}>{item.badge}</span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Logout */}
          <div style={{
            marginTop: 'auto', paddingTop: 'var(--space-6)',
            borderTop: '1px solid var(--color-divider)',
            display: 'flex', alignItems: 'center', gap: 9,
            fontSize: '12.5px', color: 'var(--color-neutral-700)',
            cursor: 'pointer',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
            </svg>
            Log out
          </div>
        </aside>

        {/* ═══ MAIN ═══ */}
        <main style={{ padding: 'clamp(22px, 2.4vw, 38px) clamp(22px, 2.6vw, 42px) clamp(26px, 3vw, 42px)' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
