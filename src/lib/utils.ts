// Utility functions

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function truncateAddress(address: string, chars = 6): string {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function formatEth(value: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return '0 ETH';
  return `${num.toFixed(4)} ETH`;
}

export function formatDate(iso: string): string {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function riskColor(level: string): string {
  switch (level) {
    case 'high':
      return 'text-red-400';
    case 'medium':
      return 'text-yellow-400';
    case 'low':
      return 'text-green-400';
    default:
      return 'text-gray-400';
  }
}

export function riskBg(level: string): string {
  switch (level) {
    case 'high':
      return 'bg-red-500/10 border-red-500/30';
    case 'medium':
      return 'bg-yellow-500/10 border-yellow-500/30';
    case 'low':
      return 'bg-green-500/10 border-green-500/30';
    default:
      return 'bg-gray-500/10 border-gray-500/30';
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'text-blue-400';
    case 'monitoring':
      return 'text-yellow-400';
    case 'solved':
      return 'text-green-400';
    case 'dead_end':
      return 'text-red-400';
    default:
      return 'text-gray-400';
  }
}

export function statusBadge(status: string): string {
  const colors: Record<string, string> = {
    active: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    monitoring: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
    solved: 'bg-green-500/20 text-green-300 border-green-500/40',
    dead_end: 'bg-red-500/20 text-red-300 border-red-500/40',
  };
  return colors[status] || 'bg-gray-500/20 text-gray-300 border-gray-500/40';
}
