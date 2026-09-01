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
  const eth = Number(weiNum) / 1e18;
  return eth.toFixed(6);
}

export function ethToWei(eth: string | number): bigint {
  return BigInt(Math.floor(Number(eth) * 1e18));
}

export function checksumAddress(address: string): string {
  // Basic lowercase normalization — proper checksum needs keccak
  return address.toLowerCase();
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
