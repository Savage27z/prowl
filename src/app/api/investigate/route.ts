// Investigation API — start new cases and list existing ones
// POST /api/investigate — Start a new investigation
// GET  /api/investigate — List cases + stats

import { NextRequest, NextResponse } from 'next/server';
import { getSharedCoordinator } from '@/agents/shared';
import { getCaseEvents } from '@/agents/coordinator';
import { isValidAddress, isValidTxHash } from '@/chain/utils';
import { requireAuth } from '@/lib/auth';

// Per-address rate limiter: max 5 investigations per minute per wallet
const recentRequests = new Map<string, number[]>();
const RATE_LIMIT = 5;
const RATE_WINDOW = 60_000;

function checkRateLimit(address: string): boolean {
  const now = Date.now();
  const key = address.toLowerCase();
  const timestamps = recentRequests.get(key) || [];
  // Remove entries older than the window
  while (timestamps.length > 0 && timestamps[0] < now - RATE_WINDOW) {
    timestamps.shift();
  }
  if (timestamps.length >= RATE_LIMIT) return false;
  timestamps.push(now);
  recentRequests.set(key, timestamps);
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    if (!checkRateLimit(auth.address)) {
      return NextResponse.json(
        { error: 'Rate limited — max 5 investigations per minute' },
        { status: 429 },
      );
    }
    const body = await req.json();
    const { bountyId, victimWallet, incidentTx, reward, description } = body;

    if (!victimWallet || !incidentTx) {
      return NextResponse.json(
        { error: 'victimWallet and incidentTx are required' },
        { status: 400 },
      );
    }

    if (!isValidAddress(victimWallet)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format — expected 0x followed by 40 hex characters' },
        { status: 400 },
      );
    }

    if (!isValidTxHash(incidentTx)) {
      return NextResponse.json(
        { error: 'Invalid transaction hash format — expected 0x followed by 64 hex characters' },
        { status: 400 },
      );
    }

    if (description && typeof description === 'string' && description.length > 2000) {
      return NextResponse.json(
        { error: 'Description must be under 2000 characters' },
        { status: 400 },
      );
    }

    const coordinator = getSharedCoordinator();

    const caseId = await coordinator.startInvestigation(
      bountyId || `manual-${Date.now()}`,
      victimWallet,
      incidentTx,
      reward || '0 ETH',
      description,
    );

    // Run the investigation pipeline synchronously so results are available
    // immediately — serverless Lambdas don't share in-memory state, so
    // after() would store events on a Lambda the client never polls
    await coordinator.runInvestigation(caseId);

    const caseData = await coordinator.getCase(caseId);
    const events = getCaseEvents(caseId);

    return NextResponse.json({ success: true, caseId, case: caseData, events });
  } catch (error) {
    console.error('[API] Investigation error:', error);
    return NextResponse.json(
      { error: 'Investigation failed' },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    const coordinator = getSharedCoordinator();
    const caseId = req.nextUrl.searchParams.get('caseId');

    if (caseId) {
      const caseData = await coordinator.getCase(caseId);
      if (!caseData) {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }
      // Include pipeline events for polling-based live feed
      const events = getCaseEvents(caseId);
      return NextResponse.json({ case: caseData, events });
    }

    const cases = await coordinator.getAllCases();
    const stats = await coordinator.getStats();

    return NextResponse.json({ cases, stats });
  } catch (error) {
    console.error('[API] Fetch investigations error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch investigations' },
      { status: 500 },
    );
  }
}
