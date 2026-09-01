// BountyCard — compact case summary card for dashboard grids
'use client';

import { truncateAddress, formatEth, formatDate, statusBadge } from '@/lib/utils';

interface BountyCardProps {
  caseId: string;
  victimWallet: string;
  reward: string;
  status: string;
  createdAt: string;
  totalHops: number;
  onClick?: () => void;
}

export default function BountyCard({
  caseId,
  victimWallet,
  reward,
  status,
  createdAt,
  totalHops,
  onClick,
}: BountyCardProps) {
  return (
    <div
      onClick={onClick}
      className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/[0.08] cursor-pointer"
    >
      {/* Status indicator */}
      <div className="absolute top-0 right-0 h-20 w-20 opacity-10">
        {status === 'active' && (
          <div className="absolute top-3 right-3 h-3 w-3 rounded-full bg-blue-400 animate-pulse" />
        )}
        {status === 'solved' && (
          <svg className="absolute top-2 right-2 h-6 w-6 text-green-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
      </div>

      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-mono text-gray-500">{caseId}</span>
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusBadge(status)}`}>
          {status.replace('_', ' ')}
        </span>
      </div>

      <div className="mb-3">
        <p className="text-sm text-gray-400 mb-1">Victim</p>
        <p className="font-mono text-sm text-white">{truncateAddress(victimWallet)}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-xs text-gray-500">Reward</p>
          <p className="text-sm font-semibold text-emerald-400">{formatEth(reward)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Hops</p>
          <p className="text-sm font-semibold text-white">{totalHops}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Posted</p>
          <p className="text-sm text-gray-300">{formatDate(createdAt)}</p>
        </div>
      </div>

      {/* Hover glow */}
      <div className="absolute inset-0 -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-blue-500/5" />
      </div>
    </div>
  );
}
