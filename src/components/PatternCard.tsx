// PatternCard — attack pattern visualization with risk indicators
'use client';

interface PatternCardProps {
  patternId: string;
  type: string;
  description: string;
  timesMatched: number;
  confidence: number;
  firstSeenCase: string;
  relatedAddresses: string[];
}

const typeIcons: Record<string, string> = {
  fund_splitting: '🔀',
  rapid_movement: '⚡',
  contract_interaction: '📜',
  bridge_usage: '🌉',
  mixer_usage: '🌀',
  cex_deposit: '🏦',
};

const typeColors: Record<string, string> = {
  fund_splitting: 'bg-orange-500/10 border-orange-500/30 text-orange-300',
  rapid_movement: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300',
  contract_interaction: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
  bridge_usage: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
  mixer_usage: 'bg-red-500/10 border-red-500/30 text-red-300',
  cex_deposit: 'bg-green-500/10 border-green-500/30 text-green-300',
};

export default function PatternCard({
  patternId,
  type,
  description,
  timesMatched,
  confidence,
  firstSeenCase,
  relatedAddresses,
}: PatternCardProps) {
  const icon = typeIcons[type] || '🔍';
  const colorClass = typeColors[type] || 'bg-gray-500/10 border-gray-500/30 text-gray-300';

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 hover:border-white/20 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${colorClass}`}>
            {type.replace(/_/g, ' ')}
          </span>
        </div>
        <span className="text-xs font-mono text-gray-600">{patternId}</span>
      </div>

      <p className="text-sm text-white mb-3">{description}</p>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <p className="text-xs text-gray-500">Matched</p>
          <p className="text-lg font-bold text-white">{timesMatched}×</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Confidence</p>
          <p className="text-lg font-bold text-white">{Math.round(confidence * 100)}%</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">First Seen</p>
          <p className="text-sm font-mono text-gray-300">{firstSeenCase}</p>
        </div>
      </div>

      {/* Confidence bar */}
      <div className="w-full bg-white/5 rounded-full h-1.5 mb-3">
        <div
          className="h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-blue-500"
          style={{ width: `${confidence * 100}%` }}
        />
      </div>

      {/* Related addresses */}
      {relatedAddresses.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">Related Addresses</p>
          <div className="flex flex-wrap gap-1">
            {relatedAddresses.slice(0, 3).map((addr) => (
              <span key={addr} className="text-[10px] font-mono bg-white/5 px-2 py-0.5 rounded text-gray-400">
                {addr.slice(0, 10)}...
              </span>
            ))}
            {relatedAddresses.length > 3 && (
              <span className="text-[10px] text-gray-600">
                +{relatedAddresses.length - 3} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
