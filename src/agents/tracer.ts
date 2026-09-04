// Tracer Agent — follows stolen funds hop by hop across Base
// Agent 1: Tracer
// Follows the money trail across wallets on Base
// Writes hop data to Sibyl Memory for Analyst and Monitor to read

import { getSibylMemory, waitForMemoryReady } from '@/memory/sibyl';
import { COLLECTIONS } from '@/memory/schemas';
import type { Hop, Case } from '@/memory/schemas';
import { ChainReader, isKnownAddress } from '@/chain/reader';
import { callAI } from '@/agents/ai';

const chain = new ChainReader();

interface TraceResult {
  hops: Hop[];
  status: 'tracing' | 'dead_end' | 'exchange_found' | 'bridge_found';
  summary: string;
}

export class TracerAgent {
  private memory = getSibylMemory();
  private maxHops = 8;          // max depth per branch
  private maxBranches = 3;       // max branches to follow at each split
  private maxTotalHops = 25;     // hard cap across ALL branches
  private totalHopsTraced = 0;   // global counter
  private traceDeadline = 0;     // timestamp ceiling (25s)
  private excludeHashes = new Set<string>(); // tx hashes to skip (prevent loops)
  // Memory-driven directives from Analyst (cross-case intelligence)
  private skipAddresses = new Set<string>();  // addresses Analyst says to skip
  private prioritizeAddresses = new Set<string>(); // addresses Analyst says to prioritize
  private memoryHits: string[] = [];          // log of memory-driven decisions

  // Start tracing from an incident transaction
  async startTrace(caseId: string, incidentTxHash: string, victimWallet: string, suspectAddress?: string): Promise<TraceResult> {

    // Get the incident transaction
    const tx = await chain.getTransaction(incidentTxHash);
    if (!tx) {
      return {
        hops: [],
        status: 'dead_end',
        summary: 'Could not fetch incident transaction',
      };
    }

    // Load cross-case intelligence from Analyst's memory
    // This is the core memory feedback loop: Analyst writes directives,
    // Tracer reads them to skip known-safe addresses, prioritize suspects,
    // and avoid re-tracing paths already investigated in prior cases.
    this.skipAddresses.clear();
    this.prioritizeAddresses.clear();
    this.memoryHits = [];
    // Ensure memory is fully hydrated before loading cross-case directives
    await waitForMemoryReady();
    await this.loadMemoryDirectives();

    // Determine where to start tracing:
    // Priority 1: If suspect/drainer address is provided, trace directly from there.
    // Priority 2: If tx.from IS the victim — trace from tx.to (the thief/recipient).
    // Priority 3: If tx.to IS the victim — trace from tx.from (the sender).
    // Default: trace from tx.to.
    let traceStartAddress: string;
    let traceStartAmount: string;

    if (suspectAddress) {
      // User provided the drainer address — trace directly from there
      traceStartAddress = suspectAddress;
      traceStartAmount = tx.value;
    } else {
      const victimLower = victimWallet.toLowerCase();
      if (tx.from.toLowerCase() === victimLower) {
        // Victim sent funds — trace from the recipient (the thief)
        traceStartAddress = tx.to;
        traceStartAmount = tx.value;
      } else if (tx.to.toLowerCase() === victimLower) {
        // Someone sent funds TO victim — trace back from the sender
        traceStartAddress = tx.from;
        traceStartAmount = tx.value;
      } else {
        // Neither — trace from tx.to
        traceStartAddress = tx.to;
        traceStartAmount = tx.value;
      }
    }

    // Reset per-investigation limits
    this.totalHopsTraced = 0;
    this.traceDeadline = Date.now() + 25_000; // 25s hard ceiling
    // Exclude the incident tx itself to prevent circular tracing
    this.excludeHashes = new Set([incidentTxHash.toLowerCase()]);

    // Trace the main branch
    const hops = await this.traceFromAddress(
      caseId,
      traceStartAddress,
      traceStartAmount,
      incidentTxHash,
      1,
      'main'
    );

    // Update case in memory
    await this.updateCase(caseId, hops);

    const status = this.determineStatus(hops);

    // Generate summary using AI
    const summary = await this.generateSummary(caseId, hops, status);

    return { hops, status, summary };
  }

