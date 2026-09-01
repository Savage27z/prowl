// BountyContract — ABI and TypeScript types for onchain escrow
// Smart contract interaction layer for BountyContract on Base

const BOUNTY_CONTRACT_ABI = [
  {
    name: 'postBounty',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'walletAddress', type: 'address' },
      { name: 'incidentTxHash', type: 'bytes32' },
      { name: 'description', type: 'string' },
    ],
    outputs: [{ name: 'bountyId', type: 'uint256' }],
  },
  {
    name: 'claimBounty',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'submitReport',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'bountyId', type: 'uint256' },
      { name: 'reportHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    name: 'approvePayout',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'disputeReport',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'getBounty',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'poster', type: 'address' },
          { name: 'walletAddress', type: 'address' },
          { name: 'incidentTxHash', type: 'bytes32' },
          { name: 'description', type: 'string' },
          { name: 'reward', type: 'uint256' },
          { name: 'claimedBy', type: 'address' },
          { name: 'reportHash', type: 'bytes32' },
          { name: 'status', type: 'uint8' },
          { name: 'createdAt', type: 'uint256' },
          { name: 'claimedAt', type: 'uint256' },
        ],
      },
    ],
  },
  {
    name: 'BountyPosted',
    type: 'event',
    inputs: [
      { name: 'bountyId', type: 'uint256', indexed: true },
      { name: 'poster', type: 'address', indexed: true },
      { name: 'reward', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'BountyClaimed',
    type: 'event',
    inputs: [
      { name: 'bountyId', type: 'uint256', indexed: true },
      { name: 'agent', type: 'address', indexed: true },
    ],
  },
  {
    name: 'ReportSubmitted',
    type: 'event',
    inputs: [
      { name: 'bountyId', type: 'uint256', indexed: true },
      { name: 'reportHash', type: 'bytes32', indexed: false },
    ],
  },
  {
    name: 'PayoutReleased',
    type: 'event',
    inputs: [
      { name: 'bountyId', type: 'uint256', indexed: true },
      { name: 'agent', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;

// Contract address - deployed on Base (update after deployment)
const BOUNTY_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_BOUNTY_CONTRACT || '';

export enum BountyStatus {
  Open = 0,
  Claimed = 1,
  Submitted = 2,
  Approved = 3,
  Disputed = 4,
  Expired = 5,
}

export interface OnchainBounty {
  id: number;
  poster: string;
  walletAddress: string;
  incidentTxHash: string;
  description: string;
  reward: string;
  claimedBy: string;
  reportHash: string;
  status: BountyStatus;
  createdAt: number;
  claimedAt: number;
}

export function getBountyContractConfig() {
  return {
    address: BOUNTY_CONTRACT_ADDRESS as `0x${string}`,
    abi: BOUNTY_CONTRACT_ABI,
  };
}

export function statusToString(status: BountyStatus): string {
  const map: Record<BountyStatus, string> = {
    [BountyStatus.Open]: 'Open',
    [BountyStatus.Claimed]: 'Claimed',
    [BountyStatus.Submitted]: 'Report Submitted',
    [BountyStatus.Approved]: 'Approved',
    [BountyStatus.Disputed]: 'Disputed',
    [BountyStatus.Expired]: 'Expired',
  };
  return map[status] || 'Unknown';
}

export { BOUNTY_CONTRACT_ABI, BOUNTY_CONTRACT_ADDRESS };
