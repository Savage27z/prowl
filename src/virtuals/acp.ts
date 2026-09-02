// Virtuals Protocol ACP — Agent Commerce Protocol integration
// Enables agents to trade services on the Virtuals marketplace
/**
 * Virtuals Protocol ACP (Agent Commerce Protocol) Integration
 *
 * Registers Prowl's investigation agents on the Virtuals network
 * so other agents can discover and hire them for crypto tracing jobs.
 *
 * The actual SDK import is deferred to runtime — if the package isn't
 * installed or has missing peer deps, everything still works with ACP disabled.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Types ──────────────────────────────────────────────────────

export interface ProwlACPConfig {
  apiKey: string;
  privateKey: string;
  agentWallet: string;
}

export interface JobResult {
  jobId: number;
  caseId: string;
  status: string;
  hopsTraced?: number;
  patternsFound?: string[];
  riskScore?: number;
  reportUrl?: string;
}

// ─── Agent offerings ────────────────────────────────────────────

export const PROWL_OFFERINGS = {
  tracer: {
    name: 'crypto-fund-tracer',
    description: 'Traces stolen cryptocurrency through hop-by-hop analysis on Base L2. Follows fund movements across wallets, contracts, bridges, and exchanges. Returns a complete fund flow map.',
    price: '0.001',
  },
  analyst: {
    name: 'theft-pattern-analyzer',
    description: 'Analyzes traced fund flows for known theft patterns (splitting, layering, bridge hopping, rapid movement). Cross-references against pattern library from past cases.',
    price: '0.0005',
  },
  monitor: {
    name: 'dormant-wallet-monitor',
    description: 'Watches addresses where stolen funds stopped moving. Alerts when dormant wallets reactivate, enabling Tracer to resume investigation.',
    price: '0.0002',
  },
  full: {
    name: 'prowl-full-investigation',
    description: 'Full coordinated investigation: Tracer maps fund flow, Analyst identifies patterns, Monitor watches dead ends. Three specialist AI agents working through shared memory.',
    price: '0.002',
  },
} as const;

// ─── SDK loader (fully lazy) ────────────────────────────────────

let _agent: any = null;
let _initialized = false;
let _available: boolean | null = null;

async function tryLoadSdk(): Promise<any> {
  try {
    // Dynamic import so Turbopack/webpack doesn't statically resolve it
    const mod = await import(
      /* webpackIgnore: true */
      '@virtuals-protocol/acp-node-v2'
    );
    return mod;
  } catch {
    return null;
  }
}

export function isACPAvailable(): boolean {
  // Fast path: if we already checked, return cached result
  if (_available !== null) return _available;
  // Without having loaded the SDK yet, just check env
  _available = !!process.env.VIRTUALS_API_KEY;
  return _available;
}

async function getACPAgent(config?: ProwlACPConfig) {
  if (_agent && _initialized) return _agent;

  const sdk = await tryLoadSdk();
  if (!sdk?.AcpAgent) {
    _available = false;
    throw new Error('ACP SDK not available — install @virtuals-protocol/acp-node-v2');
  }

  const apiKey = config?.apiKey || process.env.VIRTUALS_API_KEY;
  const privateKey = config?.privateKey || process.env.PRIVATE_KEY;

  if (!apiKey || !privateKey) {
    throw new Error('VIRTUALS_API_KEY and PRIVATE_KEY required for ACP');
  }

  _agent = new sdk.AcpAgent(apiKey, privateKey);
  _initialized = true;
  _available = true;

  return _agent;
}

// ─── Discovery ──────────────────────────────────────────────────

export async function browseAgents(cluster?: string): Promise<unknown[]> {
  const agent = await getACPAgent();
  const agents = await agent.browseAgents(cluster ? { cluster } : undefined);
  return agents || [];
}

// ─── Job management ─────────────────────────────────────────────

export async function createJob(
  providerWallet: string,
  offeringName: string,
  description: string,
): Promise<number> {
  const agent = await getACPAgent();
  const jobId = await agent.createJobByOfferingName(providerWallet, offeringName, description);
  return jobId;
}

export async function handleIncomingJobs(
  onNewJob: (job: { id: number; description: string; clientWallet: string }) => Promise<void>,
): Promise<void> {
  const agent = await getACPAgent();
  const sdk = await tryLoadSdk();

  const jobs = await agent.getJobs({
    phase: sdk?.AcpJobPhase?.NEGOTIATION,
    role: 'provider',
  });

  if (!jobs?.length) return;

  for (const job of jobs) {
    try {
      await onNewJob({
        id: job.id,
        description: job.description || '',
        clientWallet: job.clientWallet || '',
      });
    } catch (err) {
      void err; // swallow — caller handles retries
    }
  }
}

export async function acceptJob(jobId: number): Promise<void> {
  const agent = await getACPAgent();
  await agent.respondToJob(jobId, true);
}

export async function deliverJob(jobId: number, result: JobResult): Promise<void> {
  const agent = await getACPAgent();
  await agent.deliverJob(jobId, JSON.stringify(result));
}

export async function rejectJob(jobId: number, reason?: string): Promise<void> {
  const agent = await getACPAgent();
  await agent.respondToJob(jobId, false, reason || 'Not able to handle this request');
}

// ─── Integration with Coordinator ───────────────────────────────

export async function pollAndRouteJobs(
  coordinator: {
    startInvestigation: (
      bountyId: string,
      victimWallet: string,
      incidentTx: string,
      reward: string,
      description?: string,
    ) => Promise<string>;
  },
): Promise<JobResult[]> {
  if (!isACPAvailable()) return [];

  const results: JobResult[] = [];

  await handleIncomingJobs(async (job) => {
    const params = parseJobDescription(job.description);

    if (!params.txHash || !params.victimWallet) {
      await rejectJob(job.id, 'Missing required fields: txHash and victimWallet');
      return;
    }

    await acceptJob(job.id);

    const caseId = await coordinator.startInvestigation(
      `acp-${job.id}`,
      params.victimWallet,
      params.txHash,
      params.reward || '0 ETH',
      params.description || `ACP Job #${job.id}`,
    );

    results.push({ jobId: job.id, caseId, status: 'investigating' });
  });

  return results;
}

// ─── Helpers ────────────────────────────────────────────────────

function parseJobDescription(description: string): {
  txHash?: string;
  victimWallet?: string;
  description?: string;
  reward?: string;
} {
  try {
    const parsed = JSON.parse(description);
    return {
      txHash: parsed.txHash || parsed.tx_hash || parsed.incidentTx,
      victimWallet: parsed.victimWallet || parsed.victim_wallet || parsed.wallet,
      description: parsed.description || parsed.desc,
      reward: parsed.reward,
    };
  } catch {
    const txMatch = description.match(/0x[a-fA-F0-9]{64}/);
    const walletMatch = description.match(/0x[a-fA-F0-9]{40}/);
    return {
      txHash: txMatch?.[0],
      victimWallet: walletMatch?.[0],
      description,
    };
  }
}