  // Trace funds from a specific address
  private async traceFromAddress(
    caseId: string,
    address: string,
    amount: string,
    parentTxHash: string,
    hopNumber: number,
    branchId: string
  ): Promise<Hop[]> {
    // Enforce all limits
    if (hopNumber > this.maxHops) return [];
    if (this.totalHopsTraced >= this.maxTotalHops) return [];
    if (Date.now() > this.traceDeadline) return [];

    const hops: Hop[] = [];

    // Check if this is a known address (exchange, bridge, DEX, mixer, etc.)
    // Terminal (CEX deposit, bridge) → write a final hop and stop.
    // Non-terminal (DEX router, mixer, token, infra) → carry the label forward
    // as an annotation on whatever hop we write next, and keep tracing.
    // Note: we must NOT write a separate hop here for the non-terminal case —
    // writeHop keys on `case-hop-<n>-<branch>`, so a second write at the same
    // hop number would silently overwrite this one and double-count the hop.
    const known = isKnownAddress(address);
    let knownAnnotation: string | null = null;
    if (known.known) {
      knownAnnotation = `Known ${known.category}: ${known.label}`;

      if (known.terminal) {
        const hop: Hop = {
          case_id: caseId,
          hop_number: hopNumber,
          from_address: address,
          to_address: address,
          amount,
          tx_hash: parentTxHash,
          timestamp: new Date().toISOString(),
          is_split: false,
          branch_id: branchId,
          flagged: true,
          flag_reason: knownAnnotation,
        };
        hops.push(hop);
        this.totalHopsTraced++;
        await this.writeHop(hop);
        return hops;
      }
      // Non-terminal: fall through, annotation is applied below
    }

    // Check if this is a contract
    const isContractAddr = await chain.isContract(address);

    // Get ALL outgoing transactions (regular + internal + token transfers)
    const outgoingTxs = await chain.getAllOutgoingTransactions(address, 0, this.excludeHashes);

    if (outgoingTxs.length === 0) {
      // Dead end — funds sitting in this wallet
      const hop: Hop = {
        case_id: caseId,
        hop_number: hopNumber,
        from_address: address,
        to_address: address,
        amount,
        tx_hash: parentTxHash,
        timestamp: new Date().toISOString(),
        is_split: false,
        branch_id: branchId,
        flagged: true,
        flag_reason: knownAnnotation
          ? `${knownAnnotation} — no further outgoing transfers`
          : 'Dead end — funds sitting in wallet',
      };
      hops.push(hop);
      this.totalHopsTraced++;
      await this.writeHop(hop);
      return hops;
    }

    // Flag high-activity addresses (likely mixers, bots, or exchanges)
    if (outgoingTxs.length > 500) {
      const hop: Hop = {
        case_id: caseId,
        hop_number: hopNumber,
        from_address: address,
        to_address: address,
        amount,
        tx_hash: parentTxHash,
        timestamp: new Date().toISOString(),
        is_split: false,
        branch_id: branchId,
        flagged: true,
        flag_reason: knownAnnotation
          ? `${knownAnnotation} — high activity (${outgoingTxs.length} outgoing txs), trail not attributable`
          : `High-activity address (${outgoingTxs.length} outgoing txs) — possible mixer/exchange`,
      };
      hops.push(hop);
      this.totalHopsTraced++;
      await this.writeHop(hop);
      return hops;
    }

    // Follow the money: sort by value (largest first) and take top branches
    const sorted = [...outgoingTxs].sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
    const isSplit = sorted.length > 1;

    // ── MEMORY-DRIVEN BRANCH SELECTION ──────────────────────────────
    // Priority 1: Memory directives (cross-case intelligence from Analyst)
    // Priority 2: AI branch prioritization (per-case reasoning)
    // Priority 3: Value-based sorting (default)
    //
    // This is where memory changes the investigation outcome:
    // With memory: known high-risk addresses from prior cases get traced first
    // Without memory: purely value-based, may miss the real laundering path

    // Separate memory-prioritized branches from the rest
    const memoryPrioritized = sorted.filter(
      tx => this.prioritizeAddresses.has(tx.to.toLowerCase())
    );
    const memorySkipped = sorted.filter(
      tx => this.skipAddresses.has(tx.to.toLowerCase())
    );
    const remaining = sorted.filter(
      tx => !this.prioritizeAddresses.has(tx.to.toLowerCase()) &&
            !this.skipAddresses.has(tx.to.toLowerCase())
    );

    // Log memory-driven decisions
    for (const tx of memoryPrioritized) {
      this.memoryHits.push(
        `DECISION: Prioritized ${tx.to.slice(0, 10)}... (memory: known from prior case)`
      );
    }
    for (const tx of memorySkipped) {
      this.memoryHits.push(
        `DECISION: Skipped ${tx.to.slice(0, 10)}... (memory: known safe/irrelevant)`
      );
    }

    // Build branch list: memory-prioritized first, then AI/value-sorted rest
    let branchesToTrace = [...memoryPrioritized, ...remaining].slice(0, this.maxBranches);

    // AI-powered branch prioritization for the remaining (non-memory) branches
    if (remaining.length > 3) {
      const aiPriority = await this.aiBranchPriority(address, remaining.slice(0, 8), isContractAddr);
      if (aiPriority.length > 0) {
        const prioritized = aiPriority
          .map(addr => remaining.find(tx => tx.to.toLowerCase() === addr.toLowerCase()))
          .filter((tx): tx is NonNullable<typeof tx> => tx != null);
        const rest = remaining.filter(tx => !aiPriority.includes(tx.to.toLowerCase()));
        branchesToTrace = [...memoryPrioritized, ...prioritized, ...rest].slice(0, this.maxBranches);
      }
    }

    for (let i = 0; i < branchesToTrace.length; i++) {
      // Check limits before each branch
      if (this.totalHopsTraced >= this.maxTotalHops || Date.now() > this.traceDeadline) break;

      const tx = branchesToTrace[i];
      const newBranchId = isSplit ? `${branchId}-${i}` : branchId;

      // Check if this destination was informed by memory
      const isMemoryDriven = this.prioritizeAddresses.has(tx.to.toLowerCase());
      const baseReason = isMemoryDriven
        ? 'Memory hit — address flagged in prior investigation'
        : isContractAddr
          ? 'Contract interaction detected'
          : null;
      // Carry the non-terminal known-address label (DEX/mixer/token) forward
      // so the hop records that funds passed through it
      const flagReason = knownAnnotation
        ? `Routed via ${knownAnnotation}${baseReason ? ` — ${baseReason}` : ''}`
        : baseReason;

      const hop: Hop = {
        case_id: caseId,
        hop_number: hopNumber,
        from_address: address,
        to_address: tx.to,
        amount: tx.value,
        tx_hash: tx.hash,
        timestamp: tx.timestamp,
        is_split: isSplit,
        branch_id: newBranchId,
        flagged: isContractAddr || isMemoryDriven || knownAnnotation !== null,
        flag_reason: flagReason,
      };

      hops.push(hop);
      this.totalHopsTraced++;
      this.excludeHashes.add(tx.hash.toLowerCase());
      await this.writeHop(hop);

      // Recursively trace the next hop
      const subHops = await this.traceFromAddress(
        caseId,
        tx.to,
        tx.value,
        tx.hash,
        hopNumber + 1,
        newBranchId
      );

      hops.push(...subHops);
    }

    return hops;
  }

