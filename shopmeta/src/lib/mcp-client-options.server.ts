// src/lib/mcp-client-options.server.ts
// SERVER-ONLY: converts McpServerRow -> MCPClientOptions for @tanstack/ai-mcp.
//
// This file MUST NOT be imported by any client-side component or any module
// that is imported by a client component. It imports DrizzleOAuthProvider which
// pulls in @modelcontextprotocol/sdk which uses Node.js Buffer.
//
// Safe importers:
//   - src/routes/api/chat/stream.ts
//   - src/routes/api/mcp/oauth-start.ts
//   - src/routes/api/mcp/oauth-callback.ts
//
// DO NOT import from McpServersPage.tsx or any React component.

import type { MCPClientOptions } from '@tanstack/ai-mcp'
import type { McpServerRow } from '#/lib/mcp-servers'
import { DrizzleOAuthProvider } from '#/lib/mcp-oauth-provider'

/**
 * Converts a McpServerRow from the DB catalog into MCPClientOptions
 * for use with createMCPClients() from @tanstack/ai-mcp.
 *
 * Handles all auth types:
 *   'none'   - no headers, no authProvider
 *   'apikey' - static Authorization header injected via transport.headers
 *   'oauth'  - authProvider: DrizzleOAuthProvider (SDK handles token injection
 *              and auto-refresh on 401 - no manual token management needed)
 *
 * The redirect URL is derived from the request origin so it works on
 * local dev, staging, and production without configuration.
 *
 * @param row         - McpServerRow from the catalog
 * @param orgId       - Org ID for tenant scoping
 * @param redirectUrl - OAuth callback URL (e.g. `${origin}/api/mcp/oauth-callback`)
 */
export function mcpRowToClientOptions(
  row: McpServerRow,
  orgId: string,
  redirectUrl: string,
): MCPClientOptions {
  const type = row.transport === 'sse' ? 'sse' : 'http'
  const prefix = row.serverName || row.name

  if (row.authType === 'oauth') {
    return {
      transport: {
        type,
        url: row.url,
        authProvider: new DrizzleOAuthProvider(row.id, orgId, redirectUrl),
      },
      prefix,
    }
  }

  if (row.authType === 'apikey') {
    const cfg = row.authConfig as {
      key?: string
      headerFormat?: 'bearer' | 'basic' | 'custom'
      customHeader?: string
    } | null

    const headers: Record<string, string> = {}
    if (cfg?.key) {
      if (cfg.headerFormat === 'basic') {
        headers['Authorization'] = `Basic ${cfg.key}`
      } else if (cfg.headerFormat === 'custom' && cfg.customHeader) {
        headers[cfg.customHeader] = cfg.key
      } else {
        headers['Authorization'] = `Bearer ${cfg.key}`
      }
    }
    return {
      transport: {
        type,
        url: row.url,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      },
      prefix,
    }
  }

  // authType = 'none'
  return {
    transport: { type, url: row.url },
    prefix,
  }
}
