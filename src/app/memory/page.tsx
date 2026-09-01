// Memory Explorer — browse and query Sibyl memory store
'use client';

import { useState, useEffect, useCallback } from 'react';
import DashboardShell from '@/components/DashboardShell';

interface MemoryEntry {
  id: string;
  description: string;
  case_id: string;
}

export default function Memory() {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchMemory = useCallback(async () => {
    try {
      const res = await fetch('/api/memory');
      if (res.ok) {
        const data = await res.json();
        const collections = data.collections || {};
        const all: MemoryEntry[] = [];

        for (const [, items] of Object.entries(collections)) {
          if (Array.isArray(items)) {
            for (const item of items) {
              const rec = item as Record<string, unknown>;
              all.push({
                id: (rec.address_analyzed || rec.from_address || rec.pattern_id || rec.case_id || '—') as string,
                description: (rec.notes || rec.flag_reason || rec.description || JSON.stringify(rec).slice(0, 80)) as string,
                case_id: (rec.case_id || '—') as string,
              });
            }
          }
        }
        setEntries(all);
      }
    } catch { /* api unavailable */ }
    finally { setLoading(false); }
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
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-neutral-600)' }}>
            Search memory
          </span>
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
        </div>
      </div>

      <div style={{ marginTop: 'var(--space-6)' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-neutral-600)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            Loading memory…
          </div>
        ) : filtered.length === 0 ? (
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
        ) : (
          filtered.map((entry, i) => (
            <div key={i} className="pw-memory-row" style={{
              display: 'grid', gridTemplateColumns: '140px 1fr 100px',
              alignItems: 'center', gap: 'var(--space-3)',
              padding: 'var(--space-3) 0',
              borderBottom: '1px solid var(--color-divider)',
            }}>
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
