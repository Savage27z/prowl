// Case Detail — live investigation feed, hop timeline, and analysis
'use client';

import { useState, useEffect, useRef, useCallback, use } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import DashboardShell from '@/components/DashboardShell';
import { getBountyContractConfig } from '@/chain/contracts';
import { summarizeTracedFunds } from '@/chain/utils';

/* ── Types ── */

interface CaseData {
  case_id: string;
  bounty_id?: string;
  victim_wallet: string;
  incident_tx: string;
  status: string;
  reward: string;
  created_at: string;
  total_hops_traced: number;
  total_funds_traced: string;
  agents_involved: string[];
  claim_tx?: string;
  report_tx?: string;
  claimed_by?: string;
  payout_tx?: string;
}

interface HopData {
  case_id: string;
  hop_number: number;
  from_address: string;
  to_address: string;
  amount: string;
  /// Unit for `amount` — absent on hops written before asset tracking
  asset_symbol?: string;
  asset_contract?: string;
  branch_id?: string;
  tx_hash: string;
  timestamp: string;
  is_split: boolean;
  flagged: boolean;
  flag_reason: string | null;
}

/// A terminal hop stores from == to as a sentinel meaning "the trail stops
/// here" — no transfer took place. Rendering it as from → to reads as a
/// self-send that never happened.
function isTerminalHop(hop: { from_address: string; to_address: string }): boolean {
  return hop.from_address.toLowerCase() === hop.to_address.toLowerCase();
}

interface AnalysisData {
  case_id: string;
  address_analyzed: string;
  risk_level: string;
  pattern_matches: string[];
  notes: string;
  confidence: number;
}

interface FeedEvent {
  id: string;
  agent: string;
  action: string;
  data: Record<string, unknown>;
  timestamp: string;
}

/* ── Helpers ── */

function truncate(addr: string, len = 4) {
  if (!addr || addr.length < 10) return addr;
  return addr.slice(0, len + 2) + '…' + addr.slice(-len);
}

function statusStyle(status: string) {
  switch (status) {
    case 'active': return { color: 'var(--color-accent-700)', bg: 'var(--color-accent-100)', border: 'var(--color-accent-300)' };
    case 'tracing': return { color: 'var(--color-accent-700)', bg: 'var(--color-accent-100)', border: 'var(--color-accent-300)' };
    case 'analysing': return { color: 'var(--color-status-analysing)', bg: 'var(--color-status-analysing-bg)', border: 'var(--color-status-analysing-border)' };
    case 'monitoring': return { color: 'var(--color-neutral-600)', bg: 'var(--color-neutral-100)', border: 'var(--color-neutral-300)' };
    case 'solved': return { color: 'var(--color-status-solved)', bg: 'var(--color-status-solved-bg)', border: 'var(--color-status-solved-border)' };
    case 'dead_end': return { color: 'var(--color-error)', bg: 'var(--color-error-bg)', border: 'var(--color-error-border)' };
    default: return { color: 'var(--color-neutral-600)', bg: 'var(--color-neutral-100)', border: 'var(--color-neutral-300)' };
  }
}

const AGENT_COLORS: Record<string, string> = {
  coordinator: 'var(--color-neutral-600)',
  tracer: 'var(--color-accent-700)',
  analyst: 'var(--color-status-analysing)',
  monitor: 'var(--color-neutral-600)',
};

const AGENT_ICONS: Record<string, string> = {
  coordinator: 'CO',
  tracer: 'TR',
  analyst: 'AN',
  monitor: 'MO',
};

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    case_created: 'Case opened',
    tracing_started: 'Following the money…',
    tracing_complete: 'Tracing complete',
    analysis_started: 'Pattern matching…',
    analysis_complete: 'Analysis complete',
    monitoring_started: 'Setting up surveillance…',
    monitoring_setup: 'Watchlist configured',
    case_solved: 'Case solved',
    alert_received: 'Movement detected!',
    trace_resumed: 'Resumed tracing',
    reanalysis_complete: 'Reanalysis complete',
    connected: 'Stream connected',
    bounty_claimed: 'Bounty claimed on-chain',
    report_submitted: 'Report submitted on-chain',
    memory_degraded: '⚠ MEMORY FAILURE',
  };
  return labels[action] || action.replace(/_/g, ' ');
}

function isDegradedEvent(action: string): boolean {
  return action === 'memory_degraded';
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 5000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

/* ── Fund Flow Graph — visual node-edge map of the money trail ── */

interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  risk: 'high' | 'medium' | 'low' | 'none';
  flagReason?: string | null;
  isSource?: boolean;
  isSink?: boolean;
}

interface GraphEdge {
  from: string;
  to: string;
  amount: string;
  hopNumber: number;
  flagged: boolean;
}

