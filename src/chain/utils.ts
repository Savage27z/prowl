// Chain utility functions for address and transaction handling
// Chain utility functions

export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function isValidTxHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}

export function weiToEth(wei: bigint | string): string {
  const weiNum = typeof wei === 'string' ? BigInt(wei) : wei;
  // Divide by 10^12 first (stays within safe integer range), then by 10^6
  const eth = Number(weiNum / BigInt('1000000000000')) / 1e6;
  return eth.toFixed(6);
}

export function ethToWei(eth: string | number): bigint {
  // Split into whole and fractional to avoid Number precision loss
  const str = String(eth);
  const [whole = '0', frac = ''] = str.split('.');
  const padded = (frac + '000000000000000000').slice(0, 18);
  return BigInt(whole) * BigInt('1000000000000000000') + BigInt(padded);
}

export function checksumAddress(address: string): string {
  // Use viem's getAddress for proper EIP-55 checksum when available
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getAddress } = require('viem');
    return getAddress(address);
  } catch {
    return address.toLowerCase();
  }
}

/// Total the funds an investigation actually touched.
///
/// Summing every hop double-counts: 5 ETH relayed through 3 wallets is three
/// hops of 5 ETH, but only 5 ETH was ever stolen. Funds are counted once per
/// branch by taking the LARGEST transfer on each branch — a branch cannot move
/// more than the amount that entered it — and amounts are grouped by asset so
/// ETH and ERC-20 units are never added together.
export function summarizeTracedFunds(
  hops: { amount: string; branch_id?: string; asset_symbol?: string; asset_contract?: string }[],
): string {
  if (hops.length === 0) return '0 ETH';

  // asset -> branch -> largest amount seen on that branch
  const byAsset = new Map<string, Map<string, number>>();

  for (const hop of hops) {
    const amount = parseFloat(hop.amount);
    if (!isFinite(amount) || amount <= 0) continue;
    // Hops written before asset tracking are ETH by convention
    const symbol = hop.asset_symbol || 'ETH';
    const branches = byAsset.get(symbol) ?? new Map<string, number>();
    const branch = hop.branch_id || 'main';
    branches.set(branch, Math.max(branches.get(branch) ?? 0, amount));
    byAsset.set(symbol, branches);
  }

  if (byAsset.size === 0) return '0 ETH';

  const parts: string[] = [];
  // ETH first, then other assets alphabetically, so output is stable
  const symbols = [...byAsset.keys()].sort((a, b) => {
    if (a === 'ETH') return -1;
    if (b === 'ETH') return 1;
    return a.localeCompare(b);
  });

  for (const symbol of symbols) {
    const total = [...byAsset.get(symbol)!.values()].reduce((sum, v) => sum + v, 0);
    const formatted = symbol === 'ETH' ? total.toFixed(6) : String(parseFloat(total.toFixed(6)));
    parts.push(`${formatted} ${symbol}`);
  }

  return parts.join(' + ');
}

export function shortenTxHash(hash: string, chars = 8): string {
  if (!hash) return '';
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}

export function basescanTxUrl(txHash: string, testnet = false): string {
  const baseUrl = testnet ? 'https://sepolia.basescan.org' : 'https://basescan.org';
  return `${baseUrl}/tx/${txHash}`;
}

export function basescanAddressUrl(address: string, testnet = false): string {
  const baseUrl = testnet ? 'https://sepolia.basescan.org' : 'https://basescan.org';
  return `${baseUrl}/address/${address}`;
}
