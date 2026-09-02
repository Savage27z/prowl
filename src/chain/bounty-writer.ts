// Server-side bounty contract writer
// Uses the Prowl protocol wallet (PRIVATE_KEY) to auto-claim bounties
// and submit investigation reports on-chain (Base Sepolia)

import { createWalletClient, createPublicClient, http, parseEther, keccak256, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { BOUNTY_CONTRACT_ABI, BOUNTY_CONTRACT_ADDRESS } from './contracts';

const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}` | undefined;
const RPC_URL = 'https://sepolia.base.org';

function getWalletClient() {
  if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY not configured');
  if (!BOUNTY_CONTRACT_ADDRESS) throw new Error('Bounty contract address not configured');

  const account = privateKeyToAccount(PRIVATE_KEY);
  const client = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(RPC_URL),
  });
  return { client, account };
}

function getPublicClient() {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(RPC_URL),
  });
}

/**
 * Get the Prowl protocol wallet address (the agent that receives rewards)
 */
export function getProtocolWallet(): string | null {
  if (!PRIVATE_KEY) return null;
  try {
    return privateKeyToAccount(PRIVATE_KEY).address;
  } catch {
    return null;
  }
}

/**
 * Auto-claim a bounty on behalf of the Prowl agent swarm.
 * Stakes MIN_STAKE (0.001 ETH) from the protocol wallet.
 */
export async function claimBountyOnChain(bountyId: number): Promise<string | null> {
  try {
    const { client, account } = getWalletClient();
    const publicClient = getPublicClient();

    console.log(`[BountyWriter] Claiming bounty #${bountyId} as ${account.address}`);

    const hash = await client.writeContract({
      address: BOUNTY_CONTRACT_ADDRESS as `0x${string}`,
      abi: BOUNTY_CONTRACT_ABI,
      functionName: 'claimBounty',
      args: [BigInt(bountyId)],
      value: parseEther('0.001'), // MIN_STAKE
    });

    console.log(`[BountyWriter] Claim tx: ${hash}`);
    await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
    return hash;
  } catch (err) {
    console.error('[BountyWriter] claimBounty failed:', err);
    return null;
  }
}

/**
 * Submit an investigation report hash on-chain.
 * The report hash is a keccak256 of the case summary.
 */
export async function submitReportOnChain(
  bountyId: number,
  reportSummary: string
): Promise<string | null> {
  try {
    const { client, account } = getWalletClient();
    const publicClient = getPublicClient();

    // Hash the report summary to create the on-chain report hash
    const reportHash = keccak256(toBytes(reportSummary));

    console.log(`[BountyWriter] Submitting report for bounty #${bountyId} as ${account.address}`);

    const hash = await client.writeContract({
      address: BOUNTY_CONTRACT_ADDRESS as `0x${string}`,
      abi: BOUNTY_CONTRACT_ABI,
      functionName: 'submitReport',
      args: [BigInt(bountyId), reportHash],
    });

    console.log(`[BountyWriter] Submit tx: ${hash}`);
    await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
    return hash;
  } catch (err) {
    console.error('[BountyWriter] submitReport failed:', err);
    return null;
  }
}

/**
 * Read on-chain bounty status
 */
export async function getBountyOnChain(bountyId: number) {
  try {
    const publicClient = getPublicClient();
    const result = await publicClient.readContract({
      address: BOUNTY_CONTRACT_ADDRESS as `0x${string}`,
      abi: BOUNTY_CONTRACT_ABI,
      functionName: 'getBounty',
      args: [BigInt(bountyId)],
    });
    return result;
  } catch (err) {
    console.error('[BountyWriter] getBounty failed:', err);
    return null;
  }
}
