'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';

export default function PostBounty() {
  const router = useRouter();
  const [victimWallet, setVictimWallet] = useState('');
  const [incidentTx, setIncidentTx] = useState('');
  const [description, setDescription] = useState('');
  const [reward, setReward] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (!victimWallet.match(/^0x[a-fA-F0-9]{40}$/)) {
        throw new Error('Invalid wallet address format');
      }
      if (!incidentTx.match(/^0x[a-fA-F0-9]{64}$/)) {
        throw new Error('Invalid transaction hash format');
      }

      const res = await fetch('/api/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          victimWallet, incidentTx, description,
          reward: reward ? `${reward} ETH` : '0 ETH',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start investigation');
      router.push(`/case/${data.caseId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px',
    borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)',
    background: '#f3f2f2', fontFamily: 'var(--font-mono)', fontSize: 13,
    color: 'var(--color-text)', outline: 'none',
  } as const;

  return (
    <DashboardShell>
      <div style={{ maxWidth: 560 }}>
        <h1 style={{ fontSize: 'clamp(34px, 3.4vw, 46px)', fontWeight: 400, letterSpacing: '-0.02em', margin: 0, fontFamily: 'var(--font-heading)' }}>
          Post a bounty
        </h1>
        <p style={{ fontSize: 14, color: 'var(--color-neutral-700)', marginTop: 8, marginBottom: 'var(--space-8, 37px)' }}>
          Submit details about stolen funds. Prowl&apos;s AI agents will trace the money trail.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-neutral-600)', marginBottom: 6 }}>
              Victim wallet address *
            </label>
            <input type="text" value={victimWallet} onChange={(e) => setVictimWallet(e.target.value)} placeholder="0x…" required style={inputStyle} />
          </div>

          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-neutral-600)', marginBottom: 6 }}>
              Incident transaction hash *
            </label>
            <input type="text" value={incidentTx} onChange={(e) => setIncidentTx(e.target.value)} placeholder="0x…" required style={inputStyle} />
          </div>

          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-neutral-600)', marginBottom: 6 }}>
              Description
            </label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what happened…" rows={4} style={{ ...inputStyle, resize: 'none' as const, fontFamily: 'var(--font-body)' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-neutral-600)', marginBottom: 6 }}>
              Reward (ETH)
            </label>
            <input type="number" step="0.001" min="0" value={reward} onChange={(e) => setReward(e.target.value)} placeholder="0.1" style={inputStyle} />
            <p style={{ fontSize: 11, color: 'var(--color-neutral-600)', marginTop: 4 }}>
              Reward will be locked in the smart contract on Base
            </p>
          </div>

          {error && (
            <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid #e5a0a0', background: '#fdf0f0', fontSize: 13, color: '#8b3a3a' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting || !victimWallet || !incidentTx} style={{
            padding: '12px 24px', borderRadius: 'var(--radius-md)',
            background: 'var(--color-text)', color: '#f3f2f2',
            fontFamily: 'var(--font-mono)', fontSize: '11px',
            letterSpacing: '0.12em', textTransform: 'uppercase',
            border: 'none', cursor: 'pointer',
            opacity: (submitting || !victimWallet || !incidentTx) ? 0.5 : 1,
          }}>
            {submitting ? 'Starting investigation…' : 'Post bounty & start investigation'}
          </button>

          {/* Info */}
          <div style={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)', background: 'var(--color-neutral-100)', padding: 'var(--space-4)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-neutral-600)', marginBottom: 10 }}>
              What happens next
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--color-neutral-700)' }}>
              <span>1. <strong>Tracer</strong> begins following the money trail hop-by-hop</span>
              <span>2. <strong>Analyst</strong> matches patterns against known scam signatures</span>
              <span>3. <strong>Monitor</strong> watches dormant wallets for future activity</span>
            </div>
          </div>
        </form>
      </div>
    </DashboardShell>
  );
}
