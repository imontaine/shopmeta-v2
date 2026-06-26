# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
# Install all node_modules using pnpm with frozen lockfile.
FROM node:22-alpine AS deps

# Install pnpm via npm (pinned version, no corepack network fetch)
RUN npm install -g pnpm@9

WORKDIR /app

# Copy workspace config and manifests first for better layer caching
# pnpm-workspace.yaml must have packages: ['.'] for single-package workspace mode
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY drizzle.config.ts ./

# Install all dependencies (dev included — needed for the build step)
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
# Run vite build to produce the production bundle.
FROM node:22-alpine AS builder

RUN npm install -g pnpm@9

WORKDIR /app

# Copy installed dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./

# Copy all source files
COPY . .

# Build the TanStack Start production bundle
# Output goes to .output/ (TanStack Start default output directory)
RUN pnpm build

# Verify .output was produced — fail loudly if not
RUN ls -la .output && echo "✅ .output verified"

# ─── Stage 3: Production runtime ──────────────────────────────────────────────
# Minimal runtime image with only production artifacts.
FROM node:22-alpine AS runner

# Install wget for health checks and ca-certificates for HTTPS
RUN apk add --no-cache wget ca-certificates

WORKDIR /app

# Create non-root user ownership (node user exists in node:alpine at uid 1000)
RUN chown node:node /app

# Copy the built .output directory
COPY --from=builder --chown=node:node /app/.output ./.output

# Copy drizzle migrations (needed for drizzle-kit migrate at startup)
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
COPY --from=builder --chown=node:node /app/drizzle.config.ts ./drizzle.config.ts

# Copy node_modules and package.json for drizzle-kit at runtime
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=deps --chown=node:node /app/package.json ./package.json

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

# Start via entrypoint (runs migrations then starts server)
ENTRYPOINT ["./docker-entrypoint.sh"]
