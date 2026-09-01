// AuthGuard — protects dashboard pages, shows sign-in prompt for unauthenticated users
'use client';

import { ReactNode } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useSIWE } from '@/hooks/useSIWE';

export default function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isConnected, loading, signing, signIn } = useSIWE();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'grid',
        placeContent: 'center',
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        fontFamily: 'var(--font-body)',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 24,
            marginBottom: 8,
          }}>Loading…</div>
        </div>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'grid',
        placeContent: 'center',
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        fontFamily: 'var(--font-body)',
        padding: 24,
      }}>
        <div style={{
          textAlign: 'center',
          maxWidth: 420,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-divider)',
          borderRadius: 'var(--radius-lg)',
          padding: 'clamp(32px, 5vw, 48px)',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9.5px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--color-accent-700)',
            marginBottom: 12,
          }}>Authentication required</div>

          <h1 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 32,
            fontWeight: 400,
            letterSpacing: '-0.02em',
            margin: '0 0 12px',
          }}>Connect your wallet</h1>

          <p style={{
            fontSize: 14,
            color: 'var(--color-neutral-700)',
            lineHeight: 1.6,
            marginBottom: 28,
          }}>
            Prowl uses your Base wallet for authentication.
            Connect and sign a message to prove ownership — no password needed.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <ConnectButton />
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'grid',
        placeContent: 'center',
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        fontFamily: 'var(--font-body)',
        padding: 24,
      }}>
        <div style={{
          textAlign: 'center',
          maxWidth: 420,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-divider)',
          borderRadius: 'var(--radius-lg)',
          padding: 'clamp(32px, 5vw, 48px)',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '9.5px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--color-accent-700)',
            marginBottom: 12,
          }}>Wallet connected</div>

          <h1 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 32,
            fontWeight: 400,
            letterSpacing: '-0.02em',
            margin: '0 0 12px',
          }}>Sign in to Prowl</h1>

          <p style={{
            fontSize: 14,
            color: 'var(--color-neutral-700)',
            lineHeight: 1.6,
            marginBottom: 28,
          }}>
            Sign a message with your wallet to verify ownership.
            This doesn&apos;t cost any gas.
          </p>

          <button
            onClick={signIn}
            disabled={signing}
            style={{
              padding: '12px 32px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-text)',
              color: 'var(--color-bg)',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              border: 'none',
              cursor: signing ? 'wait' : 'pointer',
              opacity: signing ? 0.6 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            {signing ? 'Check your wallet…' : 'Sign in'}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
