'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import DashboardShell from '@/components/DashboardShell';

interface CaseData {
  case_id: string;
  victim_wallet: string;
  reward: string;
  status: string;
  created_at: string;
  total_hops_traced: number;
}

function statusStyle(status: string) {
  switch (status) {
    case 'tracing': return { color: 'var(--color-accent-700)', bg: 'var(--color-accent-100)', border: 'var(--color-accent-300)' };
    case 'analysing': return { color: 'var(--color-status-analysing)', bg: 'var(--color-status-analysing-bg)', border: 'var(--color-status-analysing-border)' };
    case 'monitoring': return { color: 'var(--color-neutral-600)', bg: 'var(--color-neutral-100)', border: 'var(--color-neutral-300)' };
    case 'solved': return { color: 'var(--color-status-solved)', bg: 'var(--color-status-solved-bg)', border: 'var(--color-status-solved-border)' };
    default: return { color: 'var(--color-neutral-600)', bg: 'var(--color-neutral-100)', border: 'var(--color-neutral-300)' };
  }
}

function truncate(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

export default function Cases() {
  const [cases, setCases] = useState<CaseData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/investigate');
        if (res.ok) {
          const data = await res.json();
          setCases(data.cases || []);
        }
      } catch { /* api unavailable */ }
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <DashboardShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ fontSize: 'clamp(34px, 3.4vw, 46px)', fontWeight: 400, letterSpacing: '-0.02em', margin: 0, fontFamily: 'var(--font-heading)' }}>
            Cases
          </h1>
          <p style={{ fontSize: 14, color: 'var(--color-neutral-700)', marginTop: 8 }}>
            Active and past investigations tracked by the swarm.
          </p>
        </div>
        <Link href="/bounty/new" style={{
          padding: '8px 18px', borderRadius: 'var(--radius-md)',
          background: 'var(--color-text)', color: 'var(--color-bg)',
          fontFamily: 'var(--font-mono)', fontSize: '10.5px',
          letterSpacing: '0.1em', textTransform: 'uppercase',
          textDecoration: 'none',
        }}>+ New investigation</Link>
      </div>

      <div style={{ marginTop: 'var(--space-6)', overflowX: 'auto' }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '90px 120px 80px 80px 80px 90px', minWidth: 540,
          gap: 'var(--space-3)', padding: '0 0 var(--space-3) 0',
          borderBottom: '1px solid var(--color-divider)',
          fontFamily: 'var(--font-mono)', fontSize: '9.5px',
          letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'var(--color-neutral-600)',
        }}>
          <span>Case</span>
          <span>Victim</span>
          <span>Reward</span>
          <span>Hops</span>
          <span>Status</span>
          <span>When</span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-neutral-600)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            Loading cases…
          </div>
        ) : cases.length === 0 ? (
          <div style={{
            borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-divider)',
            background: 'var(--color-neutral-100)', padding: 'clamp(40px, 5vw, 80px)',
            textAlign: 'center', marginTop: 'var(--space-4)',
          }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, marginBottom: 8 }}>No cases yet</div>
            <p style={{ fontSize: 13, color: 'var(--color-neutral-600)', maxWidth: '36ch', margin: '0 auto' }}>
              Start an investigation to open your first case.
            </p>
          </div>
        ) : (
          cases.map((c) => {
            const st = statusStyle(c.status);
            return (
              <Link key={c.case_id} href={`/case/${c.case_id.replace('case/', '')}`} style={{
                display: 'grid', gridTemplateColumns: '90px 120px 80px 80px 80px 90px', minWidth: 540,
                gap: 'var(--space-3)', padding: 'var(--space-3) 0',
                borderBottom: '1px solid var(--color-divider)',
                alignItems: 'center', textDecoration: 'none', color: 'inherit',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-accent-700)' }}>
                  {c.case_id}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-neutral-700)' }}>
                  {truncate(c.victim_wallet)}
                </span>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 14 }}>
                  {c.reward}
                </span>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                  {c.total_hops_traced}
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: '9px',
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  padding: '2px 8px', borderRadius: 999,
                  background: st.bg, color: st.color,
                  border: `1px solid ${st.border}`,
                  width: 'fit-content',
                }}>
                  {c.status}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', color: 'var(--color-neutral-600)' }}>
                  {new Date(c.created_at).toLocaleDateString()}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </DashboardShell>
  );
}
