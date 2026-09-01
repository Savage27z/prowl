// Auth helper — call from any API route to require a connected wallet
import { NextResponse } from 'next/server';
import { getSession } from './session';

export interface AuthResult {
  address: string;
  chainId: number;
}

/**
 * Require an authenticated wallet session.
 * Returns the session data or a 401 NextResponse.
 *
 * Usage in a route handler:
 * ```ts
 * const auth = await requireAuth();
 * if (auth instanceof NextResponse) return auth;
 * // auth.address is now the verified wallet
 * ```
 */
export async function requireAuth(): Promise<AuthResult | NextResponse> {
  const session = await getSession();

  if (!session.address) {
    return NextResponse.json(
      { error: 'Authentication required — connect your wallet and sign in' },
      { status: 401 },
    );
  }

  return {
    address: session.address,
    chainId: session.chainId || 8453,
  };
}
