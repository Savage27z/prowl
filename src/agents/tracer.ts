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
  private maxHops = 20;
  private maxBranches = 5;

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
    // If tx.to IS the victim, the incident tx sent funds TO the victim — the real
    // drain happens via outgoing txs FROM the victim (internal txs / contract calls).
    // If tx.from IS the victim, the victim sent funds out — trace from tx.to (the thief).
    // Otherwise, trace from tx.to as default.
    let traceStartAddress: string;
    let traceStartAmount: string;

    const victimLower = victimWallet.toLowerCase();
    if (tx.to.toLowerCase() === victimLower) {
      // Incident tx goes TO victim — trace the victim's outgoing txs to find the drain
      traceStartAddress = victimWallet;
      traceStartAmount = tx.value;
    } else if (tx.from.toLowerCase() === victimLower) {
      // Victim sent funds — trace from the recipient (the thief)
      traceStartAddress = tx.to;
      traceStartAmount = tx.value;
    } else {
      // Neither — trace from tx.to
      traceStartAddress = tx.to;
      traceStartAmount = tx.value;
    }

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
    if (hopNumber > this.maxHops) {
      return [];
    }

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
      await this.writeHop(hop);
      return hops;
    }

    // Check if this is a contract
    const isContractAddr = await chain.isContract(address);

    // Get ALL outgoing transactions (regular + internal/contract calls)
    // Internal txs catch drains via contract interactions (e.g. phishing approvals)
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
      await this.writeHop(hop);
      return hops;
    }

    // Check for fund splitting
    const isSplit = outgoingTxs.length > 1;
    if (isSplit) {
    }

    // Trace each branch (up to maxBranches)
    const branchesToTrace = outgoingTxs.slice(0, this.maxBranches);

    for (let i = 0; i < branchesToTrace.length; i++) {
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
