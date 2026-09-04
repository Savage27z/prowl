// Coordinator — orchestrates the Tracer→Analyst→Monitor pipeline
// Agent Coordinator — orchestrates Tracer, Analyst, and Monitor
// Manages the investigation lifecycle through Sibyl Memory

import { getSibylMemory } from '@/memory/sibyl';
import { COLLECTIONS } from '@/memory/schemas';
import type { Case } from '@/memory/schemas';
import { TracerAgent } from './tracer';
import { AnalystAgent } from './analyst';
import { MonitorAgent } from './monitor';
import { claimBountyOnChain, submitReportOnChain, getProtocolWallet } from '@/chain/bounty-writer';

export interface InvestigationUpdate {
  caseId: string;
  agent: 'tracer' | 'analyst' | 'monitor' | 'coordinator';
  action: string;
  data: Record<string, unknown>;
  timestamp: string;
}

type UpdateCallback = (update: InvestigationUpdate) => void;

// Per-case event log — stored in module scope so it survives across calls within one Lambda
const _eventLog = new Map<string, InvestigationUpdate[]>();

export function getCaseEvents(caseId: string): InvestigationUpdate[] {
  return _eventLog.get(caseId) || [];
}

export class Coordinator {
  private memory = getSibylMemory();
  private tracer = new TracerAgent();
  private analyst = new AnalystAgent();
  private monitor = new MonitorAgent();
  private onUpdate: UpdateCallback | null = null;

  setUpdateCallback(cb: UpdateCallback): void {
    this.onUpdate = cb;
  }

  private emit(update: Omit<InvestigationUpdate, 'timestamp'>): void {
    const fullUpdate = { ...update, timestamp: new Date().toISOString() };
    // Store in per-case event log for polling
    const events = _eventLog.get(update.caseId) || [];
    events.push(fullUpdate);
    _eventLog.set(update.caseId, events);
    this.onUpdate?.(fullUpdate);
  }

  // Start a new investigation from a bounty
  async startInvestigation(
    bountyId: string,
    victimWallet: string,
    incidentTx: string,
    reward: string,
    description?: string,
    suspectAddress?: string
  ): Promise<string> {
    const caseId = `prowl-${Date.now().toString(36)}`;

    // Create case in Sibyl Memory
    const caseData: Case & { suspect_address?: string } = {
      case_id: caseId,
      bounty_id: bountyId,
      victim_wallet: victimWallet,
      incident_tx: incidentTx,
      status: 'active',
      reward,
      created_at: new Date().toISOString(),
      solved_at: null,
      total_hops_traced: 0,
      total_funds_traced: '0 ETH',
      agents_involved: [],
    };
    if (suspectAddress) caseData.suspect_address = suspectAddress;

    await this.memory.store(
      COLLECTIONS.CASES,
      caseData as unknown as Record<string, unknown>,
      caseId
    );

    this.emit({
      caseId,
      agent: 'coordinator',
      action: 'case_created',
      data: { bountyId, victimWallet, reward, description, suspectAddress },
    });

    return caseId;
  }

  // Run the investigation pipeline for a case (call separately so the API can return first)
  async runInvestigation(caseId: string): Promise<void> {
    const caseData = await this.getCase(caseId) as (Case & { suspect_address?: string }) | null;
    if (!caseData) return;
    await this.runPipeline(caseId, caseData.incident_tx, caseData.victim_wallet, caseData.suspect_address);
  }

