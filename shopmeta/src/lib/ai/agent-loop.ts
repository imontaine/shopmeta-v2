// src/lib/ai/agent-loop.ts
// Agent loop utilities for running multi-step tool-calling conversations.
// Provides a standalone executeAgentLoop() for server-side use and
// max iterations guard logic.
//
// KEY: @tanstack/ai strategies are plain functions:
//   AgentLoopStrategy = (state: AgentLoopState) => boolean
// state shape: { iterationCount: number; finishReason?: string; messages: []; usage: {} }

import { chat, maxIterations, untilFinishReason, combineStrategies } from '@tanstack/ai'
import { getAdapter } from '#/lib/ai/providers'
import type { MCPClients } from '@tanstack/ai-mcp'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentLoopOptions {
  provider: string
  model: string
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool'
    content: Array<{ type: string; [key: string]: unknown }> | string
  }>
  systemInstructions?: string
  /** Maximum number of agent loop iterations. Default: 15 */
  maxIterationsCount?: number
  /** MCP client pool (optional) */
  mcpClients?: MCPClients
}

export interface AgentLoopResult {
  /** Whether the loop completed successfully */
  success: boolean
  /** Number of iterations executed */
  iterations: number
  /** Whether the loop was stopped by the max iterations guard */
  hitMaxIterations: boolean
  /** Final text response (if any) */
  text?: string
  /** Error message (if loop failed) */
  error?: string
}

// ─── Agent Loop Execution ─────────────────────────────────────────────────────

/**
 * Executes a full agent loop with tool calling support.
 * Automatically stops after maxIterationsCount iterations.
 *
 * @returns AgentLoopResult with iteration count and final text.
 */
export async function executeAgentLoop(options: AgentLoopOptions): Promise<AgentLoopResult> {
  const {
    provider,
    model,
    messages,
    systemInstructions,
    maxIterationsCount = 15,
    mcpClients,
  } = options

  const adapter = getAdapter(provider, model)
  let iterationsRun = 0
  let hitMaxIterations = false

  // Track the final iterationCount from the strategy
  const maxIter = maxIterationsCount
  const trackingStrategy = (state: { iterationCount: number; finishReason?: string }) => {
    iterationsRun = state.iterationCount
    if (state.iterationCount >= maxIter) {
      hitMaxIterations = true
      return false
    }
    return true
  }

  try {
    // Get MCP tools if available
    let tools: Parameters<typeof chat>[0]['tools']
    if (mcpClients) {
      const mcpTools = await mcpClients.tools()
      tools = mcpTools as Parameters<typeof chat>[0]['tools']
    }

    const stream = chat({
      adapter,
      messages: messages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string'
          ? [{ type: 'text' as const, text: m.content }]
          : (m.content as Array<{ type: string; [key: string]: unknown }>),
      })),
      system: systemInstructions,
      tools,
      // Use a custom tracking strategy combined with the finish reason strategy
      agentLoopStrategy: combineStrategies([
        trackingStrategy,
        untilFinishReason(['stop', 'length']),
      ]),
    })

    // Collect the full text response
    let fullText = ''
    for await (const chunk of stream) {
      if (typeof chunk === 'object' && chunk !== null && 'type' in chunk) {
        const typedChunk = chunk as { type: string; text?: string }
        if (typedChunk.type === 'text' && typedChunk.text) {
          fullText += typedChunk.text
        }
      }
    }

    return {
      success: true,
      iterations: iterationsRun,
      hitMaxIterations,
      text: fullText || undefined,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      iterations: iterationsRun,
      hitMaxIterations,
      error: message,
    }
  }
}

// ─── Max Iterations Guard ─────────────────────────────────────────────────────

/**
 * Creates a strategy that stops after N iterations.
 * Wraps @tanstack/ai's built-in maxIterations for testability.
 *
 * Returns a plain function: (state: AgentLoopState) => boolean
 * where AgentLoopState.iterationCount is the 0-indexed iteration count.
 * The strategy returns false (stop) when iterationCount >= limit.
 */
export function createMaxIterationsGuard(limit: number) {
  return maxIterations(limit)
}

/**
 * Creates the combined strategy used in production.
 *
 * Returns a plain function that combines maxIterations AND untilFinishReason.
 */
export function createProductionStrategy(iterLimit = 15) {
  return combineStrategies([
    maxIterations(iterLimit),
    untilFinishReason(['stop', 'length']),
  ])
}
