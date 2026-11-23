import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['node:sqlite'],
  webpack: (config, { isServer }) => {
    if (!isServer) return config;
    const current = config.externals;
    const list = Array.isArray(current) ? current : current ? [current] : [];
      list.push(({ request }: { context?: string; request?: string }, callback: (error?: null, result?: string) => void) => {
        if (request === 'node:sqlite') return callback(null, 'commonjs node:sqlite');
        callback();
      });
    config.externals = list;
    return config;
  },
};

export default nextConfig;
