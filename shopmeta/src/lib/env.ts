// src/lib/env.ts
// Environment configuration validation

interface RequiredEnvVars {
  DATABASE_URL: string
}

interface OptionalEnvVars {
  BETTER_AUTH_SECRET?: string
  BETTER_AUTH_URL?: string
  OPENAI_API_KEY?: string
  ANTHROPIC_API_KEY?: string
  GOOGLE_AI_API_KEY?: string
  ENCRYPTION_KEY?: string
  PORT?: string
  NODE_ENV?: string
}

export type Env = RequiredEnvVars & OptionalEnvVars

/**
 * Validates and returns required environment variables.
 * Throws a descriptive error if any required variable is missing.
 */
export function validateEnv(): Env {
  const required: (keyof RequiredEnvVars)[] = ['DATABASE_URL']
  const missing: string[] = []

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key)
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}.\n` +
      `Please set the following environment variables:\n` +
      missing.map((key) => `  - ${key}`).join('\n'),
    )
  }

  return {
    DATABASE_URL: process.env['DATABASE_URL']!,
    BETTER_AUTH_SECRET: process.env['BETTER_AUTH_SECRET'],
    BETTER_AUTH_URL: process.env['BETTER_AUTH_URL'],
    OPENAI_API_KEY: process.env['OPENAI_API_KEY'],
    ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'],
    GOOGLE_AI_API_KEY: process.env['GOOGLE_AI_API_KEY'],
    ENCRYPTION_KEY: process.env['ENCRYPTION_KEY'],
    PORT: process.env['PORT'],
    NODE_ENV: process.env['NODE_ENV'],
  }
}
