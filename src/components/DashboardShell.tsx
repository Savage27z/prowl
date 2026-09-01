// DashboardShell — shared layout wrapper with sidebar navigation
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useState } from 'react';
import { useSIWE } from '@/hooks/useSIWE';

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

function truncateAddress(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

export default function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { session, signOut } = useSIWE();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--color-accent-100)',
      padding: 'clamp(12px, 3vw, 46px)', fontFamily: 'var(--font-body)',
      color: 'var(--color-text)',
    }}>
      {/* Mobile top bar */}
      <div className="pw-mobile-bar" style={{
        display: 'none', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', marginBottom: 12,
        background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-divider)',
      }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit' }}>
          <SearchIcon />
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 15, letterSpacing: '0.2em', textTransform: 'uppercase' }}>Prowl</span>
        </Link>
        <button
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          type="button"
          aria-label="Toggle menu"
          style={{
            width: 36, height: 36, borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-divider)', background: 'var(--color-card)',
            display: 'grid', placeContent: 'center', gap: 4, cursor: 'pointer',
          }}
        >
          <span style={{ display: 'block', width: 14, height: 1.5, background: 'var(--color-text)', borderRadius: 1 }} />
          <span style={{ display: 'block', width: 14, height: 1.5, background: 'var(--color-text)', borderRadius: 1 }} />
        </button>
      </div>

      {/* Mobile nav dropdown */}
      {mobileNavOpen && (
        <div className="pw-mobile-dropdown" style={{
          display: 'none', flexDirection: 'column', gap: 2,
          padding: '8px 12px', marginBottom: 12,
          background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-divider)',
        }}>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link key={item.label} href={item.href} onClick={() => setMobileNavOpen(false)} style={{
                display: 'block', padding: '10px 12px', borderRadius: 'var(--radius-md)',
                fontSize: '13.5px', textDecoration: 'none',
                color: active ? 'var(--color-accent-700)' : 'var(--color-text)',
                background: active ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)' : 'transparent',
              }}>
                {item.label}
              </Link>
            );
          })}
          <button onClick={signOut} type="button" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', fontSize: '12.5px', color: 'var(--color-neutral-700)',
            cursor: 'pointer', background: 'none', border: 'none', font: 'inherit',
            borderTop: '1px solid var(--color-divider)', marginTop: 4, paddingTop: 14,
          }}>
            Sign out
          </button>
        </div>
      )}

      <div className="pw-shell-grid" style={{
        maxWidth: 1400, margin: '0 auto', display: 'grid',
        gridTemplateColumns: '246px minmax(0, 1fr)',
        borderRadius: 'var(--radius-lg)', background: 'var(--color-card)',
        border: '1px solid var(--color-divider)',
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden', minHeight: 'calc(100vh - clamp(36px, 6vw, 92px))',
      }}>

        {/* ═══ SIDEBAR (hidden on mobile) ═══ */}
        <aside className="pw-sidebar" style={{
          background: 'var(--color-surface)',
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
            }}>
              {session ? session.address.slice(2, 4).toUpperCase() : '??'}
            </span>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, marginTop: 'var(--space-3)', letterSpacing: '0.04em' }}>
              {session ? truncateAddress(session.address) : 'Not connected'}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-accent-700)', marginTop: 3 }}>Investigator</div>
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

          {/* Sign out */}
          <button
            onClick={signOut}
            type="button"
            style={{
              marginTop: 'auto',
              borderTop: '1px solid var(--color-divider)',
              display: 'flex', alignItems: 'center', gap: 9,
              fontSize: '12.5px', color: 'var(--color-neutral-700)',
              cursor: 'pointer', background: 'none', border: 'none',
              font: 'inherit', width: '100%', padding: '0',
              paddingBlockStart: 'var(--space-6)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
              <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" />
            </svg>
            Sign out
          </button>
        </aside>

        {/* ═══ MAIN ═══ */}
        <main style={{ padding: 'clamp(16px, 2.4vw, 38px) clamp(16px, 2.6vw, 42px) clamp(20px, 3vw, 42px)' }}>
          {children}
        </main>
      </div>

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          .pw-mobile-bar { display: flex !important; }
          .pw-mobile-dropdown { display: flex !important; }
          .pw-sidebar { display: none !important; }
          .pw-shell-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
