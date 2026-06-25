// app/lib/db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

function getDatabaseUrl(): string {
  const url = process.env['DATABASE_URL']
  if (!url) {
    throw new Error(
      'DATABASE_URL environment variable is required but not set. ' +
      'Please set DATABASE_URL to a valid PostgreSQL connection string, ' +
      'e.g. postgresql://user:password@localhost:5432/shopmeta',
    )
  }
  return url
}

const connectionString = getDatabaseUrl()
const client = postgres(connectionString)

export const db = drizzle(client, { schema })

export type Database = typeof db
