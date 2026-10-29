import path from 'node:path';
import type { NextConfig } from 'next';

// The monorepo keeps one .env at the root; Next only reads .env files from the app folder.
try {
  process.loadEnvFile('../../.env');
} catch {
  // No root .env (production: the host provides the environment).
}

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const config: NextConfig = {
  transpilePackages: ['@kiqro/core', '@kiqro/db', '@kiqro/network'],
  serverExternalPackages: ['pg'],
  poweredByHeader: false,
  // Self-contained server bundle for the Docker image; tracing starts at the monorepo root.
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  devIndicators: { position: 'bottom-right' },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // The password link carries its token in the URL; never leak it via Referer.
      { source: '/set-password', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};

export default config;
