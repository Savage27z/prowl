// FundFlowGraph — interactive transaction flow visualization
'use client';

import { useEffect, useRef, useCallback } from 'react';
import { truncateAddress } from '@/lib/utils';

interface Node {
  id: string;
  label: string;
  x: number;
  y: number;
  risk: 'high' | 'medium' | 'low' | 'none';
  type: 'wallet' | 'contract' | 'exchange' | 'bridge' | 'victim';
}

interface Edge {
  from: string;
  to: string;
  amount: string;
  txHash: string;
  hopNumber: number;
}

interface FundFlowGraphProps {
  hops: {
    from_address: string;
    to_address: string;
    amount: string;
    tx_hash: string;
    hop_number: number;
    flagged: boolean;
    flag_reason: string | null;
  }[];
  analyses?: {
    address_analyzed: string;
    risk_level: string;
  }[];
  victimWallet?: string;
  width?: number;
  height?: number;
}

const riskColors = {
  high: '#ef4444',
  medium: '#eab308',
  low: '#22c55e',
  none: '#6b7280',
};

const typeColors = {
  wallet: '#8b5cf6',
  contract: '#3b82f6',
  exchange: '#22c55e',
  bridge: '#a855f7',
  victim: '#ef4444',
};

export default function FundFlowGraph({
  hops,
  analyses = [],
  victimWallet,
  width = 800,
  height = 500,
}: FundFlowGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const buildGraph = useCallback((): { nodes: Node[]; edges: Edge[] } => {
    const nodeMap = new Map<string, Node>();
    const edges: Edge[] = [];

    // Build unique nodes
    for (const hop of hops) {
      if (!nodeMap.has(hop.from_address)) {
        const isVictim = hop.from_address.toLowerCase() === victimWallet?.toLowerCase();
        const analysis = analyses.find(
          (a) => a.address_analyzed.toLowerCase() === hop.from_address.toLowerCase()
        );

        nodeMap.set(hop.from_address, {
          id: hop.from_address,
          label: truncateAddress(hop.from_address, 4),
          x: 0,
          y: 0,
          risk: (analysis?.risk_level as Node['risk']) || 'none',
          type: isVictim ? 'victim' : getAddressType(hop, 'from'),
        });
      }

      if (!nodeMap.has(hop.to_address) && hop.to_address !== hop.from_address) {
        const analysis = analyses.find(
          (a) => a.address_analyzed.toLowerCase() === hop.to_address.toLowerCase()
        );

        nodeMap.set(hop.to_address, {
          id: hop.to_address,
          label: truncateAddress(hop.to_address, 4),
          x: 0,
          y: 0,
          risk: (analysis?.risk_level as Node['risk']) || 'none',
          type: getAddressType(hop, 'to'),
        });
      }

      if (hop.to_address !== hop.from_address) {
        edges.push({
          from: hop.from_address,
          to: hop.to_address,
          amount: hop.amount,
          txHash: hop.tx_hash,
          hopNumber: hop.hop_number,
        });
      }
    }

    // Layout nodes in a hierarchical flow
    const nodes = Array.from(nodeMap.values());
    layoutNodes(nodes, edges, width, height);

    return { nodes, edges };
  }, [hops, analyses, victimWallet, width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size for retina
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const { nodes, edges } = buildGraph();

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw edges
    for (const edge of edges) {
      const fromNode = nodes.find((n) => n.id === edge.from);
      const toNode = nodes.find((n) => n.id === edge.to);
      if (!fromNode || !toNode) continue;

      // Draw curved line
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.3)';
      ctx.lineWidth = 1.5;

      const cpX = (fromNode.x + toNode.x) / 2;
      const cpY = (fromNode.y + toNode.y) / 2 - 30;

      ctx.moveTo(fromNode.x, fromNode.y);
      ctx.quadraticCurveTo(cpX, cpY, toNode.x, toNode.y);
      ctx.stroke();

      // Arrow head
      const angle = Math.atan2(toNode.y - cpY, toNode.x - cpX);
      const arrowLen = 8;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(139, 92, 246, 0.5)';
      ctx.moveTo(toNode.x, toNode.y);
      ctx.lineTo(
        toNode.x - arrowLen * Math.cos(angle - Math.PI / 6),
        toNode.y - arrowLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        toNode.x - arrowLen * Math.cos(angle + Math.PI / 6),
        toNode.y - arrowLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.fill();

      // Amount label
      const midX = (fromNode.x + toNode.x) / 2;
      const midY = (fromNode.y + toNode.y) / 2 - 15;
      ctx.font = '9px monospace';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.textAlign = 'center';
      ctx.fillText(`${parseFloat(edge.amount).toFixed(3)} ETH`, midX, midY);
    }

    // Draw nodes
    for (const node of nodes) {
      const radius = node.type === 'victim' ? 22 : 18;
      const color = typeColors[node.type];

      // Glow effect
      const gradient = ctx.createRadialGradient(
        node.x, node.y, 0,
        node.x, node.y, radius * 2
      );
      gradient.addColorStop(0, color + '30');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fillRect(node.x - radius * 2, node.y - radius * 2, radius * 4, radius * 4);

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = color + '20';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Risk ring
      if (node.risk !== 'none') {
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = riskColors[node.risk] + '60';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Label
      ctx.font = '10px monospace';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(node.label, node.x, node.y + radius + 14);

      // Type icon
      const icons: Record<string, string> = {
        victim: '💀',
        exchange: '🏦',
        bridge: '🌉',
        contract: '📜',
        wallet: '👛',
      };
      ctx.font = '12px serif';
      ctx.fillText(icons[node.type] || '•', node.x, node.y + 4);
    }
  }, [hops, analyses, victimWallet, width, height, buildGraph]);

  if (hops.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-10 text-center" style={{ width, height: height / 2 }}>
        <p className="text-gray-500 text-sm">No fund flow data</p>
        <p className="text-gray-600 text-xs mt-1">Start an investigation to see the fund trail</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <h3 className="text-sm font-medium text-white">Fund Flow</h3>
        <div className="flex gap-3">
          {Object.entries(typeColors).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-gray-500 capitalize">{type}</span>
            </div>
          ))}
        </div>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width, height }}
        className="block"
      />
    </div>
  );
}

