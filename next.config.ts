import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Handle missing optional Solana deps from @coinbase/cdp-sdk
  // (pulled in by RainbowKit's Base account connector)
  turbopack: {
    resolveAlias: {
      '@x402/svm/exact/client': { browser: './src/lib/empty.ts' },
      '@x402/core/client': { browser: './src/lib/empty.ts' },
    },
  },
  serverExternalPackages: [
    '@coinbase/cdp-sdk',
  ],
};

export default nextConfig;