  // Resume tracing from a Monitor alert
  async resumeTrace(caseId: string, address: string): Promise<TraceResult> {
    // Ensure memory is hydrated + load cross-case directives
    this.skipAddresses.clear();
    this.prioritizeAddresses.clear();
    this.memoryHits = [];
    await waitForMemoryReady();
    await this.loadMemoryDirectives();

    // Reset per-investigation limits
    this.totalHopsTraced = 0;
    this.traceDeadline = Date.now() + 25_000;
    this.excludeHashes = new Set();

    // Get existing hops to determine hop number
    const existingHops = await this.memory.query<Hop>(COLLECTIONS.HOPS, {
      filter: { case_id: caseId },
      sort: { field: 'hop_number', order: 'desc' },
      limit: 1,
    });

    const lastHopNumber = existingHops.length > 0 ? existingHops[0].hop_number : 0;
    const balance = await chain.getBalance(address);

    const hops = await this.traceFromAddress(
      caseId,
      address,
      balance.balance,
      '',
      lastHopNumber + 1,
      'resumed'
    );

    await this.updateCase(caseId, hops);

    const status = this.determineStatus(hops);
    const summary = await this.generateSummary(caseId, hops, status);

    return { hops, status, summary };
  }

  // AI-powered branch prioritization — picks which outgoing addresses
  // look most suspicious when funds split to multiple destinations
  private async aiBranchPriority(
    fromAddress: string,
    candidates: { to: string; value: string; hash: string; timestamp: string }[],
    isContract: boolean
  ): Promise<string[]> {
    try {
      const candidateList = candidates.map((tx, i) =>
        `${i + 1}. → ${tx.to} (${tx.value} ETH, ${tx.timestamp})`
      ).join('\n');

      const prompt = `You are tracing stolen crypto. Funds from ${fromAddress}${isContract ? ' (a smart contract)' : ''} were sent to ${candidates.length} addresses. Which ones are most likely part of the theft trail?

${candidateList}

Rank the top 3 most suspicious destinations by address. Respond with EXACTLY a JSON array of addresses (no markdown):
["0x...", "0x...", "0x..."]

Prioritize: large value transfers, round numbers, rapid timing, contract interactions, addresses that look like intermediaries rather than end users.`;

      const raw = await callAI(prompt, { maxTokens: 200, temperature: 0.2 });
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        return parsed.map((a: string) => a.toLowerCase()).slice(0, 3);
      }
      return [];
    } catch {
      return []; // Fallback to value-based sorting
    }
  }

  // Write hop to Sibyl Memory (L45 — referenced in README)
  private async writeHop(hop: Hop): Promise<void> {
    const hopId = `${hop.case_id}-hop-${hop.hop_number}-${hop.branch_id}`;
    await this.memory.store(COLLECTIONS.HOPS, hop as unknown as Record<string, unknown>, hopId);
  }

  // Load cross-case memory directives from Analyst's past analyses
  // This is where memory becomes load-bearing: past investigations teach
  // the Tracer which addresses to prioritize, skip, or flag immediately.
  // Without memory, the Tracer has no prior intelligence — every case starts blind.
  private async loadMemoryDirectives(): Promise<void> {
    try {
      // Load ALL past analyses (not just this case — cross-case intelligence)
      const allAnalyses = await this.memory.query<{
        address_analyzed: string;
        risk_level: string;
        notes: string;
        case_id: string;
        similar_cases: string[];
        pattern_matches: string[];
      }>(COLLECTIONS.ANALYSIS, {});

      // Load known patterns from memory
      const patterns = await this.memory.query<{
        pattern_type: string;
        related_addresses: string[];
        times_matched: number;
        description: string;
      }>(COLLECTIONS.PATTERNS, {});

      if (allAnalyses.length === 0 && patterns.length === 0) {
        this.memoryHits.push('NO_MEMORY: Operating without cross-case intelligence');
        return;
      }

      // Build directive sets from past analyses
      for (const analysis of allAnalyses) {
        const addr = analysis.address_analyzed.toLowerCase();

        // High-risk addresses from prior cases → prioritize tracing through them
        if (analysis.risk_level === 'high') {
          this.prioritizeAddresses.add(addr);
          this.memoryHits.push(
            `MEMORY_PRIORITIZE: ${addr.slice(0, 10)}... flagged HIGH in case ${analysis.case_id}`
          );
        }

        // Addresses that appeared in 2+ cases → known entity, prioritize
        if (analysis.similar_cases && analysis.similar_cases.length > 0) {
          this.prioritizeAddresses.add(addr);
          this.memoryHits.push(
            `MEMORY_CROSS_CASE: ${addr.slice(0, 10)}... seen in ${analysis.similar_cases.length + 1} cases`
          );
        }

        // Only skip addresses with strong evidence they are irrelevant:
        // - Must be low-risk AND analyzed in 2+ prior cases (not just one)
        // - "low" alone means "not enough evidence" — could still be the route
        if (
          (analysis.risk_level === 'low' || analysis.risk_level === 'none') &&
          analysis.similar_cases && analysis.similar_cases.length >= 2 &&
          analysis.notes?.includes('verified clean')
        ) {
          this.skipAddresses.add(addr);
          this.memoryHits.push(
            `MEMORY_SKIP: ${addr.slice(0, 10)}... verified clean across ${analysis.similar_cases.length + 1} cases`
          );
        }
      }

      // Pattern-linked addresses → skip or prioritize based on pattern type
      for (const pattern of patterns) {
        for (const addr of pattern.related_addresses) {
          const lower = addr.toLowerCase();
          if (pattern.pattern_type === 'bridge_usage' || pattern.pattern_type === 'fund_splitting') {
            // Known laundering patterns → prioritize these addresses
            this.prioritizeAddresses.add(lower);
            this.memoryHits.push(
              `MEMORY_PATTERN: ${lower.slice(0, 10)}... linked to ${pattern.pattern_type} (matched ${pattern.times_matched}x)`
            );
          }
        }
      }

      if (this.memoryHits.length > 0) {
        console.log(`[Tracer] Loaded ${this.memoryHits.length} memory directives: ${this.prioritizeAddresses.size} prioritize, ${this.skipAddresses.size} skip`);
      }
    } catch (err) {
      console.error('[Tracer] Failed to load memory directives:', err);
      this.memoryHits.push('MEMORY_ERROR: Could not load cross-case intelligence');
    }
  }

  private async updateCase(caseId: string, newHops: Hop[]): Promise<void> {
    const totalAmount = newHops.reduce((sum, h) => sum + parseFloat(h.amount), 0);
    await this.memory.update(COLLECTIONS.CASES, caseId, {
      total_hops_traced: newHops.length,
      total_funds_traced: `${totalAmount.toFixed(6)} ETH`,
      agents_involved: ['tracer'],
    });
  }

  private determineStatus(hops: Hop[]): TraceResult['status'] {
    const lastHop = hops[hops.length - 1];
    if (!lastHop) return 'dead_end';

    // Only terminal destinations (CEX, bridge) resolve the case.
    // Non-terminal known addresses (DEX, mixer, token, infra) don't.
    if (lastHop.flag_reason?.includes('Known cex:')) return 'exchange_found';
    if (lastHop.flag_reason?.includes('Known bridge:')) return 'bridge_found';

    if (lastHop.flag_reason?.includes('Dead end')) return 'dead_end';

    return 'tracing';
  }

  private async generateSummary(
    caseId: string,
    hops: Hop[],
    status: string
  ): Promise<string> {
    const hopSummary = hops.map((h) =>
      `Hop ${h.hop_number}: ${h.from_address.slice(0, 8)}... → ${h.to_address.slice(0, 8)}... (${h.amount} ETH)${h.flagged ? ` [FLAGGED: ${h.flag_reason}]` : ''}`
    ).join('\n');

    // Include memory state in the summary for transparency
    const memoryContext = this.memoryHits.length > 0
      ? `\nMemory directives active: ${this.memoryHits.length} (${this.prioritizeAddresses.size} prioritized, ${this.skipAddresses.size} skipped)`
      : '\nMemory: No cross-case intelligence available (first investigation or memory cleared)';

    const prompt = `You are an onchain forensic investigator. Summarize this fund tracing result for case ${caseId}:

Status: ${status}
Total hops: ${hops.length}
Splits detected: ${hops.filter((h) => h.is_split).length}
${memoryContext}

Hop trail:
${hopSummary}

Provide a concise 2-3 sentence summary of where the funds went and any notable patterns.`;

    return callAI(prompt);
  }
}
