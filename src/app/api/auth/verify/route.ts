// SIWE verify endpoint — validates the signed message and creates a session
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { SiweMessage } from 'siwe';

export async function POST(req: NextRequest) {
  try {
    const { message, signature } = await req.json();

    if (!message || !signature) {
      return NextResponse.json(
        { error: 'Missing message or signature' },
        { status: 400 },
      );
    }

    const session = await getSession();
    const siweMessage = new SiweMessage(message);

    // Validate domain and nonce to prevent cross-domain replay attacks
    const expectedDomain = new URL(req.url).host;
    const { data: fields } = await siweMessage.verify({
      signature,
      nonce: session.nonce,
      domain: expectedDomain,
    });

    if (fields.nonce !== session.nonce) {
      return NextResponse.json(
        { error: 'Invalid nonce — request a new one' },
        { status: 422 },
      );
    }

    // Store authenticated wallet in session
    session.address = fields.address;
    session.chainId = fields.chainId;
    session.nonce = undefined; // consume the nonce
    await session.save();

    return NextResponse.json({
      ok: true,
      address: fields.address,
      chainId: fields.chainId,
    });
  } catch (error) {
    console.error('[Auth] SIWE verification failed:', error);
    return NextResponse.json(
      { error: 'Signature verification failed' },
      { status: 400 },
    );
  }
}