  // The main investigation pipeline
  private async runPipeline(
    caseId: string,
    incidentTx: string,
    victimWallet: string,
    suspectAddress?: string
  ): Promise<void> {
    // Step 1: Tracer traces the funds
    this.emit({
      caseId,
      agent: 'tracer',
      action: 'tracing_started',
      data: { incidentTx, victimWallet, suspectAddress },
    });

    const traceResult = await this.tracer.startTrace(caseId, incidentTx, victimWallet, suspectAddress);

    this.emit({
      caseId,
      agent: 'tracer',
      action: 'tracing_complete',
      data: {
        hops: traceResult.hops.length,
        status: traceResult.status,
        summary: traceResult.summary,
      },
    });

    // Step 2: Analyst analyzes the findings
    this.emit({
      caseId,
      agent: 'analyst',
      action: 'analysis_started',
      data: { hopsToAnalyze: traceResult.hops.length },
    });

    const analysisResult = await this.analyst.analyzeCase(caseId);

    // ⚠ Emit degradation warning if memory was empty
    if (analysisResult.memoryDegraded) {
      this.emit({
        caseId,
        agent: 'analyst',
        action: 'memory_degraded',
        data: {
          warning: 'No pattern database — Analyst cannot match against known scam signatures or past cases. Cross-case intelligence is unavailable.',
          impact: 'Every investigation starts from zero. Pattern matching disabled.',
        },
      });
    }

    this.emit({
      caseId,
      agent: 'analyst',
      action: 'analysis_complete',
      data: {
        analyses: analysisResult.analyses.length,
        newPatterns: analysisResult.newPatterns.length,
        overallRisk: analysisResult.overallRisk,
        summary: analysisResult.summary,
        memoryDegraded: analysisResult.memoryDegraded || false,
      },
    });

    // Step 3: If there are dead ends, Monitor starts watching
    if (traceResult.status === 'dead_end') {
      // Check if watchlist was wiped (deletion test)
      const existingWatchlist = await this.memory.query(COLLECTIONS.WATCHLIST, {});
      if (existingWatchlist.length === 0 && analysisResult.memoryDegraded) {
        this.emit({
          caseId,
          agent: 'monitor',
          action: 'memory_degraded',
          data: {
            warning: 'No watchlist data — Monitor has no record of previously dormant wallets. Surveillance history lost.',
            impact: 'Cannot resume prior investigations. All dormant wallet tracking reset to zero.',
          },
        });
      }

      this.emit({
        caseId,
        agent: 'monitor',
        action: 'monitoring_started',
        data: {},
      });

      const monitorResult = await this.monitor.scanForDeadEnds(caseId);

      this.emit({
        caseId,
        agent: 'monitor',
        action: 'monitoring_setup',
        data: {
          watchedAddresses: monitorResult.watchedAddresses,
          summary: monitorResult.summary,
        },
      });

      // Update case status
      await this.memory.update(COLLECTIONS.CASES, caseId, {
        status: 'monitoring',
        agents_involved: ['tracer', 'analyst', 'monitor'],
      });
    }

    // If exchange/bridge found, case is effectively solved
    if (traceResult.status === 'exchange_found' || traceResult.status === 'bridge_found') {
      await this.memory.update(COLLECTIONS.CASES, caseId, {
        status: 'solved',
        solved_at: new Date().toISOString(),
        agents_involved: ['tracer', 'analyst'],
      });

      this.emit({
        caseId,
        agent: 'coordinator',
        action: 'case_solved',
        data: { destination: traceResult.status },
      });
    }

    // Auto-claim bounty + submit report on-chain (non-blocking — best effort)
    const caseAfter = await this.getCase(caseId);
    const bountyIdStr = caseAfter?.bounty_id;
    // Only attempt on-chain actions for real bounties (not manual-*)
    if (bountyIdStr && !bountyIdStr.startsWith('manual-')) {
      const bountyIdNum = parseInt(bountyIdStr, 10);
      if (!isNaN(bountyIdNum)) {
        this.claimAndSubmit(caseId, bountyIdNum, traceResult.summary).catch((err) => {
          console.error('[Coordinator] On-chain claim/submit failed:', err);
        });
      }
    }
  }

  // Auto-claim + submit report on-chain after investigation completes
  private async claimAndSubmit(caseId: string, bountyId: number, summary: string): Promise<void> {
    const protocolWallet = getProtocolWallet();
    if (!protocolWallet) {
      console.log('[Coordinator] No PRIVATE_KEY — skipping on-chain claim');
      return;
    }

    // Step 1: Claim the bounty
    const claimTx = await claimBountyOnChain(bountyId);
    if (claimTx) {
      this.emit({
        caseId,
        agent: 'coordinator',
        action: 'bounty_claimed',
        data: { bountyId, claimTx, protocolWallet },
      });

      // Step 2: Submit the report
      const submitTx = await submitReportOnChain(bountyId, summary);
      if (submitTx) {
        this.emit({
          caseId,
          agent: 'coordinator',
          action: 'report_submitted',
          data: { bountyId, submitTx, reportSummary: summary.slice(0, 200) },
        });

        // Update case with on-chain data
        await this.memory.update(COLLECTIONS.CASES, caseId, {
          claim_tx: claimTx,
          report_tx: submitTx,
          claimed_by: protocolWallet,
        });
      }
    }
  }

