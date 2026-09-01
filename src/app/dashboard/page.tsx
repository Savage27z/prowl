'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import DashboardShell from '@/components/DashboardShell';

/* ── Types ── */
interface Stats {
  totalCases: number;
  activeCases: number;
  solvedCases: number;
  totalPatterns: number;
  watchedAddresses: number;
}

type Activity = {
  agent: 'tracer' | 'analyst' | 'monitor' | 'coordinator';
  action: string;
  data: Record<string, unknown>;
  timestamp: string;
};

/* ── Static data for chart / demo ── */
const CHART_POINTS = [
  { x: 34, y: 136.1 }, { x: 131.7, y: 109.8 }, { x: 229.3, y: 118 },
  { x: 327, y: 80.3 }, { x: 424.7, y: 24.6 }, { x: 522.3, y: 60.6 }, { x: 620, y: 37.7 },
];
const CHART_LINE = CHART_POINTS.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
const CHART_AREA = CHART_LINE + ' L620 182 L34 182 Z';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const Y_LABELS = [
  { val: '0', y: 182 }, { val: '25k', y: 141 }, { val: '50k', y: 100 },
  { val: '75k', y: 59 }, { val: '100k', y: 18 },
];

const AGENTS_DATA = [
  { abbr: 'TR', name: 'Tracer', role: 'Flow analysis', pct: '39%' },
  { abbr: 'AN', name: 'Analyst', role: 'Pattern matching', pct: '18%' },
  { abbr: 'MO', name: 'Monitor', role: 'Surveillance', pct: '35%' },
  { abbr: 'CO', name: 'Coordinator', role: 'Case lead', pct: '8%' },
];

const TRAILS = [
  { abbr: 'MX', name: 'Mixers', sub: 'Tornado-like', delta: '+2%', negative: false },
  { abbr: 'BR', name: 'Bridges', sub: 'Cross-chain', delta: '-7%', negative: true },
  { abbr: 'CX', name: 'Exchanges', sub: 'Centralised', delta: '+4%', negative: false },
  { abbr: 'P2', name: 'Peer wallets', sub: 'Layering', delta: '+2%', negative: false },
];

function ArrowIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalCases: 0, activeCases: 0, solvedCases: 0, totalPatterns: 0, watchedAddresses: 0,
  });
  const [, setActivities] = useState<Activity[]>([]);
  const [, setLoading] = useState(true);
  const [range, setRange] = useState<'7' | '30'>('7');
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/investigate');
      if (res.ok) {
        const data = await res.json();
        if (data.stats) setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const es = new EventSource('/api/investigate/stream');
    eventSourceRef.current = es;
    es.onmessage = (e) => {
      try {
        const update = JSON.parse(e.data) as Activity;
        if (update.action === 'connected') return;
        setActivities((prev) => [update, ...prev].slice(0, 50));
        if (['tracing_complete', 'analysis_complete', 'case_solved', 'monitoring_setup'].includes(update.action)) {
          fetchData();
        }
      } catch { /* ignore */ }
    };
    return () => { es.close(); };
  }, [fetchData]);

  const fundTraced = stats.totalCases > 0 ? `$${(stats.totalCases * 1.84).toFixed(1)}m` : '$0';
  const walletsFlag = stats.watchedAddresses.toLocaleString();
  const openCases = stats.activeCases;

  return (
    <DashboardShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 'clamp(34px, 3.4vw, 46px)', fontWeight: 400, letterSpacing: '-0.02em', margin: 0, fontFamily: 'var(--font-heading)' }}>Dashboard</h1>
            <div style={{ display: 'flex', gap: 'clamp(24px, 3vw, 52px)', marginTop: 'var(--space-6)' }}>
              {[
                { label: 'Funds traced', value: fundTraced },
                { label: 'Wallets flagged', value: walletsFlag },
                { label: 'Open cases', value: String(openCases) },
              ].map((s) => (
                <div key={s.label}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-neutral-700)' }}>
                    {s.label}
                    <span style={{ width: 13, height: 13, borderRadius: 999, border: '1px solid var(--color-accent-300)', display: 'grid', placeContent: 'center', fontSize: 8, color: 'var(--color-accent-700)' }}>i</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(26px, 2.4vw, 34px)', fontVariantNumeric: 'tabular-nums', marginTop: 6 }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Escrow banner */}
          <div style={{
            position: 'relative', overflow: 'hidden', width: 320,
            borderRadius: 'var(--radius-md)', border: '1px solid var(--color-accent-300)',
            background: 'var(--color-accent-100)', padding: 'var(--space-4)',
          }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, lineHeight: 1.15, maxWidth: '12ch' }}>
              <span style={{ color: 'var(--color-accent-700)' }}>Escrow</span> is armed
            </div>
            <p style={{ fontSize: '11.5px', color: 'var(--color-neutral-700)', margin: '8px 0 0', maxWidth: '22ch' }}>
              Lock USDC and the swarm opens a case in seconds.
            </p>
            <svg width="128" height="104" viewBox="0 0 128 104" fill="none" style={{ position: 'absolute', right: -6, top: 4 }}>
              <path d="M14 96a50 50 0 0 1 100 0" stroke="var(--color-accent-300)" strokeWidth="7" strokeLinecap="round" />
              <path d="M28 96a36 36 0 0 1 72 0" stroke="var(--color-accent-600)" strokeWidth="7" strokeLinecap="round" />
              <path d="M42 96a22 22 0 0 1 44 0" stroke="var(--color-neutral-800, #444)" strokeWidth="7" strokeLinecap="round" />
            </svg>
            <Link href="/bounty/new" style={{
              position: 'absolute', right: 16, bottom: 14,
              width: 46, height: 46, borderRadius: 999,
              background: 'var(--color-card)', display: 'grid', placeContent: 'center',
              fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
              fontFamily: 'var(--font-mono)', textDecoration: 'none',
              color: 'var(--color-text)', border: '1px solid var(--color-divider)',
            }}>Post</Link>
          </div>
        </div>

        {/* Activity + Top agents row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: 'clamp(20px, 2.4vw, 40px)', alignItems: 'start' }}>
          {/* Activity chart */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 25, fontWeight: 400, margin: 0, fontFamily: 'var(--font-heading)' }}>Activity</h2>
              <span style={{ fontSize: 11, color: 'var(--color-neutral-600)', flex: 1 }}>Hops traced across open cases</span>
              <div style={{ display: 'flex', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                {['7', '30'].map((r) => (
                  <button key={r} onClick={() => setRange(r as '7' | '30')} style={{
                    fontFamily: 'var(--font-mono)', fontSize: '10.5px', letterSpacing: '0.08em',
                    padding: '6px 12px', border: 'none', cursor: 'pointer',
                    background: range === r ? 'var(--color-accent-100)' : 'transparent',
                    color: range === r ? 'var(--color-accent-700)' : 'var(--color-text)',
                  }}>{r} days</button>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 'var(--space-4)', position: 'relative' }}>
              <svg viewBox="0 0 620 220" preserveAspectRatio="none" style={{ width: '100%', height: 220, display: 'block', overflow: 'visible' }}>
                {Y_LABELS.map((l) => (
                  <g key={l.val}>
                    <line x1="34" y1={l.y} x2="620" y2={l.y} stroke="var(--color-divider)" strokeWidth="1" />
                    <text x="0" y={l.y + 3} fontFamily="Space Mono, monospace" fontSize="9" fill="var(--color-neutral-600)">{l.val}</text>
                  </g>
                ))}
                <path d={CHART_AREA} fill="var(--color-accent-100)" opacity="0.85" />
                <path d={CHART_LINE} fill="none" stroke="var(--color-accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="424.7" y1="18" x2="424.7" y2="182" stroke="var(--color-neutral-400)" strokeWidth="1" strokeDasharray="3 4" />
                <circle cx="424.7" cy="24.6" r="4.5" fill="var(--color-card)" stroke="var(--color-accent)" strokeWidth="2.4" />
              </svg>
              <div style={{
                position: 'absolute', left: '68.49%', top: 10, transform: 'translateX(-50%)',
                background: 'var(--color-card)', border: '1px solid var(--color-divider)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-sm)',
                padding: '6px 11px', fontFamily: 'var(--font-mono)', fontSize: 12,
                fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
              }}>12 210</div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', paddingLeft: 34,
                marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: '9.5px',
                letterSpacing: '0.1em', color: 'var(--color-neutral-600)',
              }}>
                {DAYS.map((d) => <span key={d}>{d}</span>)}
              </div>
            </div>
          </section>

          {/* Top agents */}
          <section>
            <h2 style={{ fontSize: 25, fontWeight: 400, margin: 0, fontFamily: 'var(--font-heading)' }}>Top agents</h2>
            <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column' }}>
              {AGENTS_DATA.map((a) => (
                <div key={a.abbr} style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-3) 0', borderBottom: '1px solid var(--color-divider)',
                }}>
                  <span style={{
                    width: 34, height: 34, flex: '0 0 auto', borderRadius: 999,
                    border: '1px solid var(--color-accent-300)', background: 'var(--color-accent-100)',
                    display: 'grid', placeContent: 'center',
                    fontFamily: 'var(--font-heading)', fontSize: 13, color: 'var(--color-accent-700)',
                  }}>{a.abbr}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: 'var(--font-heading)', fontSize: 15 }}>{a.name}</span>
                    <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-neutral-600)' }}>{a.role}</span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{a.pct}</span>
                </div>
              ))}
            </div>
            <Link href="/agents" style={{ display: 'inline-block', fontFamily: 'var(--font-mono)', fontSize: '10.5px', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 'var(--space-3)', color: 'var(--color-accent-700)' }}>View more →</Link>
          </section>
        </div>

        {/* Trails section */}
        <section style={{
          borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)',
          background: 'var(--color-neutral-100)', padding: 'var(--space-6)',
          display: 'grid', gridTemplateColumns: 'minmax(150px, 200px) minmax(0, 1fr) 104px',
          gap: 'var(--space-4)', alignItems: 'center',
        }}>
          <div>
            <h3 style={{ fontSize: 21, fontWeight: 400, margin: 0, fontFamily: 'var(--font-heading)' }}>Trails</h3>
            <p style={{ fontSize: '11.5px', color: 'var(--color-neutral-700)', margin: '8px 0 0', maxWidth: '20ch' }}>
              Where traced funds went this <span style={{ fontFamily: 'var(--font-heading)', fontSize: 13 }}>1 week</span> period.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))', gap: 'var(--space-3)' }}>
            {TRAILS.map((t) => (
              <div key={t.abbr} style={{
                borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)',
                background: 'var(--color-card)', padding: 'var(--space-3)', textAlign: 'center',
              }}>
                <span style={{
                  width: 28, height: 28, margin: '0 auto', borderRadius: 999,
                  border: '1px solid var(--color-accent-300)', display: 'grid', placeContent: 'center',
                  fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-accent-700)',
                }}>{t.abbr}</span>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 14, marginTop: 9 }}>{t.name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-neutral-600)' }}>{t.sub}</div>
                <div style={{
                  fontFamily: 'var(--font-heading)', fontSize: 19, fontVariantNumeric: 'tabular-nums',
                  marginTop: 8, color: t.negative ? 'var(--color-accent-700)' : 'var(--color-text)',
                }}>{t.delta}</div>
              </div>
            ))}
          </div>
          <Link href="/case/001" style={{
            alignSelf: 'stretch', borderRadius: 'var(--radius-md)',
            background: 'var(--color-text)', color: 'var(--color-bg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 8, padding: 'var(--space-3)',
            textAlign: 'center', textDecoration: 'none',
          }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 15, lineHeight: 1.1 }}>Full trace</span>
            <span style={{
              width: 26, height: 26, borderRadius: 999,
              border: '1px solid var(--color-accent-300)',
              display: 'grid', placeContent: 'center', color: 'var(--color-accent-300)',
            }}><ArrowIcon /></span>
          </Link>
        </section>
      </div>
    </DashboardShell>
  );
}
