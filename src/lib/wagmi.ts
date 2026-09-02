// Wagmi + RainbowKit configuration for wallet connect
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { baseSepolia } from 'wagmi/chains';

export const wagmiConfig = getDefaultConfig({
  appName: 'Prowl',
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'prowl-hackathon-demo',
  chains: [baseSepolia],
  ssr: true,
});
