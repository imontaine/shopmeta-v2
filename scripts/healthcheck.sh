#!/bin/bash
# =============================================================================
# ShopMeta LibreChat Stack Health Check
# =============================================================================
# Run after deployment to verify all services are operational.
# Usage: ./scripts/healthcheck.sh [--verbose]
#
# Exit codes:
#   0 = All checks passed
#   1 = One or more checks failed
# =============================================================================

set -euo pipefail

DOMAIN_CHAT="${DOMAIN_CHAT:-chat.shopmeta.app}"
DOMAIN_ADMIN="${DOMAIN_ADMIN:-admin.shopmeta.app}"
VERBOSE="${1:-}"

PASS=0
FAIL=0
WARN=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

log_pass() { echo -e "  ${GREEN}✓${NC} $1"; ((PASS++)); }
log_fail() { echo -e "  ${RED}✗${NC} $1"; ((FAIL++)); }
log_warn() { echo -e "  ${YELLOW}⚠${NC} $1"; ((WARN++)); }
log_info() { echo -e "  ${CYAN}ℹ${NC} $1"; }
log_header() { echo -e "\n${BOLD}━━━ $1 ━━━${NC}"; }

check_http() {
    local name="$1"
    local url="$2"
    local expected_code="${3:-200}"
    
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 "$url" 2>/dev/null) || response="000"
    
    if [ "$response" = "$expected_code" ]; then
        log_pass "$name (HTTP $response)"
    else
        log_fail "$name (HTTP $response, expected $expected_code)"
    fi
    
    if [ "$VERBOSE" = "--verbose" ]; then
        log_info "  URL: $url"
    fi
}

check_container() {
    local name="$1"
    local container="$2"
    
    local status
    status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null) || status="not_found"
    local health
    health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no_healthcheck{{end}}' "$container" 2>/dev/null) || health="unknown"
    
    if [ "$status" = "running" ]; then
        if [ "$health" = "healthy" ]; then
            log_pass "$name (running, healthy)"
        elif [ "$health" = "no_healthcheck" ]; then
            log_pass "$name (running)"
        elif [ "$health" = "unhealthy" ]; then
            log_warn "$name (running, unhealthy)"
        else
            log_pass "$name (running, health: $health)"
        fi
    elif [ "$status" = "not_found" ]; then
        log_fail "$name (container not found)"
    else
        log_fail "$name (status: $status)"
    fi
}

check_container_log() {
    local name="$1"
    local container="$2"
    local pattern="$3"
    
    if docker logs "$container" 2>&1 | grep -q "$pattern"; then
        log_pass "$name"
    else
        log_fail "$name"
    fi
}

# =============================================================================
echo -e "${BOLD}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║     ShopMeta LibreChat Stack Health Check           ║"
echo "║     $(date '+%Y-%m-%d %H:%M:%S %Z')                ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# =============================================================================
log_header "Container Status"
# =============================================================================
check_container "LibreChat API"       "librechat-api"
check_container "MongoDB"             "librechat-mongodb"
check_container "Meilisearch"         "librechat-meilisearch"
check_container "RAG API"             "librechat-rag"
check_container "Vector DB"           "librechat-vectordb"
check_container "Admin Panel"         "librechat-admin"
check_container "ClickHouse MCP"      "clickhouse-mcp-server"

# =============================================================================
log_header "External Endpoints"
# =============================================================================
check_http "Chat UI"          "https://${DOMAIN_CHAT}/"
check_http "Chat API Health"  "https://${DOMAIN_CHAT}/api/health"
check_http "Admin Panel"      "https://${DOMAIN_ADMIN}/"

# =============================================================================
log_header "Internal Services"
# =============================================================================
check_container_log "Skills loaded"       "librechat-api" "deploymentSkills.*Loaded"
check_container_log "MCP registry init"   "librechat-api" "MCPServersRegistry.*Creating"
check_container_log "Server ready"        "librechat-api" "Server readiness checks passing"
check_container_log "RAG API reachable"   "librechat-api" "RAG API is running"

# =============================================================================
log_header "ClickHouse MCP Server"
# =============================================================================
check_container_log "MCP server started"  "clickhouse-mcp-server" "Starting MCP server"

# Check if MCP tools are loaded in API
if docker logs librechat-api 2>&1 | grep -q "MCP.*Initialized.*0 tools"; then
    log_warn "MCP initialized but 0 tools loaded (may need admin panel config)"
elif docker logs librechat-api 2>&1 | grep -q "MCP.*Initialized.*[1-9]"; then
    TOOL_COUNT=$(docker logs librechat-api 2>&1 | grep "MCP.*Initialized" | tail -1 | grep -oP '\d+ tools' || echo "? tools")
    log_pass "MCP tools loaded ($TOOL_COUNT)"
else
    log_warn "MCP tool status unknown"
fi

# =============================================================================
log_header "Data Persistence"
# =============================================================================
for vol in mongodb_data meilisearch_data librechat_images librechat_logs pgvector_data clickhouse_skills; do
    full_name=$(docker volume ls --format '{{.Name}}' | grep "$vol" || echo "")
    if [ -n "$full_name" ]; then
        log_pass "Volume: $vol"
    else
        log_fail "Volume: $vol (not found)"
    fi
done

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${BOLD}━━━ Summary ━━━${NC}"
echo -e "  ${GREEN}Passed:${NC}  $PASS"
echo -e "  ${RED}Failed:${NC}  $FAIL"
echo -e "  ${YELLOW}Warnings:${NC} $WARN"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}${BOLD}HEALTH CHECK FAILED${NC} — $FAIL issue(s) detected"
    exit 1
elif [ "$WARN" -gt 0 ]; then
    echo -e "${YELLOW}${BOLD}HEALTH CHECK PASSED WITH WARNINGS${NC} — $WARN warning(s)"
    exit 0
else
    echo -e "${GREEN}${BOLD}ALL CHECKS PASSED${NC}"
    exit 0
fi
