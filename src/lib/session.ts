// Iron-session configuration for SIWE auth cookies
import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData {
  /** Authenticated wallet address (checksummed) */
  address?: string;
  /** Chain ID the wallet signed on */
  chainId?: number;
  /** SIWE nonce for the current challenge */
  nonce?: string;
}

function getSessionOptions(): SessionOptions {
  const secret = process.env.SESSION_SECRET;
  return {
    // In production, use SESSION_SECRET env var; fall back to a stable default for the hackathon
    password: secret || 'prowl-hackathon-session-key-2026-base-sepolia!!',
    cookieName: 'prowl-session',
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax' as const,
    },
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, getSessionOptions());
}
