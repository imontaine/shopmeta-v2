// src/routes/api/mcp/test.ts
// POST /api/mcp/test - tests connectivity to a saved MCP server.
//
// Flow:
//   1. Verify org session
//   2. Load the mcp_servers row (org-scoped)
//   3. Build MCPClientOptions via mcpRowToClientOptions
//   4. Call createMCPClients + .tools() with a 10-second timeout
//   5. Return { ok, toolCount, tools, latencyMs } or { ok: false, error }
//
// Called by the Test button on each MCP server card. Server-side only --
// auth headers / OAuth tokens never touch the browser.

import { createFileRoute } from '@tanstack/react-router'
import { requireOrgSession } from '#/lib/auth/require-org-session'
import { getDb } from '#/lib/db/index'
import { mcpServers } from '#/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { mcpRowToClientOptions } from '#/lib/mcp-client-options.server'
import { createMCPClients } from '@tanstack/ai-mcp'
import type { McpServerRow } from '#/lib/mcp-servers'
import { getPublicOrigin } from '#/lib/get-origin'

const TEST_TIMEOUT_MS = 10_000

export const Route = createFileRoute('/api/mcp/test')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        // -- Parse body ----------------------------------------------------------
        let body: { mcpServerId?: string }
        try {
          body = await request.json() as { mcpServerId?: string }
        } catch {
          return Response.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
        }
        const { mcpServerId } = body
        if (!mcpServerId || typeof mcpServerId !== 'string') {
          return Response.json({ ok: false, error: 'mcpServerId is required' }, { status: 400 })
        }

        // -- Verify session ------------------------------------------------------
        let orgId: string
        try {
          const session = await requireOrgSession()
          orgId = session.orgId
        } catch {
          return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        // -- Load server row -----------------------------------------------------
        const db = getDb()
        const [row] = await db
          .select()
          .from(mcpServers)
          .where(and(eq(mcpServers.id, mcpServerId), eq(mcpServers.orgId, orgId)))
          .limit(1)

        if (!row) {
          return Response.json({ ok: false, error: 'MCP server not found' }, { status: 404 })
        }

        // OAuth servers must have tokens before we can test
        if (row.authType === 'oauth') {
          const cfg = row.authConfig as Record<string, unknown> | null
          if (!cfg?.['access_token']) {
            return Response.json({
              ok: false,
              error: 'OAuth server is not connected yet. Use the Connect button first.',
            }, { status: 400 })
          }
        }

        // -- Build client options -----------------------------------------------
        // Use getPublicOrigin() to honour reverse-proxy headers so OAuth
        // servers (which need a matching redirect_uri) work in production.
        const origin = getPublicOrigin(request)
        const redirectUrl = `${origin}/api/mcp/oauth-callback`

        const mcpRow: McpServerRow = {
          id: row.id,
          orgId: row.orgId,
          name: row.name,
          serverName: row.serverName ?? '',
          url: row.url,
          transport: row.transport,
          description: row.description ?? null,
          iconUrl: row.iconUrl ?? null,
          authType: row.authType,
          authConfig: row.authConfig as Record<string, unknown> | null,
          oauthClientInfo: row.oauthClientInfo as Record<string, unknown> | null,
          oauthState: row.oauthState as Record<string, unknown> | null,
          trusted: row.trusted,
          createdAt: row.createdAt?.toISOString() ?? null,
          updatedAt: row.updatedAt?.toISOString() ?? null,
        }

        const clientKey = mcpRow.serverName || mcpRow.name
        const clientOptions = mcpRowToClientOptions(mcpRow, orgId, redirectUrl)

        // -- Connect and list tools with timeout --------------------------------
        const startMs = Date.now()
        const abort = new AbortController()
        const timer = setTimeout(() => abort.abort(), TEST_TIMEOUT_MS)

        let mcpClients: Awaited<ReturnType<typeof createMCPClients>> | undefined
        try {
          mcpClients = await Promise.race([
            createMCPClients({ [clientKey]: clientOptions }),
            new Promise<never>((_, reject) =>
              abort.signal.addEventListener('abort', () =>
                reject(new Error(`Connection timed out after ${TEST_TIMEOUT_MS / 1000}s`))
              )
            ),
          ])

          const rawTools = await Promise.race([
            mcpClients.tools(),
            new Promise<never>((_, reject) =>
              abort.signal.addEventListener('abort', () =>
                reject(new Error(`Tool listing timed out after ${TEST_TIMEOUT_MS / 1000}s`))
              )
            ),
          ])

          const latencyMs = Date.now() - startMs
          const tools = (rawTools as Array<{ name?: string; description?: string }>).map((t) => ({
            name: t.name ?? '(unnamed)',
            description: t.description ?? '',
          }))

          return Response.json({
            ok: true,
            toolCount: tools.length,
            tools,
            latencyMs,
          })
        } catch (err) {
          const latencyMs = Date.now() - startMs
          const message = err instanceof Error ? err.message : String(err)

          // Unwrap cause chain for richer diagnostics
          let causeMessage: string | undefined
          let causeName: string | undefined
          if (err instanceof Error && err.cause) {
            const c = err.cause
            causeMessage = c instanceof Error ? c.message : String(c)
            causeName = c instanceof Error ? c.constructor.name : undefined
          }

          const detail = [
            message,
            causeMessage ? `Cause: ${causeMessage}` : null,
            causeName ? `(${causeName})` : null,
          ].filter(Boolean).join(' — ')

          console.error('[mcp/test] Connection test failed:', detail,
            '\n  server:', mcpRow.url,
            '\n  transport:', mcpRow.transport,
            '\n  authType:', mcpRow.authType,
          )
          return Response.json({
            ok: false,
            error: detail,
            errorCode: causeName,
            latencyMs,
            debug: {
              url: mcpRow.url,
              transport: mcpRow.transport,
              authType: mcpRow.authType,
            },
          }, { status: 200 })

        } finally {
          clearTimeout(timer)
          try { await mcpClients?.close?.() } catch { /* ignore close errors */ }
        }
      },
    },
  },
})
