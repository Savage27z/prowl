// Investigation API — start new cases and list existing ones
// POST /api/investigate — Start a new investigation
// GET  /api/investigate — List cases + stats

import { NextRequest, NextResponse } from 'next/server';
import { getSharedCoordinator } from '@/agents/shared';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { bountyId, victimWallet, incidentTx, reward, description } = body;

    if (!victimWallet || !incidentTx) {
      return NextResponse.json(
        { error: 'victimWallet and incidentTx are required' },
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