function FundFlowGraph({ hops, analyses }: { hops: HopData[]; analyses: AnalysisData[] }) {
  // Build nodes and edges from hop data
  const riskMap = new Map<string, string>();
  for (const a of analyses) {
    riskMap.set(a.address_analyzed.toLowerCase(), a.risk_level);
  }

  const nodeMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const incomingCount = new Map<string, number>();
  const outgoingCount = new Map<string, number>();

  for (const hop of hops) {
    const fromKey = hop.from_address.toLowerCase();
    const toKey = hop.to_address.toLowerCase();
    // A terminal hop stores from == to as an endpoint marker, not a movement.
    // Counting it as outgoing flow stops the node registering as a sink, and
    // draws a redundant self-loop beside the real incoming edge.
    const isTerminal = fromKey === toKey;

    if (!isTerminal) {
      outgoingCount.set(fromKey, (outgoingCount.get(fromKey) || 0) + 1);
      incomingCount.set(toKey, (incomingCount.get(toKey) || 0) + 1);
    }

    if (!nodeMap.has(fromKey)) {
      nodeMap.set(fromKey, {
        id: fromKey,
        label: hop.from_address.slice(0, 6) + '…' + hop.from_address.slice(-4),
        x: 0, y: 0,
        risk: (riskMap.get(fromKey) as GraphNode['risk']) || 'none',
      });
    }
    if (!nodeMap.has(toKey)) {
      nodeMap.set(toKey, {
        id: toKey,
        label: hop.to_address.slice(0, 6) + '…' + hop.to_address.slice(-4),
        x: 0, y: 0,
        risk: (riskMap.get(toKey) as GraphNode['risk']) || 'none',
        flagReason: hop.flagged ? hop.flag_reason : null,
      });
    }
    if (hop.flagged && hop.flag_reason) {
      const node = nodeMap.get(toKey)!;
      node.flagReason = hop.flag_reason;
    }

    if (!isTerminal) {
      edges.push({
        from: fromKey,
        to: toKey,
        amount: hop.amount,
        hopNumber: hop.hop_number,
        flagged: hop.flagged,
      });
    }
  }

  // Mark source/sink nodes. Terminal hops are excluded from the counts above,
  // so an address the trail stopped at correctly reads as a sink.
  const nodes = Array.from(nodeMap.values());
  for (const n of nodes) {
    n.isSource = !incomingCount.has(n.id);
    n.isSink = !outgoingCount.has(n.id);
  }

  // A trace that never left its starting address gives one node and no edges.
  // Draw a self-loop so the graph still renders something legible.
  if (nodes.length === 1 && edges.length === 0 && hops.length > 0) {
    edges.push({
      from: nodes[0].id,
      to: nodes[0].id,
      amount: hops[0].amount,
      hopNumber: hops[0].hop_number,
      flagged: hops[0].flagged,
    });
  }

  // Layout: topological sort into layers, then spread within layers
  const layers = new Map<string, number>();
  const queue = nodes.filter(n => n.isSource).map(n => n.id);
  for (const id of queue) layers.set(id, 0);

  // BFS layering
  const visited = new Set<string>();
  const bfsQueue = [...queue];
  while (bfsQueue.length > 0) {
    const current = bfsQueue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const currentLayer = layers.get(current) || 0;
    for (const edge of edges) {
      if (edge.from === current && !visited.has(edge.to)) {
        const existing = layers.get(edge.to) || 0;
        layers.set(edge.to, Math.max(existing, currentLayer + 1));
        bfsQueue.push(edge.to);
      }
    }
  }
  // Handle disconnected nodes
  for (const n of nodes) {
    if (!layers.has(n.id)) layers.set(n.id, 0);
  }

  // Group by layer
  const layerGroups = new Map<number, GraphNode[]>();
  for (const n of nodes) {
    const l = layers.get(n.id) || 0;
    if (!layerGroups.has(l)) layerGroups.set(l, []);
    layerGroups.get(l)!.push(n);
  }

  const maxLayer = Math.max(...Array.from(layerGroups.keys()), 0);
  const layerSpacing = 180;
  const nodeSpacing = 100;
  const padX = 80;
  const padY = 60;

  for (const [layer, group] of layerGroups) {
    const totalHeight = (group.length - 1) * nodeSpacing;
    group.forEach((n, i) => {
      n.x = padX + layer * layerSpacing;
      n.y = padY + i * nodeSpacing - totalHeight / 2 + 150;
    });
  }

  // Size the SVG to fit the content, with a reasonable minimum
  const contentWidth = padX * 2 + maxLayer * layerSpacing + 60;
  const svgWidth = Math.max(400, contentWidth);
  const allY = nodes.map(n => n.y);
  const minY = Math.min(...allY, 40);
  const maxY = Math.max(...allY, 200);
  const svgHeight = Math.max(200, maxY - minY + 140);
  const yOffset = -minY + 60;

  // Center the graph when content is smaller than the container
  const xCenter = nodes.length <= 3 ? (svgWidth - contentWidth) / 2 : 0;

  const riskColor = (risk: string) => {
    switch (risk) {
      case 'high': return '#f85149';
      case 'medium': return '#d29922';
      case 'low': return '#3fb950';
      default: return 'var(--color-neutral-400)';
    }
  };

  // For small graphs, use a compact centered layout
  const isSmall = nodes.length <= 3;
  const graphW = isSmall ? 420 : svgWidth;
  const graphH = isSmall ? 220 : svgHeight;

  return (
    <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)', background: 'var(--color-card)', padding: isSmall ? '20px' : 0 }}>
      <svg
        viewBox={`0 0 ${graphW} ${graphH}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', maxWidth: '100%' }}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
            <polygon points="0 0, 10 3.5, 0 7" fill="var(--color-neutral-400)" />
          </marker>
          <marker id="arrow-flagged" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="8" markerHeight="6" orient="auto-start-reverse">
            <polygon points="0 0, 10 3.5, 0 7" fill="#f85149" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((edge, i) => {
          const fromNode = nodeMap.get(edge.from);
          const toNode = nodeMap.get(edge.to);
          if (!fromNode || !toNode) return null;

          // Self-loop (from === to)
          if (edge.from === edge.to) {
            const cx = isSmall ? graphW / 2 : fromNode.x + xCenter;
            const cy = isSmall ? graphH / 2 - 20 : fromNode.y + yOffset;
            return (
              <g key={`edge-${i}`}>
                <path
                  d={`M ${cx + 22} ${cy - 8} C ${cx + 70} ${cy - 60}, ${cx - 70} ${cy - 60}, ${cx - 22} ${cy - 8}`}
                  fill="none"
                  stroke={edge.flagged ? '#f85149' : 'var(--color-neutral-300)'}
                  strokeWidth={edge.flagged ? 2 : 1.5}
                  strokeDasharray={edge.flagged ? '6,3' : 'none'}
                  markerEnd={edge.flagged ? 'url(#arrow-flagged)' : 'url(#arrow)'}
                  opacity={0.7}
                />
                <text
                  x={cx}
                  y={cy - 58}
                  textAnchor="middle"
                  fontSize="9"
                  fontFamily="var(--font-mono)"
                  fill="var(--color-neutral-600)"
                >
                  {parseFloat(edge.amount).toFixed(4)} ETH (self-send)
                </text>
              </g>
            );
          }

          const x1 = (isSmall ? fromNode.x + (graphW - contentWidth) / 2 : fromNode.x + xCenter) + 24;
          const y1 = isSmall ? graphH / 2 - 20 : fromNode.y + yOffset;
          const x2 = (isSmall ? toNode.x + (graphW - contentWidth) / 2 : toNode.x + xCenter) - 24;
          const y2 = isSmall ? graphH / 2 - 20 : toNode.y + yOffset;
          const midX = (x1 + x2) / 2;

          return (
            <g key={`edge-${i}`}>
              <path
                d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={edge.flagged ? '#f85149' : 'var(--color-neutral-300)'}
                strokeWidth={edge.flagged ? 2 : 1.5}
                strokeDasharray={edge.flagged ? '6,3' : 'none'}
                markerEnd={edge.flagged ? 'url(#arrow-flagged)' : 'url(#arrow)'}
                opacity={0.7}
              />
              <text
                x={midX}
                y={(y1 + y2) / 2 - 8}
                textAnchor="middle"
                fontSize="9"
                fontFamily="var(--font-mono)"
                fill="var(--color-neutral-600)"
              >
                {parseFloat(edge.amount).toFixed(4)} ETH
              </text>
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node, _idx) => {
          let nx: number, ny: number;
          if (isSmall && nodes.length === 1) {
            nx = graphW / 2;
            ny = graphH / 2 - 20;
          } else if (isSmall) {
            nx = node.x + (graphW - contentWidth) / 2;
            ny = graphH / 2 - 20;
          } else {
            nx = node.x + xCenter;
            ny = node.y + yOffset;
          }
          const color = riskColor(node.risk);
          const isTerminal = node.isSource || node.isSink;
          const r = isSmall ? 28 : isTerminal ? 22 : 18;

          return (
            <g key={node.id}>
              {/* Glow for small graphs */}
              {isSmall && (
                <circle cx={nx} cy={ny} r={r + 8} fill={color} opacity={0.06} />
              )}
              {/* Node circle */}
              <circle
                cx={nx}
                cy={ny}
                r={r}
                fill="var(--color-card)"
                stroke={color}
                strokeWidth={isSmall ? 3 : isTerminal ? 3 : 2}
              />
              {/* Icon */}
              <text x={nx} y={ny + 1} textAnchor="middle" dominantBaseline="central" fontSize={isSmall ? 11 : isTerminal ? 9 : 8} fontWeight="700" fill={color} fontFamily="var(--font-mono)">
                {node.isSource ? 'SRC' : node.isSink ? (node.flagReason?.includes('exchange') || node.flagReason?.includes('Known') ? 'CEX' : node.flagReason?.includes('Dead') ? 'END' : 'DST') : 'HOP'}
              </text>
              {/* Address label */}
              <text
                x={nx}
                y={ny + r + 14}
                textAnchor="middle"
                fontSize={isSmall ? 11 : 9}
                fontFamily="var(--font-mono)"
                fill="var(--color-text)"
              >
                {node.label}
              </text>
              {/* Risk badge */}
              {node.risk !== 'none' && (
                <>
                  <rect
                    x={nx + r - 6}
                    y={ny - r - 4}
                    width={36}
                    height={16}
                    rx={8}
                    fill={color}
                    opacity={0.15}
                  />
                  <text
                    x={nx + r + 12}
                    y={ny - r + 8}
                    textAnchor="middle"
                    fontSize={isSmall ? 8 : 7}
                    fontWeight="700"
                    fill={color}
                  >
                    {node.risk.toUpperCase()}
                  </text>
                </>
              )}
              {/* Flag reason */}
              {node.flagReason && (
                <text
                  x={nx}
                  y={ny + r + 28}
                  textAnchor="middle"
                  fontSize={isSmall ? 9 : 8}
                  fill={color}
                  fontWeight="500"
                >
                  {node.flagReason.length > 40 ? node.flagReason.slice(0, 40) + '...' : node.flagReason}
                </text>
              )}
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(12, ${graphH - 30})`}>
          <circle cx={6} cy={6} r={5} fill="none" stroke="#f85149" strokeWidth={2} />
          <text x={16} y={10} fontSize="8" fill="var(--color-neutral-600)">High risk</text>
          <circle cx={76} cy={6} r={5} fill="none" stroke="#d29922" strokeWidth={2} />
          <text x={86} y={10} fontSize="8" fill="var(--color-neutral-600)">Medium</text>
          <circle cx={136} cy={6} r={5} fill="none" stroke="#3fb950" strokeWidth={2} />
          <text x={146} y={10} fontSize="8" fill="var(--color-neutral-600)">Low</text>
          <line x1={196} y1={6} x2={220} y2={6} stroke="#f85149" strokeWidth={2} strokeDasharray="6,3" />
          <text x={226} y={10} fontSize="8" fill="var(--color-neutral-600)">Flagged</text>
        </g>
      </svg>
    </div>
  );
}

