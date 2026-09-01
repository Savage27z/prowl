// Wagmi + RainbowKit configuration for wallet connect
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base, baseSepolia } from 'wagmi/chains';

export const wagmiConfig = getDefaultConfig({
  appName: 'Prowl',
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'prowl-hackathon-demo',
  chains: [base, baseSepolia],
  ssr: true,
});
