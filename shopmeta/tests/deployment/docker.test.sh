#!/bin/bash
# tests/deployment/docker.test.sh
# Deployment integration tests for ShopMeta Docker setup.
#
# Usage:
#   bash tests/deployment/docker.test.sh [--build] [--skip-compose]
#
# Options:
#   --build         Force docker build before running tests
#   --skip-compose  Skip docker-compose tests (only verify files exist)
#
# Prerequisites:
#   - Docker must be installed and running
#   - docker-compose or docker compose must be available
#
# Exit codes:
#   0  All tests passed
#   1  One or more tests failed

set -euo pipefail

# ─── Colours ─────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ─── Counters ─────────────────────────────────────────────────────────────────

PASS=0
FAIL=0
SKIP=0

# ─── Helpers ──────────────────────────────────────────────────────────────────

pass() {
  PASS=$((PASS + 1))
  echo -e "${GREEN}  ✓${NC} $1"
}

fail() {
  FAIL=$((FAIL + 1))
  echo -e "${RED}  ✗${NC} $1"
  echo -e "${RED}    → $2${NC}"
}

skip() {
  SKIP=$((SKIP + 1))
  echo -e "${YELLOW}  ⊘${NC} $1 (skipped: $2)"
}

info() {
  echo -e "${BLUE}  ↳${NC} $1"
}

section() {
  echo ""
  echo -e "${BLUE}══ $1 ══${NC}"
}

# ─── Detect docker compose ────────────────────────────────────────────────────

if docker compose version &>/dev/null 2>&1; then
  DOCKER_COMPOSE="docker compose"
elif docker-compose version &>/dev/null 2>&1; then
  DOCKER_COMPOSE="docker-compose"
else
  DOCKER_COMPOSE=""
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SHOPMETA_DIR="$REPO_ROOT"

# Parse args
DO_BUILD=false
SKIP_COMPOSE=false
for arg in "$@"; do
  case $arg in
    --build) DO_BUILD=true ;;
    --skip-compose) SKIP_COMPOSE=true ;;
  esac
done

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ShopMeta Deployment Tests                   ║"
echo "╚══════════════════════════════════════════════╝"

cd "$SHOPMETA_DIR"

# ─── Test 1: Required files exist ────────────────────────────────────────────

section "File Existence"

for f in Dockerfile docker-compose.yml docker-compose.test.yml docker-entrypoint.sh; do
  if [ -f "$SHOPMETA_DIR/$f" ]; then
    pass "$f exists"
  else
    fail "$f missing" "File not found at $SHOPMETA_DIR/$f"
  fi
done

# Verify entrypoint is executable (or at least contains the shebang)
if head -1 "$SHOPMETA_DIR/docker-entrypoint.sh" | grep -q '^#!/'; then
  pass "docker-entrypoint.sh has shebang line"
else
  fail "docker-entrypoint.sh missing shebang" "File must start with #!/"
fi

# Verify drizzle migrations exist
MIGRATION_COUNT=$(find "$SHOPMETA_DIR/drizzle" -name "*.sql" 2>/dev/null | wc -l)
if [ "$MIGRATION_COUNT" -gt 0 ]; then
  pass "drizzle migrations present ($MIGRATION_COUNT SQL files)"
else
  fail "no drizzle migrations found" "Run pnpm db:generate first"
fi

# ─── Test 2: Dockerfile structure ────────────────────────────────────────────

section "Dockerfile Validation"

if grep -q 'FROM.*AS deps' "$SHOPMETA_DIR/Dockerfile"; then
  pass "Dockerfile has multi-stage build (deps stage)"
else
  fail "Dockerfile missing multi-stage deps stage" "Add 'FROM ... AS deps'"
fi

if grep -q 'FROM.*AS builder' "$SHOPMETA_DIR/Dockerfile"; then
  pass "Dockerfile has build stage"
else
  fail "Dockerfile missing builder stage" "Add 'FROM ... AS builder'"
fi

if grep -q 'FROM.*AS runner' "$SHOPMETA_DIR/Dockerfile"; then
  pass "Dockerfile has runner stage"
else
  fail "Dockerfile missing runner stage" "Add 'FROM ... AS runner'"
fi

if grep -q 'USER node' "$SHOPMETA_DIR/Dockerfile"; then
  pass "Dockerfile uses non-root USER node"
else
  fail "Dockerfile does not set non-root user" "Add 'USER node' before ENTRYPOINT"
fi

if grep -q 'HEALTHCHECK' "$SHOPMETA_DIR/Dockerfile"; then
  pass "Dockerfile has HEALTHCHECK"
else
  fail "Dockerfile missing HEALTHCHECK" "Add HEALTHCHECK --interval=30s ..."
fi

if grep -q '/api/health' "$SHOPMETA_DIR/Dockerfile"; then
  pass "HEALTHCHECK targets /api/health"
else
  fail "HEALTHCHECK does not target /api/health" "Use wget or curl to /api/health"
fi

if grep -q 'EXPOSE' "$SHOPMETA_DIR/Dockerfile"; then
  pass "Dockerfile has EXPOSE instruction"
else
  fail "Dockerfile missing EXPOSE" "Add EXPOSE 3000"
fi

# ─── Test 3: docker-compose.yml structure ────────────────────────────────────

section "docker-compose.yml Validation"

if grep -q 'app.shopmeta.app' "$SHOPMETA_DIR/docker-compose.yml"; then
  pass "docker-compose.yml has app.shopmeta.app Traefik label"
else
  fail "docker-compose.yml missing Traefik label" "Add traefik.http.routers.shopmeta.rule=Host('app.shopmeta.app')"
fi