function getAddressType(
  hop: FundFlowGraphProps['hops'][0],
  direction: 'from' | 'to'
): Node['type'] {
  if (!hop.flagged) return 'wallet';

  const reason = hop.flag_reason?.toLowerCase() || '';
  if (reason.includes('exchange') || reason.includes('cex') || reason.includes('coinbase') || reason.includes('binance')) return 'exchange';
  if (reason.includes('bridge')) return 'bridge';
  if (reason.includes('contract')) return 'contract';
  return 'wallet';
}

function layoutNodes(nodes: Node[], edges: Edge[], width: number, height: number) {
  // Simple hierarchical layout based on hop order
  const levels = new Map<string, number>();

  // BFS from nodes that are only sources (level 0)
  const targetSet = new Set(edges.map((e) => e.to));
  const sourceSet = new Set(edges.map((e) => e.from));

  // Root nodes are sources that aren't targets
  const roots = nodes.filter((n) => sourceSet.has(n.id) && !targetSet.has(n.id));
  if (roots.length === 0 && nodes.length > 0) {
    roots.push(nodes[0]);
  }

  for (const root of roots) {
    levels.set(root.id, 0);
  }

  // BFS
  const queue = [...roots.map((r) => r.id)];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentLevel = levels.get(current) || 0;

    for (const edge of edges) {
      if (edge.from === current && !levels.has(edge.to)) {
        levels.set(edge.to, currentLevel + 1);
        queue.push(edge.to);
      }
    }
  }

  // Assign positions
  const maxLevel = Math.max(...Array.from(levels.values()), 0);
  const nodesPerLevel = new Map<number, string[]>();

  for (const [nodeId, level] of levels) {
    if (!nodesPerLevel.has(level)) nodesPerLevel.set(level, []);
    nodesPerLevel.get(level)!.push(nodeId);
  }

  // Handle orphans
  for (const node of nodes) {
    if (!levels.has(node.id)) {
      const orphanLevel = maxLevel + 1;
      levels.set(node.id, orphanLevel);
      if (!nodesPerLevel.has(orphanLevel)) nodesPerLevel.set(orphanLevel, []);
      nodesPerLevel.get(orphanLevel)!.push(node.id);
    }
  }

  const padding = 60;
  const totalLevels = Math.max(...Array.from(nodesPerLevel.keys()), 0) + 1;

  for (const [level, nodeIds] of nodesPerLevel) {
    const x = padding + (level / Math.max(totalLevels - 1, 1)) * (width - padding * 2);

    for (let i = 0; i < nodeIds.length; i++) {
      const y = padding + ((i + 1) / (nodeIds.length + 1)) * (height - padding * 2);
      const node = nodes.find((n) => n.id === nodeIds[i]);
      if (node) {
        node.x = x;
        node.y = y;
      }
    }
  }
}
