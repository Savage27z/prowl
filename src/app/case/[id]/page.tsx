// Case Detail — live investigation feed, hop timeline, and analysis
'use client';

import { useState, useEffect, useRef, useCallback, use } from 'react';
import DashboardShell from '@/components/DashboardShell';

/* ── Types ── */

interface CaseData {
  case_id: string;
  victim_wallet: string;
  incident_tx: string;
  status: string;
  reward: string;
  created_at: string;
  total_hops_traced: number;
  total_funds_traced: string;
  agents_involved: string[];
}

interface HopData {
  case_id: string;
  hop_number: number;
  from_address: string;
  to_address: string;
  amount: string;
  tx_hash: string;
  timestamp: string;
  is_split: boolean;
  flagged: boolean;
  flag_reason: string | null;
}

interface AnalysisData {
  case_id: string;
  address_analyzed: string;
  risk_level: string;
  pattern_matches: string[];
  notes: string;
  confidence: number;
}

interface FeedEvent {
  id: string;
  agent: string;
  action: string;
  data: Record<string, unknown>;
  timestamp: string;
}

/* ── Helpers ── */

function truncate(addr: string, len = 4) {
  if (!addr || addr.length < 10) return addr;
  return addr.slice(0, len + 2) + '…' + addr.slice(-len);
}

function statusStyle(status: string) {
  switch (status) {
    case 'active': return { color: 'var(--color-accent-700)', bg: 'var(--color-accent-100)', border: 'var(--color-accent-300)' };
    case 'tracing': return { color: 'var(--color-accent-700)', bg: 'var(--color-accent-100)', border: 'var(--color-accent-300)' };
    case 'analysing': return { color: 'var(--color-status-analysing)', bg: 'var(--color-status-analysing-bg)', border: 'var(--color-status-analysing-border)' };
    case 'monitoring': return { color: 'var(--color-neutral-600)', bg: 'var(--color-neutral-100)', border: 'var(--color-neutral-300)' };
    case 'solved': return { color: 'var(--color-status-solved)', bg: 'var(--color-status-solved-bg)', border: 'var(--color-status-solved-border)' };
    case 'dead_end': return { color: 'var(--color-error)', bg: 'var(--color-error-bg)', border: 'var(--color-error-border)' };
    default: return { color: 'var(--color-neutral-600)', bg: 'var(--color-neutral-100)', border: 'var(--color-neutral-300)' };
  }
}

const AGENT_COLORS: Record<string, string> = {
  coordinator: 'var(--color-neutral-600)',
  tracer: 'var(--color-accent-700)',
  analyst: 'var(--color-status-analysing)',
  monitor: 'var(--color-neutral-600)',
};

const AGENT_ICONS: Record<string, string> = {
  coordinator: 'CO',
  tracer: 'TR',
  analyst: 'AN',
  monitor: 'MO',
};

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    case_created: 'Case opened',
    tracing_started: 'Following the money…',
    tracing_complete: 'Tracing complete',
    analysis_started: 'Pattern matching…',
    analysis_complete: 'Analysis complete',
    monitoring_started: 'Setting up surveillance…',
    monitoring_setup: 'Watchlist configured',
    case_solved: 'Case solved',
    alert_received: 'Movement detected!',
    trace_resumed: 'Resumed tracing',
    reanalysis_complete: 'Reanalysis complete',
    connected: 'Stream connected',
  };
  return labels[action] || action.replace(/_/g, ' ');
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 5000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

/* ── Event details sub-component ── */

