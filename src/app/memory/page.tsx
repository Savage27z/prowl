// Memory Explorer — browse and query Sibyl memory store
'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardShell from '@/components/DashboardShell';

interface MemoryEntry {
  id: string;
  description: string;
  case_id: string;
  kind: 'hop' | 'analysis' | 'case' | 'pattern' | 'unknown';
}

function describeRecord(rec: Record<string, unknown>): { id: string; description: string; kind: MemoryEntry['kind'] } {
  // Hop record
  if (rec.hop_number !== undefined && rec.from_address) {
    const amt = rec.amount ? ` (${rec.amount} ETH)` : '';
    const flag = rec.flag_reason ? ` — ${rec.flag_reason}` : '';
    return {
      id: (rec.from_address as string) || '—',
      description: `Hop ${rec.hop_number}: → ${((rec.to_address as string) || '').slice(0, 10)}…${amt}${flag}`,
      kind: 'hop',
    };
  }
  // Analysis record
  if (rec.address_analyzed || rec.risk_level) {
    return {
      id: (rec.address_analyzed as string) || '—',
      description: (rec.notes as string) || `${rec.risk_level || 'unknown'} risk`,
      kind: 'analysis',
    };
  }
  // Case record
  if (rec.case_id && rec.victim_wallet) {
    const status = rec.status ? ` [${rec.status}]` : '';
    const funds = rec.total_funds_traced ? ` — ${rec.total_funds_traced}` : '';
    return {
      id: (rec.victim_wallet as string) || '—',
      description: `Case${status}${funds}`,
      kind: 'case',
    };
  }
  // Pattern record
  if (rec.pattern_id || rec.pattern_type) {
    return {
      id: (rec.pattern_id as string) || '—',
      description: (rec.description as string) || `Pattern: ${rec.pattern_type || 'unknown'}`,
      kind: 'pattern',
    };
  }
  // Fallback — never show raw JSON
  return {
    id: (rec.address_analyzed || rec.from_address || rec.case_id || '—') as string,
    description: (rec.notes || rec.flag_reason || rec.description || 'Memory entry') as string,
    kind: 'unknown',
  };
}

