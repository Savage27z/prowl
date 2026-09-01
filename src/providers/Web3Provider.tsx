// Web3Provider — wraps the app with RainbowKit + wagmi + React Query
'use client';

import { ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import {
  RainbowKitProvider,
  darkTheme,
  lightTheme,
} from '@rainbow-me/rainbowkit';
import { wagmiConfig } from '@/lib/wagmi';

import '@rainbow-me/rainbowkit/styles.css';

// Custom RainbowKit theme that matches Prowl's warm design system
const prowlLightTheme = lightTheme({
  accentColor: '#b68235',
  accentColorForeground: '#fff',
  borderRadius: 'small',
  fontStack: 'system',
});

const prowlDarkTheme = darkTheme({
  accentColor: '#d4963f',
  accentColorForeground: '#161513',
  borderRadius: 'small',
  fontStack: 'system',
});

export default function Web3Provider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={{
            lightMode: prowlLightTheme,
            darkMode: prowlDarkTheme,
          }}
          appInfo={{
            appName: 'Prowl',
            learnMoreUrl: 'https://github.com/Savage27z/prowl',
          }}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
