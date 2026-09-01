// Session check endpoint — returns current auth state
// Also handles sign-out via DELETE
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

export async function GET() {
  const session = await getSession();

  if (!session.address) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    address: session.address,
    chainId: session.chainId,
  });
}

export async function DELETE() {
  const session = await getSession();
  session.destroy();

  return NextResponse.json({ ok: true });
}
