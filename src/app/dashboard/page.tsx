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
  totalHops: number;
  totalFundsEth: number;
  agentCounts: Record<string, number>;
  dailyHops: number[];
  trailCounts: Record<string, number>;
}

type Activity = {
  agent: 'tracer' | 'analyst' | 'monitor' | 'coordinator';
  action: string;
  data: Record<string, unknown>;
  timestamp: string;
};

/* ── Trail type labels ── */
const TRAIL_META: Record<string, { abbr: string; name: string; sub: string }> = {
  mixer_usage: { abbr: 'MX', name: 'Mixers', sub: 'Tornado-like' },
  bridge_usage: { abbr: 'BR', name: 'Bridges', sub: 'Cross-chain' },
  cex_deposit: { abbr: 'CX', name: 'Exchanges', sub: 'Centralised' },
  fund_splitting: { abbr: 'FS', name: 'Splitting', sub: 'Layering' },
  rapid_movement: { abbr: 'RM', name: 'Rapid moves', sub: 'Speed wash' },
  contract_interaction: { abbr: 'SC', name: 'Contracts', sub: 'Unverified' },
};

const AGENT_META: Record<string, { abbr: string; name: string; role: string }> = {
  tracer: { abbr: 'TR', name: 'Tracer', role: 'Flow analysis' },
  analyst: { abbr: 'AN', name: 'Analyst', role: 'Pattern matching' },
  monitor: { abbr: 'MO', name: 'Monitor', role: 'Surveillance' },
  coordinator: { abbr: 'CO', name: 'Coordinator', role: 'Case lead' },
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ArrowIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/* ── Chart helpers ── */
function buildChartPath(data: number[], width: number, height: number) {
  if (data.length === 0) return { line: '', area: '', max: 0 };
  const max = Math.max(...data, 1);
  const padX = 34;
  const usableW = width - padX;
  const step = usableW / Math.max(data.length - 1, 1);

  const points = data.map((v, i) => ({
    x: padX + i * step,
    y: height - (v / max) * (height - 18) - 18,
  }));

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = line + ` L${points[points.length - 1].x.toFixed(1)} ${height} L${padX} ${height} Z`;
  return { line, area, max, points };
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/investigate');
      if (res.ok) {
        const data = await res.json();
        if (data.stats) setStats(data.stats);
      }
    } catch {
      // api unavailable
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

  // Derived values
  const totalFunds = stats ? `$${stats.totalFundsEth.toFixed(2)}` : '$0';
  const walletsFlag = stats ? stats.watchedAddresses.toLocaleString() : '0';
  const openCases = stats ? stats.activeCases : 0;
  const dailyHops = stats?.dailyHops || [0, 0, 0, 0, 0, 0, 0];
  const totalHops = stats?.totalHops || 0;

  // Chart
  const chartW = 620;
  const chartH = 182;
  const { line: chartLine, area: chartArea, max: chartMax, points: chartPoints } = buildChartPath(dailyHops, chartW, chartH);
  const yLabels = chartMax > 0
    ? [0, 0.25, 0.5, 0.75, 1].map((f) => ({ val: Math.round(chartMax * f).toLocaleString(), y: chartH - f * (chartH - 18) - 18 }))
    : [{ val: '0', y: chartH }];

  // Agent percentages from real data
  const agentCounts = stats?.agentCounts || {};
  const agentTotal = Object.values(agentCounts).reduce((a, b) => a + b, 0) || 1;
  const agents = Object.entries(AGENT_META).map(([key, meta]) => ({
    ...meta,
    pct: `${Math.round(((agentCounts[key] || 0) / agentTotal) * 100)}%`,
    count: agentCounts[key] || 0,
  })).sort((a, b) => b.count - a.count);

  // Trail data from real patterns
  const trailCounts = stats?.trailCounts || {};
  const trailTotal = Object.values(trailCounts).reduce((a, b) => a + b, 0) || 0;
  const trails = Object.entries(trailCounts)
    .map(([type, count]) => ({
      ...(TRAIL_META[type] || { abbr: type.slice(0, 2).toUpperCase(), name: type, sub: '' }),
      count,
      pct: trailTotal > 0 ? `${Math.round((count / trailTotal) * 100)}%` : '0%',
    }))
    .sort((a, b) => b.count - a.count);

  // Peak point for tooltip
  const peakIdx = dailyHops.indexOf(Math.max(...dailyHops));
  const peakPoint = chartPoints?.[peakIdx];

  if (loading) {
    return (
      <DashboardShell>
        <div style={{ padding: 60, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-neutral-600)' }}>
          Loading dashboard…
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 'clamp(34px, 3.4vw, 46px)', fontWeight: 400, letterSpacing: '-0.02em', margin: 0, fontFamily: 'var(--font-heading)' }}>Dashboard</h1>
            <div style={{ display: 'flex', gap: 'clamp(24px, 3vw, 52px)', marginTop: 'var(--space-6)' }}>
              {[
                { label: 'Funds traced', value: totalFunds },
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
          <div className="pw-escrow" style={{
            position: 'relative', overflow: 'hidden', width: 320, maxWidth: '100%',
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
        <div className="pw-dash-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.55fr) minmax(0, 1fr)', gap: 'clamp(20px, 2.4vw, 40px)', alignItems: 'start' }}>
          {/* Activity chart */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 25, fontWeight: 400, margin: 0, fontFamily: 'var(--font-heading)' }}>Activity</h2>
              <span style={{ fontSize: 11, color: 'var(--color-neutral-600)', flex: 1 }}>
                {totalHops.toLocaleString()} hops traced across {stats?.totalCases || 0} cases
              </span>
            </div>
            <div style={{ marginTop: 'var(--space-4)', position: 'relative' }}>
              {totalHops === 0 ? (
                <div style={{
                  height: 220, display: 'grid', placeContent: 'center',
                  border: '1px dashed var(--color-divider)', borderRadius: 'var(--radius-md)',
                  color: 'var(--color-neutral-600)', fontFamily: 'var(--font-mono)', fontSize: 12,
                  textAlign: 'center', padding: 20,
                }}>
                  No activity yet.<br />Post a bounty to start your first investigation.
                </div>
              ) : (
                <>
                  <svg viewBox={`0 0 ${chartW} ${chartH + 20}`} preserveAspectRatio="none" style={{ width: '100%', height: 220, display: 'block', overflow: 'visible' }}>
                    {yLabels.map((l) => (
                      <g key={l.val}>
                        <line x1="34" y1={l.y} x2={chartW} y2={l.y} stroke="var(--color-divider)" strokeWidth="1" />
                        <text x="0" y={l.y + 3} fontFamily="Space Mono, monospace" fontSize="9" fill="var(--color-neutral-600)">{l.val}</text>
                      </g>
                    ))}
                    <path d={chartArea} fill="var(--color-accent-100)" opacity="0.85" />
                    <path d={chartLine} fill="none" stroke="var(--color-accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    {peakPoint && (
                      <>
                        <line x1={peakPoint.x} y1={18} x2={peakPoint.x} y2={chartH} stroke="var(--color-neutral-400)" strokeWidth="1" strokeDasharray="3 4" />
                        <circle cx={peakPoint.x} cy={peakPoint.y} r="4.5" fill="var(--color-card)" stroke="var(--color-accent)" strokeWidth="2.4" />
                      </>
                    )}
                  </svg>
                  {peakPoint && (
                    <div style={{
                      position: 'absolute', left: `${(peakPoint.x / chartW) * 100}%`, top: 10, transform: 'translateX(-50%)',
                      background: 'var(--color-card)', border: '1px solid var(--color-divider)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: 'var(--shadow-sm)',
                      padding: '6px 11px', fontFamily: 'var(--font-mono)', fontSize: 12,
                      fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                    }}>{dailyHops[peakIdx].toLocaleString()}</div>
                  )}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', paddingLeft: 34,
                    marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: '9.5px',
                    letterSpacing: '0.1em', color: 'var(--color-neutral-600)',
                  }}>
                    {DAYS.map((d) => <span key={d}>{d}</span>)}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Top agents */}
          <section>
            <h2 style={{ fontSize: 25, fontWeight: 400, margin: 0, fontFamily: 'var(--font-heading)' }}>Top agents</h2>
            <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column' }}>
              {agents.map((a) => (
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

        {/* Live feed */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <h2 style={{ fontSize: 25, fontWeight: 400, margin: 0, fontFamily: 'var(--font-heading)' }}>Live feed</h2>
            <span style={{
              width: 8, height: 8, borderRadius: 999,
              background: activities.length > 0 ? 'var(--color-status-solved)' : 'var(--color-neutral-400)',
              boxShadow: activities.length > 0 ? '0 0 6px var(--color-status-solved)' : 'none',
              animation: activities.length > 0 ? 'pw-blink 2s infinite' : 'none',
            }} />
            <span style={{ fontSize: 11, color: 'var(--color-neutral-600)', fontFamily: 'var(--font-mono)' }}>
              {activities.length > 0 ? `${activities.length} events` : 'Waiting for agent activity…'}
            </span>
          </div>
          <div style={{
            borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)',
            background: 'var(--color-neutral-100)', maxHeight: 260, overflowY: 'auto',
          }}>
            {activities.length === 0 ? (
              <div style={{
                padding: 'clamp(24px, 3vw, 40px)', textAlign: 'center',
                color: 'var(--color-neutral-600)', fontFamily: 'var(--font-mono)', fontSize: 12,
              }}>
                Agent events will appear here in real time as investigations run.
              </div>
            ) : (
              activities.slice(0, 20).map((a, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: '10px var(--space-4)',
                  borderBottom: i < Math.min(activities.length, 20) - 1 ? '1px solid var(--color-divider)' : 'none',
                }}>
                  <span style={{
                    width: 26, height: 26, flex: '0 0 auto', borderRadius: 999,
                    border: '1px solid var(--color-accent-300)', background: 'var(--color-accent-100)',
                    display: 'grid', placeContent: 'center',
                    fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--color-accent-700)',
                    textTransform: 'uppercase',
                  }}>
                    {AGENT_META[a.agent]?.abbr || a.agent.slice(0, 2).toUpperCase()}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13 }}>
                      <strong style={{ fontFamily: 'var(--font-heading)', fontWeight: 400 }}>{AGENT_META[a.agent]?.name || a.agent}</strong>
                      {' — '}
                      {a.action.replace(/_/g, ' ')}
                    </span>
                    {a.data?.case_id ? (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-neutral-600)' }}>
                        {String(a.data.case_id)}
                      </span>
                    ) : null}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-neutral-600)', whiteSpace: 'nowrap' }}>
                    {new Date(a.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Trails section */}
        {trails.length > 0 ? (
          <section className="pw-trails" style={{
            borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)',
            background: 'var(--color-neutral-100)', padding: 'var(--space-6)',
            display: 'grid', gridTemplateColumns: 'minmax(150px, 200px) minmax(0, 1fr) 104px',
            gap: 'var(--space-4)', alignItems: 'center',
          }}>
            <div>
              <h3 style={{ fontSize: 21, fontWeight: 400, margin: 0, fontFamily: 'var(--font-heading)' }}>Trails</h3>
              <p style={{ fontSize: '11.5px', color: 'var(--color-neutral-700)', margin: '8px 0 0', maxWidth: '20ch' }}>
                Where traced funds went across <span style={{ fontFamily: 'var(--font-heading)', fontSize: 13 }}>{trailTotal}</span> pattern matches.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))', gap: 'var(--space-3)' }}>
              {trails.map((t) => (
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
                    marginTop: 8,
                  }}>{t.pct}</div>
                </div>
              ))}
            </div>
            <Link href="/cases" className="pw-trails-button" style={{
              alignSelf: 'stretch', borderRadius: 'var(--radius-md)',
              background: 'var(--color-text)', color: 'var(--color-bg)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 8, padding: 'var(--space-3)',
              textAlign: 'center', textDecoration: 'none',
            }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 15, lineHeight: 1.1 }}>All cases</span>
              <span style={{
                width: 26, height: 26, borderRadius: 999,
                border: '1px solid var(--color-accent-300)',
                display: 'grid', placeContent: 'center', color: 'var(--color-accent-300)',
              }}><ArrowIcon /></span>
            </Link>
          </section>
        ) : (
          <section style={{
            borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-divider)',
            background: 'var(--color-neutral-100)', padding: 'clamp(32px, 4vw, 56px)',
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>No patterns detected yet</div>
            <p style={{ fontSize: 13, color: 'var(--color-neutral-600)', marginTop: 8, maxWidth: '40ch', margin: '8px auto 0' }}>
              The Analyst agent will identify fund movement patterns as investigations run.
            </p>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
