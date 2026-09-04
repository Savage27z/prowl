// Core data types for Prowl investigation memory
// Sibyl Memory collection schemas for Prowl
// All 3 agents coordinate through these shared memory structures

export interface Case {
  case_id: string;
  bounty_id: string;
  victim_wallet: string;
  incident_tx: string;
  status: 'active' | 'monitoring' | 'solved' | 'dead_end';
  reward: string;
  created_at: string;
  solved_at: string | null;
  total_hops_traced: number;
  total_funds_traced: string;
  agents_involved: ('tracer' | 'analyst' | 'monitor')[];
  report_hash?: string;
}

export interface Hop {
  case_id: string;
  hop_number: number;
  from_address: string;
  to_address: string;
  amount: string;
  tx_hash: string;
  timestamp: string;
  is_split: boolean;
  branch_id: string;
  flagged: boolean;
  flag_reason: string | null;
}

export interface Pattern {
  pattern_id: string;
  pattern_type: 'fund_splitting' | 'rapid_movement' | 'contract_interaction' | 'bridge_usage' | 'mixer_usage' | 'cex_deposit';
  description: string;
  first_seen_case: string;
  times_matched: number;
  confidence: number;
  related_addresses: string[];
  bytecode_hash: string | null;
}

export interface WatchlistEntry {
  case_id: string;
  address: string;
  reason: string;
  watching_since: string;
  last_checked: string;
  status: 'watching' | 'moved' | 'abandoned';
  alert_sent: boolean;
}

/// Explicit, machine-readable instruction the Analyst leaves for the Tracer.
/// Preferred over parsing `notes` — free text changes with model wording.
export interface MemoryDirective {
  action: 'skip' | 'prioritize';
  reason: 'verified_service' | 'known_drainer' | 'cross_case_entity' | 'laundering_pattern';
  confidence: number;
}

export interface Analysis {
  case_id: string;
  hop_number: number;
  address_analyzed: string;
  risk_level: 'high' | 'medium' | 'low';
  pattern_matches: string[];
  similar_cases: string[];
  notes: string;
  confidence: number;
  /// Optional structured directive consumed by Tracer.loadMemoryDirectives()
  directive?: MemoryDirective;
}

// Collection names in Sibyl Memory
export const COLLECTIONS = {
  CASES: 'prowl_cases',
  HOPS: 'prowl_hops',
  PATTERNS: 'prowl_patterns',
  WATCHLIST: 'prowl_watchlist',
  ANALYSIS: 'prowl_analysis',
} as const;

export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];
