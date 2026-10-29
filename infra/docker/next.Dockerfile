# Next.js apps (admin panel, advertise.kiqro.com). Pick the app with the APP build argument:
#   docker build -f infra/docker/next.Dockerfile --build-arg APP=admin .
#   docker build -f infra/docker/next.Dockerfile --build-arg APP=advertise .
FROM node:24-alpine AS build
ARG APP
RUN test -n "$APP" || (echo "Build argument APP is required (admin or advertise)" && false)
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/network/package.json packages/network/
COPY apps/tracking/package.json apps/tracking/
COPY apps/admin/package.json apps/admin/
COPY apps/advertise/package.json apps/advertise/
RUN npm ci --workspace @kiqro/$APP --include-workspace-root --no-audit --no-fund

COPY tsconfig.json ./
COPY packages ./packages
COPY apps/$APP ./apps/$APP
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @kiqro/$APP

# Runtime image: only the standalone server bundle, static assets and public files.
FROM node:24-alpine
ARG APP
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=10000
COPY --from=build --chown=node:node /app/apps/$APP/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/$APP/.next/static ./apps/$APP/.next/static
COPY --from=build --chown=node:node /app/apps/$APP/public ./apps/$APP/public
ENV APP_DIR=apps/$APP
USER node
EXPOSE 10000
CMD ["sh", "-c", "node $APP_DIR/server.js"]
