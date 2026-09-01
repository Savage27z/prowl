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
