// src/lib/ai/mcp.ts
// MCP (Model Context Protocol) client setup with multi-server tool discovery.
// Uses @tanstack/ai-mcp to connect to one or more MCP servers and expose their
// tools to the TanStack AI agent loop.
//
// KEY DESIGN:
//   - createMCPClients() creates a pool of named clients from config.
//   - The pool auto-prefixes tool names: { clickhouse: ..., postgres: ... }
//     → "clickhouse__list_tables", "postgres__list_tables" avoiding collisions.
//   - discoverTools() returns all tools from all servers, merged with prefixes.
//   - mergeServerTools() is a pure utility for testing / manual merging.

import { createMCPClient, createMCPClientFromTransport, InMemoryTransport } from '@tanstack/ai-mcp'
import type { MCPClientOptions, MCPClientsConfig } from '@tanstack/ai-mcp'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

// Re-export for test usage so tests can import from '#/lib/ai/mcp'
export { createMCPClientFromTransport }

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MCPServerConfig {
  /** Unique name for this server — used as the tool name prefix. */
  name: string
  /** Transport URL for HTTP/SSE servers. */
  url: string
  /** Optional HTTP headers (e.g. Authorization). */
  headers?: Record<string, string>
  /** Transport type. Defaults to 'http'. */
  transportType?: 'http' | 'sse'
}

export interface DiscoveredTool {
  /** Prefixed name, e.g. "clickhouse__list_tables" */
  name: string
  /** Originating server name */
  server: string
  /** Original unprefixed tool name */
  originalName: string
  /** Tool description (if available) */
  description?: string
  /** JSON schema for input args */
  inputSchema?: unknown
}

// ─── Multi-Server Prefix Utility ─────────────────────────────────────────────

/**
 * Pure utility: merges tool lists from multiple servers, applying
 * `serverName__toolName` prefixes to avoid name collisions.
 *
 * @example
 * const tools = mergeServerTools([
 *   { server: 'clickhouse', tools: [{ name: 'list_tables' }] },
 *   { server: 'postgres',   tools: [{ name: 'list_tables' }] },
 * ])
 * // → [{ name: 'clickhouse__list_tables', ... }, { name: 'postgres__list_tables', ... }]
 */
export function mergeServerTools(
  serverToolSets: Array<{ server: string; tools: Array<{ name: string; description?: string; inputSchema?: unknown }> }>,
): DiscoveredTool[] {
  const result: DiscoveredTool[] = []
  for (const { server, tools } of serverToolSets) {
    for (const tool of tools) {
      result.push({
        name: `${server}__${tool.name}`,
        server,
        originalName: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })
    }
  }
  return result
}

/**
 * Splits a prefixed tool name back into server + original name.
 * e.g. "clickhouse__list_tables" → { server: 'clickhouse', toolName: 'list_tables' }
 */
export function splitPrefixedToolName(prefixedName: string): { server: string; toolName: string } | null {
  const idx = prefixedName.indexOf('__')
  if (idx === -1) return null
  return {
    server: prefixedName.slice(0, idx),
    toolName: prefixedName.slice(idx + 2),
  }
}

// ─── MCP Client Factory ───────────────────────────────────────────────────────

/**
 * Creates an MCPClient for a single server using HTTP or SSE transport.
 * The prefix option ensures tools are namespaced as `serverName__toolName`.
 */
export async function createServerMCPClient(config: MCPServerConfig) {
  const options: MCPClientOptions = {
    transport: {
      type: config.transportType ?? 'http',
      url: config.url,
      headers: config.headers,
    },
    prefix: config.name,
    name: `shopmeta-${config.name}`,
    version: '1.0.0',
  }
  return createMCPClient(options)
}

/**
 * Creates an MCPClient directly from an existing Transport (for testing
 * with InMemoryTransport or custom transports).
 * @deprecated Use the re-exported `createMCPClientFromTransport` directly.
 */
