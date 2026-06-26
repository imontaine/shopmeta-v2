# ─── Stage 1: Dependencies ────────────────────────────────────────────────────
# Install all node_modules using pnpm with frozen lockfile.
# We use node:22-alpine for a minimal base.
FROM node:22-alpine AS deps

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy lockfiles and manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY drizzle.config.ts ./

# Install production + dev dependencies (we need dev deps to build)
RUN pnpm install --frozen-lockfile

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
# Run vite build to produce the production bundle.
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./

# Copy all source files
COPY . .

# Build the TanStack Start production bundle
# Output goes to .output/ (configured by TanStack Start)
RUN pnpm build

# ─── Stage 3: Production runtime ──────────────────────────────────────────────
# Minimal runtime image with only production artifacts.
FROM node:22-alpine AS runner

# Install netcat for the PostgreSQL health check in entrypoint
# and ca-certificates for HTTPS connections to ClickHouse/OpenAI
RUN apk add --no-cache netcat-openbsd ca-certificates

WORKDIR /app

# Create non-root user (node user already exists in node:alpine at uid 1000)
# Ensure app directory is owned by node user
RUN chown node:node /app

# Copy build output
COPY --from=builder --chown=node:node /app/.output ./.output

# Copy drizzle migrations (needed for drizzle-kit migrate at startup)
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
COPY --from=builder --chown=node:node /app/drizzle.config.ts ./drizzle.config.ts

# Copy node_modules (needed by drizzle-kit for migrations)
# We install only production deps here to keep the image lean
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
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/health || exit 1

# Default environment
ENV NODE_ENV=production \
    PORT=3000

# Start via entrypoint (runs migrations then starts server)
ENTRYPOINT ["./docker-entrypoint.sh"]
