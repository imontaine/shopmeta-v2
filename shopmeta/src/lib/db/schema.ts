// app/lib/db/schema.ts
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  index,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// ─── Better Auth tables ───────────────────────────
// These must be in the schema so drizzleAdapter can map model names to tables.
// Column names match the raw SQL in drizzle/0001_better_auth_and_organizations.sql.

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const organization = pgTable('organization', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').unique(),
  logo: text('logo'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  metadata: text('metadata'),
})

export const member = pgTable('member', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const invitation = pgTable('invitation', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role'),
  status: text('status').notNull().default('pending'),
  expiresAt: timestamp('expires_at').notNull(),
  inviterId: text('inviter_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
})

// ─── Conversations ────────────────────────────────
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(), // Better Auth user ID
    orgId: text('org_id').notNull(), // Organization (tenant)
    agentId: uuid('agent_id'), // Which agent config
    title: text('title').default('New Chat'),
    model: text('model'), // e.g. 'gpt-4o', 'claude-sonnet-4-6'
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('conversations_user_id_idx').on(table.userId),
    index('conversations_org_id_idx').on(table.orgId),
    index('conversations_created_at_idx').on(table.createdAt),
  ],
)

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    parentId: uuid('parent_id'), // Branching support
    role: text('role').notNull(), // user | assistant | tool
    content: jsonb('content').notNull(), // TanStack AI message parts
    toolCalls: jsonb('tool_calls'), // Tool call metadata
    metrics: jsonb('metrics'), // { tokens, elapsed, etc. }
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('messages_conversation_id_idx').on(table.conversationId),
    index('messages_created_at_idx').on(table.createdAt),
  ],
)

// ─── Agents ───────────────────────────────────────
export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    model: text('model').notNull(), // Default model
    provider: text('provider').notNull(), // openai | anthropic | google
    systemInstructions: text('system_instructions'),
    mcpServers: jsonb('mcp_servers'), // [{ name, url, transport }]
    temperature: integer('temperature'),
    maxTokens: integer('max_tokens'),
    isDefault: boolean('is_default').default(false),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('agents_org_id_idx').on(table.orgId),
    index('agents_is_default_idx').on(table.isDefault),
  ],
)

// ─── Tenant Connections ───────────────────────────
// Note: widgets references connections, so connections must be defined first
export const connections = pgTable(
  'connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id').notNull(),
    name: text('name').notNull(), // "Production CH", "Staging"
    host: text('host').notNull(),
    port: integer('port').default(8443),
    database: text('database').notNull(),
    username: text('username').notNull(),
    encryptedPassword: text('encrypted_password').notNull(),
    isDefault: boolean('is_default').default(false),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('connections_org_id_idx').on(table.orgId),
    index('connections_is_default_idx').on(table.isDefault),
  ],
)

// ─── Dashboard ────────────────────────────────────
export const dashboards = pgTable(
  'dashboards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id').notNull(),
    createdBy: text('created_by').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    layout: jsonb('layout'), // react-grid-layout format
    isDefault: boolean('is_default').default(false),
    sharedWith: jsonb('shared_with'), // User/team IDs
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => [
    index('dashboards_org_id_idx').on(table.orgId),
    index('dashboards_created_by_idx').on(table.createdBy),
    index('dashboards_is_default_idx').on(table.isDefault),
  ],
)

export const widgets = pgTable(
  'widgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dashboardId: uuid('dashboard_id')
      .notNull()
      .references(() => dashboards.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type').notNull(), // chart | table | kpi
    sql: text('sql').notNull(), // ClickHouse SQL query
    chartConfig: jsonb('chart_config'), // { chartType, xAxis, yAxis[], title }
    refreshInterval: integer('refresh_interval'), // seconds, null = manual
    connectionId: uuid('connection_id').references(() => connections.id),
    cachedData: jsonb('cached_data'),
    lastRefreshed: timestamp('last_refreshed'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('widgets_dashboard_id_idx').on(table.dashboardId),
    index('widgets_connection_id_idx').on(table.connectionId),
    index('widgets_type_idx').on(table.type),
  ],
)

// ─── Usage Tracking ───────────────────────────────
export const usageRecords = pgTable(
  'usage_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    orgId: text('org_id').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').default(0),
    outputTokens: integer('output_tokens').default(0),
    conversationId: uuid('conversation_id'),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => [
    index('usage_records_user_id_idx').on(table.userId),
    index('usage_records_org_id_idx').on(table.orgId),
    index('usage_records_model_idx').on(table.model),
    index('usage_records_created_at_idx').on(table.createdAt),
  ],
)

// ─── Relations ────────────────────────────────────
export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(messages),
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}))

export const agentsRelations = relations(agents, ({ many }) => ({
  conversations: many(conversations),
}))

export const dashboardsRelations = relations(dashboards, ({ many }) => ({
  widgets: many(widgets),
}))

export const widgetsRelations = relations(widgets, ({ one }) => ({
  dashboard: one(dashboards, {
    fields: [widgets.dashboardId],
    references: [dashboards.id],
  }),
  connection: one(connections, {
    fields: [widgets.connectionId],
    references: [connections.id],
  }),
}))

export const connectionsRelations = relations(connections, ({ many }) => ({
  widgets: many(widgets),
}))

export const usageRecordsRelations = relations(usageRecords, ({ one }) => ({
  conversation: one(conversations, {
    fields: [usageRecords.conversationId],
    references: [conversations.id],
  }),
}))
