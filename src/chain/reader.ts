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

const BASE_RPC = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const BASESCAN_API = 'https://api.basescan.org/api';
const BASESCAN_KEY = process.env.BASESCAN_API_KEY || '';

export class ChainReader {
  // Get transaction details
  async getTransaction(txHash: string): Promise<Transaction | null> {
    try {
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
    } catch (error) {
      console.error('[ChainReader] Error fetching tx:', error);
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
      const url = new URL(BASESCAN_API);
      url.searchParams.set('module', 'account');
      url.searchParams.set('action', 'txlist');
      url.searchParams.set('address', address);
      url.searchParams.set('startblock', String(startBlock));
      url.searchParams.set('endblock', '99999999');
      url.searchParams.set('sort', 'asc');
      url.searchParams.set('apikey', BASESCAN_KEY);

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.status !== '1' || !data.result) return [];

      return data.result
        .filter((tx: Record<string, string>) => tx.from.toLowerCase() === address.toLowerCase())
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
    } catch (error) {
      console.error('[ChainReader] Error fetching outgoing txs:', error);
      return [];
    }
  }

  // Get internal transactions (for tracking fund splits through contracts)
  async getInternalTransactions(txHash: string): Promise<InternalTx[]> {
    try {
      const url = new URL(BASESCAN_API);
      url.searchParams.set('module', 'account');
      url.searchParams.set('action', 'txlistinternal');
      url.searchParams.set('txhash', txHash);
      url.searchParams.set('apikey', BASESCAN_KEY);

      const response = await fetch(url.toString());
      const data = await response.json();

      if (data.status !== '1' || !data.result) return [];

      return data.result.map((tx: Record<string, string>) => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: this.weiToEth(tx.value),
        type: tx.type,
      }));
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

  // Check latest transaction timestamp for a wallet (for Monitor agent)
  async getLatestActivity(address: string): Promise<{ hasNewActivity: boolean; latestTx: Transaction | null }> {
    try {
      const url = new URL(BASESCAN_API);
      url.searchParams.set('module', 'account');
      url.searchParams.set('action', 'txlist');
      url.searchParams.set('address', address);
      url.searchParams.set('page', '1');
      url.searchParams.set('offset', '1');
      url.searchParams.set('sort', 'desc');
      url.searchParams.set('apikey', BASESCAN_KEY);

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
    const eth = Number(wei) / 1e18;
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
