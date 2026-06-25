import { defineConfig } from 'drizzle-kit'

const databaseUrl = process.env['DATABASE_URL']

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required for drizzle-kit. ' +
    'Set it in your .env file or environment before running migrations.'
  )
}

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  verbose: true,
  strict: false,
})
