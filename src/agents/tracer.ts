// Tracer Agent — follows stolen funds hop by hop across Base
// Agent 1: Tracer
// Follows the money trail across wallets on Base
// Writes hop data to Sibyl Memory for Analyst and Monitor to read

import { getSibylMemory } from '@/memory/sibyl';
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

  // Start tracing from an incident transaction
  async startTrace(caseId: string, incidentTxHash: string, victimWallet: string): Promise<TraceResult> {

    // Get the incident transaction
    const tx = await chain.getTransaction(incidentTxHash);
    if (!tx) {
      return {
        hops: [],
        status: 'dead_end',
        summary: 'Could not fetch incident transaction',
      };
    }

    // Check if Analyst has any tips for us from memory
    const existingAnalysis = await this.checkAnalystTips(caseId);
    if (existingAnalysis.length > 0) {
    }

    // Determine where to start tracing:
    // The goal is to follow the stolen funds FORWARD from the thief.
    // If tx.from IS the victim — victim sent funds out, trace from tx.to (the thief/recipient).
    // If tx.to IS the victim — someone sent funds to victim, trace from tx.from (the sender).
    // Otherwise — trace from tx.to as default.
    let traceStartAddress: string;
    let traceStartAmount: string;

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

    // Reset per-investigation limits
    this.totalHopsTraced = 0;
    this.traceDeadline = Date.now() + 25_000; // 25s hard ceiling

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

    // Check if this is a known address (exchange, bridge, etc.)
    const known = isKnownAddress(address);
    if (known.known) {
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
        flag_reason: `Known address: ${known.label}`,
      };
      hops.push(hop);
      this.totalHopsTraced++;
      await this.writeHop(hop);
      return hops;
    }

    // Check if this is a contract
    const isContractAddr = await chain.isContract(address);

    // Get ALL outgoing transactions (regular + internal/contract calls)
    const outgoingTxs = await chain.getAllOutgoingTransactions(address);

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
        flag_reason: 'Dead end — funds sitting in wallet',
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
        flag_reason: `High-activity address (${outgoingTxs.length} outgoing txs) — possible mixer/exchange`,
      };
      hops.push(hop);
      this.totalHopsTraced++;
      await this.writeHop(hop);
      return hops;
    }

    // Follow the money: sort by value (largest first) and take top branches
    const sorted = [...outgoingTxs].sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
    const isSplit = sorted.length > 1;

    // AI-powered branch prioritization — when there are many branches,
    // ask the AI which ones look most suspicious to trace first
    let branchesToTrace = sorted.slice(0, this.maxBranches);
    if (sorted.length > 3) {
      const aiPriority = await this.aiBranchPriority(address, sorted.slice(0, 8), isContractAddr);
      if (aiPriority.length > 0) {
        // Re-order: AI-prioritized addresses first, then by value
        const prioritized = aiPriority
          .map(addr => sorted.find(tx => tx.to.toLowerCase() === addr.toLowerCase()))
          .filter((tx): tx is NonNullable<typeof tx> => tx != null);
        const rest = sorted.filter(tx => !aiPriority.includes(tx.to.toLowerCase()));
        branchesToTrace = [...prioritized, ...rest].slice(0, this.maxBranches);
      }
    }

    for (let i = 0; i < branchesToTrace.length; i++) {
      // Check limits before each branch
      if (this.totalHopsTraced >= this.maxTotalHops || Date.now() > this.traceDeadline) break;

      const tx = branchesToTrace[i];
      const newBranchId = isSplit ? `${branchId}-${i}` : branchId;

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
        flagged: isContractAddr,
        flag_reason: isContractAddr ? 'Contract interaction detected' : null,
      };

      hops.push(hop);
      this.totalHopsTraced++;
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

  // Read analyst tips from memory (L90 — referenced in README)
  private async checkAnalystTips(caseId: string): Promise<string[]> {
    try {
      const analyses = await this.memory.query<{ notes: string; address_analyzed: string }>(
        COLLECTIONS.ANALYSIS,
        { filter: { case_id: caseId } }
      );
      return analyses.map((a) => `${a.address_analyzed}: ${a.notes}`);
    } catch {
      return [];
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

    if (lastHop.flag_reason?.includes('Known address')) {
      if (lastHop.flag_reason.includes('Bridge')) return 'bridge_found';
      return 'exchange_found';
    }

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

    const prompt = `You are an onchain forensic investigator. Summarize this fund tracing result for case ${caseId}:

Status: ${status}
Total hops: ${hops.length}
Splits detected: ${hops.filter((h) => h.is_split).length}

Hop trail:
${hopSummary}

Provide a concise 2-3 sentence summary of where the funds went and any notable patterns.`;

    return callAI(prompt);
  }
}