/* ── Event details sub-component ── */

function EventDetails({ data }: { data: Record<string, unknown> }) {
  const d = data;
  const summary = d.summary != null ? String(d.summary) : null;
  const hops = d.hops != null ? String(d.hops) : null;
  const status = d.status != null ? String(d.status) : null;
  const risk = d.overallRisk != null ? String(d.overallRisk) : null;
  const newPats = d.newPatterns != null ? Number(d.newPatterns) : null;
  const watched = d.watchedAddresses != null ? String(d.watchedAddresses) : null;
  const dest = d.destination != null ? String(d.destination) : null;

  return (
    <div style={{ marginTop: 4, paddingLeft: 34, fontSize: 12, color: 'var(--color-neutral-700)', lineHeight: 1.5 }}>
      {summary && <p style={{ margin: 0 }}>{summary}</p>}
      {hops && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', marginRight: 10 }}>
          Hops: {hops}
        </span>
      )}
      {status && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', marginRight: 10 }}>
          Status: {status}
        </span>
      )}
      {risk && (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '9.5px',
          color: risk === 'high' ? 'var(--color-error)' : risk === 'medium' ? 'var(--color-accent-700)' : 'var(--color-neutral-600)',
        }}>
          Risk: {risk.toUpperCase()}
        </span>
      )}
      {newPats != null && newPats > 0 && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', marginLeft: 10 }}>
          +{newPats} new pattern(s)
        </span>
      )}
      {watched && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px' }}>
          Watching: {watched} address(es)
        </span>
      )}
      {dest && (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', color: 'var(--color-status-solved)' }}>
          → {dest.replace('_', ' ')}
        </span>
      )}
    </div>
  );
}

/* ── Investigation Report ── */

