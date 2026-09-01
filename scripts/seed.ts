// Seed — populate local store with realistic demo data
// Seed script — populates Sibyl Memory with sample patterns and cases
// Run before demo to make Analyst have patterns to match against

import { getSibylMemory } from '../src/memory/sibyl';
import { COLLECTIONS } from '../src/memory/schemas';
import type { Pattern, Case, Hop, Analysis } from '../src/memory/schemas';

async function seed() {
  const memory = getSibylMemory();
  await memory.init();

  console.log('🌱 Seeding Prowl memory with sample data...\n');

  // Sample patterns
  const patterns: Pattern[] = [
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
      description: 'Funds sent to bridge contract — attempting cross-chain movement',
      first_seen_case: 'prowl-seed-002',
      times_matched: 3,
      confidence: 0.90,
      related_addresses: ['0x3154cf16ccdb4c6d922629664174b904d80f2c36'],
      bytecode_hash: null,
    },
    {
      pattern_id: 'pat-004',
      pattern_type: 'contract_interaction',
      description: 'Funds routed through unverified smart contract — possible mixer or laundering proxy',
      first_seen_case: 'prowl-seed-003',
      times_matched: 2,
      confidence: 0.70,
      related_addresses: [],
      bytecode_hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    },
    {
      pattern_id: 'pat-005',
      pattern_type: 'cex_deposit',
      description: 'Funds deposited to known CEX hot wallet — final destination reached',
      first_seen_case: 'prowl-seed-001',
      times_matched: 5,
      confidence: 0.95,
      related_addresses: [
        '0x3154cf16ccdb4c6d922629664174b904d80f2c35',
        '0x1ab4973a48dc892cd9971ece8e01dcc7688f8f23',
      ],
      bytecode_hash: null,
    },
  ];

  // Sample solved case
  const case1: Case = {
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
  };

  // Sample active case
  const case2: Case = {
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
  };

  const case3: Case = {
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
  };

  // Store patterns
  for (const pattern of patterns) {
    await memory.store(COLLECTIONS.PATTERNS, pattern as unknown as Record<string, unknown>, pattern.pattern_id);
    console.log(`  ✅ Pattern: ${pattern.pattern_id} — ${pattern.description.slice(0, 50)}...`);
  }

  // Store cases
  for (const c of [case1, case2, case3]) {
    await memory.store(COLLECTIONS.CASES, c as unknown as Record<string, unknown>, c.case_id);
    console.log(`  ✅ Case: ${c.case_id} (${c.status})`);
  }

  console.log('\n🎉 Seed complete!');
  console.log(`  ${patterns.length} patterns stored`);
  console.log(`  3 sample cases stored`);
  console.log('\nThe Analyst now has patterns to match against in new investigations.');
}

seed().catch(console.error);
