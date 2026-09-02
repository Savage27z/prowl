// Agents — swarm status dashboard and controls
'use client';

import { useState, useEffect } from 'react';
import DashboardShell from '@/components/DashboardShell';

interface AgentInfo {
  abbr: string;
  name: string;
  status: string;
  desc: string;
  tasks: number;
}

const AGENT_META: Record<string, { abbr: string; name: string }> = {
  tracer: { abbr: 'TR', name: 'Tracer' },
  analyst: { abbr: 'AN', name: 'Analyst' },
  monitor: { abbr: 'MO', name: 'Monitor' },
  coordinator: { abbr: 'CO', name: 'Coordinator' },
};

export default function Agents() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let cases: { agents_involved?: string[] }[] = [];
      try {
        const res = await fetch('/api/investigate');
        if (res.ok) {
          const data = await res.json();
          cases = data.cases || [];
        }
      } catch { /* api unavailable */ }

      // Merge with localStorage — serverless cold starts return empty
      if (cases.length === 0) {
        try {
          const raw = localStorage.getItem('prowl-cases');
          if (raw) cases = JSON.parse(raw);
        } catch { /* */ }
      }

      if (cases.length > 0) {
        const agentTasks: Record<string, number> = { tracer: 0, analyst: 0, monitor: 0, coordinator: 0 };
        for (const c of cases) {
          if (c.agents_involved) {
            for (const a of c.agents_involved) {
              if (agentTasks[a] !== undefined) agentTasks[a]++;
            }
          }
        }
        const built: AgentInfo[] = Object.entries(AGENT_META).map(([key, meta]) => ({
          ...meta,
          status: agentTasks[key] > 0 ? 'Active' : 'Idle',
          desc: agentTasks[key] > 0 ? `Working on ${agentTasks[key]} case${agentTasks[key] > 1 ? 's' : ''}.` : 'No active tasks.',
          tasks: agentTasks[key],
        }));
        setAgents(built);
      }
      setLoading(false);
    })();
  }, []);

  // Fallback: show agent structure even without API data
  const displayAgents = agents.length > 0 ? agents : Object.values(AGENT_META).map(m => ({
    ...m, status: 'Idle', desc: 'No active tasks.', tasks: 0,
  }));

  return (
    <DashboardShell>
      <h1 style={{ fontSize: 'clamp(34px, 3.4vw, 46px)', fontWeight: 400, letterSpacing: '-0.02em', margin: 0, fontFamily: 'var(--font-heading)' }}>
        Agents
      </h1>
      <p style={{ fontSize: 14, color: 'var(--color-neutral-700)', marginTop: 8, marginBottom: 'var(--space-6)' }}>
        Live status of the four-agent swarm.
      </p>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-4)' }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ height: 180, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)', background: 'var(--color-neutral-100)', animation: 'pw-fade 1s infinite alternate' }} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
          {displayAgents.map((agent) => (
            <div key={agent.abbr} style={{
              borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)',
              background: 'var(--color-card)', padding: 'var(--space-4)',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{
                  width: 36, height: 36, borderRadius: 999,
                  border: '1px solid var(--color-accent-300)', background: 'var(--color-accent-100)',
                  display: 'grid', placeContent: 'center',
                  fontFamily: 'var(--font-heading)', fontSize: 14, color: 'var(--color-accent-700)',
                }}>{agent.abbr}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: 999,
                    background: agent.tasks > 0 ? 'var(--color-accent)' : 'var(--color-neutral-400)',
                  }} />
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '9.5px',
                    letterSpacing: '0.14em', textTransform: 'uppercase',
                    color: 'var(--color-neutral-600)',
                  }}>{agent.status}</span>
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22 }}>{agent.name}</div>
              <p style={{ fontSize: '12.5px', color: 'var(--color-neutral-700)', lineHeight: 1.5 }}>{agent.desc}</p>
              <div style={{ borderTop: '1px solid var(--color-divider)', marginTop: 'auto' }} />
              <div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{agent.tasks}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-neutral-600)' }}>Open tasks</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
