#!/bin/sh
# docker-entrypoint.sh
# Production container startup script for ShopMeta.
#
# Steps:
#   1. Wait for PostgreSQL to be ready (with retry loop)
#   2. Run Drizzle migrations automatically
#   3. Start the Node.js server
#
# Environment variables required:
#   DATABASE_URL  — PostgreSQL connection string
#   PORT          — Server port (default: 3000)
#
# The script runs as the non-root 'node' user (UID 1000).
# Migrations use drizzle-kit which reads DATABASE_URL from the environment.

set -e

echo "[entrypoint] ShopMeta starting up..."

# ─── Wait for PostgreSQL ───────────────────────────────────────────────────────

if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] Waiting for PostgreSQL to be ready..."

  # Extract host and port from DATABASE_URL
  # Format: postgresql://user:pass@host:port/db
  DB_HOST=$(echo "$DATABASE_URL" | sed -e 's|.*@||' -e 's|:.*||' -e 's|/.*||')
  DB_PORT=$(echo "$DATABASE_URL" | sed -e 's|.*:||' -e 's|/.*||')

  # Default port to 5432 if not specified
  DB_PORT=${DB_PORT:-5432}

  MAX_RETRIES=30
  RETRY_INTERVAL=2
  RETRIES=0

  until nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
    RETRIES=$((RETRIES + 1))
    if [ "$RETRIES" -ge "$MAX_RETRIES" ]; then
      echo "[entrypoint] ERROR: PostgreSQL at $DB_HOST:$DB_PORT not available after $MAX_RETRIES attempts. Exiting."
      exit 1
    fi
    echo "[entrypoint] PostgreSQL not ready yet (attempt $RETRIES/$MAX_RETRIES). Retrying in ${RETRY_INTERVAL}s..."
    sleep "$RETRY_INTERVAL"
  done

  echo "[entrypoint] PostgreSQL is ready."

  # ─── Run migrations ─────────────────────────────────────────────────────────

  echo "[entrypoint] Running database migrations..."
  # drizzle-kit supports .ts configs natively
  node_modules/.bin/drizzle-kit migrate
  echo "[entrypoint] Migrations complete."
else
  echo "[entrypoint] WARNING: DATABASE_URL is not set. Skipping migrations."
fi

# ─── Start the server ─────────────────────────────────────────────────────────

PORT=${PORT:-3000}
echo "[entrypoint] Starting ShopMeta server on port $PORT..."

exec node .output/server/index.js
