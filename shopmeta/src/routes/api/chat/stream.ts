// src/routes/api/chat/stream.ts
// Chat streaming API route - handles POST /api/chat/stream.
// Returns SSE response with AI-generated text chunks.
// Compatible with assistant-ui's ChatModelAdapter streaming format.
//
// MCP integration:
//   When agentId + orgId are provided, the route loads the agent's attached
//   MCP servers from the DB catalog, resolves auth headers (API key / OAuth
//   with automatic token refresh), and passes the configured server list to
//   the AI agent loop for tool discovery.

import { createFileRoute } from '@tanstack/react-router'
import { getAdapter } from '#/lib/ai/providers'
import { chat, toServerSentEventsResponse } from '@tanstack/ai'
import { maxIterations, untilFinishReason, combineStrategies } from '@tanstack/ai'
import { z } from 'zod'
import { compileSystemPrompt } from '#/lib/ai/compile-system-prompt'

const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system']),
      content: z.union([
        z.string(),
        z.array(z.object({ type: z.string(), text: z.string().optional() })),
      ]),
    }),
  ).min(1),
  model: z.string().default('gpt-4o'),
  provider: z.string().default('openai'),
  conversationId: z.string().uuid().optional(),
  systemInstructions: z.string().optional(),
  agentId: z.string().uuid().optional(),
  orgId: z.string().optional(),
})

