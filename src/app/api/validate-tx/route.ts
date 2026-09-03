// Validate that a victim address appears in a transaction
// Checks from, to, and internal transactions before allowing investigation submission

import { NextRequest, NextResponse } from 'next/server';

const BASE_RPC = process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org';
const EXPLORER_API = process.env.BASE_EXPLORER_API_URL || 'https://base.blockscout.com/api';

export async function GET(req: NextRequest) {
  const txHash = req.nextUrl.searchParams.get('tx');
  const victim = req.nextUrl.searchParams.get('victim');

  if (!txHash || !victim) {
    return NextResponse.json({ valid: false, error: 'Missing tx or victim param' }, { status: 400 });
  }

  const victimLower = victim.toLowerCase();

  try {
    // 1. Check the main transaction via RPC
    const rpcRes = await fetch(BASE_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_getTransactionByHash',
        params: [txHash],
        id: 1,
      }),
    });
    const rpcData = await rpcRes.json();

    if (!rpcData.result) {
      return NextResponse.json({ valid: false, error: 'Transaction not found on Base. Check the hash.' }, { status: 404 });
    }

    const txFrom = (rpcData.result.from || '').toLowerCase();
    const txTo = (rpcData.result.to || '').toLowerCase();

    if (txFrom === victimLower || txTo === victimLower) {
      return NextResponse.json({ valid: true, role: txFrom === victimLower ? 'sender' : 'receiver' });
    }

    // 2. Check internal transactions via Blockscout
    const baseUrl = EXPLORER_API.replace(/\/api$/, '');
    try {
      const intRes = await fetch(`${baseUrl}/api/v2/transactions/${txHash}/internal-transactions`, {
        signal: AbortSignal.timeout(8000),
      });
      if (intRes.ok) {
        const intData = await intRes.json();
        const items = (intData.items || []) as Record<string, unknown>[];
        for (const item of items) {
          const from = item.from as Record<string, string> | null;
          const to = item.to as Record<string, string> | null;
          if (from?.hash?.toLowerCase() === victimLower || to?.hash?.toLowerCase() === victimLower) {
            return NextResponse.json({ valid: true, role: 'internal_tx' });
          }
        }
      }
    } catch { /* Blockscout timeout — continue */ }

    // 3. Check token transfers
    try {
      const tokRes = await fetch(`${baseUrl}/api/v2/transactions/${txHash}/token-transfers`, {
        signal: AbortSignal.timeout(8000),
      });
      if (tokRes.ok) {
        const tokData = await tokRes.json();
        const items = (tokData.items || []) as Record<string, unknown>[];
        for (const item of items) {
          const from = item.from as Record<string, string> | null;
          const to = item.to as Record<string, string> | null;
          if (from?.hash?.toLowerCase() === victimLower || to?.hash?.toLowerCase() === victimLower) {
            return NextResponse.json({ valid: true, role: 'token_transfer' });
          }
        }
      }
    } catch { /* Blockscout timeout — continue */ }

    return NextResponse.json({
      valid: false,
      error: `Victim address not found in this transaction. The tx is from ${txFrom.slice(0, 10)}... to ${txTo.slice(0, 10)}... — neither matches the victim wallet.`,
    }, { status: 400 });

  } catch (err) {
    return NextResponse.json({
      valid: false,
      error: 'Could not verify transaction. Try again.',
    }, { status: 500 });
  }
}
