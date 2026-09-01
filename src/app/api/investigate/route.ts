// Investigation API — start new cases and list existing ones
// POST /api/investigate — Start a new investigation
// GET  /api/investigate — List cases + stats

import { NextRequest, NextResponse } from 'next/server';
import { getSharedCoordinator } from '@/agents/shared';
import { isValidAddress, isValidTxHash } from '@/chain/utils';
import { requireAuth } from '@/lib/auth';

// Simple in-memory rate limiter: max 5 investigations per minute
const recentRequests: number[] = [];
const RATE_LIMIT = 5;
const RATE_WINDOW = 60_000;

function checkRateLimit(): boolean {
  const now = Date.now();
  // Remove entries older than the window
  while (recentRequests.length > 0 && recentRequests[0] < now - RATE_WINDOW) {
    recentRequests.shift();
  }
  if (recentRequests.length >= RATE_LIMIT) return false;
  recentRequests.push(now);
  return true;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    if (!checkRateLimit()) {
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

    const caseData = await coordinator.getCase(caseId);

    return NextResponse.json({ success: true, caseId, case: caseData });
  } catch (error) {
    console.error('[API] Investigation error:', error);
    return NextResponse.json(
      { error: 'Investigation failed', details: String(error) },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const coordinator = getSharedCoordinator();
    const caseId = req.nextUrl.searchParams.get('caseId');

    if (caseId) {
      const caseData = await coordinator.getCase(caseId);
      if (!caseData) {
        return NextResponse.json({ error: 'Case not found' }, { status: 404 });
      }
      return NextResponse.json({ case: caseData });
    }

    const cases = await coordinator.getAllCases();
    const stats = await coordinator.getStats();

    return NextResponse.json({ cases, stats });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch investigations', details: String(error) },
      { status: 500 },
    );
  }
}
