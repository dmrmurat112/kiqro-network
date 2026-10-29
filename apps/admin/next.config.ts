import path from 'node:path';
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
  // Self-contained server bundle for the Docker image; tracing starts at the monorepo root.
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  // The dev badge defaults to bottom-left, where it covers the sidebar's logout button.
  devIndicators: { position: 'bottom-right' },
};

export default config;
