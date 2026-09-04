// ChainReader — abstraction layer for Base chain data
// Supports both direct RPC calls and Basescan API
// Base chain data reader
// Reads transaction data, wallet balances, and contract info from Base

/// A transferred asset. ETH and ERC-20 amounts are NOT interchangeable —
/// 1000 USDC is not "more" than 0.5 ETH. Anything that ranks or sums
/// transfers must respect this, so the unit travels with the value.
export interface AssetAmount {
  /// Human-readable amount in the asset's own units
  value: string;
  symbol: string;
  /// 'native' for ETH, otherwise the ERC-20 contract address (lowercased)
  contract: 'native' | string;
  decimals: number;
}

export interface Transaction {
  hash: string;
  from: string;
  to: string;
  /// Amount in the asset's own units. Read `asset` for what unit that is.
  value: string;
  asset: AssetAmount;
  timestamp: string;
  blockNumber: number;
  gasUsed: string;
  input: string;
  isError: boolean;
}

const NATIVE_ETH = (value: string): AssetAmount => ({
  value,
  symbol: 'ETH',
  contract: 'native',
  decimals: 18,
});

interface WalletBalance {
  address: string;
  balance: string; // in ETH
  tokenBalances?: { token: string; symbol: string; balance: string }[];
}

interface InternalTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  type: string;
}

// Investigation agents trace on Base mainnet (real transactions)
// Wallet connection / bounty payment stays on Base Sepolia (see src/lib/wagmi.ts)
const BASE_RPC = process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org';
// Basescan V1 API is deprecated (June 2026) — use Blockscout (free, no key)
const EXPLORER_API = process.env.BASE_EXPLORER_API_URL || 'https://base.blockscout.com/api';

