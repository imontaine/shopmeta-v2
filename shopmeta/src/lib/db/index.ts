// src/lib/db/index.ts
// Lazy database connection — only initialized when getDb() is called.
// The `db` export is a getter-based facade that defers connection until first use.

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

type Database = ReturnType<typeof drizzle<typeof schema>>

let _db: Database | null = null

/**
 * Returns (or creates) the database instance.
 * Throws if DATABASE_URL is not set.
 */
export function getDb(): Database {
  if (_db) return _db

  const url = process.env['DATABASE_URL']
  if (!url) {
    throw new Error(
      'DATABASE_URL environment variable is required but not set. ' +
      'Please set DATABASE_URL to a valid PostgreSQL connection string, ' +
      'e.g. postgresql://user:password@localhost:5432/shopmeta',
    )
  }

  const client = postgres(url)
  _db = drizzle(client, { schema })
  return _db
}

/**
 * `db` is a convenience export that calls getDb() on first property access.
 * This allows `import { db } from '#/lib/db'` to work without eager initialization.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    const instance = getDb()
    const value = Reflect.get(instance, prop, receiver)
    // Bind functions to the actual db instance to preserve `this`
    if (typeof value === 'function') {
      return value.bind(instance)
    }
    return value
  },
  apply(_target, _thisArg, args) {
    return Reflect.apply(getDb() as unknown as (...a: unknown[]) => unknown, getDb(), args)
  },
})

export type { Database }
