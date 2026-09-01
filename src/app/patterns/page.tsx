// Patterns — grid view of detected attack patterns
'use client';

import { useState, useEffect } from 'react';
import DashboardShell from '@/components/DashboardShell';

interface Pattern {
  pattern_id: string;
  pattern_type: string;
  description: string;
  first_seen_case: string;
  times_matched: number;
  confidence: number;
}

export default function Patterns() {
  const [apiPatterns, setApiPatterns] = useState<Pattern[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/patterns');
        if (res.ok) {
          const data = await res.json();
          setApiPatterns(data.patterns || []);
        }
      } catch { /* api unavailable */ }
      finally { setLoading(false); }
    })();
  }, []);

  const patterns = apiPatterns.map((p, i) => ({
    id: `PATTERN ${String(i + 1).padStart(3, '0')}`,
    name: p.pattern_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    confidence: Math.round(p.confidence * 100),
    desc: p.description,
    matches: p.times_matched,
    case_id: p.first_seen_case,
  }));

  return (
    <DashboardShell>
      <h1 style={{ fontSize: 'clamp(34px, 3.4vw, 46px)', fontWeight: 400, letterSpacing: '-0.02em', margin: 0, fontFamily: 'var(--font-heading)' }}>
        Patterns
      </h1>
      <p style={{ fontSize: 14, color: 'var(--color-neutral-700)', marginTop: 8, marginBottom: 'var(--space-6)' }}>
        Attack signatures the Analyst matches against. Confidence is the swarm&apos;s hit rate on past cases.
      </p>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ height: 180, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)', background: 'var(--color-neutral-100)', animation: 'pw-fade 1s infinite alternate' }} />
          ))}
        </div>
      ) : patterns.length === 0 ? (
        <div style={{
          borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-divider)',
          background: 'var(--color-neutral-100)', padding: 'clamp(40px, 5vw, 80px)',
          textAlign: 'center',
        }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, marginBottom: 8 }}>No patterns yet</div>
          <p style={{ fontSize: 13, color: 'var(--color-neutral-600)', maxWidth: '36ch', margin: '0 auto' }}>
            Patterns are discovered automatically as investigations are completed. Each case makes the Analyst smarter.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
          {patterns.map((p) => (
            <div key={p.id} style={{
              borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)',
              background: 'var(--color-card)', padding: 'var(--space-4)',
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-accent-700)' }}>
                  {p.id}
                </span>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>
                  {p.confidence}%
                </span>
              </div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20 }}>{p.name}</div>
              <p style={{ fontSize: '12.5px', color: 'var(--color-neutral-700)', lineHeight: 1.5, flex: 1 }}>{p.desc}</p>
              <div style={{ borderTop: '1px solid var(--color-divider)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-neutral-600)' }}>
                  {p.matches} matches
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-neutral-600)' }}>
                  {p.case_id}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
