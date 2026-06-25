// tests/integration/db/seed.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { eq } from 'drizzle-orm'
import postgres from 'postgres'
import * as schema from '#/lib/db/schema'
import {
  conversations,
  messages,
  agents,
  connections,
  dashboards,
  widgets,
  usageRecords,
} from '#/lib/db/schema'

let container: StartedPostgreSqlContainer
let client: ReturnType<typeof postgres>
let db: ReturnType<typeof drizzle>

// Test data constants
const TEST_USER_ID = 'user_test_123'
const TEST_ORG_ID = 'org_test_456'

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start()
  const connectionString = container.getConnectionUri()
  client = postgres(connectionString)
  db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
}, 120_000)

afterAll(async () => {
  await client.end()
  await container.stop()
})

describe('Seed data inserts correctly', () => {
  describe('conversations CRUD', () => {
    let conversationId: string

    test('can insert a conversation', async () => {
      const [inserted] = await db
        .insert(conversations)
        .values({
          userId: TEST_USER_ID,
          orgId: TEST_ORG_ID,
          title: 'Test Conversation',
          model: 'gpt-4o',
        })
        .returning()

      expect(inserted).toBeDefined()
      expect(inserted!.id).toBeDefined()
      expect(inserted!.userId).toBe(TEST_USER_ID)
      expect(inserted!.orgId).toBe(TEST_ORG_ID)
      expect(inserted!.title).toBe('Test Conversation')
      conversationId = inserted!.id
    })

    test('can select a conversation by id', async () => {
      const [found] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))

      expect(found).toBeDefined()
      expect(found!.id).toBe(conversationId)
      expect(found!.userId).toBe(TEST_USER_ID)
    })

    test('can select conversations by userId', async () => {
      const results = await db
        .select()
        .from(conversations)
        .where(eq(conversations.userId, TEST_USER_ID))

      expect(results.length).toBeGreaterThan(0)
      expect(results.every(c => c.userId === TEST_USER_ID)).toBe(true)
    })

    describe('messages CRUD', () => {
      let messageId: string

      test('can insert a message into a conversation', async () => {
        const [inserted] = await db
          .insert(messages)
          .values({
            conversationId: conversationId,
            role: 'user',
            content: { type: 'text', text: 'Hello, ShopMeta!' },
          })
          .returning()

        expect(inserted).toBeDefined()
        expect(inserted!.conversationId).toBe(conversationId)
        expect(inserted!.role).toBe('user')
        messageId = inserted!.id
      })

      test('can insert an assistant message', async () => {
        const [inserted] = await db
          .insert(messages)
          .values({
            conversationId: conversationId,
            role: 'assistant',
            content: { type: 'text', text: 'Hello! How can I help?' },
            metrics: { tokens: 10, elapsed: 500 },
          })
          .returning()

        expect(inserted).toBeDefined()
        expect(inserted!.role).toBe('assistant')
        expect(inserted!.metrics).toEqual({ tokens: 10, elapsed: 500 })
      })

      test('can select messages by conversationId', async () => {
        const result = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conversationId))

        expect(result.length).toBe(2)
        expect(result.map(m => m.role).sort()).toEqual(['assistant', 'user'])
      })

      test('cascade deletes messages when conversation is deleted', async () => {
        // Create a throwaway conversation
        const [tmpConversation] = await db
          .insert(conversations)
          .values({ userId: TEST_USER_ID, orgId: TEST_ORG_ID, title: 'Temp' })
          .returning()

        const [tmpMessage] = await db
          .insert(messages)
          .values({
            conversationId: tmpConversation!.id,
            role: 'user',
            content: { type: 'text', text: 'temp' },
          })
          .returning()

        // Delete the conversation
        await db.delete(conversations).where(eq(conversations.id, tmpConversation!.id))

        // Message should be gone
        const remaining = await db
          .select()
          .from(messages)
          .where(eq(messages.id, tmpMessage!.id))

        expect(remaining.length).toBe(0)
      })
    })
  })

  describe('agents CRUD', () => {
    let agentId: string

    test('can insert an agent', async () => {
      const [inserted] = await db
        .insert(agents)
        .values({
          orgId: TEST_ORG_ID,
          name: 'ClickHouse Analyst',
          model: 'gpt-4o',
          provider: 'openai',
          systemInstructions: 'You are a ClickHouse data analyst.',
          isDefault: true,
        })
        .returning()

      expect(inserted).toBeDefined()
      expect(inserted!.name).toBe('ClickHouse Analyst')
      expect(inserted!.provider).toBe('openai')
      expect(inserted!.isDefault).toBe(true)
      agentId = inserted!.id
    })

    test('can select an agent by id', async () => {
      const [found] = await db
        .select()
        .from(agents)
        .where(eq(agents.id, agentId))

      expect(found).toBeDefined()
      expect(found!.id).toBe(agentId)
    })
  })

  describe('connections CRUD', () => {
    let connectionId: string

    test('can insert a connection', async () => {
      const [inserted] = await db
        .insert(connections)
        .values({
          orgId: TEST_ORG_ID,
          name: 'Production ClickHouse',
          host: 'abc123.us-east-1.aws.clickhouse.cloud',
          port: 8443,
          database: 'default',
          username: 'default',
          encryptedPassword: 'enc:abc123xyz',
          isDefault: true,
        })
        .returning()

      expect(inserted).toBeDefined()
      expect(inserted!.name).toBe('Production ClickHouse')
      expect(inserted!.host).toBe('abc123.us-east-1.aws.clickhouse.cloud')
      expect(inserted!.port).toBe(8443)
      connectionId = inserted!.id
    })

    test('can select a connection by orgId', async () => {
      const result = await db
        .select()
        .from(connections)
        .where(eq(connections.orgId, TEST_ORG_ID))

      expect(result.length).toBeGreaterThan(0)
    })

    describe('dashboards + widgets CRUD', () => {
      let dashboardId: string

      test('can insert a dashboard', async () => {
        const [inserted] = await db
          .insert(dashboards)
          .values({
            orgId: TEST_ORG_ID,
            createdBy: TEST_USER_ID,
            name: 'Sales Overview',
            description: 'Key sales metrics',
            isDefault: true,
          })
          .returning()

        expect(inserted).toBeDefined()
        expect(inserted!.name).toBe('Sales Overview')
        expect(inserted!.orgId).toBe(TEST_ORG_ID)
        dashboardId = inserted!.id
      })

      test('can insert a widget into a dashboard', async () => {
        const [inserted] = await db
          .insert(widgets)
          .values({
            dashboardId: dashboardId,
            name: 'Revenue by Day',
            type: 'chart',
            sql: "SELECT toDate(created_at) AS day, sum(revenue) AS revenue FROM orders GROUP BY day ORDER BY day",
            chartConfig: { chartType: 'line', xAxis: 'day', yAxis: ['revenue'] },
            connectionId: connectionId,
          })
          .returning()

        expect(inserted).toBeDefined()
        expect(inserted!.name).toBe('Revenue by Day')
        expect(inserted!.type).toBe('chart')
        expect(inserted!.dashboardId).toBe(dashboardId)
      })

      test('can select widgets by dashboardId', async () => {
        const result = await db
          .select()
          .from(widgets)
          .where(eq(widgets.dashboardId, dashboardId))

        expect(result.length).toBeGreaterThan(0)
        expect(result[0]!.type).toBe('chart')
      })

      test('cascade deletes widgets when dashboard is deleted', async () => {
        const [tmpDashboard] = await db
          .insert(dashboards)
          .values({
            orgId: TEST_ORG_ID,
            createdBy: TEST_USER_ID,
            name: 'Temp Dashboard',
          })
          .returning()

        const [tmpWidget] = await db
          .insert(widgets)
          .values({
            dashboardId: tmpDashboard!.id,
            name: 'Temp Widget',
            type: 'kpi',
            sql: 'SELECT 1',
          })
          .returning()

        await db.delete(dashboards).where(eq(dashboards.id, tmpDashboard!.id))

        const remaining = await db
          .select()
          .from(widgets)
          .where(eq(widgets.id, tmpWidget!.id))

        expect(remaining.length).toBe(0)
      })
    })
  })

  describe('usageRecords CRUD', () => {
    test('can insert a usage record', async () => {
      const [inserted] = await db
        .insert(usageRecords)
        .values({
          userId: TEST_USER_ID,
          orgId: TEST_ORG_ID,
          model: 'gpt-4o',
          inputTokens: 150,
          outputTokens: 320,
        })
        .returning()

      expect(inserted).toBeDefined()
      expect(inserted!.userId).toBe(TEST_USER_ID)
      expect(inserted!.model).toBe('gpt-4o')
      expect(inserted!.inputTokens).toBe(150)
      expect(inserted!.outputTokens).toBe(320)
    })

    test('can query usage records by user', async () => {
      const result = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.userId, TEST_USER_ID))

      expect(result.length).toBeGreaterThan(0)
    })
  })
})
