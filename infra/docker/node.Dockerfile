# Tracking service, publisher-postback/e-mail worker and database migrations.
# One image, three commands (see render.yaml):
#   tracking  : node_modules/.bin/tsx apps/tracking/src/main.ts
#   worker    : node_modules/.bin/tsx apps/tracking/src/worker.ts
#   migrations: node_modules/.bin/tsx packages/db/src/migrate.ts
# TypeScript runs through tsx, as in development; there is no separate compile step.
FROM node:24-alpine
WORKDIR /app

# Workspace manifests first, so dependency installs are cached until they change.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/network/package.json packages/network/
COPY packages/sdk-node/package.json packages/sdk-node/
COPY apps/tracking/package.json apps/tracking/
COPY apps/admin/package.json apps/admin/
COPY apps/advertise/package.json apps/advertise/
RUN npm ci --workspace @kiqro/tracking --include-workspace-root --no-audit --no-fund

COPY tsconfig.json ./
COPY packages ./packages
COPY apps/tracking ./apps/tracking
# Operator scripts (create the first admin, reset 2FA), run from the Render shell.
COPY apps/admin/scripts ./apps/admin/scripts

ENV NODE_ENV=production NPM_CONFIG_UPDATE_NOTIFIER=false
USER node
EXPOSE 10000
CMD ["node_modules/.bin/tsx", "apps/tracking/src/main.ts"]
