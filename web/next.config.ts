import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The shared workspace package ships TypeScript source, so Next compiles it too.
  transpilePackages: ['@debonaire/shared'],
  reactStrictMode: true,
  // The Playwright suite builds into its own directory (.next-e2e), so it can
  // never clash with a running `next dev`. Next locks its build directory.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
