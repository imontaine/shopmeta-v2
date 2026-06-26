// src/lib/ai/chat.ts
// Chat server function — streams AI responses via TanStack AI.
// Supports MCP multi-server tool calling with agent loop and max iterations guard.

import { createServerFn } from '@tanstack/react-start'
import { chat, maxIterations, untilFinishReason, combineStrategies, toServerSentEventsResponse } from '@tanstack/ai'
import { z } from 'zod'
import { getAdapter } from '#/lib/ai/providers'
import { createTenantMCPClients } from '#/lib/ai/mcp'
import type { MCPServerConfig } from '#/lib/ai/mcp'

// ─── Input Schema ─────────────────────────────────────────────────────────────

const MessagePartSchema = z.union([
  z.object({ type: z.literal('text'), text: z.string() }),
  z.object({ type: z.literal('image'), image: z.string() }),
  z.object({ type: z.literal('tool-call'), toolCallId: z.string(), toolName: z.string(), args: z.unknown() }),
  z.object({ type: z.literal('tool-result'), toolCallId: z.string(), toolName: z.string(), result: z.unknown() }),
])

const UIMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.union([
    z.string(),
    z.array(MessagePartSchema),
  ]),
})

const MCPServerConfigSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  transportType: z.enum(['http', 'sse']).optional(),
})

export const ChatInputSchema = z.object({
  messages: z.array(UIMessageSchema).min(1),
  model: z.string().default('gpt-4o'),
  provider: z.string().default('openai'),
  conversationId: z.string().uuid().optional(),
  systemInstructions: z.string().optional(),
  /** Max agent loop iterations. Defaults to 15. */
  maxIterationsCount: z.number().int().positive().max(50).default(15),
  /** MCP servers to connect for tool calling. */
  mcpServers: z.array(MCPServerConfigSchema).optional(),
  signal: z.instanceof(AbortSignal).optional(),
})

export type ChatInput = z.infer<typeof ChatInputSchema>

// ─── Server Function ──────────────────────────────────────────────────────────

/**
 * Streams AI chat responses as Server-Sent Events.
 * Supports MCP multi-server tool discovery and the full agent loop.
 * The client can abort via AbortController.
 */
export const streamChat = createServerFn({ method: 'POST' })
  .validator((data: unknown) => ChatInputSchema.parse(data))
  .handler(async ({ data }) => {
    const adapter = getAdapter(data.provider, data.model)

    // ── MCP Integration ────────────────────────────────────────────────────────
    // If MCP servers are configured, create a client pool and discover tools.
    // The pool auto-prefixes tools: clickhouse__list_tables, postgres__list_tables.
    let mcpClients: Awaited<ReturnType<typeof createTenantMCPClients>> | undefined
    let mcpTools: unknown[] = []

    if (data.mcpServers && data.mcpServers.length > 0) {
      try {
        mcpClients = await createTenantMCPClients(data.mcpServers as MCPServerConfig[])
        mcpTools = await mcpClients.tools()
      } catch (err) {
        // Log but don't crash — degrade gracefully to no-tool mode
        console.error('[chat] MCP client init failed:', err)
      }
    }

    // ── Agent Loop ─────────────────────────────────────────────────────────────
    const iterLimit = data.maxIterationsCount ?? 15

    const stream = chat({
      adapter,
      messages: data.messages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string'
          ? [{ type: 'text' as const, text: m.content }]
          : m.content,
      })),
      system: data.systemInstructions,
      // Merge MCP tools with any static tools if needed
      tools: mcpTools.length > 0 ? (mcpTools as Parameters<typeof chat>[0]['tools']) : undefined,
      agentLoopStrategy: combineStrategies([
        maxIterations(iterLimit),
        untilFinishReason(['stop', 'length']),
      ]),
    })

    // Clean up MCP connections when the stream ends
    if (mcpClients) {
      const clientsToClose = mcpClients
      stream.finally?.(() => clientsToClose.close().catch(() => {}))
    }

    return toServerSentEventsResponse(stream)
  })
