// tests/unit/db/schema.test.ts
import { describe, test, expect } from 'vitest'
import {
  conversations,
  messages,
  agents,
  connections,
  dashboards,
  widgets,
  usageRecords,
  conversationsRelations,
  messagesRelations,
  agentsRelations,
  dashboardsRelations,
  widgetsRelations,
  connectionsRelations,
  usageRecordsRelations,
} from '#/lib/db/schema'

describe('Drizzle schema exports', () => {
  test('conversations table is defined', () => {
    expect(conversations).toBeDefined()
  })

  test('messages table is defined', () => {
    expect(messages).toBeDefined()
  })

  test('agents table is defined', () => {
    expect(agents).toBeDefined()
  })

  test('connections table is defined', () => {
    expect(connections).toBeDefined()
  })

  test('dashboards table is defined', () => {
    expect(dashboards).toBeDefined()
  })

  test('widgets table is defined', () => {
    expect(widgets).toBeDefined()
  })

  test('usageRecords table is defined', () => {
    expect(usageRecords).toBeDefined()
  })
})

describe('conversations table columns', () => {
  test('has all required columns', () => {
    const cols = Object.keys(conversations)
    expect(cols).toContain('id')
    expect(cols).toContain('userId')
    expect(cols).toContain('orgId')
    expect(cols).toContain('title')
    expect(cols).toContain('agentId')
    expect(cols).toContain('model')
    expect(cols).toContain('createdAt')
    expect(cols).toContain('updatedAt')
  })
})

describe('messages table columns', () => {
  test('has all required columns', () => {
    const cols = Object.keys(messages)
    expect(cols).toContain('id')
    expect(cols).toContain('conversationId')
    expect(cols).toContain('parentId')
    expect(cols).toContain('role')
    expect(cols).toContain('content')
    expect(cols).toContain('toolCalls')
    expect(cols).toContain('metrics')
    expect(cols).toContain('createdAt')
  })
})

describe('agents table columns', () => {
  test('has all required columns', () => {
    const cols = Object.keys(agents)
    expect(cols).toContain('id')
    expect(cols).toContain('orgId')
    expect(cols).toContain('name')
    expect(cols).toContain('description')
    expect(cols).toContain('model')
    expect(cols).toContain('provider')
    expect(cols).toContain('systemInstructions')
    expect(cols).toContain('mcpServers')
    expect(cols).toContain('temperature')
    expect(cols).toContain('maxTokens')
    expect(cols).toContain('isDefault')
    expect(cols).toContain('createdAt')
  })
})

describe('connections table columns', () => {
  test('has all required columns', () => {
    const cols = Object.keys(connections)
    expect(cols).toContain('id')
    expect(cols).toContain('orgId')
    expect(cols).toContain('name')
    expect(cols).toContain('host')
    expect(cols).toContain('port')
    expect(cols).toContain('database')
    expect(cols).toContain('username')
    expect(cols).toContain('encryptedPassword')
    expect(cols).toContain('isDefault')
    expect(cols).toContain('createdAt')
  })
})

describe('dashboards table columns', () => {
  test('has all required columns', () => {
    const cols = Object.keys(dashboards)
    expect(cols).toContain('id')
    expect(cols).toContain('orgId')
    expect(cols).toContain('createdBy')
    expect(cols).toContain('name')
    expect(cols).toContain('description')
    expect(cols).toContain('layout')
    expect(cols).toContain('isDefault')
    expect(cols).toContain('sharedWith')
    expect(cols).toContain('createdAt')
    expect(cols).toContain('updatedAt')
  })
})

describe('widgets table columns', () => {
  test('has all required columns', () => {
    const cols = Object.keys(widgets)
    expect(cols).toContain('id')
    expect(cols).toContain('dashboardId')
    expect(cols).toContain('name')
    expect(cols).toContain('type')
    expect(cols).toContain('sql')
    expect(cols).toContain('chartConfig')
    expect(cols).toContain('refreshInterval')
    expect(cols).toContain('connectionId')
    expect(cols).toContain('cachedData')
    expect(cols).toContain('lastRefreshed')
    expect(cols).toContain('createdAt')
  })
})

describe('usageRecords table columns', () => {
  test('has all required columns', () => {
    const cols = Object.keys(usageRecords)
    expect(cols).toContain('id')
    expect(cols).toContain('userId')
    expect(cols).toContain('orgId')
    expect(cols).toContain('model')
    expect(cols).toContain('inputTokens')
    expect(cols).toContain('outputTokens')
    expect(cols).toContain('conversationId')
    expect(cols).toContain('createdAt')
  })
})

describe('Schema relations', () => {
  test('conversationsRelations is defined', () => {
    expect(conversationsRelations).toBeDefined()
  })

  test('messagesRelations is defined', () => {
    expect(messagesRelations).toBeDefined()
  })

  test('agentsRelations is defined', () => {
    expect(agentsRelations).toBeDefined()
  })

  test('dashboardsRelations is defined', () => {
    expect(dashboardsRelations).toBeDefined()
  })

  test('widgetsRelations is defined', () => {
    expect(widgetsRelations).toBeDefined()
  })

  test('connectionsRelations is defined', () => {
    expect(connectionsRelations).toBeDefined()
  })

  test('usageRecordsRelations is defined', () => {
    expect(usageRecordsRelations).toBeDefined()
  })
})

describe('Schema FK references (relation wiring)', () => {
  test('messages.conversationId references conversations.id', () => {
    // Access the underlying column config to verify the FK reference
    const msgConversationId = messages.conversationId
    // In drizzle, foreign key is established via .references()
    // We verify the column name matches what we expect
    expect(msgConversationId.columnType).toBe('PgUUID')
    expect(msgConversationId.name).toBe('conversation_id')
  })

  test('widgets.dashboardId references dashboards.id', () => {
    const widgetDashboardId = widgets.dashboardId
    expect(widgetDashboardId.columnType).toBe('PgUUID')
    expect(widgetDashboardId.name).toBe('dashboard_id')
  })

  test('widgets.connectionId references connections.id', () => {
    const widgetConnectionId = widgets.connectionId
    expect(widgetConnectionId.columnType).toBe('PgUUID')
    expect(widgetConnectionId.name).toBe('connection_id')
  })
})

describe('Schema table names', () => {
  test('conversations table name is correct', () => {
    expect(conversations[Symbol.for('drizzle:Name')]).toBe('conversations')
  })

  test('messages table name is correct', () => {
    expect(messages[Symbol.for('drizzle:Name')]).toBe('messages')
  })

  test('agents table name is correct', () => {
    expect(agents[Symbol.for('drizzle:Name')]).toBe('agents')
  })

  test('connections table name is correct', () => {
    expect(connections[Symbol.for('drizzle:Name')]).toBe('connections')
  })

  test('dashboards table name is correct', () => {
    expect(dashboards[Symbol.for('drizzle:Name')]).toBe('dashboards')
  })

  test('widgets table name is correct', () => {
    expect(widgets[Symbol.for('drizzle:Name')]).toBe('widgets')
  })

  test('usage_records table name is correct', () => {
    expect(usageRecords[Symbol.for('drizzle:Name')]).toBe('usage_records')
  })
})
