import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The shared workspace package ships TypeScript source, so Next compiles it too.
  transpilePackages: ['@debonaire/shared'],
  reactStrictMode: true,
};

export default nextConfig;
