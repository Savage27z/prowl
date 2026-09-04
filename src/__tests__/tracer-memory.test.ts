// Agent-level integration test — runs the REAL TracerAgent twice.
//
// The pipeline test proves the memory *algorithm* is correct. This proves
// TracerAgent actually uses it: identical chain data, identical candidate
// branches, and the only difference is what is in Sibyl Memory.
//
// Without memory the tracer follows the money (5 ETH branch first).
// With case A's analysis in memory it follows the intelligence (the known
// 0.5 ETH drainer first) — even though that branch is 10x smaller.
//
// If loadMemoryDirectives() or the branch-selection code in traceFromAddress()
// regressed, this test fails. That is the point.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const VICTIM = '0x1111111111111111111111111111111111111111';
const THIEF = '0x2222222222222222222222222222222222222222';
const DRAINER = '0x3333333333333333333333333333333333333333';
const BIG = '0x4444444444444444444444444444444444444444';
const MID = '0x5555555555555555555555555555555555555555';
const INCIDENT_TX = '0x' + 'ab'.repeat(32);

// The thief splits funds three ways. DRAINER receives the SMALLEST amount,
// so any value-based strategy ranks it last.
const OUTGOING = [
  { hash: '0x' + '11'.repeat(32), from: THIEF, to: BIG, value: '5.0', timestamp: '2026-09-01T00:00:00Z', blockNumber: 1, gasUsed: '0', input: '0x', isError: false },
  { hash: '0x' + '22'.repeat(32), from: THIEF, to: MID, value: '2.0', timestamp: '2026-09-01T00:01:00Z', blockNumber: 2, gasUsed: '0', input: '0x', isError: false },
  { hash: '0x' + '33'.repeat(32), from: THIEF, to: DRAINER, value: '0.5', timestamp: '2026-09-01T00:02:00Z', blockNumber: 3, gasUsed: '0', input: '0x', isError: false },
];

vi.mock('@/chain/reader', () => ({
  ChainReader: class {
    async getTransaction(hash: string) {
      return { hash, from: VICTIM, to: THIEF, value: '7.5', timestamp: '2026-09-01T00:00:00Z', blockNumber: 1, gasUsed: '0', input: '0x', isError: false };
    }
    // Only the thief has outgoing transfers; every downstream address is a
    // dead end, which keeps the trace shallow and deterministic.
    async getAllOutgoingTransactions(address: string) {
      return address.toLowerCase() === THIEF.toLowerCase() ? OUTGOING : [];
    }
    async isContract() { return false; }
    async getBalance(address: string) { return { address, balance: '0' }; }
    async getBytecodeHash() { return null; }
    async getLatestActivity() { return { hasNewActivity: false, latestTx: null }; }
  },
  isKnownAddress: () => ({ known: false, label: null, category: null, terminal: false }),
}));

// Keep the AI out of it — this test is about memory, not model output.
// aiBranchPriority is skipped anyway (it needs >3 candidates; we supply 3).
vi.mock('@/agents/ai', () => ({
  callAI: async () => 'Test summary — AI stubbed.',
}));

const { TracerAgent } = await import('@/agents/tracer');
const { getSibylMemory } = await import('@/memory/sibyl');
const { COLLECTIONS } = await import('@/memory/schemas');
type Analysis = import('@/memory/schemas').Analysis;

describe('TracerAgent — memory changes real branch selection', () => {
  const memory = getSibylMemory();

  beforeEach(async () => {
    await memory.clearAll();
  });

  it('without memory: follows the largest transfer', async () => {
    const tracer = new TracerAgent();
    const result = await tracer.startTrace('case-no-memory', INCIDENT_TX, VICTIM);

    const firstBranch = result.hops.find((h) => h.from_address.toLowerCase() === THIEF.toLowerCase());
    expect(firstBranch).toBeDefined();
    // Pure value ordering — the 5 ETH branch wins.
    expect(firstBranch!.to_address.toLowerCase()).toBe(BIG.toLowerCase());
    expect(firstBranch!.to_address.toLowerCase()).not.toBe(DRAINER.toLowerCase());
  });

  it('with memory: follows the known drainer despite it being 10x smaller', async () => {
    // Case A taught the swarm that DRAINER is a high-risk address.
    const priorAnalysis: Analysis = {
      case_id: 'case-A',
      hop_number: 1,
      address_analyzed: DRAINER,
      risk_level: 'high',
      pattern_matches: ['pat-001'],
      similar_cases: [],
      notes: 'Confirmed drainer in a prior investigation.',
      confidence: 0.92,
      directive: { action: 'prioritize', reason: 'known_drainer', confidence: 0.92 },
    };
    await memory.store(
      COLLECTIONS.ANALYSIS,
      priorAnalysis as unknown as Record<string, unknown>,
      'case-A-analysis-1-main',
    );

    const tracer = new TracerAgent();
    const result = await tracer.startTrace('case-with-memory', INCIDENT_TX, VICTIM);

    const firstBranch = result.hops.find((h) => h.from_address.toLowerCase() === THIEF.toLowerCase());
    expect(firstBranch).toBeDefined();
    // Memory overrides value ordering — the 0.5 ETH drainer is traced first.
    expect(firstBranch!.to_address.toLowerCase()).toBe(DRAINER.toLowerCase());
    expect(firstBranch!.flagged).toBe(true);
    expect(firstBranch!.flag_reason).toContain('Memory hit');
  });

  it('an explicit skip directive removes a branch from tracing', async () => {
    // Analyst marks BIG as a verified service — the only way to earn a skip.
    const skipAnalysis: Analysis = {
      case_id: 'case-A',
      hop_number: 1,
      address_analyzed: BIG,
      risk_level: 'low',
      pattern_matches: [],
      similar_cases: ['case-X', 'case-Y'],
      notes: 'Verified exchange deposit address.',
      confidence: 0.98,
      directive: { action: 'skip', reason: 'verified_service', confidence: 0.98 },
    };
    await memory.store(
      COLLECTIONS.ANALYSIS,
      skipAnalysis as unknown as Record<string, unknown>,
      'case-A-analysis-skip',
    );

    const tracer = new TracerAgent();
    const result = await tracer.startTrace('case-skip', INCIDENT_TX, VICTIM);

    const branches = result.hops
      .filter((h) => h.from_address.toLowerCase() === THIEF.toLowerCase())
      .map((h) => h.to_address.toLowerCase());

    // BIG was skipped despite being the largest transfer.
    expect(branches).not.toContain(BIG.toLowerCase());
    expect(branches).toContain(MID.toLowerCase());
  });

  it('low risk alone does NOT cause a skip (insufficient evidence)', async () => {
    // Same address, same low risk — but no explicit directive this time.
    const weakAnalysis: Analysis = {
      case_id: 'case-A',
      hop_number: 1,
      address_analyzed: BIG,
      risk_level: 'low',
      pattern_matches: [],
      similar_cases: ['case-X', 'case-Y'],
      notes: 'Nothing conclusive found. Possibly verified clean.',
      confidence: 0.4,
    };
    await memory.store(
      COLLECTIONS.ANALYSIS,
      weakAnalysis as unknown as Record<string, unknown>,
      'case-A-analysis-weak',
    );

    const tracer = new TracerAgent();
    const result = await tracer.startTrace('case-weak', INCIDENT_TX, VICTIM);

    const branches = result.hops
      .filter((h) => h.from_address.toLowerCase() === THIEF.toLowerCase())
      .map((h) => h.to_address.toLowerCase());

    // Still traced — memory must not hide a route on weak evidence.
    expect(branches).toContain(BIG.toLowerCase());
  });
});