export class ChainReader {
  // Get transaction details
  async getTransaction(txHash: string): Promise<Transaction | null> {
    try {
      console.log(`[ChainReader] Fetching tx ${txHash} from ${BASE_RPC}`);
      const response = await fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getTransactionByHash',
          params: [txHash],
          id: 1,
        }),
      });

      const data = await response.json();
      console.log(`[ChainReader] RPC response status=${response.status} hasResult=${!!data.result} error=${JSON.stringify(data.error || null)}`);
      if (!data.result) return null;

      const tx = data.result;
      const receipt = await this.getTransactionReceipt(txHash);
      const ethValue = this.weiToEth(tx.value);

      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to || '',
        value: ethValue,
        asset: NATIVE_ETH(ethValue),
        timestamp: '', // need block timestamp
        blockNumber: parseInt(tx.blockNumber, 16),
        gasUsed: receipt?.gasUsed || '0',
        input: tx.input,
        isError: receipt?.status === '0x0',
      };
    } catch (err) {
      console.error(`[ChainReader] getTransaction error:`, err);
      return null;
    }
  }

  // Get transaction receipt
  async getTransactionReceipt(txHash: string): Promise<Record<string, string> | null> {
    try {
      const response = await fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getTransactionReceipt',
          params: [txHash],
          id: 1,
        }),
      });

      const data = await response.json();
      return data.result;
    } catch {
      return null;
    }
  }

  // Helper: fetch from Blockscout V2 REST API with timeout
  private async fetchV2(path: string, timeoutMs = 12000): Promise<Record<string, unknown>> {
    const baseUrl = EXPLORER_API.replace(/\/api$/, '');
    const apiUrl = `${baseUrl}/api/v2${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`Blockscout V2 HTTP ${response.status}`);
      }
      const data = await response.json();
      // V2 sometimes returns a string error instead of an object
      if (typeof data === 'string') {
        throw new Error(`Blockscout V2 error: ${data}`);
      }
      return data as Record<string, unknown>;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  // Parse a V2 transaction item into our Transaction format
  private parseV2Tx(tx: Record<string, unknown>): Transaction {
    const from = tx.from as Record<string, string> | null;
    const to = tx.to as Record<string, string> | null;
    const val = String(tx.value || '0');
    const ethValue = this.weiToEth('0x' + BigInt(val).toString(16));
    return {
      hash: (tx.hash || tx.transaction_hash || '') as string,
      from: from?.hash || '',
      to: to?.hash || '',
      value: ethValue,
      asset: NATIVE_ETH(ethValue),
      timestamp: (tx.timestamp || new Date().toISOString()) as string,
      blockNumber: (tx.block_number || tx.block || 0) as number,
      gasUsed: String(tx.gas_used || '0'),
      input: '0x',
      isError: tx.status === 'error',
    };
  }

  // Fetch outgoing txs via Blockscout V1 API (legacy, more reliable for some addresses)
  private async fetchV1Txs(address: string): Promise<Transaction[]> {
    const txs: Transaction[] = [];
    try {
      console.log(`[ChainReader] V1 fallback: Fetching txs for ${address}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const response = await fetch(
        `${EXPLORER_API}?module=account&action=txlist&address=${address}&sort=desc&page=1&offset=50`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);
      const data = await response.json();
      const results = (data.result || []) as Record<string, string>[];
      console.log(`[ChainReader] V1: ${results.length} total txs`);
      for (const tx of results) {
        // Only outgoing (from this address)
        if (tx.from?.toLowerCase() !== address.toLowerCase()) continue;
        const v1Value = this.weiToEth('0x' + BigInt(tx.value || '0').toString(16));
        txs.push({
          hash: tx.hash || '',
          from: tx.from || '',
          to: tx.to || '',
          value: v1Value,
          asset: NATIVE_ETH(v1Value),
          timestamp: tx.timeStamp ? new Date(parseInt(tx.timeStamp, 10) * 1000).toISOString() : '',
          blockNumber: parseInt(tx.blockNumber || '0', 10),
          gasUsed: tx.gasUsed || '0',
          input: tx.input || '0x',
          isError: tx.isError === '1',
        });
      }
    } catch (err) {
      console.error(`[ChainReader] V1 fallback error:`, err);
    }
    return txs;
  }

  // Get ALL outgoing transactions (regular + internal + token transfers)
  // Tries V2 first, falls back to V1 if V2 returns nothing
  //
  // `startBlock` bounds the trace to movements at or after the incident.
  // Stolen funds cannot leave a wallet before they arrived, so transfers from
  // earlier blocks are unrelated history and must not be followed.
  async getAllOutgoingTransactions(address: string, startBlock = 0, excludeHashes?: Set<string>): Promise<Transaction[]> {
    const allTxs: Transaction[] = [];
    let v2Failed = false;

    // 1. Regular outgoing transactions (V2)
    try {
      console.log(`[ChainReader] V2: Fetching regular txs from ${address}`);
      const data = await this.fetchV2(`/addresses/${address}/transactions?filter=from`);
      const items = (data.items || []) as Record<string, unknown>[];
      console.log(`[ChainReader] V2: ${items.length} regular txs`);
      for (const tx of items) {
        allTxs.push(this.parseV2Tx(tx));
      }
    } catch (err) {
      console.error(`[ChainReader] V2 regular txs error:`, err);
      v2Failed = true;
    }

    // 2. Internal outgoing transactions (V2)
    try {
      console.log(`[ChainReader] V2: Fetching internal txs from ${address}`);
      const data = await this.fetchV2(`/addresses/${address}/internal-transactions?filter=from`);
      const items = (data.items || []) as Record<string, unknown>[];
      console.log(`[ChainReader] V2: ${items.length} internal txs`);
      for (const tx of items) {
        allTxs.push(this.parseV2Tx(tx));
      }
    } catch (err) {
      console.error(`[ChainReader] V2 internal txs error:`, err);
      v2Failed = true;
    }

    // 3. Token transfers FROM this address (V2)
    try {
      console.log(`[ChainReader] V2: Fetching token transfers from ${address}`);
      const data = await this.fetchV2(`/addresses/${address}/token-transfers?filter=from&type=ERC-20`);
      const items = (data.items || []) as Record<string, unknown>[];
      console.log(`[ChainReader] V2: ${items.length} token transfers`);
      for (const item of items) {
        const from = item.from as Record<string, string> | null;
        const to = item.to as Record<string, string> | null;
        const total = item.total as Record<string, string> | null;
        const token = item.token as Record<string, unknown> | null;
        const decimals = parseInt(String(token?.decimals || '18'), 10);
        const rawValue = total?.value || '0';
        const tokenValue = this.scaleByDecimals(rawValue, decimals);
        const symbol = String(token?.symbol || 'TOKEN');
        const contract = String(
          (token?.address_hash as string) || (token?.address as string) || '',
        ).toLowerCase();
        allTxs.push({
          hash: ((item.tx_hash || item.transaction_hash || '') as string),
          from: from?.hash || '',
          to: to?.hash || '',
          value: tokenValue,
          // Tagged as an ERC-20 so it is never ranked or summed against ETH
          asset: { value: tokenValue, symbol, contract: contract || 'unknown', decimals },
          timestamp: (item.timestamp || new Date().toISOString()) as string,
          blockNumber: (item.block_number || 0) as number,
          gasUsed: '0',
          input: '0x',
          isError: false,
        });
      }
    } catch (err) {
      console.error(`[ChainReader] V2 token transfers error:`, err);
    }

    // 4. V1 fallback — if V2 returned nothing (500 errors, timeouts, etc.)
    if (allTxs.length === 0 || v2Failed) {
      const v1Txs = await this.fetchV1Txs(address);
      allTxs.push(...v1Txs);
    }

    // Deduplicate by tx hash + recipient, exclude specified hashes,
    // and drop anything that predates the incident block.
    const seen = new Set<string>();
    const merged: Transaction[] = [];
    for (const tx of allTxs) {
      if (excludeHashes?.has(tx.hash.toLowerCase())) continue;
      // Funds cannot leave before they arrived — ignore prior history.
      // blockNumber 0 means the explorer omitted it; keep it rather than
      // silently discarding a transfer we simply cannot date.
      if (startBlock > 0 && tx.blockNumber > 0 && tx.blockNumber < startBlock) continue;
      const key = `${tx.hash}-${tx.to}`;
      if (!seen.has(key) && parseFloat(tx.value) >= 0) {
        seen.add(key);
        merged.push(tx);
      }
    }

    // Rank "follow the money" WITHIN each asset — comparing 1000 USDC against
    // 0.5 ETH is meaningless. Native ETH transfers are considered first, then
    // token transfers, each ordered by their own magnitude.
    merged.sort((a, b) => {
      const aNative = a.asset.contract === 'native';
      const bNative = b.asset.contract === 'native';
      if (aNative !== bNative) return aNative ? -1 : 1;
      if (a.asset.contract !== b.asset.contract) {
        return a.asset.contract.localeCompare(b.asset.contract);
      }
      return parseFloat(b.value) - parseFloat(a.value);
    });
    console.log(`[ChainReader] ${merged.length} merged outgoing txs (V2+V1 fallback, startBlock=${startBlock})`);
    return merged;
  }

  /// Scale a raw integer token amount by its decimals without the precision
  /// loss of Number(BigInt(raw)) — that overflows past 2^53 for 18-decimal
  /// tokens, silently corrupting large transfer amounts.
  private scaleByDecimals(raw: string, decimals: number): string {
    try {
      const value = BigInt(raw);
      if (decimals <= 0) return value.toString();
      const divisor = BigInt(10) ** BigInt(decimals);
      const whole = value / divisor;
      const frac = value % divisor;
      if (frac === BigInt(0)) return whole.toString();
      const fracStr = frac.toString().padStart(decimals, '0').slice(0, 6).replace(/0+$/, '');
      return fracStr ? `${whole}.${fracStr}` : whole.toString();
    } catch {
      return '0';
    }
  }

  // Get internal transactions by tx hash (legacy — kept for other callers)
  async getInternalTransactions(txHash: string): Promise<InternalTx[]> {
    try {
      const data = await this.fetchV2(`/transactions/${txHash}/internal-transactions`);
      const items = (data.items || []) as Record<string, unknown>[];
      return items.map((tx) => {
        const from = tx.from as Record<string, string> | null;
        const to = tx.to as Record<string, string> | null;
        const val = String(tx.value || '0');
        return {
          hash: txHash,
          from: from?.hash || '',
          to: to?.hash || '',
          value: this.weiToEth('0x' + BigInt(val).toString(16)),
          type: (tx.type || 'call') as string,
        };
      });
    } catch {
      return [];
    }
  }

  // Get wallet balance
  async getBalance(address: string): Promise<WalletBalance> {
    try {
      const response = await fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getBalance',
          params: [address, 'latest'],
          id: 1,
        }),
      });

      const data = await response.json();
      return {
        address,
        balance: this.weiToEth(data.result || '0x0'),
      };
    } catch {
      return { address, balance: '0' };
    }
  }

  // Check if address is a contract
  async isContract(address: string): Promise<boolean> {
    try {
      const response = await fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getCode',
          params: [address, 'latest'],
          id: 1,
        }),
      });

      const data = await response.json();
      return data.result && data.result !== '0x';
    } catch {
      return false;
    }
  }

  // Get contract bytecode hash (for pattern matching)
  async getBytecodeHash(address: string): Promise<string | null> {
    try {
      const response = await fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getCode',
          params: [address, 'latest'],
          id: 1,
        }),
      });

      const data = await response.json();
      if (!data.result || data.result === '0x') return null;

      // Simple hash of bytecode for comparison
      const encoder = new TextEncoder();
      const dataBytes = encoder.encode(data.result);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return null;
    }
  }

  // Check latest outgoing transaction for a wallet (for Monitor agent)
  // Returns the most recent tx — caller compares timestamp against last_checked
  async getLatestActivity(address: string): Promise<{ hasNewActivity: boolean; latestTx: Transaction | null }> {
    try {
      const data = await this.fetchV2(`/addresses/${address}/transactions?filter=from`);
      const items = (data.items || []) as Record<string, unknown>[];
      if (items.length === 0) {
        return { hasNewActivity: false, latestTx: null };
      }
      const latestTx = this.parseV2Tx(items[0]);
      // Only flag as new activity if the tx has a valid timestamp
      // The Monitor agent compares this against its last_checked time
      const hasTimestamp = !!latestTx.timestamp && latestTx.timestamp !== '';
      return {
        hasNewActivity: hasTimestamp,
        latestTx,
      };
    } catch {
      return { hasNewActivity: false, latestTx: null };
    }
  }

  private weiToEth(weiHex: string): string {
    const wei = BigInt(weiHex || '0');
    // For values under MAX_SAFE_INTEGER (~9000 ETH), direct conversion is precise
    if (wei < BigInt('9007199254740991')) {
      return (Number(wei) / 1e18).toFixed(18).replace(/0+$/, '').replace(/\.$/, '.0');
    }
    // For very large values, divide in two steps to avoid precision loss
    const eth = Number(wei / BigInt('1000000000000')) / 1e6;
    return eth.toFixed(6);
  }
}

