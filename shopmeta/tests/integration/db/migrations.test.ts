// tests/integration/db/migrations.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { sql } from 'drizzle-orm'
import postgres from 'postgres'
import * as schema from '#/lib/db/schema'

let container: StartedPostgreSqlContainer
let client: ReturnType<typeof postgres>
let db: ReturnType<typeof drizzle>

beforeAll(async () => {
  // Start a fresh PostgreSQL container
  container = await new PostgreSqlContainer('postgres:17-alpine').start()
  
  const connectionString = container.getConnectionUri()
  client = postgres(connectionString)
  db = drizzle(client, { schema })

  // Run all migrations
  await migrate(db, { migrationsFolder: './drizzle' })
}, 120_000)

afterAll(async () => {
  await client.end()
  await container.stop()
})

describe('migrations create all tables', () => {
  async function getTableNames(): Promise<string[]> {
    const result = await db.execute(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    )
    return result.map((r: Record<string, unknown>) => r['tablename'] as string)
  }

  test('creates conversations table', async () => {
    const tables = await getTableNames()
    expect(tables).toContain('conversations')
  })

  test('creates messages table', async () => {
    const tables = await getTableNames()
    expect(tables).toContain('messages')
  })

  test('creates agents table', async () => {
    const tables = await getTableNames()
    expect(tables).toContain('agents')
  })

  test('creates connections table', async () => {
    const tables = await getTableNames()
    expect(tables).toContain('connections')
  })

  test('creates dashboards table', async () => {
    const tables = await getTableNames()
    expect(tables).toContain('dashboards')
  })

  test('creates widgets table', async () => {
    const tables = await getTableNames()
    expect(tables).toContain('widgets')
  })

  test('creates usage_records table', async () => {
    const tables = await getTableNames()
    expect(tables).toContain('usage_records')
  })
})

describe('migrations create indexes', () => {
  async function getIndexNames(): Promise<string[]> {
    const result = await db.execute(
      sql`SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`
    )
    return result.map((r: Record<string, unknown>) => r['indexname'] as string)
  }

  test('creates conversations_user_id_idx', async () => {
    const indexes = await getIndexNames()
    expect(indexes).toContain('conversations_user_id_idx')
  })

  test('creates conversations_org_id_idx', async () => {
    const indexes = await getIndexNames()
    expect(indexes).toContain('conversations_org_id_idx')
  })

  test('creates messages_conversation_id_idx', async () => {
    const indexes = await getIndexNames()
    expect(indexes).toContain('messages_conversation_id_idx')
  })

  test('creates widgets_dashboard_id_idx', async () => {
    const indexes = await getIndexNames()
    expect(indexes).toContain('widgets_dashboard_id_idx')
  })

  test('creates usage_records_user_id_idx', async () => {
    const indexes = await getIndexNames()
    expect(indexes).toContain('usage_records_user_id_idx')
  })
})

describe('migration runs without errors on fresh DB', () => {
  test('migration completes without throwing', async () => {
    // If we got here, migration succeeded (it was already run in beforeAll)
    const result = await db.execute(
      sql`SELECT COUNT(*) as count FROM pg_tables WHERE schemaname = 'public'`
    )
    const count = Number(result[0]?.['count'] ?? 0)
    expect(count).toBeGreaterThan(0)
  })
})
