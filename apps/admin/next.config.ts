import type { NextConfig } from 'next';

// The monorepo keeps one .env at the root; Next only reads .env files from the app folder.
try {
  process.loadEnvFile('../../.env');
} catch {
  // No root .env (e.g. production, where the environment is set by the host).
}

const config: NextConfig = {
  // Workspace packages ship TypeScript sources.
  transpilePackages: ['@kiqro/core', '@kiqro/db', '@kiqro/network'],
  serverExternalPackages: ['pg'],
  poweredByHeader: false,
};

export default config;