export const Route = createFileRoute('/api/chat/stream')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        let parsed: z.infer<typeof ChatRequestSchema>
        try {
          parsed = ChatRequestSchema.parse(body)
        } catch (err) {
          return new Response(JSON.stringify({ error: 'Invalid request', details: String(err) }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // If the client didn't send orgId, resolve it server-side from the session.
        // This makes MCP loading reliable even when the client-side listAgents call
        // fails or the user hasn't configured a default agent yet.
        if (!parsed.orgId) {
          try {
            const { requireOrgSession } = await import('#/lib/auth/require-org-session')
            const { orgId } = await requireOrgSession()
            parsed = { ...parsed, orgId }
          } catch {
            // Session unavailable or no org — MCP will be skipped gracefully
          }
        }

        let adapter: ReturnType<typeof getAdapter>
        try {
          adapter = getAdapter(parsed.provider, parsed.model)
        } catch (err) {
          return new Response(JSON.stringify({ error: String(err) }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // -- MCP Integration ----------------------------------------------------
        // Load MCP servers from the DB catalog in two passes:
        //   1. Trusted org-wide servers  — always injected (requires only orgId)
        //   2. Agent-specific servers    — additionally injected when agentId is set
        //
        // "Trusted" is the user's explicit signal that a server is safe to use in
        // all conversations.  The agent layer is a fine-grained override/extension.
        let mcpTools: unknown[] = []
        let mcpClients: Awaited<ReturnType<typeof import('@tanstack/ai-mcp').createMCPClients>> | undefined

        if (parsed.orgId) {
          try {
            const { getDb } = await import('#/lib/db/index')
            const { mcpServers, agentMcpServers } = await import('#/lib/db/schema')
            const { eq, and, or, inArray } = await import('drizzle-orm')
            const { mcpRowToClientOptions } = await import('#/lib/mcp-client-options.server')
            const { createMCPClients, MCPConnectionError, DuplicateToolNameError } = await import('@tanstack/ai-mcp')

            const db = getDb()

            // 1. Trusted servers for this org (org-wide, always available)
            const trustedRows = await db
              .select()
              .from(mcpServers)
              .where(
                and(
                  eq(mcpServers.orgId, parsed.orgId),
                  eq(mcpServers.trusted, true),
                )
              )

            // 2. Agent-specific servers (union, deduped by id)
            let agentRows: typeof trustedRows = []
            if (parsed.agentId) {
              const allAgentRows = await db
                .select({
                  id: mcpServers.id,
                  orgId: mcpServers.orgId,
                  name: mcpServers.name,
                  serverName: mcpServers.serverName,
                  url: mcpServers.url,
                  transport: mcpServers.transport,
                  description: mcpServers.description,
                  iconUrl: mcpServers.iconUrl,
                  authType: mcpServers.authType,
                  authConfig: mcpServers.authConfig,
                  oauthClientInfo: mcpServers.oauthClientInfo,
                  oauthState: mcpServers.oauthState,
                  trusted: mcpServers.trusted,
                  createdAt: mcpServers.createdAt,
                  updatedAt: mcpServers.updatedAt,
                })
                .from(agentMcpServers)
                .innerJoin(mcpServers, eq(agentMcpServers.mcpServerId, mcpServers.id))
                .where(
                  and(
                    eq(agentMcpServers.agentId, parsed.agentId),
                    eq(mcpServers.orgId, parsed.orgId),
                  )
                )
              // Exclude servers already in trustedRows (dedup by id)
              const trustedIds = new Set(trustedRows.map((r) => r.id))
              agentRows = allAgentRows.filter((r) => !trustedIds.has(r.id))
            }

            const rows = [...trustedRows, ...agentRows]

            if (rows.length > 0) {
              // Derive the redirect URL from the public-facing origin.
              // getPublicOrigin() honours x-forwarded-proto so the redirect_uri
              // is https:// in production (behind a reverse proxy) and http://
              // on localhost dev — matching what oauth-start registered.
              const { getPublicOrigin } = await import('#/lib/get-origin')
              const origin = getPublicOrigin(request)
              const redirectUrl = `${origin}/api/mcp/oauth-callback`

              // Build MCPClientOptions for each server. For OAuth servers, the
              // transport's authProvider handles token injection + refresh on 401.
              const clientOptionsMap: Record<string, import('@tanstack/ai-mcp').MCPClientOptions> = {}
              for (const row of rows) {
                const mcpRow: import('#/lib/mcp-servers').McpServerRow = {
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
                const opts = mcpRowToClientOptions(mcpRow, parsed.orgId!, redirectUrl)
                const key = (opts.prefix ?? mcpRow.serverName) || mcpRow.name
                clientOptionsMap[key] = opts
              }

              try {
                // Create MCP client pool. SDK handles transport lifecycle.
                mcpClients = await createMCPClients(clientOptionsMap)
                mcpTools = await mcpClients.tools()
                console.log(
                  `[chat/stream] MCP loaded: ${mcpTools.length} tools from ${rows.length} servers`,
                  rows.map((r) => r.name),
                )
              } catch (err) {
                if (err instanceof DuplicateToolNameError) {
                  // Two MCP servers expose a tool with the same prefixed name
                  console.error('[chat/stream] Duplicate MCP tool name:', err.toolName)
                } else if (err instanceof MCPConnectionError) {
                  // One or more MCP servers failed to connect (OAuth failure, network, etc.)
                  const causeMsg = err.cause instanceof Error
                    ? err.cause.message
                    : err.cause != null ? String(err.cause) : '(no cause)'
                  console.error(
                    '[chat/stream] MCP connection error:', err.message,
                    '| cause:', causeMsg,
                    '| servers:', Object.keys(clientOptionsMap).join(', '),
                  )
                  if (err.cause instanceof Error && err.cause.stack) {
                    console.error('[chat/stream] MCP cause stack:', err.cause.stack)
                  }
                } else {
                  throw err
                }
              }
            } else {
              console.log('[chat/stream] No MCP servers configured for org:', parsed.orgId)
            }
          } catch (err) {
            // Log but don't crash - degrade gracefully to no-MCP mode
            console.error('[chat/stream] MCP init failed:', err instanceof Error ? err.message : String(err))
          }
        }

        // -- System prompt ------------------------------------------------------
        // Split out system messages vs conversation messages
        const systemMessages = parsed.messages.filter((m) => m.role === 'system')
        const conversationMessages = parsed.messages.filter((m) => m.role !== 'system')

        // Base instructions: check system messages in the request first,
        // then fall back to any client-sent systemInstructions field.
        const clientBasePrompt = systemMessages.map((m) =>
          typeof m.content === 'string' ? m.content : m.content.map((p) => p.text ?? '').join('')
        ).join('\n') || parsed.systemInstructions || ''

        // Load the agent's systemInstructions from the DB if an agentId was provided.
        // The client only sends the agentId — the actual instructions live in the DB.
        let agentSystemInstructions = ''
        if (parsed.agentId && parsed.orgId) {
          try {
            const { getDb } = await import('#/lib/db/index')
            const { agents } = await import('#/lib/db/schema')
            const { eq, and } = await import('drizzle-orm')
            const db = getDb()
            const [agentRow] = await db
              .select({ systemInstructions: agents.systemInstructions })
              .from(agents)
              .where(
                and(
                  eq(agents.id, parsed.agentId),
                  eq(agents.orgId, parsed.orgId),
                )
              )
              .limit(1)
            agentSystemInstructions = agentRow?.systemInstructions ?? ''
            if (agentSystemInstructions) {
              console.log(`[chat/stream] Loaded agent system instructions (${agentSystemInstructions.length} chars) for agent ${parsed.agentId}`)
            }
          } catch (err) {
            console.error('[chat/stream] Failed to load agent system instructions:', err instanceof Error ? err.message : String(err))
          }
        }

        // Merge: agent instructions take precedence, then any client-sent base prompt.
        // If both exist, agent instructions come first so they set the persona/scope.
        const baseSystemPrompt = [agentSystemInstructions, clientBasePrompt].filter(Boolean).join('\n\n')

        // Compile skills into system prompt
        const systemPrompt = parsed.orgId
          ? await compileSystemPrompt(parsed.agentId ?? null, parsed.orgId, baseSystemPrompt)
          : baseSystemPrompt

        const messages = conversationMessages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: typeof m.content === 'string'
            ? [{ type: 'text' as const, content: m.content }]
            : m.content.map((p) => ({ type: 'text' as const, content: p.text ?? '' })),
        }))

        // -- Agent loop ---------------------------------------------------------
        // Prepend system prompt as a system message
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allMessages: any[] = systemPrompt
          ? [{ role: 'system', content: systemPrompt }, ...messages]
          : messages

        const stream = chat({
          adapter,
          messages: allMessages,
          tools: mcpTools.length > 0 ? (mcpTools as Parameters<typeof chat>[0]['tools']) : undefined,
          agentLoopStrategy: combineStrategies([
            maxIterations(15),
            untilFinishReason(['stop', 'length']),
          ]),
        })

        // Clean up MCP connections when stream finishes
        // AsyncIterable from @tanstack/ai doesn't have .finally - wrap it
        async function* withMcpCleanup() {
          try {
            for await (const chunk of stream) {
              yield chunk
            }
          } finally {
            if (mcpClients) {
              await mcpClients.close().catch(() => {})
            }
          }
        }

        return toServerSentEventsResponse(mcpClients ? withMcpCleanup() : stream)

        } catch (err) {
          // Top-level catch — prevents TanStack Start from producing an opaque
          // {"status":500,"unhandled":true,"message":"HTTPError"} response.
          // Log the real error so we can diagnose it from server logs.
          const errName = err instanceof Error ? err.constructor.name : typeof err
          const errMsg = err instanceof Error ? err.message : String(err)
          const errStack = err instanceof Error ? err.stack : undefined
          console.error(`[chat/stream] Unhandled error (${errName}):`, errMsg)
          if (errStack) console.error('[chat/stream] Stack:', errStack)
          return new Response(
            JSON.stringify({ error: errMsg, errorType: errName }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
      },
    },
  },
})

