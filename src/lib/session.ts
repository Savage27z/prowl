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
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET environment variable is required in production');
  }
  return {
    password: secret || 'prowl-dev-secret-must-be-at-least-32-chars-long!!',
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