function ReportView({ caseData, hops, analyses, feed }: {
  caseData: CaseData;
  hops: HopData[];
  analyses: AnalysisData[];
  feed: FeedEvent[];
}) {
  // Pull AI summaries from feed events
  const tracerSummary = feed.find(e => e.action === 'tracing_complete')?.data?.summary as string || null;
  const analystSummary = feed.find(e => e.action === 'analysis_complete')?.data?.summary as string || null;
  const overallRisk = feed.find(e => e.action === 'analysis_complete')?.data?.overallRisk as string || null;
  const traceStatus = feed.find(e => e.action === 'tracing_complete')?.data?.status as string || caseData.status;
  const watchedAddresses = feed.find(e => e.action === 'monitoring_setup')?.data?.watchedAddresses as string | number | undefined;

  // Unique addresses touched
  const addressSet = new Set<string>();
  for (const h of hops) {
    addressSet.add(h.from_address.toLowerCase());
    addressSet.add(h.to_address.toLowerCase());
  }

  // Flagged hops
  const flaggedHops = hops.filter(h => h.flagged && h.flag_reason);

  // Funds traced — counted once per branch, grouped by asset.
  // Summing every hop would double-count funds relayed through wallets.
  const tracedFunds = summarizeTracedFunds(hops);

  // Splits count
  const splits = hops.filter(h => h.is_split).length;

  // Build the money trail as text
  const sortedHops = [...hops].sort((a, b) => a.hop_number - b.hop_number);

  const sectionStyle = {
    marginBottom: 'var(--space-6)',
  } as const;

  const sectionHeadingStyle = {
    fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.14em',
    textTransform: 'uppercase' as const, color: 'var(--color-neutral-600)',
    marginBottom: 12, display: 'block',
  };

  const cardStyle = {
    borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)',
    background: 'var(--color-card)', padding: 'var(--space-4)',
  } as const;

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Report header */}
      <div style={{ ...sectionStyle, borderBottom: '1px solid var(--color-divider)', paddingBottom: 'var(--space-4)' }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 24, fontWeight: 400, margin: '0 0 6px' }}>
          Investigation Report
        </h2>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-600)', lineHeight: 1.6 }}>
          <span>Case: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent-700)' }}>{caseData.case_id}</span></span>
          <span style={{ margin: '0 8px' }}>·</span>
          <span>Generated: {new Date().toLocaleDateString()}</span>
          <span style={{ margin: '0 8px' }}>·</span>
          <span>Agents: Tracer, Analyst, Monitor</span>
        </div>
      </div>

      {/* Executive summary */}
      <div style={sectionStyle}>
        <span style={sectionHeadingStyle}>Executive Summary</span>
        <div style={cardStyle}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{hops.length}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-neutral-600)' }}>Hops traced</div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{tracedFunds}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-neutral-600)' }}>Funds traced</div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{addressSet.size}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-neutral-600)' }}>Addresses</div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{splits}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-neutral-600)' }}>Splits</div>
            </div>
          </div>
          {overallRisk && (
            <div style={{
              display: 'inline-block', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
              textTransform: 'uppercase', padding: '3px 10px', borderRadius: 999, marginBottom: 12,
              background: overallRisk === 'high' ? 'var(--color-error-bg)' : overallRisk === 'medium' ? 'var(--color-accent-100)' : 'var(--color-neutral-100)',
              color: overallRisk === 'high' ? 'var(--color-error)' : overallRisk === 'medium' ? 'var(--color-accent-700)' : 'var(--color-neutral-600)',
              border: `1px solid ${overallRisk === 'high' ? 'var(--color-error-border)' : overallRisk === 'medium' ? 'var(--color-accent-300)' : 'var(--color-divider)'}`,
            }}>
              {overallRisk} risk
            </div>
          )}
          <div style={{
            display: 'inline-block', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em',
            textTransform: 'uppercase', padding: '3px 10px', borderRadius: 999, marginLeft: overallRisk ? 6 : 0,
            background: 'var(--color-neutral-100)', color: 'var(--color-neutral-600)',
            border: '1px solid var(--color-divider)',
          }}>
            {traceStatus.replace(/_/g, ' ')}
          </div>
        </div>
      </div>

      {/* Victim details */}
      <div style={sectionStyle}>
        <span style={sectionHeadingStyle}>Victim</span>
        <div style={cardStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            <div>
              <span style={{ color: 'var(--color-neutral-600)', fontSize: 12 }}>Wallet: </span>
              <a href={`https://basescan.org/address/${caseData.victim_wallet}`} target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-accent-700)', textDecoration: 'underline' }}>
                {caseData.victim_wallet}
              </a>
            </div>
            <div>
              <span style={{ color: 'var(--color-neutral-600)', fontSize: 12 }}>Incident TX: </span>
              <a href={`https://basescan.org/tx/${caseData.incident_tx}`} target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-accent-700)', textDecoration: 'underline' }}>
                {caseData.incident_tx}
              </a>
            </div>
            <div>
              <span style={{ color: 'var(--color-neutral-600)', fontSize: 12 }}>Reported: </span>
              <span style={{ fontSize: 12 }}>{new Date(caseData.created_at).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tracer findings */}
      <div style={sectionStyle}>
        <span style={sectionHeadingStyle}>Fund Tracing — Tracer Agent</span>
        {tracerSummary && (
          <p style={{ fontSize: 14, color: 'var(--color-text)', lineHeight: 1.7, margin: '0 0 16px', fontFamily: 'var(--font-body)' }}>
            {tracerSummary}
          </p>
        )}
        <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '46px 1fr 1fr 90px',
            gap: 0, padding: '8px var(--space-3)',
            borderBottom: '1px solid var(--color-divider)',
            fontFamily: 'var(--font-mono)', fontSize: '8.5px', letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'var(--color-neutral-600)',
          }}>
            <span>Hop</span><span>From</span><span>To</span><span style={{ textAlign: 'right' }}>Amount</span>
          </div>
          {sortedHops.map((hop, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '46px 1fr 1fr 90px',
              gap: 0, padding: '8px var(--space-3)',
              borderBottom: i < sortedHops.length - 1 ? '1px solid var(--color-divider)' : 'none',
              background: hop.flagged ? 'var(--color-accent-100)' : 'transparent',
              fontSize: 12,
            }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-neutral-600)' }}>
                #{hop.hop_number}{hop.is_split ? '⑂' : ''}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-accent-700)' }}>
                {truncate(hop.from_address, 6)}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: isTerminalHop(hop) ? 'var(--color-neutral-600)' : 'var(--color-accent-700)' }}>
                {/* from == to is the terminal sentinel — no transfer occurred */}
                {isTerminalHop(hop) ? '— trail ends —' : truncate(hop.to_address, 6)}
              </span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {parseFloat(hop.amount).toFixed(6)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Flagged items */}
      {flaggedHops.length > 0 && (
        <div style={sectionStyle}>
          <span style={sectionHeadingStyle}>Flags &amp; Warnings</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {flaggedHops.map((hop, i) => (
              <div key={i} style={{
                borderRadius: 'var(--radius-md)', border: '1px solid var(--color-accent-300)',
                background: 'var(--color-accent-100)', padding: '10px var(--space-3)',
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-accent-700)', marginBottom: 2 }}>{hop.flag_reason}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-neutral-600)' }}>
                    {isTerminalHop(hop)
                      ? `Hop ${hop.hop_number}: funds held at ${truncate(hop.from_address, 6)}`
                      : `Hop ${hop.hop_number}: ${truncate(hop.from_address, 6)} → ${truncate(hop.to_address, 6)}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analyst findings */}
      {analyses.length > 0 && (
        <div style={sectionStyle}>
          <span style={sectionHeadingStyle}>Pattern Analysis — Analyst Agent</span>
          {analystSummary && (
            <p style={{ fontSize: 14, color: 'var(--color-text)', lineHeight: 1.7, margin: '0 0 16px', fontFamily: 'var(--font-body)' }}>
              {analystSummary}
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {analyses.map((a, i) => {
              const riskColor = a.risk_level === 'high' ? 'var(--color-error)' : a.risk_level === 'medium' ? 'var(--color-accent-700)' : 'var(--color-neutral-600)';
              return (
                <div key={i} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <a href={`https://basescan.org/address/${a.address_analyzed}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-accent-700)', textDecoration: 'underline' }}>
                      {truncate(a.address_analyzed, 8)}
                    </a>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase',
                      color: riskColor,
                    }}>
                      {a.risk_level} risk · {Math.round(a.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--color-neutral-700)', lineHeight: 1.6, margin: 0 }}>{a.notes}</p>
                  {a.pattern_matches.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                      {a.pattern_matches.map((p) => (
                        <span key={p} style={{
                          fontFamily: 'var(--font-mono)', fontSize: '9px', padding: '2px 6px',
                          borderRadius: 'var(--radius-sm)', background: 'var(--color-accent-100)',
                          color: 'var(--color-accent-700)', border: '1px solid var(--color-accent-300)',
                        }}>{p}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Monitoring status */}
      {watchedAddresses && (
        <div style={sectionStyle}>
          <span style={sectionHeadingStyle}>Ongoing Surveillance — Monitor Agent</span>
          <div style={cardStyle}>
            <p style={{ fontSize: 13, color: 'var(--color-neutral-700)', lineHeight: 1.6, margin: 0 }}>
              {String(watchedAddresses)} dormant address(es) are under active surveillance. If funds move, the Tracer agent will automatically resume tracing and the report will be updated.
            </p>
          </div>
        </div>
      )}

      {/* On-chain references */}
      {(caseData.claim_tx || caseData.report_tx || caseData.payout_tx) && (
        <div style={sectionStyle}>
          <span style={sectionHeadingStyle}>On-Chain Records (Base Sepolia)</span>
          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
              {caseData.claim_tx && (
                <div>
                  <span style={{ color: 'var(--color-neutral-600)' }}>Bounty claimed: </span>
                  <a href={`https://sepolia.basescan.org/tx/${caseData.claim_tx}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-accent-700)', textDecoration: 'underline' }}>
                    {truncate(caseData.claim_tx, 8)}
                  </a>
                </div>
              )}
              {caseData.report_tx && (
                <div>
                  <span style={{ color: 'var(--color-neutral-600)' }}>Report submitted: </span>
                  <a href={`https://sepolia.basescan.org/tx/${caseData.report_tx}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-accent-700)', textDecoration: 'underline' }}>
                    {truncate(caseData.report_tx, 8)}
                  </a>
                </div>
              )}
              {caseData.payout_tx && (
                <div>
                  <span style={{ color: 'var(--color-status-solved)' }}>✓ Reward released: </span>
                  <a href={`https://sepolia.basescan.org/tx/${caseData.payout_tx}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-accent-700)', textDecoration: 'underline' }}>
                    {truncate(caseData.payout_tx, 8)}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        borderTop: '1px solid var(--color-divider)', paddingTop: 'var(--space-4)',
        fontSize: 11, color: 'var(--color-neutral-600)', fontFamily: 'var(--font-mono)',
        lineHeight: 1.6,
      }}>
        This report was generated by Prowl&apos;s AI agent swarm (Tracer, Analyst, Monitor) coordinated through Sibyl Memory.
        All fund tracing was performed on Base mainnet. Bounty escrow transactions are on Base Sepolia (testnet).
      </div>
    </div>
  );
}

/* ── Component ── */

export default function CaseView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [hops, setHops] = useState<HopData[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisData[]>([]);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'feed' | 'hops' | 'graph' | 'analysis' | 'report'>('feed');
  const [pipelineDone, setPipelineDone] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const [payoutPending, setPayoutPending] = useState(false);
  const [payoutTxHash, setPayoutTxHash] = useState<string | null>(null);
  const [payoutError, setPayoutError] = useState('');
  const { isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  useWaitForTransactionReceipt({
    hash: payoutTxHash as `0x${string}` | undefined,
  });

  // Release reward — poster calls approvePayout on-chain
  const handleReleasePayout = async () => {
    if (!caseData?.bounty_id || caseData.bounty_id.startsWith('manual-')) return;
    const bountyId = parseInt(caseData.bounty_id, 10);
    if (isNaN(bountyId)) return;

    setPayoutPending(true);
    setPayoutError('');
    try {
      if (chainId !== baseSepolia.id) {
        await switchChainAsync({ chainId: baseSepolia.id });
      }
      const contract = getBountyContractConfig();
      const hash = await writeContractAsync({
        ...contract,
        chainId: baseSepolia.id,
        functionName: 'approvePayout',
        args: [BigInt(bountyId)],
      });
      setPayoutTxHash(hash);
      // Update local case data
      setCaseData(prev => prev ? { ...prev, payout_tx: hash, status: 'solved' } : prev);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Payout failed';
      if (msg.includes('User rejected') || msg.includes('denied')) {
        setPayoutError('Transaction cancelled');
      } else {
        setPayoutError(msg.slice(0, 120));
      }
    } finally {
      setPayoutPending(false);
    }
  };

  // Load data — try server first, fall back to localStorage
  const fetchData = useCallback(async () => {
    // 1. Try to load case + events from server
    let serverCase: CaseData | null = null;
    let serverEvents: FeedEvent[] = [];
    try {
      const res = await fetch(`/api/investigate?caseId=${id}`);
      if (res.ok) {
        const data = await res.json();
        serverCase = data.case;
        if (data.events?.length) {
          serverEvents = data.events.map((e: { agent: string; action: string; data: Record<string, unknown>; timestamp: string }) => ({
            id: `${e.agent}-${e.action}-${e.timestamp}`,
            agent: e.agent, action: e.action, data: e.data || {}, timestamp: e.timestamp,
          }));
          try { localStorage.setItem(`prowl-feed-${id}`, JSON.stringify(data.events)); } catch { /* */ }
        }
        if (data.case) {
          try { localStorage.setItem(`prowl-case-${id}`, JSON.stringify(data.case)); } catch { /* */ }
        }
      }
    } catch { /* server unreachable */ }

    // 2. Fall back to localStorage
    if (!serverCase) {
      try {
        const cached = localStorage.getItem(`prowl-case-${id}`);
        if (cached) serverCase = JSON.parse(cached);
      } catch { /* */ }
    }
    if (serverEvents.length === 0) {
      try {
        const cached = localStorage.getItem(`prowl-feed-${id}`);
        if (cached) {
          const raw = JSON.parse(cached);
          serverEvents = raw.map((e: { agent: string; action: string; data: Record<string, unknown>; timestamp: string }) => ({
            id: `${e.agent}-${e.action}-${e.timestamp}`,
            agent: e.agent, action: e.action, data: e.data || {}, timestamp: e.timestamp,
          }));
        }
      } catch { /* */ }
    }

    if (serverCase) setCaseData(serverCase);
    if (serverCase?.status && serverCase.status !== 'active') setPipelineDone(true);

    // 3. Load hops + analyses
    try {
      const memRes = await fetch('/api/memory');
      if (memRes.ok) {
        const memData = await memRes.json();
        const caseHops = (memData.collections?.HOPS || []).filter((h: HopData) => h.case_id === id);
        const caseAnalyses = (memData.collections?.ANALYSIS || []).filter((a: AnalysisData) => a.case_id === id);
        setHops(caseHops);
        setAnalyses(caseAnalyses);
        try {
          localStorage.setItem(`prowl-hops-${id}`, JSON.stringify(caseHops));
          localStorage.setItem(`prowl-analysis-${id}`, JSON.stringify(caseAnalyses));
        } catch { /* */ }
      } else {
        const cachedHops = localStorage.getItem(`prowl-hops-${id}`);
        const cachedAnalyses = localStorage.getItem(`prowl-analysis-${id}`);
        if (cachedHops) setHops(JSON.parse(cachedHops));
        if (cachedAnalyses) setAnalyses(JSON.parse(cachedAnalyses));
      }
    } catch {
      try {
        const cachedHops = localStorage.getItem(`prowl-hops-${id}`);
        const cachedAnalyses = localStorage.getItem(`prowl-analysis-${id}`);
        if (cachedHops) setHops(JSON.parse(cachedHops));
        if (cachedAnalyses) setAnalyses(JSON.parse(cachedAnalyses));
      } catch { /* */ }
    }

    // 4. Animate events into the feed one by one for a "live" effect
    if (serverEvents.length > 0 && feed.length === 0) {
      // Reveal events sequentially with delays
      const reversed = [...serverEvents].reverse();
      for (let i = 0; i < reversed.length; i++) {
        setTimeout(() => {
          setFeed(prev => {
            // Avoid duplicates
            if (prev.some(f => f.id === reversed[i].id)) return prev;
            return [reversed[i], ...prev];
          });
        }, i * 1200); // 1.2s between each event
      }
      setPipelineDone(true);
    }

    setLoading(false);
  }, [id, feed.length]);

  // Initial fetch
  useEffect(() => { fetchData(); }, [fetchData]); // eslint-disable-line react-hooks/set-state-in-effect -- fetch on mount

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current && activeTab === 'feed') {
      feedRef.current.scrollTop = 0;
    }
  }, [feed, activeTab]);

  if (loading) {
    return (
      <DashboardShell>
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div style={{
            width: 32, height: 32, margin: '0 auto 16px',
            border: '2px solid var(--color-accent-300)', borderTopColor: 'var(--color-accent)',
            borderRadius: 999, animation: 'spin 1s linear infinite',
          }} />
          <div style={{ color: 'var(--color-neutral-600)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            Loading investigation…
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </DashboardShell>
    );
  }

  if (!caseData) {
    return (
      <DashboardShell>
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 28, marginBottom: 8 }}>Case not found</div>
          <div style={{ color: 'var(--color-neutral-600)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{id}</div>
        </div>
      </DashboardShell>
    );
  }

  const st = statusStyle(caseData.status);

  return (
    <DashboardShell>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
        <h1 style={{ fontSize: 'clamp(24px, 2.8vw, 34px)', fontWeight: 400, margin: 0, fontFamily: 'var(--font-mono)', letterSpacing: '-0.01em' }}>
          {caseData.case_id}
        </h1>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase',
          padding: '3px 10px', borderRadius: 999,
          background: st.bg, color: st.color, border: `1px solid ${st.border}`,
        }}>
          {caseData.status.replace('_', ' ')}
        </span>
      </div>

      <div style={{ fontSize: 13, color: 'var(--color-neutral-700)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
        <span>Victim: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-accent-700)' }}>{truncate(caseData.victim_wallet, 6)}</span></span>
        {' · '}
        <span>Reward: <span style={{ fontFamily: 'var(--font-heading)', fontSize: 15 }}>{caseData.reward}</span></span>
        {' · '}
        <span>Opened: <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{new Date(caseData.created_at).toLocaleString()}</span></span>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        {[
          { label: 'Hops traced', value: caseData.total_hops_traced },
          { label: 'Funds traced', value: caseData.total_funds_traced || '—' },
          { label: 'Analyses', value: analyses.length },
          { label: 'High risk', value: analyses.filter(a => a.risk_level === 'high').length },
          { label: 'Agents', value: (caseData.agents_involved || []).length },
        ].map((s) => (
          <div key={s.label} style={{
            borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)',
            background: 'var(--color-card)', padding: 'var(--space-3)', textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '8.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-neutral-600)', marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Payout section — shown when report is submitted on-chain */}
      {caseData.report_tx && !caseData.payout_tx && (
        <div style={{
          borderRadius: 'var(--radius-md)', border: '1px solid var(--color-accent-300)',
          background: 'var(--color-accent-100)', padding: 'var(--space-4)',
          marginBottom: 'var(--space-4)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)',
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 17, marginBottom: 4 }}>
              Investigation complete — report submitted on-chain
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-neutral-700)' }}>
              Reward: <strong style={{ fontFamily: 'var(--font-heading)' }}>{caseData.reward}</strong>
              {caseData.claimed_by && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, marginLeft: 8 }}>
                  → {truncate(caseData.claimed_by, 6)}
                </span>
              )}
            </div>
            {payoutError && (
              <div style={{ fontSize: 11, color: 'var(--color-error)', marginTop: 4 }}>{payoutError}</div>
            )}
          </div>
          {isConnected ? (
            <button onClick={handleReleasePayout} disabled={payoutPending} style={{
              padding: '10px 20px', borderRadius: 'var(--radius-md)',
              background: 'var(--color-text)', color: 'var(--color-bg)',
              fontFamily: 'var(--font-mono)', fontSize: '10px',
              letterSpacing: '0.12em', textTransform: 'uppercase',
              border: 'none', cursor: payoutPending ? 'wait' : 'pointer',
              opacity: payoutPending ? 0.6 : 1, whiteSpace: 'nowrap',
            }}>
              {payoutPending ? 'Confirm in wallet…' : 'Release reward'}
            </button>
          ) : (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-neutral-600)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Connect wallet to release
            </div>
          )}
        </div>
      )}

      {/* Payout confirmed */}
      {(caseData.payout_tx || payoutTxHash) && (
        <div style={{
          borderRadius: 'var(--radius-md)', border: '1px solid var(--color-status-solved-border)',
          background: 'var(--color-status-solved-bg)', padding: 'var(--space-4)',
          marginBottom: 'var(--space-4)',
          fontSize: 13,
        }}>
          <span style={{ color: 'var(--color-status-solved)', fontWeight: 600 }}>✓ Reward released</span>
          {(caseData.payout_tx || payoutTxHash) && (
            <a
              href={`https://sepolia.basescan.org/tx/${caseData.payout_tx || payoutTxHash}`}
              target="_blank" rel="noopener noreferrer"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-accent-700)', marginLeft: 12, textDecoration: 'underline' }}
            >
              {truncate(caseData.payout_tx || payoutTxHash || '', 8)}
            </a>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-divider)', marginBottom: 'var(--space-4)' }}>
        {[
          { key: 'feed' as const, label: 'Live feed', count: feed.length },
          { key: 'hops' as const, label: 'Hop timeline', count: hops.length },
          { key: 'graph' as const, label: 'Fund graph', count: hops.length > 0 ? 1 : 0 },
          { key: 'analysis' as const, label: 'Analysis', count: analyses.length },
          { key: 'report' as const, label: 'Report', count: pipelineDone ? 1 : 0 },
        ].map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
            padding: '8px 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
            borderBottom: activeTab === tab.key ? '2px solid var(--color-accent)' : '2px solid transparent',
            color: activeTab === tab.key ? 'var(--color-text)' : 'var(--color-neutral-600)',
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-body)',
          }}>
            {tab.label}
            {tab.count > 0 && (
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '9px', padding: '1px 5px',
                borderRadius: 999, background: 'var(--color-accent-100)',
                color: 'var(--color-accent-700)', border: '1px solid var(--color-accent-300)',
              }}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Live Feed */}
      {activeTab === 'feed' && (
        <div ref={feedRef} style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 520, overflowY: 'auto' }}>
          {feed.length === 0 ? (
            <div style={{
              borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-divider)',
              background: 'var(--color-neutral-100)', padding: 'clamp(40px, 5vw, 60px)',
              textAlign: 'center',
            }}>
              <div style={{
                width: 32, height: 32, margin: '0 auto 12px',
                border: '2px solid var(--color-accent-300)', borderTopColor: 'var(--color-accent)',
                borderRadius: 999, animation: 'spin 1.2s linear infinite',
              }} />
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18, marginBottom: 6 }}>Listening for agent activity</div>
              <p style={{ fontSize: 12, color: 'var(--color-neutral-600)', maxWidth: '36ch', margin: '0 auto' }}>
                The swarm&apos;s events will appear here in real time as agents process this case.
              </p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : (
            feed.map((event) => {
              const agentColor = AGENT_COLORS[event.agent] || 'var(--color-neutral-600)';
              const icon = AGENT_ICONS[event.agent] || '??';
              const isMilestone = ['tracing_complete', 'analysis_complete', 'case_solved', 'monitoring_setup'].includes(event.action);
              const isDegraded = isDegradedEvent(event.action);

              return (
                <div key={event.id} style={{
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${isDegraded ? '#f85149' : isMilestone ? 'var(--color-accent-300)' : 'var(--color-divider)'}`,
                  background: isDegraded ? 'rgba(248, 81, 73, 0.08)' : isMilestone ? 'var(--color-accent-100)' : 'var(--color-card)',
                  padding: 'var(--space-3)',
                  animation: 'pw-fade-up 0.4s ease-out both',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {/* Agent icon */}
                    <span style={{
                      width: 26, height: 26, borderRadius: 999, flexShrink: 0,
                      border: `1px solid ${isDegraded ? '#f85149' : agentColor}`,
                      display: 'grid', placeContent: 'center',
                      fontFamily: 'var(--font-heading)', fontSize: 10,
                      color: isDegraded ? '#f85149' : agentColor,
                      background: isDegraded ? 'rgba(248, 81, 73, 0.12)' : 'rgba(255,255,255,0.5)',
                    }}>{isDegraded ? '!!' : icon}</span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        fontFamily: 'var(--font-heading)', fontSize: 14,
                        color: isDegraded ? '#f85149' : agentColor,
                        textTransform: 'capitalize',
                      }}>
                        {event.agent}
                      </span>
                      <span style={{
                        fontSize: 12,
                        color: isDegraded ? '#f85149' : 'var(--color-neutral-600)',
                        marginLeft: 8,
                        fontWeight: isDegraded ? 600 : 400,
                      }}>
                        {actionLabel(event.action)}
                      </span>
                    </div>

                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-neutral-600)', flexShrink: 0 }}>
                      {timeAgo(event.timestamp)}
                    </span>
                  </div>

                  {/* Degradation warning banner */}
                  {isDegraded && Boolean(event.data?.warning) && (
                    <div style={{
                      background: 'rgba(248, 81, 73, 0.06)',
                      border: '1px dashed rgba(248, 81, 73, 0.3)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px 12px',
                      marginTop: 4,
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}>
                      <div style={{ color: '#f85149', fontWeight: 600, marginBottom: 2 }}>
                        {String(event.data.warning)}
                      </div>
                      {Boolean(event.data.impact) && (
                        <div style={{ color: 'var(--color-neutral-600)', fontStyle: 'italic' }}>
                          {String(event.data.impact)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Event details */}
                  {!isDegraded && event.data && Object.keys(event.data).length > 0 && (
                    <EventDetails data={event.data} />
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Hop Timeline */}
      {activeTab === 'hops' && (
        hops.length === 0 ? (
          <div style={{
            borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-divider)',
            background: 'var(--color-neutral-100)', padding: 'clamp(40px, 5vw, 60px)',
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18, marginBottom: 6 }}>No hops traced yet</div>
            <p style={{ fontSize: 12, color: 'var(--color-neutral-600)', maxWidth: '36ch', margin: '0 auto' }}>
              Tracer will map the fund flow hop-by-hop once the investigation starts.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {hops.sort((a, b) => a.hop_number - b.hop_number).map((hop, i) => (
              <div key={i} style={{ display: 'flex', gap: 12 }}>
                {/* Timeline line */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: 999,
                    background: hop.flagged ? 'var(--color-accent)' : 'var(--color-neutral-400)',
                    border: '2px solid #f3f2f2', flexShrink: 0,
                  }} />
                  {i < hops.length - 1 && (
                    <div style={{ width: 1, flex: 1, background: 'var(--color-divider)', minHeight: 20 }} />
                  )}
                </div>

                {/* Hop card */}
                <div style={{
                  flex: 1, marginBottom: 8,
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${hop.flagged ? 'var(--color-accent-300)' : 'var(--color-divider)'}`,
                  background: hop.flagged ? 'var(--color-accent-100)' : 'var(--color-card)',
                  padding: 'var(--space-3)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-neutral-600)' }}>
                      Hop {hop.hop_number} {hop.is_split && '· SPLIT'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: 14 }}>{hop.amount} {hop.asset_symbol ?? 'ETH'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-accent-700)' }}>{truncate(hop.from_address, 6)}</span>
                    <span style={{ color: 'var(--color-neutral-400)', fontSize: 10 }}>→</span>
                    {/* from == to marks the end of the trail, not a self-send */}
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: isTerminalHop(hop) ? 'var(--color-neutral-600)' : 'var(--color-accent-700)' }}>
                      {isTerminalHop(hop) ? '— trail ends —' : truncate(hop.to_address, 6)}
                    </span>
                  </div>
                  {hop.tx_hash && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--color-neutral-600)', marginTop: 3 }}>
                      TX: {truncate(hop.tx_hash, 8)}
                    </div>
                  )}
                  {hop.flagged && hop.flag_reason && (
                    <div style={{ marginTop: 5, fontSize: 11, color: 'var(--color-accent-700)', fontWeight: 500 }}>⚠ {hop.flag_reason}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Fund Flow Graph */}
      {activeTab === 'graph' && (
        hops.length === 0 ? (
          <div style={{
            borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-divider)',
            background: 'var(--color-neutral-100)', padding: 'clamp(40px, 5vw, 60px)',
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18, marginBottom: 6 }}>No fund flow data</div>
            <p style={{ fontSize: 12, color: 'var(--color-neutral-600)', maxWidth: '36ch', margin: '0 auto' }}>
              The graph will render once Tracer maps the fund trail.
            </p>
          </div>
        ) : (
          <FundFlowGraph hops={hops} analyses={analyses} />
        )
      )}

      {/* Analysis */}
      {activeTab === 'analysis' && (
        analyses.length === 0 ? (
          <div style={{
            borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-divider)',
            background: 'var(--color-neutral-100)', padding: 'clamp(40px, 5vw, 60px)',
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18, marginBottom: 6 }}>No analysis results yet</div>
            <p style={{ fontSize: 12, color: 'var(--color-neutral-600)', maxWidth: '36ch', margin: '0 auto' }}>
              Analyst will match patterns against known scam signatures once Tracer finishes.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {analyses.map((a, i) => {
              const riskColor = a.risk_level === 'high' ? 'var(--color-error)' : a.risk_level === 'medium' ? 'var(--color-accent-700)' : 'var(--color-neutral-600)';
              const riskBg = a.risk_level === 'high' ? 'var(--color-error-bg)' : a.risk_level === 'medium' ? 'var(--color-accent-100)' : 'var(--color-neutral-100)';

              return (
                <div key={i} style={{
                  borderRadius: 'var(--radius-md)', border: '1px solid var(--color-divider)',
                  background: 'var(--color-card)', padding: 'var(--space-3)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--color-accent-700)' }}>
                      {truncate(a.address_analyzed, 6)}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase',
                      padding: '2px 8px', borderRadius: 999,
                      background: riskBg, color: riskColor,
                    }}>
                      {a.risk_level} risk · {Math.round(a.confidence * 100)}%
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--color-neutral-700)', lineHeight: 1.5, margin: 0 }}>{a.notes}</p>
                  {a.pattern_matches.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                      {a.pattern_matches.map((p) => (
                        <span key={p} style={{
                          fontFamily: 'var(--font-mono)', fontSize: '9px', padding: '2px 6px',
                          borderRadius: 'var(--radius-sm)', background: 'var(--color-accent-100)',
                          color: 'var(--color-accent-700)', border: '1px solid var(--color-accent-300)',
                        }}>{p}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}
      {/* Report */}
      {activeTab === 'report' && (
        !pipelineDone ? (
          <div style={{
            borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-divider)',
            background: 'var(--color-neutral-100)', padding: 'clamp(40px, 5vw, 60px)',
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: 18, marginBottom: 6 }}>Report pending</div>
            <p style={{ fontSize: 12, color: 'var(--color-neutral-600)', maxWidth: '36ch', margin: '0 auto' }}>
              The investigation report will be generated once all agents finish processing.
            </p>
          </div>
        ) : (
          <ReportView caseData={caseData} hops={hops} analyses={analyses} feed={feed} />
        )
      )}
    </DashboardShell>
  );
}
