# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
# Install all node_modules using pnpm with frozen lockfile.
FROM node:22-alpine AS deps

# Install pnpm via npm (pinned version, no corepack network fetch)
RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace config and manifests first for better layer caching
# pnpm-workspace.yaml has packages: ['.'] for single-package workspace mode
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY drizzle.config.ts ./

# Install all dependencies (dev included — needed for the build step)
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
# Run vite build to produce the production bundle in dist/
FROM node:22-alpine AS builder

RUN npm install -g pnpm@9

WORKDIR /app

# Copy installed dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./

# Copy all source files
COPY . .

# App version is read from package.json by vite.config.ts at build time.
# The root deploy script syncs the version into this package.json automatically.

# Build the TanStack Start production bundle
# TanStack Start (with vite) outputs to dist/ by default:
#   dist/client/   — static assets served by the server
#   dist/server/   — server-side bundle, entry: dist/server/server.js
RUN pnpm build

# Verify dist was produced — fail loudly if not
RUN ls -la dist/server/ && echo "✅ dist/server/ verified"

# ─── Stage 3: Production runtime ──────────────────────────────────────────────
# Runtime image with production artifacts + vite for `vite preview`.
# TanStack Start's dist/server/server.js is a Fetch API handler module,
# NOT a standalone HTTP server. `vite preview` is the correct production
# server command that wraps the fetch handler with an HTTP listener.
FROM node:22-alpine AS runner

# Install wget for health checks, ca-certificates for HTTPS, netcat for DB wait
RUN apk add --no-cache wget ca-certificates netcat-openbsd

WORKDIR /app

# Create non-root user ownership (node user exists in node:alpine at uid 1000)
RUN chown node:node /app

# Copy the built dist directory (client + server bundles)
COPY --from=builder --chown=node:node /app/dist ./dist

# Copy source directory — TanStack Start's vite plugin resolves entry files
# (src/router.tsx, src/client.tsx) at config time, even during `vite preview`
COPY --from=builder --chown=node:node /app/src ./src

# Copy tsconfig.json — needed by vite-tsconfig-paths during config resolution
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json

# Copy vite config — required by `vite preview` to locate the dist directory
COPY --from=builder --chown=node:node /app/vite.config.ts ./vite.config.ts

# Copy drizzle migrations (needed for drizzle-kit migrate at startup)
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
COPY --from=builder --chown=node:node /app/drizzle.config.ts ./drizzle.config.ts

# Copy bundled skills folder (synced to DB at startup)
COPY --from=builder --chown=node:node /app/skills ./skills

# Copy node_modules (needed for vite binary, vite plugins, and drizzle-kit)
# and package.json (needed for pnpm/npm resolution)
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=deps --chown=node:node /app/package.json ./package.json
COPY --from=deps --chown=node:node /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Copy entrypoint script and make it executable
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# Switch to non-root user
USER node

# Expose the application port
EXPOSE 3000

# Container health check — polls /api/health every 30s
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/health || exit 1

# Default environment
ENV NODE_ENV=production \
    PORT=3000

# Start via entrypoint (runs migrations then starts server via vite preview)
ENTRYPOINT ["./docker-entrypoint.sh"]
