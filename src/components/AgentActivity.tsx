// AgentActivity — real-time display of agent actions and status
'use client';

import { formatDate } from '@/lib/utils';

interface ActivityEntry {
  agent: 'tracer' | 'analyst' | 'monitor' | 'coordinator';
  action: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface AgentActivityProps {
  activities: ActivityEntry[];
  maxEntries?: number;
}

const agentIcons: Record<string, string> = {
  tracer: '🔍',
  analyst: '🧠',
  monitor: '📡',
  coordinator: '⚙️',
};

const agentColors: Record<string, string> = {
  tracer: 'border-blue-500/40 text-blue-300',
  analyst: 'border-purple-500/40 text-purple-300',
  monitor: 'border-amber-500/40 text-amber-300',
  coordinator: 'border-gray-500/40 text-gray-300',
};

function formatAction(action: string): string {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AgentActivity({ activities, maxEntries = 20 }: AgentActivityProps) {
  const displayed = activities.slice(0, maxEntries);

  if (displayed.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-gray-500 text-sm">No agent activity yet</p>
        <p className="text-gray-600 text-xs mt-1">Start an investigation to see agents in action</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {displayed.map((entry, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.03] p-3 hover:bg-white/[0.06] transition-colors"
        >
          {/* Agent icon */}
          <div className={`flex-shrink-0 w-8 h-8 rounded-full border flex items-center justify-center text-sm ${agentColors[entry.agent]}`}>
            {agentIcons[entry.agent]}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {entry.agent}
              </span>
              <span className="text-xs text-gray-600">•</span>
              <span className="text-xs text-gray-500">
                {formatDate(entry.timestamp)}
              </span>
            </div>
            <p className="text-sm text-white">{formatAction(entry.action)}</p>

            {/* Summary data */}
            {'summary' in entry.data && entry.data.summary ? (
              <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                {String(entry.data.summary)}
              </p>
            ) : null}

            {/* Key metrics */}
            <div className="flex gap-3 mt-1">
              {entry.data.hops !== undefined && (
                <span className="text-[10px] text-gray-500">
                  {String(entry.data.hops)} hops
                </span>
              )}
              {entry.data.newPatterns !== undefined && (
                <span className="text-[10px] text-gray-500">
                  {String(entry.data.newPatterns)} new patterns
                </span>
              )}
              {entry.data.watchedAddresses !== undefined && (
                <span className="text-[10px] text-gray-500">
                  {String(entry.data.watchedAddresses)} watching
                </span>
              )}
              {'overallRisk' in entry.data && entry.data.overallRisk ? (
                <span className={`text-[10px] ${
                  entry.data.overallRisk === 'high' ? 'text-red-400' :
                  entry.data.overallRisk === 'medium' ? 'text-yellow-400' :
                  'text-green-400'
                }`}>
                  Risk: {String(entry.data.overallRisk)}
                </span>
              ) : null}
            </div>
          </div>

          {/* Status pulse for active items */}
          {entry.action.includes('started') && (
            <div className="flex-shrink-0 mt-1">
              <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
