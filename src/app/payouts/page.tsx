// Payouts — investigation fee tracking and release status
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
      let cases: Record<string, unknown>[] = [];
      try {
        const res = await fetch('/api/investigate');
        if (res.ok) {
          const data = await res.json();
          cases = data.cases || [];
        }
      } catch { /* api unavailable */ }

      // Fall back to localStorage on cold start
      if (cases.length === 0) {
        try {
          const raw = localStorage.getItem('prowl-cases');
          if (raw) cases = JSON.parse(raw);
        } catch { /* */ }
      }

      const solved = cases.filter(c => c.status === 'solved');
      setPayouts(solved.map(c => ({
        case_id: c.case_id as string,
        recipient: (c.victim_wallet as string)?.slice(0, 6) + '…' + (c.victim_wallet as string)?.slice(-4),
        amount: parseFloat(((c.reward as string) || '0').replace(/[^\d.]/g, '')) || 0,
        released: new Date(c.solved_at as string || c.created_at as string).toLocaleDateString(),
        tx: '—',
      })));
      setLoading(false);
    })();
  }, []);

  return (
    <DashboardShell>
      <h1 style={{ fontSize: 'clamp(34px, 3.4vw, 46px)', fontWeight: 400, letterSpacing: '-0.02em', margin: 0, fontFamily: 'var(--font-heading)' }}>
        Payouts
      </h1>
      <p style={{ fontSize: 14, color: 'var(--color-neutral-700)', marginTop: 8, marginBottom: 'var(--space-4)' }}>
        Escrow releases on Base Sepolia. 5% protocol fee on solved bounties.
      </p>

      {/* Revenue summary */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 10, marginBottom: 'var(--space-6)',
      }}>
        {[
          { label: 'Total released', value: `${payouts.reduce((s, p) => s + p.amount, 0).toFixed(4)} ETH`, sub: `${payouts.length} payouts` },
          { label: 'Protocol fees', value: `${(payouts.reduce((s, p) => s + p.amount, 0) * 0.05 / 0.95).toFixed(4)} ETH`, sub: '5% per bounty' },
          { label: 'Agent earnings', value: `${payouts.reduce((s, p) => s + p.amount, 0).toFixed(4)} ETH`, sub: '95% to investigators' },
        ].map((stat) => (
          <div key={stat.label} style={{
            borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)',
            background: 'var(--color-card)', padding: 'var(--space-3)',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-neutral-600)', marginBottom: 4 }}>
              {stat.label}
            </div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>
              {stat.value}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-neutral-600)', marginTop: 2 }}>
              {stat.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '100px 1fr 100px 120px 120px', minWidth: 560,
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
            Payouts appear here when investigations are complete and escrow is released.
          </p>
        </div>
      ) : (
        payouts.map((p, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '100px 1fr 100px 120px 120px', minWidth: 560,
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
      </div>
    </DashboardShell>
  );
}
