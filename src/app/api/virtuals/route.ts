// Virtuals API — ACP service registration and management
import { NextResponse } from 'next/server';
import {
  isACPAvailable,
  browseAgents,
  PROWL_OFFERINGS,
} from '@/virtuals/acp';

/**
 * GET /api/virtuals — ACP status + available agents
 */
export async function GET() {
  const available = isACPAvailable();

  if (!available) {
    return NextResponse.json({
      acp: false,
      reason: 'VIRTUALS_API_KEY not set or ACP SDK not installed',
      offerings: PROWL_OFFERINGS,
    });
  }

  try {
    const agents = await browseAgents();
    return NextResponse.json({
      acp: true,
      offerings: PROWL_OFFERINGS,
      networkAgents: agents.length,
      agents: agents.slice(0, 20), // first 20
    });
  } catch (err) {
    return NextResponse.json({
      acp: true,
      error: String(err),
      offerings: PROWL_OFFERINGS,
    });
  }
}