if grep -q 'dokploy-network' "$SHOPMETA_DIR/docker-compose.yml"; then
  pass "docker-compose.yml references dokploy-network"
else
  fail "docker-compose.yml missing dokploy-network" "Add networks: dokploy-network: external: true"
fi

if grep -q 'postgres:' "$SHOPMETA_DIR/docker-compose.yml"; then
  pass "docker-compose.yml has postgres service"
else
  fail "docker-compose.yml missing postgres service" "Add shopmeta-db service using postgres image"
fi

if grep -q 'service_healthy' "$SHOPMETA_DIR/docker-compose.yml"; then
  pass "docker-compose.yml uses service health-check dependency"
else
  fail "docker-compose.yml missing depends_on with service_healthy" "Use condition: service_healthy"
fi

if grep -q 'DATABASE_URL' "$SHOPMETA_DIR/docker-compose.yml"; then
  pass "docker-compose.yml sets DATABASE_URL"
else
  fail "docker-compose.yml missing DATABASE_URL" "Add DATABASE_URL environment variable"
fi

if grep -q 'ENCRYPTION_KEY' "$SHOPMETA_DIR/docker-compose.yml"; then
  pass "docker-compose.yml sets ENCRYPTION_KEY"
else
  fail "docker-compose.yml missing ENCRYPTION_KEY" "Add ENCRYPTION_KEY environment variable"
fi

# ─── Test 4: Health check endpoint source ────────────────────────────────────

section "Health Check Route"

if [ -f "$SHOPMETA_DIR/src/routes/api/health.ts" ]; then
  pass "src/routes/api/health.ts exists"
else
  fail "health route missing" "$SHOPMETA_DIR/src/routes/api/health.ts not found"
fi

if grep -q "status.*ok" "$SHOPMETA_DIR/src/routes/api/health.ts"; then
  pass "health route returns status: 'ok'"
else
  fail "health route missing ok status" "Route must return { status: 'ok' }"
fi

if grep -q "db.*connected" "$SHOPMETA_DIR/src/routes/api/health.ts"; then
  pass "health route returns db: 'connected'"
else
  fail "health route missing db connected status" "Route must return { db: 'connected' }"
fi

# ─── Test 5: Docker build (optional) ─────────────────────────────────────────

section "Docker Build"

if ! command -v docker &>/dev/null; then
  skip "Docker build" "Docker not installed"
elif [ "$DO_BUILD" = true ]; then
  info "Building Docker image (this may take several minutes)..."
  if docker build -t shopmeta:test . --quiet 2>&1; then
    pass "docker build succeeded"

    # Verify image was created
    if docker image inspect shopmeta:test &>/dev/null; then
      pass "shopmeta:test image exists in Docker"
    fi

    # Verify non-root user in image
    USER_CHECK=$(docker run --rm --entrypoint whoami shopmeta:test 2>/dev/null || echo "unknown")
    if [ "$USER_CHECK" = "node" ]; then
      pass "Container runs as non-root 'node' user"
    else
      fail "Container user check" "Expected 'node', got '$USER_CHECK'"
    fi
  else
    fail "docker build failed" "Run: docker build -t shopmeta:test . to see full output"
  fi
else
  skip "Docker build" "Run with --build flag to execute: docker build -t shopmeta:test ."
fi

# ─── Test 6: Docker Compose (optional) ───────────────────────────────────────

section "Docker Compose + Health Check"

if [ -z "$DOCKER_COMPOSE" ]; then
  skip "docker-compose up" "docker compose not available"
elif [ "$SKIP_COMPOSE" = true ]; then
  skip "docker-compose up" "--skip-compose flag set"
elif [ "$DO_BUILD" != true ]; then
  skip "docker-compose up" "Build not run. Use --build to also run compose tests"
else
  info "Starting services with docker-compose.test.yml..."
  $DOCKER_COMPOSE -f docker-compose.test.yml up -d --build 2>&1 | tail -5

  info "Waiting up to 90s for health check to pass..."
  MAX_WAIT=90
  WAITED=0
  HEALTH_OK=false

  while [ "$WAITED" -lt "$MAX_WAIT" ]; do
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "000")
    if [ "$HTTP_STATUS" = "200" ]; then
      HEALTH_OK=true
      break
    fi
    sleep 5
    WAITED=$((WAITED + 5))
    info "Still waiting... (${WAITED}s elapsed, HTTP $HTTP_STATUS)"
  done

  if [ "$HEALTH_OK" = true ]; then
    pass "Container serves HTTP 200"

    # Check response body
    HEALTH_BODY=$(curl -s http://localhost:3000/api/health 2>/dev/null)
    if echo "$HEALTH_BODY" | grep -q '"status":"ok"'; then
      pass "Health check returns { status: 'ok' }"
    else
      fail "Health check body" "Expected status:ok, got: $HEALTH_BODY"
    fi

    if echo "$HEALTH_BODY" | grep -q '"db":"connected"'; then
      pass "Health check returns { db: 'connected' }"
    else
      fail "Health check DB status" "Expected db:connected, got: $HEALTH_BODY"
    fi
  else
    fail "Container health check timed out" "Service did not become healthy within ${MAX_WAIT}s"
  fi

  info "Tearing down test containers..."
  $DOCKER_COMPOSE -f docker-compose.test.yml down -v 2>&1 | tail -3
fi

# ─── Summary ─────────────────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════════"
echo -e "  ${GREEN}Passed: $PASS${NC}   ${RED}Failed: $FAIL${NC}   ${YELLOW}Skipped: $SKIP${NC}"
echo "════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}  ✗ Some deployment tests FAILED${NC}"
  exit 1
else
  echo -e "${GREEN}  ✓ All deployment tests PASSED${NC}"
  exit 0
fi