// Known address categories — determines tracing behavior
export type AddressCategory = 'cex' | 'bridge' | 'dex' | 'mixer' | 'token' | 'infrastructure';

export interface KnownAddressEntry {
  label: string;
  category: AddressCategory;
  terminal: boolean;  // true = stop tracing here, false = annotate and continue
}

// Known addresses on BASE. Every entry below is a canonical OP-Stack
// predeploy or a contract deployed at a well-known deterministic address, so
// it can be checked against basescan.org directly.
//
// This list was deliberately trimmed. An earlier revision carried ~35 entries
// copied from Ethereum mainnet (Binance/Kraken/Tornado hot wallets) plus one
// fabricated "Base Bridge" address. Mislabelling an address is worse than not
// knowing it: a wrong `terminal: true` ends a live investigation at the wrong
// wallet. Only add an address here after confirming it on Base.
export const KNOWN_ADDRESSES: Record<string, KnownAddressEntry> = {
  // ── Token contracts (NOT terminal — a token contract is never a destination)
  '0x4200000000000000000000000000000000000006': { label: 'WETH (Base)', category: 'token', terminal: false },
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { label: 'USDC (Base)', category: 'token', terminal: false },

  // ── Infrastructure (NOT terminal — OP-Stack predeploys, annotate only)
  '0x4200000000000000000000000000000000000015': { label: 'L1Block (Base predeploy)', category: 'infrastructure', terminal: false },
  '0x4200000000000000000000000000000000000010': { label: 'L2StandardBridge (Base predeploy)', category: 'infrastructure', terminal: false },
  '0x4200000000000000000000000000000000000007': { label: 'L2CrossDomainMessenger (Base predeploy)', category: 'infrastructure', terminal: false },

  // ── DEX routers (NOT terminal — funds pass through a swap and continue)
  '0x2626664c2603336e57b271c5c0b26f421741e481': { label: 'Uniswap Universal Router (Base)', category: 'dex', terminal: false },
  '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae': { label: 'LI.FI Diamond', category: 'dex', terminal: false },

  // ── CEX deposit addresses (terminal) ────────────────────────────
  // Intentionally empty. Exchange deposit addresses are per-user and rotate;
  // hardcoding mainnet hot wallets produced false "case solved" results.
  // Populate from a verified Base attribution source before relying on this.
};

export function isKnownAddress(address: string): { known: boolean; label: string | null; category: AddressCategory | null; terminal: boolean } {
  const lower = address.toLowerCase();
  for (const [addr, entry] of Object.entries(KNOWN_ADDRESSES)) {
    if (addr.toLowerCase() === lower) {
      return { known: true, label: entry.label, category: entry.category, terminal: entry.terminal };
    }
  }
  return { known: false, label: null, category: null, terminal: false };
}
