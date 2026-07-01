// src/routes/api/mcp/diagnose.ts
// POST /api/mcp/diagnose - raw HTTP probe of an MCP endpoint for debugging.
//
// Does NOT use the MCP SDK - just fires real HTTP requests to the server URL
// and reports back: status, content-type, WWW-Authenticate header, and the
// first 500 chars of the response body.
//
// KEY FIX: sends the FULL token in the HTTP request (server-side is safe —
// the token never reaches the browser). The display label shows only the
// first 8 chars for security, but the wire request uses the full token.
//
// This lets us distinguish:
//   - 401 with token → token expired (need reconnect)
//   - 401 without token → not connected yet
//   - 403 Forbidden
//   - 404 Not Found (wrong URL)
//   - 405 Method Not Allowed (SSE vs Streamable HTTP mismatch)
//   - 200 with wrong content-type
//   - Network/DNS errors
//
// Also auto-detects correct transport by trying both POST (Streamable HTTP)
// and GET (SSE) when transport type is uncertain.

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

        // -- Step 1: Build auth headers ------------------------------------------
        // IMPORTANT: Send the FULL credential in the wire request.
        // This endpoint is server-side only - tokens never reach the browser.
        // We track a masked display label separately for the response.
        const wireHeaders: Record<string, string> = {
          'Accept': 'application/json, text/event-stream, */*',
          'User-Agent': 'ShopMeta-Diagnose/1.0',
        }

        let authStatusLabel = 'No auth'
        let hasToken = false

        if (row.authType === 'apikey') {
          const cfg = row.authConfig as { key?: string; headerFormat?: string; customHeader?: string } | null
          if (cfg?.key) {
            hasToken = true
            if (cfg.headerFormat === 'basic') {
              wireHeaders['Authorization'] = `Basic ${cfg.key}` // full value on wire
              authStatusLabel = `Basic [key:${cfg.key.slice(0, 6)}…]`
            } else if (cfg.headerFormat === 'custom' && cfg.customHeader) {
              wireHeaders[cfg.customHeader] = cfg.key // full value on wire
              authStatusLabel = `${cfg.customHeader}: [key:${cfg.key.slice(0, 6)}…]`
            } else {
              wireHeaders['Authorization'] = `Bearer ${cfg.key}` // full value on wire
              authStatusLabel = `Bearer [key:${cfg.key.slice(0, 6)}…]`
            }
          } else {
            steps.push({
              label: 'API key check',
              ok: false,
              error: 'No API key stored for this server.',
            })
          }
        } else if (row.authType === 'oauth') {
          const cfg = row.authConfig as Record<string, unknown> | null
          const token = cfg?.['access_token'] as string | undefined
          if (token) {
            hasToken = true
            wireHeaders['Authorization'] = `Bearer ${token}` // full token on wire (server-side safe)
            authStatusLabel = `Bearer [token:${token.slice(0, 8)}…] (OAuth)`
          } else {
            steps.push({
              label: 'OAuth token check',
              ok: false,
              error: 'No access_token stored — server not connected yet. Use the Connect button first.',
            })
          }
        }

        // -- Step 2: HTTP probe --------------------------------------------------
        // Probe the configured transport first, then auto-detect if it fails.
        const probeUrl = row.url
        const startMs = Date.now()

        // Helper: fire a single probe request
        async function probe(method: 'GET' | 'POST'): Promise<{
          status: number
          contentType: string
          wwwAuthenticate?: string
          bodySnippet: string
          latencyMs: number
        }> {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
          try {
            const res = await fetch(probeUrl, {
              method,
              headers: {
                ...wireHeaders,
                ...(method === 'GET'
                  ? { Accept: 'text/event-stream' }
                  : { 'Content-Type': 'application/json' }),
              },
              body: method === 'POST'
                ? JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'initialize',
                    params: {
                      protocolVersion: '2024-11-05',
                      capabilities: {},
                      clientInfo: { name: 'shopmeta-diagnose', version: '1.0' },
                    },
                  })
                : undefined,
              signal: controller.signal,
            })
            const latencyMs = Date.now() - startMs
            const contentType = res.headers.get('content-type') ?? '(none)'
            const wwwAuthenticate = res.headers.get('www-authenticate') ?? undefined
            let bodySnippet = '(unread)'
            try {
              const text = await res.text()
              bodySnippet = text.slice(0, 500) + (text.length > 500 ? '…' : '')
            } catch {
              bodySnippet = '(body read failed)'
            }
            return { status: res.status, contentType, wwwAuthenticate, bodySnippet, latencyMs }
          } finally {
            clearTimeout(timer)
          }
        }

        try {
          // Primary probe: use the configured transport
          const isSSE = row.transport === 'sse'
          const primaryMethod = isSSE ? 'GET' : 'POST'
          const primaryResult = await probe(primaryMethod)

          steps.push({
            label: `HTTP ${primaryMethod} ${probeUrl} (${isSSE ? 'SSE' : 'Streamable HTTP'}) | auth: ${authStatusLabel}`,
            status: primaryResult.status,
            contentType: primaryResult.contentType,
            wwwAuthenticate: primaryResult.wwwAuthenticate,
            body: primaryResult.bodySnippet,
            ok: primaryResult.status >= 200 && primaryResult.status < 300,
          })

          // -- Step 3: Transport auto-detection ------------------------------------
          // If we got 405 Method Not Allowed, try the opposite transport method.
          // This tells the user which transport is actually correct.
          let alternativeResult: Awaited<ReturnType<typeof probe>> | null = null
          let suggestedTransport: string | null = null

          if (primaryResult.status === 405) {
            const altMethod = isSSE ? 'POST' : 'GET'
            const altStartMs = Date.now()
            try {
              alternativeResult = await probe(altMethod)
              steps.push({
                label: `HTTP ${altMethod} ${probeUrl} (${isSSE ? 'Streamable HTTP' : 'SSE'} — auto-detect) | auth: ${authStatusLabel}`,
                status: alternativeResult.status,
                contentType: alternativeResult.contentType,
                wwwAuthenticate: alternativeResult.wwwAuthenticate,
                body: alternativeResult.bodySnippet,
                ok: alternativeResult.status >= 200 && alternativeResult.status < 300,
              })
              if (alternativeResult.status !== 405) {
                suggestedTransport = isSSE ? 'streamable-http' : 'sse'
              }
            } catch {
              // Alternative probe failed — ignore
            }
            void altStartMs
          }

          // -- Step 4: Build diagnosis --------------------------------------------
          const diagnosis: string[] = []
          const status = primaryResult.status
          const ct = primaryResult.contentType
          const wwwAuth = primaryResult.wwwAuthenticate

          if (status === 401) {
            if (!hasToken) {
              diagnosis.push('401 Unauthorized — no credentials stored. Connect the server first (OAuth flow or API key).')
            } else {
              diagnosis.push('401 Unauthorized — credentials were sent but rejected by the server.')
              if (row.authType === 'oauth') {
                diagnosis.push('OAuth token is likely expired. Click Reconnect to refresh it.')
              } else {
                diagnosis.push('API key may be invalid or revoked. Check the key value.')
              }
            }
            if (wwwAuth) diagnosis.push(`Server WWW-Authenticate: ${wwwAuth}`)
          } else if (status === 403) {
            diagnosis.push('403 Forbidden — authenticated but not authorized for this resource or org.')
          } else if (status === 404) {
            diagnosis.push('404 Not Found — URL is wrong or the MCP endpoint path is different.')
          } else if (status === 405) {
            if (suggestedTransport) {
              const label = suggestedTransport === 'sse' ? 'SSE' : 'Streamable HTTPS'
              diagnosis.push(`405 Method Not Allowed — wrong transport. Switch to "${label}" in the server settings.`)
              diagnosis.push(`Auto-detect: the ${altMethod} method returned HTTP ${alternativeResult?.status ?? '?'}.`)
            } else {
              diagnosis.push('405 Method Not Allowed — transport type mismatch (SSE vs Streamable HTTP).')
              diagnosis.push('Try switching the transport setting and re-running diagnose.')
            }
          } else if (status === 200 || status === 202) {
            if (ct.includes('text/event-stream') && !isSSE) {
              diagnosis.push(`Server returned SSE stream (text/event-stream) but transport is set to "Streamable HTTP". Switch to "SSE".`)
            } else if (!ct.includes('text/event-stream') && !ct.includes('application/json') && isSSE) {
              diagnosis.push(`Unexpected Content-Type: ${ct}. Check the URL is correct.`)
            } else {
              diagnosis.push('✓ HTTP probe succeeded with credentials.')
              if (hasToken) {
                diagnosis.push('Token is valid and accepted. If the MCP SDK still fails, the issue may be in the handshake (initialize / capabilities exchange).')
              }
            }
          }

          // Transport detection note (even on 200)
          if (status !== 405) {
            if (isSSE && ct.includes('text/event-stream')) {
              diagnosis.push('Transport confirmed: SSE (GET → text/event-stream ✓)')
            } else if (!isSSE && ct.includes('application/json')) {
              diagnosis.push('Transport confirmed: Streamable HTTP (POST → application/json ✓)')
            } else if (!isSSE && ct.includes('text/event-stream')) {
              diagnosis.push('⚠ Transport mismatch: set to Streamable HTTP but server returned text/event-stream. Try switching to SSE.')
            }
          }

          return Response.json({
            ok: status >= 200 && status < 300,
            steps,
            diagnosis,
            latencyMs: primaryResult.latencyMs,
            server: {
              name: row.name,
              url: row.url,
              transport: row.transport,
              authType: row.authType,
              hasToken,
              suggestedTransport,
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
              hasToken,
              origin,
            },
          })
        }
      },
    },
  },
})
