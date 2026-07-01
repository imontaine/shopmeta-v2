// src/routes/api/mcp/diagnose.ts
// POST /api/mcp/diagnose - raw HTTP probe of an MCP endpoint for debugging.
//
// Does NOT use the MCP SDK - just fires a raw HTTP request to the server URL
// and reports back: status, content-type, WWW-Authenticate header, and the
// first 500 chars of the response body.
//
// This lets us distinguish:
//   - 401 Unauthorized (OAuth token expired / not connected)
//   - 403 Forbidden
//   - 404 Not Found (wrong URL)
//   - 405 Method Not Allowed (SSE endpoint hit with POST, or vice versa)
//   - 200 with wrong content-type (not MCP)
//   - Network/DNS errors
//
// Called by the Debug button on each MCP server card.

import { createFileRoute } from '@tanstack/react-router'
import { requireOrgSession } from '#/lib/auth/require-org-session'
import { getDb } from '#/lib/db/index'
import { mcpServers } from '#/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getPublicOrigin } from '#/lib/get-origin'

const PROBE_TIMEOUT_MS = 8_000

export const Route = createFileRoute('/api/mcp/diagnose')({
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
          .select({
            id: mcpServers.id,
            name: mcpServers.name,
            serverName: mcpServers.serverName,
            url: mcpServers.url,
            transport: mcpServers.transport,
            authType: mcpServers.authType,
            authConfig: mcpServers.authConfig,
            oauthState: mcpServers.oauthState,
          })
          .from(mcpServers)
          .where(and(eq(mcpServers.id, mcpServerId), eq(mcpServers.orgId, orgId)))
          .limit(1)

        if (!row) {
          return Response.json({ ok: false, error: 'MCP server not found' }, { status: 404 })
        }

        const origin = getPublicOrigin(request)
        const steps: Array<{
          label: string
          status?: number
          contentType?: string
          wwwAuthenticate?: string
          body?: string
          error?: string
          ok: boolean
        }> = []

        // -- Step 1: Build auth header -------------------------------------------
        const headers: Record<string, string> = {
          'Accept': 'application/json, text/event-stream, */*',
          'User-Agent': 'ShopMeta-Diagnose/1.0',
        }

        if (row.authType === 'apikey') {
          const cfg = row.authConfig as { key?: string; headerFormat?: string; customHeader?: string } | null
          if (cfg?.key) {
            if (cfg.headerFormat === 'basic') {
              headers['Authorization'] = `Basic ${cfg.key.slice(0, 8)}...`
            } else if (cfg.headerFormat === 'custom' && cfg.customHeader) {
              headers[cfg.customHeader] = `${cfg.key.slice(0, 8)}...`
            } else {
              headers['Authorization'] = `Bearer ${cfg.key.slice(0, 8)}...`
            }
          }
        } else if (row.authType === 'oauth') {
          const cfg = row.authConfig as Record<string, unknown> | null
          const token = cfg?.['access_token'] as string | undefined
          if (token) {
            headers['Authorization'] = `Bearer ${token.slice(0, 8)}...`
          } else {
            steps.push({
              label: 'OAuth token check',
              ok: false,
              error: 'No access_token stored — server not connected yet. Use the Connect button first.',
            })
          }
        }

        // -- Step 2: Raw GET probe (SSE endpoint typically accepts GET) ----------
        const probeUrl = row.url
        const startMs = Date.now()
        try {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)

          let resp: Response
          try {
            // For SSE: GET with Accept: text/event-stream
            // For HTTP (Streamable): POST with MCP initialize JSON
            const isSSE = row.transport === 'sse'
            resp = await fetch(probeUrl, {
              method: isSSE ? 'GET' : 'POST',
              headers: {
                ...headers,
                ...(isSSE
                  ? { Accept: 'text/event-stream' }
                  : { 'Content-Type': 'application/json' }),
              },
              body: isSSE
                ? undefined
                : JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'initialize',
                    params: {
                      protocolVersion: '2024-11-05',
                      capabilities: {},
                      clientInfo: { name: 'shopmeta-diagnose', version: '1.0' },
                    },
                  }),
              signal: controller.signal,
            })
          } finally {
            clearTimeout(timer)
          }

          const latencyMs = Date.now() - startMs
          const contentType = resp.headers.get('content-type') ?? '(none)'
          const wwwAuth = resp.headers.get('www-authenticate') ?? undefined
          const xRequestId = resp.headers.get('x-request-id') ?? undefined

          // Read up to 500 chars of body
          let bodySnippet = '(unread)'
          try {
            const text = await resp.text()
            bodySnippet = text.slice(0, 500) + (text.length > 500 ? '…' : '')
          } catch {
            bodySnippet = '(body read failed)'
          }

          steps.push({
            label: `HTTP ${row.transport === 'sse' ? 'GET' : 'POST'} ${probeUrl}`,
            status: resp.status,
            contentType,
            wwwAuthenticate: wwwAuth,
            body: bodySnippet,
            ok: resp.status >= 200 && resp.status < 300,
          })

          // -- Step 3: Interpret the result ------------------------------------
          const diagnosis: string[] = []

          if (resp.status === 401) {
            diagnosis.push('401 Unauthorized — token missing, expired, or invalid.')
            if (row.authType === 'oauth') {
              diagnosis.push('Try disconnecting and reconnecting the OAuth flow.')
            } else if (row.authType === 'none') {
              diagnosis.push('Server requires auth but authType is "none". Set authType to "oauth" or "apikey".')
            }
            if (wwwAuth) diagnosis.push(`WWW-Authenticate: ${wwwAuth}`)
          } else if (resp.status === 403) {
            diagnosis.push('403 Forbidden — authenticated but not authorized for this resource.')
          } else if (resp.status === 404) {
            diagnosis.push('404 Not Found — wrong URL. Verify the MCP endpoint path.')
          } else if (resp.status === 405) {
            diagnosis.push('405 Method Not Allowed — transport type mismatch (SSE vs Streamable HTTP).')
          } else if (resp.status === 200 || resp.status === 202) {
            if (row.transport === 'sse' && !contentType.includes('text/event-stream')) {
              diagnosis.push(`Transport is SSE but server returned Content-Type: ${contentType}. Try switching to "Streamable HTTP".`)
            } else if (row.transport !== 'sse' && contentType.includes('text/event-stream')) {
              diagnosis.push(`Transport is Streamable HTTP but server returned SSE Content-Type. Try switching transport to "SSE".`)
            } else {
              diagnosis.push('HTTP probe succeeded. If MCP SDK still fails, the issue may be in the MCP handshake (initialize / capabilities).')
            }
          }

          return Response.json({
            ok: resp.status >= 200 && resp.status < 300,
            steps,
            diagnosis,
            latencyMs,
            server: {
              name: row.name,
              url: row.url,
              transport: row.transport,
              authType: row.authType,
              origin,
            },
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          const latencyMs = Date.now() - startMs
          steps.push({
            label: `HTTP probe ${probeUrl}`,
            ok: false,
            error: message,
          })
          return Response.json({
            ok: false,
            steps,
            diagnosis: [
              message.includes('aborted') || message.includes('abort')
                ? `Connection timed out after ${PROBE_TIMEOUT_MS / 1000}s — server may be unreachable or blocking.`
                : `Network error: ${message}`,
            ],
            latencyMs,
            server: {
              name: row.name,
              url: row.url,
              transport: row.transport,
              authType: row.authType,
              origin,
            },
          })
        }
      },
    },
  },
})