export default function Memory() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [memoryMode, setMemoryMode] = useState<{ mode: string; bridgeUrl: string | null } | null>(null);
  const [wasCleared, setWasCleared] = useState(false);

  const fetchMemory = useCallback(async () => {
    let all: MemoryEntry[] = [];

    // Try server first
    try {
      const res = await fetch('/api/memory');
      if (res.ok) {
        const data = await res.json();
        if (data.memoryMode) setMemoryMode(data.memoryMode);
        const collections = data.collections || {};
        for (const [, items] of Object.entries(collections)) {
          if (Array.isArray(items)) {
            for (const item of items) {
              const rec = item as Record<string, unknown>;
              const { id, description, kind } = describeRecord(rec);
              all.push({ id, description, case_id: (rec.case_id || '—') as string, kind });
            }
          }
        }
        if (all.length > 0) {
          try { localStorage.setItem('prowl-memory', JSON.stringify(all)); } catch { /* */ }
        }
      }
    } catch { /* api unavailable */ }

    // Fall back to localStorage on cold start
    if (all.length === 0) {
      try {
        const raw = localStorage.getItem('prowl-memory');
        if (raw) all = JSON.parse(raw);
      } catch { /* */ }

      // Also try aggregating from per-case cached data
      if (all.length === 0) {
        try {
          const casesRaw = localStorage.getItem('prowl-cases');
          if (casesRaw) {
            const cases = JSON.parse(casesRaw) as { case_id: string }[];
            for (const c of cases) {
              const hopsRaw = localStorage.getItem(`prowl-hops-${c.case_id}`);
              if (hopsRaw) {
                for (const h of JSON.parse(hopsRaw)) {
                  const { id, description, kind } = describeRecord(h);
                  all.push({ id, description, case_id: c.case_id, kind });
                }
              }
              const analysisRaw = localStorage.getItem(`prowl-analysis-${c.case_id}`);
              if (analysisRaw) {
                for (const a of JSON.parse(analysisRaw)) {
                  const { id, description, kind } = describeRecord(a);
                  all.push({ id, description, case_id: c.case_id, kind });
                }
              }
            }
          }
        } catch { /* */ }
      }
    }

    setEntries(all);
    setLoading(false);
  }, []);

  const clearMemory = useCallback(async () => {
    // Clear localStorage caches
    try {
      const casesRaw = localStorage.getItem('prowl-cases');
      if (casesRaw) {
        const cases = JSON.parse(casesRaw) as { case_id: string }[];
        for (const c of cases) {
          localStorage.removeItem(`prowl-hops-${c.case_id}`);
          localStorage.removeItem(`prowl-analysis-${c.case_id}`);
          localStorage.removeItem(`prowl-feed-${c.case_id}`);
        }
      }
      localStorage.removeItem('prowl-cases');
      localStorage.removeItem('prowl-memory');
      localStorage.removeItem('prowl-stats');
    } catch { /* */ }

    // Clear server memory too
    try { await fetch('/api/memory?confirm=yes', { method: 'DELETE' }); } catch { /* */ }

    setEntries([]);
    setWasCleared(true);
  }, []);

  useEffect(() => { fetchMemory(); }, [fetchMemory]);

  const filtered = search
    ? entries.filter(e =>
        e.id.toLowerCase().includes(search.toLowerCase()) ||
        e.description.toLowerCase().includes(search.toLowerCase()) ||
        e.case_id.toLowerCase().includes(search.toLowerCase())
      )
    : entries;

  return (
    <DashboardShell>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)', width: '100%' }}>
        <div>
          <h1 style={{ fontSize: 'clamp(34px, 3.4vw, 46px)', fontWeight: 400, letterSpacing: '-0.02em', margin: 0, fontFamily: 'var(--font-heading)' }}>
            Sibyl Memory
          </h1>
          <p style={{ fontSize: 14, color: 'var(--color-neutral-700)', marginTop: 8 }}>
            {entries.length > 0
              ? `${entries.length.toLocaleString()} traces. What one case learns, the next one starts with.`
              : 'What one case learns, the next one starts with.'}
          </p>
          {/* Memory mode indicator */}
          {memoryMode && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8,
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
              textTransform: 'uppercase', padding: '3px 10px',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${memoryMode.mode !== 'local' ? 'var(--color-accent-300)' : 'var(--color-divider)'}`,
              color: memoryMode.mode !== 'local' ? 'var(--color-accent-700)' : 'var(--color-neutral-600)',
              background: memoryMode.mode !== 'local' ? 'var(--color-accent-100)' : 'transparent',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: 999,
                background: memoryMode.mode !== 'local' ? '#3fb950' : 'var(--color-accent)',
              }} />
              {memoryMode.mode === 'sibyl-bridge' ? 'Sibyl SDK Connected' : memoryMode.mode === 'redis-persistent' ? 'Persistent Memory (Redis)' : 'Sibyl Memory · Local'}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-neutral-600)' }}>
            Search memory
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="0x… or pattern name"
            style={{
              width: 220, maxWidth: '100%', padding: '8px 12px',
              borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)',
              background: 'var(--color-card)', fontFamily: 'var(--font-mono)', fontSize: 12,
              color: 'var(--color-text)', outline: 'none',
            }}
          />
          {entries.length > 0 && (
            <button
              onClick={clearMemory}
              style={{
                padding: '8px 12px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-divider)', background: 'transparent',
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'var(--color-neutral-600)',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >Clear</button>
          )}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 'var(--space-6)' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-neutral-600)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            Loading memory…
          </div>
        ) : filtered.length === 0 ? (
          wasCleared ? (
            /* ⚠ DRAMATIC DELETION TEST STATE */
            <div style={{
              borderRadius: 'var(--radius-md)',
              border: '1px solid #f85149',
              background: 'rgba(248, 81, 73, 0.06)',
              padding: 'clamp(32px, 5vw, 60px)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚠</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, marginBottom: 8, color: '#f85149' }}>
                Sibyl Memory Wiped
              </div>
              <div style={{
                fontSize: 13, color: 'var(--color-text)', maxWidth: '48ch', margin: '0 auto 16px',
                lineHeight: 1.6,
              }}>
                All agent coordination data has been destroyed. Without Sibyl Memory:
              </div>
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 8,
                maxWidth: '44ch', margin: '0 auto',
                textAlign: 'left',
              }}>
                {[
                  { agent: 'Tracer', impact: 'Cannot share hop data with Analyst — tracing is isolated' },
                  { agent: 'Analyst', impact: 'No pattern database — every case starts from zero, no cross-case intelligence' },
                  { agent: 'Monitor', impact: 'No watchlist — dormant wallets will never be re-traced' },
                ].map(({ agent, impact }) => (
                  <div key={agent} style={{
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                    padding: '8px 12px', borderRadius: 'var(--radius-md)',
                    background: 'rgba(248, 81, 73, 0.04)',
                    border: '1px dashed rgba(248, 81, 73, 0.2)',
                  }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                      color: '#f85149', flexShrink: 0, marginTop: 2,
                    }}>✕</span>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{agent}:</span>{' '}
                      <span style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>{impact}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{
                fontSize: 12, color: '#f85149', fontWeight: 600, marginTop: 20,
                fontFamily: 'var(--font-mono)', letterSpacing: '0.02em',
              }}>
                Without memory, Prowl is just three dumb bots. With memory, it&apos;s a detective squad.
              </p>
            </div>
          ) : (
          <div style={{
            borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-divider)',
            background: 'var(--color-neutral-100)', padding: 'clamp(40px, 5vw, 80px)',
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, marginBottom: 8 }}>
              {search ? `No entries match "${search}"` : 'Memory is empty'}
            </div>
            {!search && (
              <p style={{ fontSize: 13, color: 'var(--color-neutral-600)', maxWidth: '36ch', margin: '0 auto' }}>
                Start an investigation to populate Sibyl Memory. Agents write traces here as they work.
              </p>
            )}
          </div>
          )
        ) : (
          filtered.map((entry, i) => (
            <div key={i} className="pw-memory-row" style={{
              display: 'grid', gridTemplateColumns: '52px 140px 1fr 100px',
              alignItems: 'center', gap: 'var(--space-3)',
              padding: 'var(--space-3) 0',
              borderBottom: '1px solid var(--color-divider)',
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--color-accent-700)',
                background: 'var(--color-accent-100)', borderRadius: 'var(--radius-md)',
                padding: '2px 6px', textAlign: 'center', whiteSpace: 'nowrap',
              }}>
                {entry.kind === 'hop' ? 'HOP' : entry.kind === 'analysis' ? 'ANLYS' : entry.kind === 'case' ? 'CASE' : entry.kind === 'pattern' ? 'PTRN' : 'DATA'}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-accent-700)' }}>
                {entry.id.length > 16 ? entry.id.slice(0, 6) + '…' + entry.id.slice(-4) : entry.id}
              </span>
              <span style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.4 }}>
                {entry.description}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-accent-700)', textAlign: 'right' }}>
                {entry.case_id}
              </span>
            </div>
          ))
        )}
      </div>
    </DashboardShell>
  );
}
