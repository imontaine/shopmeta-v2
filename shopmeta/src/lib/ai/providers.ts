// src/lib/ai/providers.ts
// TanStack AI provider configuration.
// Supports OpenAI, Anthropic, and Google adapters.
// Each model is a factory function — call it to get the adapter instance.

import { openaiText } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'

// ─── Provider / Model Registry ────────────────────────────────────────────────

export type ProviderKey = keyof typeof providers
export type ModelKey<P extends ProviderKey> = keyof (typeof providers)[P]

export const providers = {
  openai: {
    'gpt-4o': () => openaiText('gpt-4o'),
    'gpt-4o-mini': () => openaiText('gpt-4o-mini'),
    'o3': () => openaiText('o3'),
  },
  anthropic: {
    'claude-sonnet-4-6': () => anthropicText('claude-sonnet-4-6'),
    'claude-haiku-4-5': () => anthropicText('claude-haiku-4-5'),
  },
  // Google adapter — uses openaiText against the Gemini compatible endpoint
  // when @tanstack/ai-google is not yet available.
  google: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    'gemini-2.5-pro': () =>
      openaiText('gemini-2.5-pro' as any, {
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: process.env['GOOGLE_AI_API_KEY'] ?? '',
      }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    'gemini-2.5-flash': () =>
      openaiText('gemini-2.5-flash' as any, {
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: process.env['GOOGLE_AI_API_KEY'] ?? '',
      }),
  },
} as const

// ─── Metadata for UI ─────────────────────────────────────────────────────────

export interface ModelInfo {
  provider: ProviderKey
  model: string
  label: string
  description?: string
}

export const modelList: ModelInfo[] = [
  { provider: 'openai', model: 'gpt-4o', label: 'GPT-4o', description: 'Most capable OpenAI model' },
  { provider: 'openai', model: 'gpt-4o-mini', label: 'GPT-4o Mini', description: 'Faster, cheaper' },
  { provider: 'openai', model: 'o3', label: 'o3', description: 'Advanced reasoning' },
  { provider: 'anthropic', model: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', description: 'Balanced power and speed' },
  { provider: 'anthropic', model: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', description: 'Fastest Anthropic model' },
  { provider: 'google', model: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Google flagship model' },
  { provider: 'google', model: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Fast and efficient' },
]

// ─── Adapter factory ──────────────────────────────────────────────────────────

/**
 * Resolves the correct TanStack AI adapter for a given provider + model.
 *
 * @throws {Error} if the provider or model is not recognized.
 */
export function getAdapter(provider: string, model: string) {
  const providerModels = providers[provider as ProviderKey]
  if (!providerModels) {
    throw new Error(`Unknown AI provider: "${provider}". Valid providers: ${Object.keys(providers).join(', ')}`)
  }

  const factory = (providerModels as Record<string, () => ReturnType<typeof openaiText>>)[model]
  if (!factory) {
    throw new Error(
      `Unknown model: "${model}" for provider "${provider}". Valid models: ${Object.keys(providerModels).join(', ')}`,
    )
  }

  return factory()
}

// ─── Default model ────────────────────────────────────────────────────────────

export const DEFAULT_PROVIDER: ProviderKey = 'openai'
export const DEFAULT_MODEL = 'gpt-4o'