export async function createMCPClientForTransport(transport: Transport, serverName?: string) {
  return createMCPClientFromTransport(transport, serverName)
}

// ─── Multi-Server Pool ────────────────────────────────────────────────────────

/**
 * Creates a pool of MCP clients from a list of server configs.
 * Returns an object with individual clients and a merged tools() method.
 *
 * The pool uses the server `name` as the config key, which becomes
 * the tool prefix. So a server named "clickhouse" produces tools like
 * "clickhouse__list_tables", "clickhouse__run_select_query".
 */
export async function createTenantMCPClients(servers: MCPServerConfig[]) {
  // Build config map: { serverName: MCPClientOptions }
  const config: MCPClientsConfig = {}
  for (const server of servers) {
    config[server.name] = {
      transport: {
        type: server.transportType ?? 'http',
        url: server.url,
        headers: server.headers,
      },
      prefix: server.name,
      name: `shopmeta-${server.name}`,
      version: '1.0.0',
    }
  }

  // Lazy import to allow tree-shaking / SSR boundaries
  const { createMCPClients } = await import('@tanstack/ai-mcp')
  return createMCPClients(config)
}

/**
 * Discovers all tools from a list of MCP server configs.
 * Returns a flat list of tools with prefixed names for collision avoidance.
 */
export async function discoverTools(servers: MCPServerConfig[]): Promise<DiscoveredTool[]> {
  if (servers.length === 0) return []

  const clients = await createTenantMCPClients(servers)
  try {
    const serverTools: Array<{ server: string; tools: Array<{ name: string; description?: string; inputSchema?: unknown }> }> = []

    for (const [serverName, client] of Object.entries(clients.clients)) {
      const tools = await (client as ReturnType<typeof createMCPClient> extends Promise<infer T> ? T : never).tools()
      serverTools.push({
        server: serverName,
        tools: (tools as Array<{ name: string; description?: string; inputSchema?: unknown }>).map((t) => ({
          name: (t as { name: string }).name.replace(`${serverName}__`, ''), // strip prefix since mergeServerTools re-adds it
          description: (t as { description?: string }).description,
          inputSchema: (t as { inputSchema?: unknown }).inputSchema,
        })),
      })
    }

    return mergeServerTools(serverTools)
  } finally {
    await clients.close()
  }
}

// ─── Agent Loop MCP Integration ───────────────────────────────────────────────

/**
 * Executes a named tool on an MCP client pool.
 * Parses the prefixed name to find the right server, then calls the tool.
 *
 * @param clients - The MCPClients pool
 * @param prefixedToolName - e.g. "clickhouse__run_select_query"
 * @param args - Tool input arguments
 */
export async function executeToolOnClient(
  clients: Awaited<ReturnType<typeof createTenantMCPClients>>,
  prefixedToolName: string,
  args: Record<string, unknown>,
): Promise<{ result: unknown; error?: string }> {
  const parsed = splitPrefixedToolName(prefixedToolName)
  if (!parsed) {
    return { result: null, error: `Invalid tool name format: "${prefixedToolName}". Expected "serverName__toolName".` }
  }

  const { server } = parsed

  // Look up the client for this server
  const client = clients.clients[server]
  if (!client) {
    return { result: null, error: `Unknown MCP server: "${server}". Available: ${Object.keys(clients.clients).join(', ')}` }
  }

  try {
    // Get the pool's flattened tools and find our tool
    const allTools = await clients.tools()
    const tool = allTools.find((t: { name: string }) => t.name === prefixedToolName)
    if (!tool) {
      return { result: null, error: `Tool "${prefixedToolName}" not found on server "${server}".` }
    }

    // Execute the tool
    const callResult = await (tool as { execute: (args: Record<string, unknown>) => Promise<unknown> }).execute(args)
    return { result: callResult as unknown }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { result: null, error: message }
  }
}

// Re-export InMemoryTransport for test convenience
export { InMemoryTransport }
