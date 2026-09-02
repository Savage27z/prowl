// New Bounty — form to submit investigation requests
// Posts bounty on-chain via ProwlBounty contract, then starts the investigation API
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { parseEther, pad } from 'viem';
import { baseSepolia } from 'wagmi/chains';
import DashboardShell from '@/components/DashboardShell';
import { getBountyContractConfig } from '@/chain/contracts';

export default function PostBounty() {
  const router = useRouter();
  const { isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [victimWallet, setVictimWallet] = useState('');
  const [incidentTx, setIncidentTx] = useState('');
  const [description, setDescription] = useState('');
  const [reward, setReward] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [error, setError] = useState('');
  const [step, setStep] = useState<'idle' | 'onchain' | 'api' | 'done'>('idle');

  const { isLoading: waitingForTx } = useWaitForTransactionReceipt({
    hash: txHash,
  });

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

      const rewardEth = reward ? parseFloat(reward) : 0;
      const contract = getBountyContractConfig();

      // Step 1: Post bounty on-chain (if wallet connected and reward > 0)
      if (isConnected && contract.address && rewardEth > 0) {
        setStep('onchain');
        try {
          // Switch to Base Sepolia if wallet is on the wrong chain
          if (chainId !== baseSepolia.id) {
            await switchChainAsync({ chainId: baseSepolia.id });
          }
          const hash = await writeContractAsync({
            ...contract,
            chainId: baseSepolia.id,
            functionName: 'postBounty',
            args: [
              victimWallet as `0x${string}`,
              pad(incidentTx as `0x${string}`, { size: 32 }),
              description || 'Prowl investigation',
            ],
            value: parseEther(reward || '0'),
          });
          setTxHash(hash);
        } catch (txErr) {
          // User rejected or wallet error — still allow API-only path
          const msg = txErr instanceof Error ? txErr.message : '';
          if (msg.includes('User rejected') || msg.includes('denied')) {
            setStep('api');
            // fall through to API-only
          } else {
            throw new Error(`On-chain tx failed: ${msg.slice(0, 100)}`);
          }
        }
      }

      // Step 2: Start investigation via API
      setStep('api');
      const res = await fetch('/api/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          victimWallet, incidentTx, description,
          reward: reward ? `${reward} ETH` : '0 ETH',
          txHash: txHash || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start investigation');
      setStep('done');
      // Cache case data so it survives serverless cold starts
      try {
        if (data.case) localStorage.setItem(`prowl-case-${data.caseId}`, JSON.stringify(data.case));
        const existing = localStorage.getItem('prowl-cases');
        const list = existing ? JSON.parse(existing) : [];
        if (data.case) list.unshift(data.case);
        localStorage.setItem('prowl-cases', JSON.stringify(list));
      } catch { /* */ }
      router.push(`/case/${data.caseId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStep('idle');
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px',
    borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)',
    background: 'var(--color-card)', fontFamily: 'var(--font-mono)', fontSize: 13,
    color: 'var(--color-text)', outline: 'none',
  } as const;

  return (
    <DashboardShell>
      <div style={{ maxWidth: 560 }}>
        <h1 style={{ fontSize: 'clamp(34px, 3.4vw, 46px)', fontWeight: 400, letterSpacing: '-0.02em', margin: 0, fontFamily: 'var(--font-heading)' }}>
          Start an investigation
        </h1>
        <p style={{ fontSize: 14, color: 'var(--color-neutral-700)', marginTop: 8, marginBottom: 'var(--space-8, 37px)' }}>
          Submit details about stolen funds. Prowl&apos;s AI agents will trace the money trail automatically.
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
              Investigation fee (ETH)
            </label>
            <input type="number" step="0.001" min="0" value={reward} onChange={(e) => setReward(e.target.value)} placeholder="0.1" style={inputStyle} />
            <p style={{ fontSize: 11, color: 'var(--color-neutral-600)', marginTop: 4 }}>
              Locked in escrow on Base — refunded if the case is unsolved
            </p>
          </div>

          {error && (
            <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-error-border)', background: 'var(--color-error-bg)', fontSize: 13, color: 'var(--color-error)' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting || !victimWallet || !incidentTx} style={{
            padding: '12px 24px', borderRadius: 'var(--radius-md)',
            background: 'var(--color-text)', color: 'var(--color-bg)',
            fontFamily: 'var(--font-mono)', fontSize: '11px',
            letterSpacing: '0.12em', textTransform: 'uppercase',
            border: 'none', cursor: 'pointer',
            opacity: (submitting || !victimWallet || !incidentTx) ? 0.5 : 1,
          }}>
            {step === 'onchain' ? 'Confirm in wallet…' :
             step === 'api' ? 'Starting investigation…' :
             waitingForTx ? 'Waiting for confirmation…' :
             isConnected && reward ? 'Lock fee & start investigation' : 'Start investigation'}
          </button>

          {txHash && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-status-solved)' }}>
              ✓ On-chain TX: <a href={`https://sepolia.basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent-700)', textDecoration: 'underline' }}>{txHash.slice(0, 10)}…{txHash.slice(-8)}</a>
            </div>
          )}

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
