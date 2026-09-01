'use client';

import { useState, useEffect } from 'react';
import DashboardShell from '@/components/DashboardShell';

interface Payout {
  case_id: string;
  recipient: string;
  amount: number;
  released: string;
  tx: string;
}

export default function Payouts() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Pull solved cases and derive payouts from them
        const res = await fetch('/api/investigate');
        if (res.ok) {
          const data = await res.json();
          const solved = (data.cases || []).filter((c: Record<string, unknown>) => c.status === 'solved');
          setPayouts(solved.map((c: Record<string, unknown>) => ({
            case_id: c.case_id as string,
            recipient: (c.victim_wallet as string)?.slice(0, 6) + '…' + (c.victim_wallet as string)?.slice(-4),
            amount: parseFloat(((c.reward as string) || '0').replace(/[^\d.]/g, '')) || 0,
            released: new Date(c.solved_at as string || c.created_at as string).toLocaleDateString(),
            tx: '—',
          })));
        }
      } catch { /* api unavailable */ }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <DashboardShell>
      <h1 style={{ fontSize: 'clamp(34px, 3.4vw, 46px)', fontWeight: 400, letterSpacing: '-0.02em', margin: 0, fontFamily: 'var(--font-heading)' }}>
        Payouts
      </h1>
      <p style={{ fontSize: 14, color: 'var(--color-neutral-700)', marginTop: 8, marginBottom: 'var(--space-6)' }}>
        Escrow releases on Base Sepolia. Testnet funds only.
      </p>

      {/* Table header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '100px 1fr 100px 120px 120px',
        gap: 'var(--space-3)', padding: '0 0 var(--space-3) 0',
        borderBottom: '1px solid var(--color-divider)',
        fontFamily: 'var(--font-mono)', fontSize: '9.5px',
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'var(--color-neutral-600)',
      }}>
        <span>Case</span>
        <span>Recipient</span>
        <span>Amount</span>
        <span>Released</span>
        <span>TX</span>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-neutral-600)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          Loading payouts…
        </div>
      ) : payouts.length === 0 ? (
        <div style={{
          borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-divider)',
          background: 'var(--color-neutral-100)', padding: 'clamp(40px, 5vw, 80px)',
          textAlign: 'center', marginTop: 'var(--space-4)',
        }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, marginBottom: 8 }}>No payouts yet</div>
          <p style={{ fontSize: 13, color: 'var(--color-neutral-600)', maxWidth: '36ch', margin: '0 auto' }}>
            Payouts appear here when cases are solved and escrow is released.
          </p>
        </div>
      ) : (
        payouts.map((p, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '100px 1fr 100px 120px 120px',
            gap: 'var(--space-3)', padding: 'var(--space-3) 0',
            borderBottom: '1px solid var(--color-divider)',
            alignItems: 'center',
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-accent-700)' }}>{p.case_id}</span>
            <span style={{ fontSize: 13 }}>{p.recipient}</span>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{p.amount.toLocaleString()}</span>
            <span style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>{p.released}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-accent-700)' }}>{p.tx}</span>
          </div>
        ))
      )}
    </DashboardShell>
  );
}
