// ChainReader — abstraction layer for Base chain data
// Supports both direct RPC calls and Basescan API
// Base chain data reader
// Reads transaction data, wallet balances, and contract info from Base

interface Transaction {
  hash: string;
  from: string;
  to: string;
  value: string;
  timestamp: string;
  blockNumber: number;
  gasUsed: string;
  input: string;
  isError: boolean;
}

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

      return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to || '',
        value: this.weiToEth(tx.value),
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
    return {
      hash: (tx.hash || tx.transaction_hash || '') as string,
      from: from?.hash || '',
      to: to?.hash || '',
      value: this.weiToEth('0x' + BigInt(val).toString(16)),
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
        txs.push({
          hash: tx.hash || '',
          from: tx.from || '',
          to: tx.to || '',
          value: this.weiToEth('0x' + BigInt(tx.value || '0').toString(16)),
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
  async getAllOutgoingTransactions(address: string, _startBlock = 0, excludeHashes?: Set<string>): Promise<Transaction[]> {
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
        const tokenValue = (Number(BigInt(rawValue)) / Math.pow(10, decimals)).toFixed(6);
        allTxs.push({
          hash: ((item.tx_hash || item.transaction_hash || '') as string),
          from: from?.hash || '',
          to: to?.hash || '',
          value: tokenValue,
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

    // Deduplicate by tx hash + recipient, exclude specified hashes
    const seen = new Set<string>();
    const merged: Transaction[] = [];
    for (const tx of allTxs) {
      if (excludeHashes?.has(tx.hash.toLowerCase())) continue;
      const key = `${tx.hash}-${tx.to}`;
      if (!seen.has(key) && parseFloat(tx.value) >= 0) {
        seen.add(key);
        merged.push(tx);
      }
    }

    // Sort by value descending (follow the money)
    merged.sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
    console.log(`[ChainReader] ${merged.length} merged outgoing txs (V2+V1 fallback)`);
    return merged;
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

// Known addresses for detection — exchanges, bridges, and infrastructure on Base
export const KNOWN_ADDRESSES: Record<string, KnownAddressEntry> = {
  // ── CEX Hot Wallets (terminal — funds reached an exchange) ──────
  '0x3154cf16ccdb4c6d922629664174b904d80f2c35': { label: 'Binance Hot Wallet', category: 'cex', terminal: true },
  '0x28c6c06298d514db089934071355e5743bf21d60': { label: 'Binance Hot Wallet 14', category: 'cex', terminal: true },
  '0xdfd5293d8e347dfe59e90efd55b2956a1343963d': { label: 'Binance Hot Wallet 16', category: 'cex', terminal: true },
  '0x21a31ee1afc51d94c2efccaa2092ad1028285549': { label: 'Binance Hot Wallet 20', category: 'cex', terminal: true },
  '0xf89d7b9c864f589bbf53a82105107622b35eaa40': { label: 'Bybit Hot Wallet', category: 'cex', terminal: true },
  '0x1ab4973a48dc892cd9971ece8e01dcc7688f8f23': { label: 'Coinbase', category: 'cex', terminal: true },
  '0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43': { label: 'Coinbase 10', category: 'cex', terminal: true },
  '0x503828976d22510aad0201ac7ec88293211d23da': { label: 'Coinbase 2', category: 'cex', terminal: true },
  '0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740': { label: 'Coinbase 3', category: 'cex', terminal: true },
  '0x71660c4005ba85c37ccec55d0c4493e66fe775d3': { label: 'Coinbase 4', category: 'cex', terminal: true },
  '0xfbb1b73c4f0bda4f67dca266ce6ef42f520fbb98': { label: 'Bitget Hot Wallet', category: 'cex', terminal: true },
  '0x5bdf85216ec1e38d6458c870992a69e38e03f7ef': { label: 'OKX', category: 'cex', terminal: true },
  '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b': { label: 'OKX 2', category: 'cex', terminal: true },
  '0x98ec059dc3adfbdd63429454aeb0c990fba4a128': { label: 'KuCoin Hot Wallet', category: 'cex', terminal: true },
  '0xd6216fc19db775df9774a6e33526131da7d19a2c': { label: 'KuCoin 2', category: 'cex', terminal: true },
  '0x0d0707963952f2fba59dd06f2b425ace40b492fe': { label: 'Gate.io', category: 'cex', terminal: true },
  '0x1c4b70a3968436b9a0a9cf5205c787eb81bb558c': { label: 'Gate.io 2', category: 'cex', terminal: true },
  '0x0639556f03714a74a5feeaf5736a4a64ff70d921': { label: 'Kraken Hot Wallet', category: 'cex', terminal: true },
  '0xa83b11093c8a88e1fc5b2f21fa89e1e7ae4ed67a': { label: 'HTX (Huobi)', category: 'cex', terminal: true },
  '0x46340b20830761efd32832a74d7169b29feb9758': { label: 'Crypto.com', category: 'cex', terminal: true },
  '0xcffad3200574698b78f32232aa9d63eabd290703': { label: 'Crypto.com 2', category: 'cex', terminal: true },
  // ── Bridges (terminal — funds left the chain) ────────────────────
  '0x3154cf16ccdb4c6d922629664174b904d80f2c36': { label: 'Base Bridge (Official)', category: 'bridge', terminal: true },
  '0x49048044d57e1c92a77f79988d21fa8faf74e97e': { label: 'Base Portal (L1 Bridge)', category: 'bridge', terminal: true },
  '0x3666f603cc164936c1b87e207f36beba4ac5f18a': { label: 'Base Standard Bridge', category: 'bridge', terminal: true },
  '0xaf54be5b6eec24d6bfacf1cce4eaf680a8239398': { label: 'Across Bridge (Base)', category: 'bridge', terminal: true },
  '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae': { label: 'LI.FI Diamond', category: 'bridge', terminal: true },
  '0x2a3dd3eb832af982ec71669e178424b10dca2ede': { label: 'Stargate Finance (Base)', category: 'bridge', terminal: true },
  '0xe4edb277e41dc89ab076a1f049f4a3efa700bce8': { label: 'Orbiter Finance', category: 'bridge', terminal: true },
  // ── DEX Routers (NOT terminal — annotate and continue tracing) ──
  '0x2626664c2603336e57b271c5c0b26f421741e481': { label: 'Uniswap Universal Router', category: 'dex', terminal: false },
  '0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad': { label: 'Uniswap Universal Router V2', category: 'dex', terminal: false },
  '0x1111111254eeb25477b68fb85ed929f73a960582': { label: '1inch Router v5', category: 'dex', terminal: false },
  '0x6131b5fae19ea4f9d964eac0408e4408b66337b5': { label: 'KyberSwap', category: 'dex', terminal: false },
  '0x6352a56caadc4f1e25cd6c75970fa768a3304e64': { label: 'OpenOcean Exchange', category: 'dex', terminal: false },
  // ── Mixers (NOT terminal — flag high risk and continue) ──────────
  '0xd90e2f925da726b50c4ed8d0fb90ad053324f31b': { label: 'Tornado Cash Router', category: 'mixer', terminal: false },
  '0x722122df12d4e14e13ac3b6895a86e84145b6967': { label: 'Tornado Cash Proxy', category: 'mixer', terminal: false },
  // ── Token contracts (NOT terminal — never treat as destination) ──
  '0x4200000000000000000000000000000000000006': { label: 'WETH (Base)', category: 'token', terminal: false },
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': { label: 'USDC (Base)', category: 'token', terminal: false },
  // ── Infrastructure (NOT terminal — annotate only) ────────────────
  '0x4200000000000000000000000000000000000015': { label: 'L1 Block (Base System)', category: 'infrastructure', terminal: false },
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
