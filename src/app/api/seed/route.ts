// Seed API — populate database with demo investigation data
// POST /api/seed — Populate memory with sample data for demo
// Seeds patterns + solved cases so the Analyst has data to match against

import { NextResponse } from 'next/server';
import { getSibylMemory, waitForMemoryReady } from '@/memory/sibyl';
import { COLLECTIONS } from '@/memory/schemas';
import type { Pattern, Case } from '@/memory/schemas';
import { requireAuth } from '@/lib/auth';

const memory = getSibylMemory();

const SEED_PATTERNS: Pattern[] = [
  {
    pattern_id: 'pat-001',
    pattern_type: 'fund_splitting',
    description: 'Funds split into 5+ wallets within 1 hour of theft — classic laundering pattern',
    first_seen_case: 'prowl-seed-001',
    times_matched: 7,
    confidence: 0.85,
    related_addresses: [
      '0x1234567890abcdef1234567890abcdef12345678',
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    ],
    bytecode_hash: null,
  },
  {
    pattern_id: 'pat-002',
    pattern_type: 'rapid_movement',
    description: '3+ hops within 10 minutes — rapid fund movement to evade tracking',
    first_seen_case: 'prowl-seed-001',
    times_matched: 4,
    confidence: 0.75,
    related_addresses: [],
    bytecode_hash: null,
  },
  {
    pattern_id: 'pat-003',
    pattern_type: 'bridge_usage',
    description: 'Funds sent to bridge contract — cross-chain escape attempt',
    first_seen_case: 'prowl-seed-002',
    times_matched: 3,
    confidence: 0.9,
    related_addresses: ['0xDeaD000000000000000000000000000000000101'],
    bytecode_hash: null,
  },
  {
    pattern_id: 'pat-004',
    pattern_type: 'contract_interaction',
    description: 'Funds routed through unverified contract — possible mixer or proxy',
    first_seen_case: 'prowl-seed-003',
    times_matched: 2,
    confidence: 0.7,
    related_addresses: [],
    bytecode_hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
  },
  {
    pattern_id: 'pat-005',
    pattern_type: 'cex_deposit',
    description: 'Funds deposited to known CEX hot wallet — final destination',
    first_seen_case: 'prowl-seed-001',
    times_matched: 5,
    confidence: 0.95,
    related_addresses: [
      '0xDeaD000000000000000000000000000000000102',
      '0xDeaD000000000000000000000000000000000103',
    ],
    bytecode_hash: null,
  },
];

const SEED_CASES: Case[] = [
  {
    case_id: 'prowl-seed-001',
    bounty_id: 'bounty-seed-001',
    victim_wallet: '0xDeaD000000000000000000000000000000000001',
    incident_tx: '0x' + 'a'.repeat(64),
    status: 'solved',
    reward: '0.1 ETH',
    created_at: '2026-09-01T10:00:00Z',
    solved_at: '2026-09-01T14:00:00Z',
    total_hops_traced: 6,
    total_funds_traced: '2.0 ETH',
    agents_involved: ['tracer', 'analyst', 'monitor'],
  },
  {
    case_id: 'prowl-seed-002',
    bounty_id: 'bounty-seed-002',
    victim_wallet: '0xDeaD000000000000000000000000000000000002',
    incident_tx: '0x' + 'b'.repeat(64),
    status: 'monitoring',
    reward: '0.05 ETH',
    created_at: '2026-09-02T08:00:00Z',
    solved_at: null,
    total_hops_traced: 4,
    total_funds_traced: '1.5 ETH',
    agents_involved: ['tracer', 'analyst', 'monitor'],
  },
  {
    case_id: 'prowl-seed-003',
    bounty_id: 'bounty-seed-003',
    victim_wallet: '0xDeaD000000000000000000000000000000000003',
    incident_tx: '0x' + 'c'.repeat(64),
    status: 'solved',
    reward: '0.2 ETH',
    created_at: '2026-09-03T09:00:00Z',
    solved_at: '2026-09-03T16:00:00Z',
    total_hops_traced: 8,
    total_funds_traced: '5.0 ETH',
    agents_involved: ['tracer', 'analyst'],
  },
];

export async function POST() {
  try {
    const auth = await requireAuth();
    if (auth instanceof NextResponse) return auth;

    // Module-scope hydration is not awaited; without this a cold lambda
    // serves an empty store and the UI renders zeros.
    await waitForMemoryReady();
    let patternsStored = 0;
    let casesStored = 0;

    for (const p of SEED_PATTERNS) {
      await memory.store(COLLECTIONS.PATTERNS, p as unknown as Record<string, unknown>, p.pattern_id);
      patternsStored++;
    }

    for (const c of SEED_CASES) {
      await memory.store(COLLECTIONS.CASES, c as unknown as Record<string, unknown>, c.case_id);
      casesStored++;
    }

    return NextResponse.json({
      success: true,
      message: `Seeded ${patternsStored} patterns and ${casesStored} cases`,
      patterns: patternsStored,
      cases: casesStored,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Seed failed' },
      { status: 500 },
    );
  }
}
