// useSIWE — custom hook for Sign-In with Ethereum flow
// Manages nonce fetching, message signing, and session verification
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { SiweMessage } from 'siwe';

export interface SIWESession {
  address: string;
  chainId: number;
}

export function useSIWE() {
  const { address, chainId, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [session, setSession] = useState<SIWESession | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check existing session on mount
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      if (data.authenticated) {
        setSession({ address: data.address, chainId: data.chainId });
      } else {
        setSession(null);
      }
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Clear session when wallet disconnects
  useEffect(() => {
    if (!isConnected && session) {
      fetch('/api/auth/session', { method: 'DELETE' }).then(() => setSession(null));
    }
  }, [isConnected, session]);

  // Sign in with wallet
  const signIn = useCallback(async () => {
    if (!address || !chainId) return;
    setSigning(true);
    setError(null);

    try {
      // 1. Get nonce from server
      const nonceRes = await fetch('/api/auth/nonce');
      const { nonce } = await nonceRes.json();

      // 2. Create SIWE message fields
      const messageFields = {
        domain: window.location.host,
        address,
        statement: 'Sign in to Prowl — AI Crypto Investigation Swarm',
        uri: window.location.origin,
        version: '1' as const,
        chainId,
        nonce,
      };

      const message = new SiweMessage(messageFields);
      const messageString = message.prepareMessage();

      // 3. Sign the message
      const signature = await signMessageAsync({ message: messageString });

      // 4. Verify on server — send fields object, not the prepared string
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageFields, signature }),
      });

      const result = await verifyRes.json();
      if (result.ok) {
        setSession({ address: result.address, chainId: result.chainId });
      } else {
        setError(result.error || 'Verification failed');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed';
      console.error('[SIWE] Sign-in failed:', err);
      setError(msg);
    } finally {
      setSigning(false);
    }
  }, [address, chainId, signMessageAsync]);

  // Sign out
  const signOut = useCallback(async () => {
    await fetch('/api/auth/session', { method: 'DELETE' });
    setSession(null);
  }, []);

  return {
    session,
    loading,
    signing,
    signIn,
    signOut,
    error,
    isAuthenticated: !!session,
    isConnected,
  };
}
