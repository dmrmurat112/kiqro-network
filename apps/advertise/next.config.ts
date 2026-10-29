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
  devIndicators: { position: 'bottom-right' },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default config;