function EventDetails({ data }: { data: Record<string, unknown> }) {
  const d = data;
  const summary = d.summary != null ? String(d.summary) : null;
  const hops = d.hops != null ? String(d.hops) : null;
  const status = d.status != null ? String(d.status) : null;
  const risk = d.overallRisk != null ? String(d.overallRisk) : null;
  const newPats = d.newPatterns != null ? Number(d.newPatterns) : null;
  const watched = d.watchedAddresses != null ? String(d.watchedAddresses) : null;
  const dest = d.destination != null ? String(d.destination) : null;

  return (
    <div style={{ marginTop: 4, paddingLeft: 34, fontSize: 12, color: 'var(--color-neutral-700)', lineHeight: 1.5 }}>
      {summary && <p style={{ margin: 0 }}>{summary}</p>}
      {hops && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', marginRight: 10 }}>
          Hops: {hops}
        </span>
      )}
      {status && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', marginRight: 10 }}>
          Status: {status}
        </span>
      )}
      {risk && (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '9.5px',
          color: risk === 'high' ? 'var(--color-error)' : risk === 'medium' ? 'var(--color-accent-700)' : 'var(--color-neutral-600)',
        }}>
          Risk: {risk.toUpperCase()}
        </span>
      )}
      {newPats != null && newPats > 0 && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', marginLeft: 10 }}>
          +{newPats} new pattern(s)
        </span>
      )}
      {watched && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px' }}>
          Watching: {watched} address(es)
        </span>
      )}
      {dest && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', color: 'var(--color-status-solved)' }}>
          → {dest.replace('_', ' ')}
        </span>
      )}
    </div>
  );
}

/* ── Component ── */