  // Handle Monitor alert — resume tracing
  async handleMonitorAlert(caseId: string, address: string): Promise<void> {
    this.emit({
      caseId,
      agent: 'coordinator',
      action: 'alert_received',
      data: { address },
    });

    // Resume tracing from the alert address
    const traceResult = await this.tracer.resumeTrace(caseId, address);

    this.emit({
      caseId,
      agent: 'tracer',
      action: 'trace_resumed',
      data: {
        hops: traceResult.hops.length,
        status: traceResult.status,
        summary: traceResult.summary,
      },
    });

    // Re-analyze with new data
    const analysisResult = await this.analyst.analyzeCase(caseId);

    this.emit({
      caseId,
      agent: 'analyst',
      action: 'reanalysis_complete',
      data: {
        overallRisk: analysisResult.overallRisk,
        summary: analysisResult.summary,
      },
    });
  }

  // Run monitor check cycle
  async runMonitorCheck(): Promise<void> {
    const result = await this.monitor.checkWatchlist();

    if (result.newAlerts.length > 0) {
      for (const alert of result.newAlerts) {
        await this.handleMonitorAlert(alert.case_id, alert.address);
      }
    }
  }

  // Get case status
  async getCase(caseId: string): Promise<Case | null> {
    return this.memory.retrieve<Case>(COLLECTIONS.CASES, caseId);
  }

  // Get all active cases
  async getActiveCases(): Promise<Case[]> {
    return this.memory.query<Case>(COLLECTIONS.CASES, {
      filter: { status: 'active' },
    });
  }

  // Get all cases
  async getAllCases(): Promise<Case[]> {
    return this.memory.query<Case>(COLLECTIONS.CASES, {});
  }

  // Get investigation stats
  async getStats() {
    const cases = await this.memory.query<Case>(COLLECTIONS.CASES, {});
    const patternStats = await this.memory.stats(COLLECTIONS.PATTERNS);
    const monitorStatus = await this.monitor.getStatus();

    // Compute agent involvement counts
    const agentCounts: Record<string, number> = { tracer: 0, analyst: 0, monitor: 0, coordinator: 0 };
    let totalHops = 0;
    let totalFundsEth = 0;

    for (const c of cases) {
      totalHops += c.total_hops_traced || 0;
      // Extract only the ETH component — total_funds_traced can read
      // "1.5 ETH + 1000 USDC", and token amounts must not be added as ETH.
      const ethMatch = c.total_funds_traced?.match(/([\d.]+)\s*ETH/);
      if (ethMatch) totalFundsEth += parseFloat(ethMatch[1]);
      for (const agent of c.agents_involved || []) {
        agentCounts[agent] = (agentCounts[agent] || 0) + 1;
      }
      // Coordinator is always involved
      agentCounts.coordinator = (agentCounts.coordinator || 0) + 1;
    }

    // Compute daily hop distribution from cases (group by day of week)
    const dailyHops: number[] = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun
    for (const c of cases) {
      if (c.created_at) {
        const day = new Date(c.created_at).getDay(); // 0=Sun
        const idx = day === 0 ? 6 : day - 1; // shift to Mon=0
        dailyHops[idx] += c.total_hops_traced || 0;
      }
    }

    // Pattern type distribution for trails
    const patterns = await this.memory.query<{ pattern_type: string; times_matched: number }>(COLLECTIONS.PATTERNS, {});
    const trailCounts: Record<string, number> = {};
    for (const p of patterns) {
      trailCounts[p.pattern_type] = (trailCounts[p.pattern_type] || 0) + p.times_matched;
    }

    return {
      totalCases: cases.length,
      activeCases: cases.filter((c) => c.status === 'active' || c.status === 'monitoring').length,
      solvedCases: cases.filter((c) => c.status === 'solved').length,
      totalPatterns: patternStats.count,
      watchedAddresses: monitorStatus.totalWatching,
      totalHops,
      totalFundsEth,
      agentCounts,
      dailyHops,
      trailCounts,
    };
  }
}
