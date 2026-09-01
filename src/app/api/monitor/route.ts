// Monitor API — trigger watchlist checks and get status
// Monitor API — check watchlist and trigger checks
import { NextRequest, NextResponse } from 'next/server';
import { MonitorAgent } from '@/agents/monitor';
import { getSharedCoordinator } from '@/agents/shared';
import { requireAuth } from '@/lib/auth';

const monitor = new MonitorAgent();

// GET /api/monitor — Get monitoring status
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const status = await monitor.getStatus();
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: 'Monitor status failed' },
      { status: 500 }
    );
  }
}

// POST /api/monitor — Trigger a watch check
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const body = await req.json().catch(() => ({}));
    const { caseId } = body;

    if (caseId) {
      // Check specific case
      const result = await monitor.checkCase(caseId);
      return NextResponse.json(result);
    }

    // Check all watched addresses
    const coordinator = getSharedCoordinator();
    await coordinator.runMonitorCheck();
    const status = await monitor.getStatus();

    return NextResponse.json({
      success: true,
      message: 'Monitor check complete',
      ...status,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Monitor check failed' },
      { status: 500 }
    );
  }
}
