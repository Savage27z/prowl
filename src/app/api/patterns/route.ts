// Patterns API — retrieve detected attack patterns
// Pattern Library API — query learned patterns
import { NextResponse } from 'next/server';
import { getSibylMemory } from '@/memory/sibyl';
import { COLLECTIONS } from '@/memory/schemas';
import type { Pattern } from '@/memory/schemas';
import { requireAuth } from '@/lib/auth';

const memory = getSibylMemory();

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;
    const patterns = await memory.query<Pattern>(COLLECTIONS.PATTERNS, {
      sort: { field: 'times_matched', order: 'desc' },
    });

    return NextResponse.json({
      patterns,
      total: patterns.length,
      byType: {
        fund_splitting: patterns.filter((p) => p.pattern_type === 'fund_splitting').length,
        rapid_movement: patterns.filter((p) => p.pattern_type === 'rapid_movement').length,
        contract_interaction: patterns.filter((p) => p.pattern_type === 'contract_interaction').length,
        bridge_usage: patterns.filter((p) => p.pattern_type === 'bridge_usage').length,
        mixer_usage: patterns.filter((p) => p.pattern_type === 'mixer_usage').length,
        cex_deposit: patterns.filter((p) => p.pattern_type === 'cex_deposit').length,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch patterns', details: String(error) },
      { status: 500 }
    );
  }
}
