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

  // Get all outgoing transactions from an address (via Basescan)
  async getOutgoingTransactions(address: string, startBlock = 0): Promise<Transaction[]> {
    try {
      const url = new URL(EXPLORER_API);
      url.searchParams.set('module', 'account');
      url.searchParams.set('action', 'txlist');
      url.searchParams.set('address', address);
      url.searchParams.set('startblock', String(startBlock));
      url.searchParams.set('endblock', '99999999');
      url.searchParams.set('sort', 'asc');


      console.log(`[ChainReader] Fetching outgoing txs for ${address} from ${EXPLORER_API}`);
      const response = await fetch(url.toString());
      const data = await response.json();

      console.log(`[ChainReader] Basescan response status=${data.status} message=${data.message} resultCount=${Array.isArray(data.result) ? data.result.length : 'N/A'}`);
      if (data.status !== '1' || !data.result) return [];

      const outgoing = data.result
        .filter((tx: Record<string, string>) => tx.from.toLowerCase() === address.toLowerCase());
      console.log(`[ChainReader] Outgoing txs from ${address}: ${outgoing.length}`);

      return outgoing
        .map((tx: Record<string, string>) => ({
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: this.weiToEth(tx.value),
          timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
          blockNumber: parseInt(tx.blockNumber),
          gasUsed: tx.gasUsed,
          input: tx.input,
          isError: tx.isError === '1',
        }));
    } catch {
      return [];
    }
  }

  // Get internal transactions by tx hash (for tracking fund splits through contracts)
  async getInternalTransactions(txHash: string): Promise<InternalTx[]> {
    try {
      const url = new URL(EXPLORER_API);
      url.searchParams.set('module', 'account');
      url.searchParams.set('action', 'txlistinternal');
      url.searchParams.set('txhash', txHash);


      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.status !== '1' || !data.result) return [];

      return data.result.map((tx: Record<string, string>) => ({
        hash: tx.hash || txHash,
        from: tx.from,
        to: tx.to,
        value: this.weiToEth(tx.value),
        type: tx.type,
      }));
    } catch {
      return [];
    }
  }

  // Get internal transactions by address (drains via contract calls)
  // Uses Blockscout V2 REST API — much faster than the V1 etherscan-compat endpoint
  async getInternalTransactionsByAddress(address: string, _startBlock = 0): Promise<Transaction[]> {
    try {
      // Blockscout V2: /api/v2/addresses/{hash}/internal-transactions?filter=from
      const baseUrl = EXPLORER_API.replace(/\/api$/, '');
      const apiUrl = `${baseUrl}/api/v2/addresses/${address}/internal-transactions?filter=from`;

      console.log(`[ChainReader] Fetching internal txs for ${address} via V2 API`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout
      const response = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeout);

      const data = await response.json();
      const items = data.items || [];

      console.log(`[ChainReader] Internal txs V2 response: ${items.length} items`);

      return items
        .filter((tx: Record<string, unknown>) => {
          const from = tx.from as Record<string, string> | null;
          return from?.hash?.toLowerCase() === address.toLowerCase();
        })
        .map((tx: Record<string, unknown>) => {
          const from = tx.from as Record<string, string>;
          const to = tx.to as Record<string, string>;
          const val = String(tx.value || '0');
          return {
            hash: (tx.transaction_hash || '') as string,
            from: from?.hash || '',
            to: to?.hash || '',
            value: this.weiToEth('0x' + BigInt(val).toString(16)),
            timestamp: (tx.timestamp || new Date().toISOString()) as string,
            blockNumber: (tx.block_number || 0) as number,
            gasUsed: '0',
            input: '0x',
            isError: false,
          };
        });
    } catch (err) {
      console.error(`[ChainReader] getInternalTransactionsByAddress error:`, err);
      return [];
    }
  }

  // Get ALL outgoing transactions (regular + internal) — the full money trail
  async getAllOutgoingTransactions(address: string, startBlock = 0): Promise<Transaction[]> {
    const [regular, internal] = await Promise.all([
      this.getOutgoingTransactions(address, startBlock),
      this.getInternalTransactionsByAddress(address, startBlock),
    ]);

    // Merge and deduplicate by tx hash, sort by timestamp
    const seen = new Set<string>();
    const merged: Transaction[] = [];
    for (const tx of [...regular, ...internal]) {
      const key = `${tx.hash}-${tx.to}-${tx.value}`;
      if (!seen.has(key) && parseFloat(tx.value) > 0) {
        seen.add(key);
        merged.push(tx);
      }
    }

    merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    console.log(`[ChainReader] All outgoing from ${address}: ${regular.length} regular + ${internal.length} internal = ${merged.length} merged`);
    return merged;
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

  // Check latest transaction timestamp for a wallet (for Monitor agent)
  async getLatestActivity(address: string): Promise<{ hasNewActivity: boolean; latestTx: Transaction | null }> {
    try {
      const url = new URL(EXPLORER_API);
      url.searchParams.set('module', 'account');
      url.searchParams.set('action', 'txlist');
      url.searchParams.set('address', address);
      url.searchParams.set('page', '1');
      url.searchParams.set('offset', '1');
      url.searchParams.set('sort', 'desc');


      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.status !== '1' || !data.result?.length) {
        return { hasNewActivity: false, latestTx: null };
      }

      const tx = data.result[0];
      return {
        hasNewActivity: true,
        latestTx: {
          hash: tx.hash,
          from: tx.from,
          to: tx.to,
          value: this.weiToEth(tx.value),
          timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
          blockNumber: parseInt(tx.blockNumber),
          gasUsed: tx.gasUsed,
          input: tx.input,
          isError: tx.isError === '1',
        },
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

// Known addresses for detection
export const KNOWN_ADDRESSES: Record<string, string> = {
  // Base CEX deposit addresses (example — extend with real ones)
  '0x3154cf16ccdb4c6d922629664174b904d80f2c35': 'Binance Hot Wallet',
  '0xf89d7b9c864f589bbf53a82105107622b35eaa40': 'Bybit',
  '0x1ab4973a48dc892cd9971ece8e01dcc7688f8f23': 'Coinbase',
  // Known bridge contracts on Base
  '0x3154cf16ccdb4c6d922629664174b904d80f2c36': 'Base Bridge',
};

export function isKnownAddress(address: string): { known: boolean; label: string | null } {
  const lower = address.toLowerCase();
  for (const [addr, label] of Object.entries(KNOWN_ADDRESSES)) {
    if (addr.toLowerCase() === lower) {
      return { known: true, label };
    }
  }
  return { known: false, label: null };
}
