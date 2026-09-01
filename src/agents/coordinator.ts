// Agent Coordinator — orchestrates Tracer, Analyst, and Monitor
// Manages the investigation lifecycle through Sibyl Memory

import { getSibylMemory } from '@/memory/sibyl';
import { COLLECTIONS } from '@/memory/schemas';
import type { Case } from '@/memory/schemas';
import { TracerAgent } from './tracer';
import { AnalystAgent } from './analyst';
import { MonitorAgent } from './monitor';

export interface InvestigationUpdate {
  caseId: string;
  agent: 'tracer' | 'analyst' | 'monitor' | 'coordinator';
  action: string;
  data: Record<string, unknown>;
  timestamp: string;
}

type UpdateCallback = (update: InvestigationUpdate) => void;

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
    this.onUpdate?.(fullUpdate);
  }

  // Start a new investigation from a bounty
  async startInvestigation(
    bountyId: string,
    victimWallet: string,
    incidentTx: string,
    reward: string,
    description?: string
  ): Promise<string> {
    const caseId = `prowl-${Date.now().toString(36)}`;

    // Create case in Sibyl Memory
    const caseData: Case = {
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

    await this.memory.store(
      COLLECTIONS.CASES,
      caseData as unknown as Record<string, unknown>,
      caseId
    );

    this.emit({
      caseId,
      agent: 'coordinator',
      action: 'case_created',
      data: { bountyId, victimWallet, reward, description },
    });

    // Run the investigation pipeline
    await this.runPipeline(caseId, incidentTx, victimWallet);

    return caseId;
  }

  // The main investigation pipeline
  private async runPipeline(
    caseId: string,
    incidentTx: string,
    victimWallet: string
  ): Promise<void> {
    // Step 1: Tracer traces the funds
    this.emit({
      caseId,
      agent: 'tracer',
      action: 'tracing_started',
      data: { incidentTx, victimWallet },
    });

    const traceResult = await this.tracer.startTrace(caseId, incidentTx, victimWallet);

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

    this.emit({
      caseId,
      agent: 'analyst',
      action: 'analysis_complete',
      data: {
        analyses: analysisResult.analyses.length,
        newPatterns: analysisResult.newPatterns.length,
        overallRisk: analysisResult.overallRisk,
        summary: analysisResult.summary,
      },
    });

    // Step 3: If there are dead ends, Monitor starts watching
    if (traceResult.status === 'dead_end') {
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
  async getStats(): Promise<{
    totalCases: number;
    activeCases: number;
    solvedCases: number;
    totalPatterns: number;
    watchedAddresses: number;
  }> {
    const cases = await this.memory.query<Case>(COLLECTIONS.CASES, {});
    const patternStats = await this.memory.stats(COLLECTIONS.PATTERNS);
    const monitorStatus = await this.monitor.getStatus();

    return {
      totalCases: cases.length,
      activeCases: cases.filter((c) => c.status === 'active').length,
      solvedCases: cases.filter((c) => c.status === 'solved').length,
      totalPatterns: patternStats.count,
      watchedAddresses: monitorStatus.totalWatching,
    };
  }
}