export default function CaseView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [hops, setHops] = useState<HopData[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisData[]>([]);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'feed' | 'hops' | 'analysis'>('feed');
  const feedRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/investigate?caseId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setCaseData(data.case);
      }
      const memRes = await fetch('/api/memory');
      if (memRes.ok) {
        const memData = await memRes.json();
        const allHops = memData.collections?.HOPS || [];
        const allAnalyses = memData.collections?.ANALYSIS || [];
        setHops(allHops.filter((h: HopData) => h.case_id === id));
        setAnalyses(allAnalyses.filter((a: AnalysisData) => a.case_id === id));
      }
    } catch (error) {
      console.error('Failed to fetch case:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Initial fetch
  useEffect(() => { fetchData(); }, [fetchData]);

  // SSE stream for real-time updates
  useEffect(() => {
    const es = new EventSource('/api/investigate/stream');
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const update = JSON.parse(e.data);
        if (update.action === 'connected') return;

        // Only show events for this case (or show all if no caseId filter)
        if (update.caseId && update.caseId !== id) return;

        const event: FeedEvent = {
          id: `${update.agent}-${update.action}-${Date.now()}`,
          agent: update.agent,
          action: update.action,
          data: update.data || {},
          timestamp: update.timestamp || new Date().toISOString(),
        };

        setFeed(prev => [event, ...prev].slice(0, 100));

        // Refresh data when pipeline stages complete
        if (['tracing_complete', 'analysis_complete', 'case_solved', 'monitoring_setup', 'reanalysis_complete'].includes(update.action)) {
          fetchData();
        }
      } catch { /* ignore malformed */ }
    };

    return () => { es.close(); };
  }, [id, fetchData]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current && activeTab === 'feed') {
      feedRef.current.scrollTop = 0;
    }
  }, [feed, activeTab]);

  if (loading) {
    return (
      <DashboardShell>
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div style={{
            width: 32, height: 32, margin: '0 auto 16px',
            border: '2px solid var(--color-accent-300)', borderTopColor: 'var(--color-accent)',
            borderRadius: 999, animation: 'spin 1s linear infinite',
          }} />
          <div style={{ color: 'var(--color-neutral-600)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            Loading investigation…
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </DashboardShell>
    );
  }

  if (!caseData) {
    return (
      <DashboardShell>
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 28, marginBottom: 8 }}>Case not found</div>
          <div style={{ color: 'var(--color-neutral-600)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{id}</div>
        </div>
      </DashboardShell>
    );
  }

  const st = statusStyle(caseData.status);

  return (
    <DashboardShell>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <h1 style={{ fontSize: 'clamp(24px, 2.8vw, 34px)', fontWeight: 400, margin: 0, fontFamily: 'var(--font-mono)', letterSpacing: '-0.01em' }}>
          {caseData.case_id}
        </h1>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase',
          padding: '3px 10px', borderRadius: 999,
          background: st.bg, color: st.color, border: `1px solid ${st.border}`,
        }}>
          {caseData.status.replace('_', ' ')}
        </span>
      </div>

      <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
        <span>Victim: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent-700)' }}>{truncate(caseData.victim_wallet, 6)}</span></span>
        {' · '}
        <span>Reward: <span style={{ fontFamily: 'var(--font-heading)', fontSize: 15 }}>{caseData.reward}</span></span>
        {' · '}
        <span>Opened: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{new Date(caseData.created_at).toLocaleString()}</span></span>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        {[
          { label: 'Hops traced', value: caseData.total_hops_traced },
          { label: 'Funds traced', value: caseData.total_funds_traced || '—' },
          { label: 'Analyses', value: analyses.length },
          { label: 'High risk', value: analyses.filter(a => a.risk_level === 'high').length },
          { label: 'Agents', value: (caseData.agents_involved || []).length },
        ].map((s) => (
          <div key={s.label} style={{
            borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)',
            background: 'var(--color-card)', padding: 'var(--space-3)', textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-neutral-600)', marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-divider)', marginBottom: 'var(--space-4)' }}>
        {[
          { key: 'feed' as const, label: 'Live feed', count: feed.length },
          { key: 'hops' as const, label: 'Hop timeline', count: hops.length },
          { key: 'analysis' as const, label: 'Analysis', count: analyses.length },
        ].map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '8px 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
            borderBottom: activeTab === tab.key ? '2px solid var(--color-accent)' : '2px solid transparent',
            color: activeTab === tab.key ? 'var(--color-text)' : 'var(--color-neutral-600)',
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-body)',
          }}>
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '9px', padding: '1px 5px',
                borderRadius: 999, background: 'var(--color-accent-100)',
                color: 'var(--color-accent-700)', border: '1px solid var(--color-accent-300)',
              }}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Live Feed */}
      {activeTab === 'feed' && (
        <div ref={feedRef} style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 520, overflowY: 'auto' }}>
          {feed.length === 0 ? (
            <div style={{
              borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-divider)',
              background: 'var(--color-neutral-100)', padding: 'clamp(40px, 5vw, 60px)',
              textAlign: 'center',
            }}>
              <div style={{
                width: 32, height: 32, margin: '0 auto 12px',
                border: '2px solid var(--color-accent-300)', borderTopColor: 'var(--color-accent)',
                borderRadius: 999, animation: 'spin 1.2s linear infinite',
              }} />
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18, marginBottom: 6 }}>Listening for agent activity</div>
              <p style={{ fontSize: 12, color: 'var(--color-neutral-600)', maxWidth: '36ch', margin: '0 auto' }}>
                The swarm&apos;s events will appear here in real time as agents process this case.
              </p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : (
            feed.map((event) => {
              const agentColor = AGENT_COLORS[event.agent] || 'var(--color-neutral-600)';
              const icon = AGENT_ICONS[event.agent] || '??';
              const isMilestone = ['tracing_complete', 'analysis_complete', 'case_solved', 'monitoring_setup'].includes(event.action);

              return (
                <div key={event.id} style={{
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${isMilestone ? 'var(--color-accent-300)' : 'var(--color-divider)'}`,
                  background: isMilestone ? 'var(--color-accent-100)' : 'var(--color-card)',
                  padding: 'var(--space-3)',
                  animation: 'pw-fade-up 0.4s ease-out both',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {/* Agent icon */}
                    <span style={{
                      width: 26, height: 26, borderRadius: 999, flexShrink: 0,
                      border: `1px solid ${agentColor}`,
                      display: 'grid', placeContent: 'center',
                      fontFamily: 'var(--font-heading)', fontSize: 10, color: agentColor,
                      background: 'rgba(255,255,255,0.5)',
                    }}>{icon}</span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        fontFamily: 'var(--font-heading)', fontSize: 14, color: agentColor,
                        textTransform: 'capitalize',
                      }}>
                        {event.agent}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--color-neutral-600)', marginLeft: 8 }}>
                        {actionLabel(event.action)}
                      </span>
                    </div>

                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-neutral-600)', flexShrink: 0 }}>
                      {timeAgo(event.timestamp)}
                    </span>
                  </div>

                  {/* Event details */}
                  {event.data && Object.keys(event.data).length > 0 && (
                    <EventDetails data={event.data} />
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Hop Timeline */}
      {activeTab === 'hops' && (
        hops.length === 0 ? (
          <div style={{
            borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-divider)',
            background: 'var(--color-neutral-100)', padding: 'clamp(40px, 5vw, 60px)',
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18, marginBottom: 6 }}>No hops traced yet</div>
            <p style={{ fontSize: 12, color: 'var(--color-neutral-600)', maxWidth: '36ch', margin: '0 auto' }}>
              Tracer will map the fund flow hop-by-hop once the investigation starts.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {hops.sort((a, b) => a.hop_number - b.hop_number).map((hop, i) => (
              <div key={i} style={{ display: 'flex', gap: 12 }}>
                {/* Timeline line */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: 999,
                    background: hop.flagged ? 'var(--color-accent)' : 'var(--color-neutral-400)',
                    border: '2px solid #f3f2f2', flexShrink: 0,
                  }} />
                  {i < hops.length - 1 && (
                    <div style={{ width: 1, flex: 1, background: 'var(--color-divider)', minHeight: 20 }} />
                  )}
                </div>

                {/* Hop card */}
                <div style={{
                  flex: 1, marginBottom: 8,
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${hop.flagged ? 'var(--color-accent-300)' : 'var(--color-divider)'}`,
                  background: hop.flagged ? 'var(--color-accent-100)' : 'var(--color-card)',
                  padding: 'var(--space-3)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-neutral-600)' }}>
                      Hop {hop.hop_number} {hop.is_split && '· SPLIT'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: 14 }}>{hop.amount} ETH</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-accent-700)' }}>{truncate(hop.from_address, 6)}</span>
                    <span style={{ color: 'var(--color-neutral-400)', fontSize: 10 }}>→</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-accent-700)' }}>{truncate(hop.to_address, 6)}</span>
                  </div>
                  {hop.tx_hash && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-neutral-600)', marginTop: 3 }}>
                      TX: {truncate(hop.tx_hash, 8)}
                    </div>
                  )}
                  {hop.flagged && hop.flag_reason && (
                    <div style={{ marginTop: 5, fontSize: 11, color: 'var(--color-accent-700)', fontWeight: 500 }}>⚠ {hop.flag_reason}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Analysis */}
      {activeTab === 'analysis' && (
        analyses.length === 0 ? (
          <div style={{
            borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-divider)',
            background: 'var(--color-neutral-100)', padding: 'clamp(40px, 5vw, 60px)',
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18, marginBottom: 6 }}>No analysis results yet</div>
            <p style={{ fontSize: 12, color: 'var(--color-neutral-600)', maxWidth: '36ch', margin: '0 auto' }}>
              Analyst will match patterns against known scam signatures once Tracer finishes.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {analyses.map((a, i) => {
              const riskColor = a.risk_level === 'high' ? 'var(--color-error)' : a.risk_level === 'medium' ? 'var(--color-accent-700)' : 'var(--color-neutral-600)';
              const riskBg = a.risk_level === 'high' ? 'var(--color-error-bg)' : a.risk_level === 'medium' ? 'var(--color-accent-100)' : 'var(--color-neutral-100)';

              return (
                <div key={i} style={{
                  borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)',
                  background: 'var(--color-card)', padding: 'var(--space-3)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-accent-700)' }}>
                      {truncate(a.address_analyzed, 6)}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase',
                      padding: '2px 8px', borderRadius: 999,
                      background: riskBg, color: riskColor,
                    }}>
                      {a.risk_level} risk · {Math.round(a.confidence * 100)}%
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--color-neutral-700)', lineHeight: 1.5, margin: 0 }}>{a.notes}</p>
                  {a.pattern_matches.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                      {a.pattern_matches.map((p) => (
                        <span key={p} style={{
                          fontFamily: 'var(--font-mono)', fontSize: '9px', padding: '2px 6px',
                          borderRadius: 'var(--radius-sm)', background: 'var(--color-accent-100)',
                          color: 'var(--color-accent-700)', border: '1px solid var(--color-accent-300)',
                        }}>{p}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
    </DashboardShell>
  );
}
