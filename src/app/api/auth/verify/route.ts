// SIWE verify endpoint — validates the signed message and creates a session
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { verifyMessage } from 'viem';

// Minimal SIWE message parser — extracts fields without apg-js
function parseSiweMessage(msg: string) {
  const lines = msg.split('\n');
  // Line 0: "{domain} wants you to sign in with your Ethereum account:"
  const domain = lines[0]?.split(' wants you to sign in')[0];
  // Line 1: address
  const address = lines[1]?.trim();
  // Find nonce, chainId, issuedAt from "Key: Value" lines
  let nonce: string | undefined;
  let chainId: number | undefined;
  let uri: string | undefined;
  for (const line of lines) {
    const l = line.trim();
    if (l.startsWith('Nonce: ')) nonce = l.slice(7);
    else if (l.startsWith('Chain ID: ')) chainId = parseInt(l.slice(10), 10);
    else if (l.startsWith('URI: ')) uri = l.slice(5);
  }
  return { domain, address, nonce, chainId, uri };
}

export async function POST(req: NextRequest) {
  try {
    const { message, signature } = await req.json();

    if (!message || !signature) {
      return NextResponse.json(
        { error: 'Missing message or signature' },
        { status: 400 },
      );
    }

    // Parse the SIWE fields from the prepared message string
    const fields = parseSiweMessage(message);

    if (!fields.address || !fields.nonce) {
      return NextResponse.json(
        { error: 'Invalid SIWE message format' },
        { status: 400 },
      );
    }

    // Verify signature using viem (no siwe parser needed)
    const valid = await verifyMessage({
      address: fields.address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 },
      );
    }

    // Validate domain
    const expectedDomain = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
    if (fields.domain !== expectedDomain) {
      return NextResponse.json(
        { error: 'Domain mismatch' },
        { status: 400 },
      );
    }

    // Validate nonce
    const session = await getSession();
    if (fields.nonce !== session.nonce) {
      return NextResponse.json(
        { error: 'Invalid nonce - request a new one' },
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
