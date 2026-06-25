FROM ghcr.io/danny-avila/librechat:latest

# Install build tools and lz4 dev libraries so that the Python lz4 package
# (required by mcp-clickhouse → clickhouse-connect) can compile natively.
# Alpine uses apk, and the LibreChat image runs as the 'node' user.
USER root
RUN apk add --no-cache \
    gcc \
    g++ \
    musl-dev \
    python3-dev \
    lz4-dev \
    make
USER node
