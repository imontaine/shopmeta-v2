# ShopMeta — Full TanStack Implementation Plan

> Magento Analytics SaaS: AI Chat + ClickHouse + Dashboard Builder

## The Stack

```
┌─────────────────────────────────────────────────────┐
│                    ShopMeta App                      │
├──────────────────┬──────────────────────────────────┤
│  FRAMEWORK       │  TanStack Start (RC)             │
│  ROUTING         │  TanStack Router (type-safe)     │
│  AI ENGINE       │  TanStack AI (beta)              │
│  DATA FETCHING   │  TanStack Query                  │
│  DATA TABLES     │  TanStack Table                  │
│  FORMS           │  TanStack Form                   │
│  VIRTUALIZATION  │  TanStack Virtual                │
│  CHAT UI         │  assistant-ui                    │
│  AUTH             │  Better Auth                     │
│  APP DATABASE    │  Drizzle ORM + PostgreSQL        │
│  ANALYTICS DB    │  @clickhouse/client              │
│  MCP             │  @tanstack/ai-mcp               │
│  CHARTS          │  Recharts                        │
│  DASHBOARD GRID  │  react-grid-layout               │
│  DESIGN SYSTEM   │  Shadcn/ui + Tailwind CSS v4     │
│  DEPLOYMENT      │  Docker (self-hosted)            │
└──────────────────┴──────────────────────────────────┘
```

All packages: **MIT or Apache 2.0**. Zero commercial licenses needed.

---

## Project Structure

```
shopmeta/
├── app/
│   ├── routes/
│   │   ├── __root.tsx                 # Root layout (sidebar + main)
│   │   ├── index.tsx                  # Landing / redirect to chat
│   │   ├── login.tsx                  # Auth pages
│   │   ├── register.tsx
│   │   ├── chat/
│   │   │   ├── route.tsx              # Chat layout (thread list + thread)
│   │   │   └── $conversationId.tsx    # Individual conversation
│   │   ├── dashboard/
│   │   │   ├── route.tsx              # Dashboard list
│   │   │   └── $dashboardId.tsx       # Dashboard view (grid layout)
│   │   ├── agents/
│   │   │   ├── route.tsx              # Agent list
│   │   │   └── $agentId.tsx           # Agent builder
│   │   ├── settings/
│   │   │   ├── route.tsx              # Settings layout
│   │   │   ├── connections.tsx        # ClickHouse connections
│   │   │   ├── team.tsx              # Team / org management
│   │   │   └── profile.tsx
│   │   └── admin/
│   │       ├── route.tsx              # Admin layout
│   │       ├── users.tsx
│   │       └── usage.tsx
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatLayout.tsx         # assistant-ui Thread + ThreadList
│   │   │   ├── ToolCallRenderer.tsx   # Custom MCP tool result renderer
│   │   │   ├── DataTableView.tsx      # TanStack Table for query results
│   │   │   ├── ChartView.tsx          # Recharts chart from data
│   │   │   ├── ChartConfigEditor.tsx  # Axis/type picker modal
│   │   │   ├── QueryStatsBar.tsx      # Elapsed, rows read, bytes
│   │   │   └── SaveToDashboard.tsx    # Save chart config button
│   │   ├── dashboard/
│   │   │   ├── DashboardGrid.tsx      # react-grid-layout wrapper
│   │   │   ├── Widget.tsx             # Individual widget container
│   │   │   ├── WidgetChart.tsx        # Chart widget
│   │   │   ├── WidgetTable.tsx        # Table widget
│   │   │   ├── WidgetKPI.tsx          # KPI / single number widget
│   │   │   └── AddWidgetModal.tsx     # Create widget from SQL
│   │   ├── agents/
│   │   │   ├── AgentBuilder.tsx       # Agent config form
│   │   │   └── AgentCard.tsx          # Agent list item
│   │   └── ui/                        # Shadcn/ui components
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── tabs.tsx
│   │       └── ...
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── providers.ts           # TanStack AI provider config
│   │   │   ├── tools.ts              # Isomorphic tool definitions
│   │   │   ├── mcp.ts                # MCP client setup
│   │   │   └── strategies.ts         # Agent loop strategies
│   │   ├── auth/
│   │   │   ├── auth.ts               # Better Auth server config
│   │   │   └── client.ts             # Better Auth client
│   │   ├── db/
│   │   │   ├── schema.ts             # Drizzle schema
│   │   │   ├── migrations/           # Drizzle migrations
│   │   │   └── index.ts              # DB connection
│   │   ├── clickhouse/
│   │   │   ├── client.ts             # Per-tenant CH connection pool
│   │   │   ├── parser.ts             # Output parser (rows/KV/error)
│   │   │   └── chart-detect.ts       # Auto chart type detection
│   │   └── utils/
│   │       ├── token-count.ts         # Usage tracking
│   │       └── rate-limit.ts          # Request rate limiting
│   ├── server/
│   │   ├── functions/
│   │   │   ├── chat.ts               # createServerFn for chat stream
│   │   │   ├── conversations.ts      # CRUD conversations
│   │   │   ├── messages.ts           # CRUD messages
│   │   │   ├── dashboards.ts         # CRUD dashboards
│   │   │   ├── widgets.ts            # CRUD widgets + query executor
│   │   │   └── agents.ts             # CRUD agents
│   │   └── middleware/
│   │       ├── auth.ts               # Auth middleware
│   │       └── tenant.ts             # Tenant resolution
│   └── styles/
│       └── globals.css                # Tailwind v4 + design tokens
├── drizzle.config.ts
├── app.config.ts                      # TanStack Start config
├── package.json
├── Dockerfile
├── docker-compose.yml
└── .env
```

---

## Database Schema (Drizzle + PostgreSQL)

```typescript
// app/lib/db/schema.ts
import { pgTable, uuid, text, timestamp, jsonb, integer, boolean } from 'drizzle-orm/pg-core'

// ─── Better Auth manages these ───────────────────
// users, sessions, accounts, verifications
// organizations, members, invitations

// ─── Conversations ───────────────────────────────
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),          // Better Auth user ID
  orgId: text('org_id').notNull(),            // Organization (tenant)
  agentId: uuid('agent_id'),                  // Which agent config
  title: text('title').default('New Chat'),
  model: text('model'),                       // e.g. 'gpt-4o', 'claude-sonnet'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  parentId: uuid('parent_id'),               // Branching support
  role: text('role').notNull(),              // user | assistant | tool
  content: jsonb('content').notNull(),       // TanStack AI message parts
  toolCalls: jsonb('tool_calls'),            // Tool call metadata
  metrics: jsonb('metrics'),                 // { tokens, elapsed, etc. }
  createdAt: timestamp('created_at').defaultNow(),
})

// ─── Agents ──────────────────────────────────────
export const agents = pgTable('agents', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  model: text('model').notNull(),            // Default model
  provider: text('provider').notNull(),      // openai | anthropic | google
  systemInstructions: text('system_instructions'),
  mcpServers: jsonb('mcp_servers'),          // [{ name, url, transport }]
  temperature: integer('temperature'),
  maxTokens: integer('max_tokens'),
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at').defaultNow(),
})

// ─── Dashboard ───────────────────────────────────
export const dashboards = pgTable('dashboards', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  createdBy: text('created_by').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  layout: jsonb('layout'),                   // react-grid-layout format
  isDefault: boolean('is_default').default(false),
  sharedWith: jsonb('shared_with'),          // User/team IDs
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const widgets = pgTable('widgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  dashboardId: uuid('dashboard_id').notNull()
    .references(() => dashboards.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').notNull(),              // chart | table | kpi
  sql: text('sql').notNull(),                // ClickHouse SQL query
  chartConfig: jsonb('chart_config'),        // { chartType, xAxis, yAxis[], title }
  refreshInterval: integer('refresh_interval'), // seconds, null = manual
  connectionId: uuid('connection_id')
    .references(() => connections.id),
  cachedData: jsonb('cached_data'),
  lastRefreshed: timestamp('last_refreshed'),
  createdAt: timestamp('created_at').defaultNow(),
})

// ─── Tenant Connections ──────────────────────────
export const connections = pgTable('connections', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),              // "Production CH", "Staging"
  host: text('host').notNull(),
  port: integer('port').default(8443),
  database: text('database').notNull(),
  username: text('username').notNull(),
  encryptedPassword: text('encrypted_password').notNull(),
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at').defaultNow(),
})

// ─── Usage Tracking ──────────────────────────────
export const usageRecords = pgTable('usage_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  orgId: text('org_id').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  conversationId: uuid('conversation_id'),
  createdAt: timestamp('created_at').defaultNow(),
})
```

---

## Core AI Setup

### Provider Configuration

```typescript
// app/lib/ai/providers.ts
import { openaiText, openaiImage } from '@tanstack/ai-openai'
import { anthropicText } from '@tanstack/ai-anthropic'
import { geminiText } from '@tanstack/ai-google'

export const providers = {
  openai: {
    'gpt-4o': () => openaiText('gpt-4o'),
    'gpt-4o-mini': () => openaiText('gpt-4o-mini'),
    'o3': () => openaiText('o3'),
  },
  anthropic: {
    'claude-sonnet-4': () => anthropicText('claude-sonnet-4-20250514'),
    'claude-haiku': () => anthropicText('claude-3-5-haiku-20241022'),
  },
  google: {
    'gemini-2.5-pro': () => geminiText('gemini-2.5-pro'),
    'gemini-2.5-flash': () => geminiText('gemini-2.5-flash'),
  },
} as const
```

### MCP Integration

```typescript
// app/lib/ai/mcp.ts
import { createMCPClients } from '@tanstack/ai-mcp'

export function createTenantMCPClients(agentConfig: AgentConfig) {
  return createMCPClients(
    agentConfig.mcpServers.map(server => ({
      name: server.name,
      transport: {
        type: 'sse' as const,
        url: server.url,
        headers: server.headers,
      },
    }))
  )
}
```

### Chat Server Function

```typescript
// app/server/functions/chat.ts
import { createServerFn } from '@tanstack/react-start'
import { chat } from '@tanstack/ai'
import { maxIterations, untilFinishReason, combineStrategies } from '@tanstack/ai'
import { providers } from '~/lib/ai/providers'
import { createTenantMCPClients } from '~/lib/ai/mcp'

export const streamChat = createServerFn({ method: 'POST' })
  .validator(chatInputSchema)
  .handler(async ({ data }) => {
    const { messages, model, provider, agentConfig } = data

    const adapter = providers[provider][model]()
    const mcpClients = agentConfig.mcpServers?.length
      ? createTenantMCPClients(agentConfig)
      : undefined

    const stream = chat({
      adapter,
      messages,
      system: agentConfig.systemInstructions,
      tools: agentConfig.tools,
      mcp: mcpClients,
      agentLoopStrategy: combineStrategies([
        maxIterations(15),
        untilFinishReason(['stop', 'length']),
      ]),
    })

    return stream // TanStack AI handles SSE streaming
  })
```

### Custom Tool Call Renderer

```typescript
// app/components/chat/ToolCallRenderer.tsx
import { makeToolUI } from '@assistant-ui/react'
import { DataTableView } from './DataTableView'
import { ChartView } from './ChartView'
import { QueryStatsBar } from './QueryStatsBar'
import { SaveToDashboard } from './SaveToDashboard'
import { parseToolOutput, suggestChart } from '~/lib/clickhouse/parser'

export const ClickHouseToolUI = makeToolUI({
  toolName: 'run_select_query',
  render: ({ args, result, status }) => {
    if (status.type === 'running') {
      return <QueryRunningState sql={args.query} />
    }
    if (status.type === 'error') {
      return <QueryErrorState error={result} sql={args.query} />
    }

    const parsed = parseToolOutput(result)
    const chartConfig = parsed.rows ? suggestChart(parsed.rows) : null

    return (
      <div className="tool-call-container">
        <Tabs defaultValue={chartConfig ? 'chart' : 'result'}>
          {chartConfig && (
            <TabPanel value="chart">
              <ChartView rows={parsed.rows} config={chartConfig} />
            </TabPanel>
          )}
          <TabPanel value="result">
            <DataTableView rows={parsed.rows} />
          </TabPanel>
          <TabPanel value="query">
            <SQLHighlight sql={args.query} />
          </TabPanel>
        </Tabs>
        <QueryStatsBar metrics={parsed.metrics} />
        <SaveToDashboard sql={args.query} chartConfig={chartConfig} />
      </div>
    )
  },
})
```

---

## Complete Feature Guide

> **P0** = must have for launch · **P1** = fast-follow (within 2 weeks of launch) · **P2** = future roadmap
>
> **164 features total:** 72 P0 · 52 P1 · 40 P2

---

### 1. Chat & AI

#### Conversation Management

- [ ] **P0** — Create new conversation
- [ ] **P0** — List all conversations in sidebar
- [ ] **P0** — Rename conversation
- [ ] **P0** — Delete conversation
- [ ] **P0** — Search conversations by title/content
- [ ] **P1** — Organize conversations into folders
- [ ] **P1** — Pin conversations to top of sidebar
- [ ] **P1** — Archive conversations (hide from sidebar, still searchable)
- [ ] **P2** — Export conversation as Markdown / PDF
- [ ] **P2** — Import conversation from JSON

#### Chat Experience

- [ ] **P0** — Streaming responses (token-by-token display)
- [ ] **P0** — Stop generation button (abort mid-stream)
- [ ] **P0** — Regenerate last response
- [ ] **P0** — Markdown rendering in responses (headings, lists, bold, italic, links)
- [ ] **P0** — Code blocks with syntax highlighting
- [ ] **P0** — Copy code blocks with one click
- [ ] **P0** — Auto-scroll during streaming
- [ ] **P1** — Edit a previous message and regenerate from that point
- [ ] **P1** — Conversation branching (fork from any message into alternate thread)
- [ ] **P1** — Inline tables in markdown responses
- [ ] **P2** — Mermaid diagram rendering in chat
- [ ] **P2** — LaTeX/math formula rendering

#### Model Selection

- [ ] **P0** — Switch AI model mid-conversation (OpenAI, Anthropic, Google)
- [ ] **P0** — Model selector dropdown in composer area
- [ ] **P0** — Support for OpenAI (GPT-4o, GPT-4o-mini, o3)
- [ ] **P0** — Support for Anthropic (Claude Sonnet 4, Haiku)
- [ ] **P0** — Support for Google (Gemini 2.5 Pro, Flash)
- [ ] **P1** — Support for local models via Ollama
- [ ] **P1** — Support for OpenRouter (100s of models)
- [ ] **P2** — Custom model endpoint (any OpenAI-compatible API)

#### File & Media

- [ ] **P1** — Upload images for vision models (GPT-4o, Claude, Gemini)
- [ ] **P1** — Upload PDFs / documents as context
- [ ] **P2** — Drag-and-drop file upload
- [ ] **P2** — Image generation from chat (DALL-E, etc.)
- [ ] **P2** — Text-to-speech (listen to responses)

---

### 2. Agents & Tools

#### Agent Builder

- [ ] **P0** — Create custom agents (name, description, model, instructions)
- [ ] **P0** — Set system instructions per agent
- [ ] **P0** — Choose default model per agent
- [ ] **P0** — Configure MCP servers per agent
- [ ] **P0** — List all agents for the organization
- [ ] **P0** — Edit agent configuration
- [ ] **P0** — Delete agent
- [ ] **P0** — Set a default agent for new conversations
- [ ] **P1** — Clone/duplicate an agent
- [ ] **P1** — Set temperature and max tokens per agent
- [ ] **P2** — Agent templates (pre-built configs for common use cases)
- [ ] **P2** — Agent versioning (rollback to previous config)

#### MCP Integration

- [ ] **P0** — Connect to MCP servers (Streamable HTTP, SSE, stdio)
- [ ] **P0** — Multi-server support (connect to multiple MCP servers per agent)
- [ ] **P0** — Auto-discover tools from MCP servers
- [ ] **P0** — ClickHouse MCP server integration (run_select_query, list_tables, etc.)
- [ ] **P1** — Lazy tool discovery (only send tool schemas the LLM actually needs)
- [ ] **P1** — Tool approval / human-in-the-loop (approve before executing dangerous tools)
- [ ] **P2** — Custom MCP server builder (create MCP endpoints from within the app)

#### Tool Calling

- [ ] **P0** — Execute MCP tools and display results in chat
- [ ] **P0** — Show tool call status (running, succeeded, error)
- [ ] **P0** — Error handling with retry suggestion
- [ ] **P0** — Agent loop with automatic multi-step tool calls
- [ ] **P1** — Configurable max iterations per agent
- [ ] **P1** — Cost/budget-based loop stopping
- [ ] **P2** — Tool call history/audit log

---

### 3. Query Results & Visualization

#### Data Table

- [ ] **P0** — Render query results as a data table
- [ ] **P0** — Column sorting (click header to sort)
- [ ] **P0** — Pagination (configurable page size: 10, 25, 50, 100)
- [ ] **P0** — Column visibility toggle (show/hide columns)
- [ ] **P1** — Column filtering (search within a column)
- [ ] **P1** — Column resizing
- [ ] **P1** — Copy table to clipboard (as TSV for spreadsheet paste)
- [ ] **P1** — Export table as CSV
- [ ] **P2** — Virtual scrolling for very large result sets (1000+ rows)
- [ ] **P2** — Inline cell editing (for editable data views)

#### Charts

- [ ] **P0** — Auto-detect best chart type from data shape:
  - Date + numeric → **Line / Area**
  - String + 1 numeric (≤8 rows) → **Doughnut / Pie**
  - String + numeric(s) → **Bar**
  - Numeric + numeric → **Scatter**
- [ ] **P0** — Line chart
- [ ] **P0** — Bar chart (vertical + horizontal)
- [ ] **P0** — Area chart
- [ ] **P0** — Pie / Doughnut chart
- [ ] **P1** — Scatter plot
- [ ] **P1** — Stacked bar chart
- [ ] **P2** — Funnel chart
- [ ] **P2** — Heatmap / treemap

#### Chart Configuration

- [ ] **P0** — Chart type selector (switch between chart types)
- [ ] **P0** — X-axis column picker
- [ ] **P0** — Y-axis column picker (multiple series)
- [ ] **P0** — Chart title editor
- [ ] **P1** — Color customization per series
- [ ] **P1** — Legend toggle
- [ ] **P1** — Tooltip formatting
- [ ] **P2** — Axis label formatting (date format, number format)
- [ ] **P2** — Chart annotations (reference lines, labels)

#### Query Stats

- [ ] **P0** — Elapsed query time
- [ ] **P0** — Rows read count
- [ ] **P0** — Bytes scanned
- [ ] **P0** — Status badge (succeeded / error / idle)
- [ ] **P1** — Total rows in result vs displayed
- [ ] **P1** — ClickHouse query ID (for debugging)

#### Tab Layout (per tool call)

- [ ] **P0** — Chart tab (if chart is available)
- [ ] **P0** — Result tab (data table)
- [ ] **P0** — Query tab (SQL with syntax highlighting + copy button)
- [ ] **P1** — Details tab (raw JSON input/output)

---

### 4. Dashboard Builder

#### Dashboard Management

- [ ] **P0** — Create new dashboard
- [ ] **P0** — List all dashboards for the organization
- [ ] **P0** — Rename dashboard
- [ ] **P0** — Delete dashboard
- [ ] **P0** — Set a default dashboard (opens on login)
- [ ] **P1** — Duplicate dashboard
- [ ] **P1** — Share dashboard with team members
- [ ] **P2** — Public dashboard link (read-only, no login required)
- [ ] **P2** — Dashboard templates (pre-built for Magento use cases)

#### Widget System

- [ ] **P0** — Add widget from dashboard (write SQL, pick chart type)
- [ ] **P0** — "Save to Dashboard" button in chat tool results
- [ ] **P0** — Widget types: **Chart**, **Table**, **KPI (single number)**
- [ ] **P0** — Edit widget (change SQL, chart config, name)
- [ ] **P0** — Delete widget
- [ ] **P1** — Widget auto-refresh (configurable: 30s, 1m, 5m, 15m, 1h)
- [ ] **P1** — Manual refresh button per widget
- [ ] **P1** — Widget loading states with skeleton UI
- [ ] **P1** — Cached data (avoid re-querying on page load)
- [ ] **P2** — Widget description / notes field
- [ ] **P2** — Widget alert thresholds (notify if KPI crosses a value)

#### Grid Layout

- [ ] **P0** — Drag-and-drop widget positioning
- [ ] **P0** — Resize widgets
- [ ] **P0** — Layout auto-save (persists positions to database)
- [ ] **P0** — Responsive breakpoints (desktop, tablet, mobile)
- [ ] **P1** — Lock layout mode (prevent accidental moves)
- [ ] **P2** — Full-screen widget view (expand one widget)

#### Magento Dashboard Templates (Pre-built)

- [ ] **P1** — Daily Revenue Overview
- [ ] **P1** — Top Products by Revenue
- [ ] **P1** — Order Funnel (placed → processing → shipped → delivered)
- [ ] **P1** — Customer Acquisition Trends
- [ ] **P2** — Inventory Levels by SKU
- [ ] **P2** — Return Rate by Category
- [ ] **P2** — Average Order Value Over Time
- [ ] **P2** — Geographic Sales Heatmap

---

### 5. Authentication & Teams

#### Authentication

- [ ] **P0** — Email + password registration
- [ ] **P0** — Email + password login
- [ ] **P0** — Session management (JWT + refresh tokens)
- [ ] **P0** — Logout
- [ ] **P0** — Password reset (email link)
- [ ] **P1** — Google OAuth login
- [ ] **P1** — GitHub OAuth login
- [ ] **P1** — Two-factor authentication (TOTP)
- [ ] **P2** — SSO / SAML (enterprise customers)
- [ ] **P2** — Passkeys / WebAuthn

#### Organization & Teams

- [ ] **P0** — Create organization (auto-created on first user signup)
- [ ] **P0** — Invite team members by email
- [ ] **P0** — Remove team members
- [ ] **P0** — Role-based access: **Owner**, **Admin**, **Member**
- [ ] **P1** — Transfer organization ownership
- [ ] **P1** — Multiple organizations per user (switch between)
- [ ] **P2** — Teams within organizations (sub-groups)
- [ ] **P2** — Custom roles with granular permissions

---

### 6. Connections & Data

#### ClickHouse Connections

- [ ] **P0** — Add ClickHouse connection (host, port, database, username, password)
- [ ] **P0** — Test connection (verify credentials)
- [ ] **P0** — Set default connection per organization
- [ ] **P0** — Encrypted credential storage
- [ ] **P0** — List connections for the organization
- [ ] **P0** — Edit connection
- [ ] **P0** — Delete connection
- [ ] **P1** — Multiple connections per organization (prod, staging, etc.)
- [ ] **P1** — Connection health monitoring (periodic ping)
- [ ] **P2** — Read-only connection enforcement (block INSERT/UPDATE/DELETE)
- [ ] **P2** — Query allowlist / blocklist

#### Data Exploration (non-AI)

- [ ] **P2** — SQL editor page (write and run queries outside of chat)
- [ ] **P2** — Database schema browser (list tables, columns, types)
- [ ] **P2** — Query history (recent queries with results)
- [ ] **P2** — Saved queries library (reusable SQL snippets)

---

### 7. Admin & Billing

#### Admin Panel

- [ ] **P0** — User list with search
- [ ] **P0** — Suspend / reactivate user
- [ ] **P1** — View usage per user (tokens consumed)
- [ ] **P1** — View usage per organization
- [ ] **P1** — System health overview (active users, queries/day)
- [ ] **P2** — Audit log (who ran what, when)

#### Usage & Billing

- [ ] **P0** — Track tokens consumed per request (input + output)
- [ ] **P0** — Track usage by model (cost varies per model)
- [ ] **P1** — Usage dashboard (charts showing tokens/day, cost/day)
- [ ] **P1** — Rate limiting per user (requests per minute)
- [ ] **P1** — Rate limiting per organization (daily token cap)
- [ ] **P2** — Billing integration (Stripe — per-seat or usage-based)
- [ ] **P2** — Plan tiers (Free, Pro, Enterprise)
- [ ] **P2** — Invoicing and payment history

---

### 8. UX & Polish

#### Theme & Design

- [ ] **P0** — Dark mode (default)
- [ ] **P0** — Light mode
- [ ] **P0** — System-preference auto-detection
- [ ] **P0** — Mobile responsive layout
- [ ] **P1** — Custom brand colors per organization (white-label)
- [ ] **P1** — Custom logo per organization
- [ ] **P2** — Custom CSS injection for enterprise

#### Keyboard Shortcuts

- [ ] **P1** — `Cmd/Ctrl + K` — Command palette / search
- [ ] **P1** — `Cmd/Ctrl + N` — New conversation
- [ ] **P1** — `Cmd/Ctrl + Shift + S` — Toggle sidebar
- [ ] **P1** — `Enter` — Send message
- [ ] **P1** — `Shift + Enter` — Newline in composer
- [ ] **P1** — `Escape` — Cancel generation

#### Notifications

- [ ] **P1** — In-app notification for widget alerts
- [ ] **P2** — Email notifications for widget threshold breaches
- [ ] **P2** — Slack/webhook integration for alerts

#### Onboarding

- [ ] **P1** — First-time setup wizard (connect ClickHouse, create first agent)
- [ ] **P1** — Sample conversation / demo mode
- [ ] **P2** — Interactive product tour (highlight features)
- [ ] **P2** — Documentation / help center

#### Deployment

- [ ] **P0** — Multi-stage Dockerfile
- [ ] **P0** — docker-compose.yml (app + postgres)
- [ ] **P0** — Traefik integration (already have)
- [ ] **P1** — CI/CD pipeline
- [ ] **P1** — Setup documentation

## Development Roadmap: Testable Units

> Each unit is independently testable and must pass its gate before the next unit begins.
> Full details, test tables, and example code live in individual unit files.
> See [units/00-overview.md](units/00-overview.md) for the dependency graph, testing stack, and test commands.

| # | Unit | File | Depends on | Status |
|---|------|------|-----------|--------|
| 01 | Scaffold + Database | [01-scaffold-database.md](units/01-scaffold-database.md) | — | ✅ |
| 02 | Authentication | [02-authentication.md](units/02-authentication.md) | U1 | ⬜ |
| 03 | Layout + Theme | [03-layout-theme.md](units/03-layout-theme.md) | U2 | ⬜ |
| 04 | Conversation CRUD | [04-conversation-crud.md](units/04-conversation-crud.md) | U2, U3 | ⬜ |
| 05 | Chat Streaming | [05-chat-streaming.md](units/05-chat-streaming.md) | U4 | ⬜ |
| 06 | ClickHouse Connections | [06-clickhouse-connections.md](units/06-clickhouse-connections.md) | U2 | ⬜ |
| 07 | Agent Builder | [07-agent-builder.md](units/07-agent-builder.md) | U2, U6 | ⬜ |
| 08 | MCP Tool Execution | [08-mcp-tool-execution.md](units/08-mcp-tool-execution.md) | U5, U7 | ⬜ |
| 09 | Data Table | [09-data-table.md](units/09-data-table.md) | U8 | ⬜ |
| 10 | Chart Components | [10-chart-components.md](units/10-chart-components.md) | U8 | ⬜ |
| 11 | Tool Call Renderer | [11-tool-call-renderer.md](units/11-tool-call-renderer.md) | U9, U10 | ⬜ |
| 12 | Dashboard CRUD | [12-dashboard-crud.md](units/12-dashboard-crud.md) | U2 | ⬜ |
| 13 | Widget System | [13-widget-system.md](units/13-widget-system.md) | U12, U6, U10 | ⬜ |
| 14 | Admin + Usage | [14-admin-usage.md](units/14-admin-usage.md) | U2, U5 | ⬜ |
| 15 | Deployment | [15-deployment.md](units/15-deployment.md) | All | ⬜ |




## Deployment: Dokploy + shopmeta.app

### Existing Infrastructure

```
Server:    Dokploy VPS
Dashboard: deploy.shopmeta.app
Traefik:   Auto-managed by Dokploy (Let's Encrypt TLS)
Existing:  chat.shopmeta.app  → LibreChat       (keep running, do not touch)
           admin.shopmeta.app → LibreChat Admin  (keep running, do not touch)
```

### Subdomain Plan

| Subdomain | Service | Status |
|-----------|---------|--------|
| `app.shopmeta.app` | **ShopMeta (TanStack Start)** | **NEW** — deploy here |
| `deploy.shopmeta.app` | Dokploy Dashboard | Existing — no changes |
| `chat.shopmeta.app` | LibreChat | Existing — keep running |
| `admin.shopmeta.app` | LibreChat Admin | Existing — keep running |

> ShopMeta runs as a completely separate Dokploy project alongside the existing LibreChat stack. No redirects, no shared databases, no interference. LibreChat can be sunset later when ShopMeta is fully ready.

### Dokploy Project Setup

Create a new **Compose** project in Dokploy with this structure:

```yaml
# docker-compose.yml (deployed via Dokploy)
services:
  shopmeta:
    build:
      context: .
      dockerfile: Dockerfile
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      # Database
      DATABASE_URL: postgresql://shopmeta:${DB_PASSWORD}@shopmeta-db:5432/shopmeta
      # Auth
      BETTER_AUTH_SECRET: ${AUTH_SECRET}
      BETTER_AUTH_URL: https://app.shopmeta.app
      # AI Providers
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      GOOGLE_AI_API_KEY: ${GOOGLE_AI_API_KEY}
      # Encryption (for ClickHouse connection passwords)
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
    depends_on:
      shopmeta-db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    networks:
      - dokploy-network
    labels:
      # Dokploy manages Traefik labels automatically, but for reference:
      - "traefik.enable=true"
      - "traefik.http.routers.shopmeta.rule=Host(`app.shopmeta.app`)"
      - "traefik.http.routers.shopmeta.entryPoints=websecure"
      - "traefik.http.routers.shopmeta.tls=true"
      - "traefik.http.routers.shopmeta.tls.certresolver=letsencrypt"
      - "traefik.http.services.shopmeta.loadbalancer.server.port=3000"
      # HTTP → HTTPS redirect
      - "traefik.http.routers.shopmeta-http.rule=Host(`app.shopmeta.app`)"
      - "traefik.http.routers.shopmeta-http.entryPoints=web"
      - "traefik.http.routers.shopmeta-http.middlewares=redirect-to-https@docker"
      - "traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https"

  shopmeta-db:
    image: postgres:17-alpine
    restart: unless-stopped
    volumes:
      - shopmeta-pgdata:/var/lib/postgresql/data
    environment:
      POSTGRES_DB: shopmeta
      POSTGRES_USER: shopmeta
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U shopmeta"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - dokploy-network

volumes:
  shopmeta-pgdata:

networks:
  dokploy-network:
    external: true
```

### Dockerfile

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable pnpm

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# --- Build ---
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# --- Runtime ---
FROM base AS runtime
WORKDIR /app
RUN addgroup -S shopmeta && adduser -S shopmeta -G shopmeta

COPY --from=build /app/.output ./.output
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/drizzle ./drizzle

# Run migrations on startup, then start the app
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

USER shopmeta
EXPOSE 3000

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
```

### Entrypoint Script

```bash
#!/bin/sh
# docker-entrypoint.sh
set -e

echo "Running database migrations..."
npx drizzle-kit migrate

echo "Starting ShopMeta..."
exec "$@"
```

### Dokploy Environment Variables

Set these in the Dokploy project settings → Environment:

```env
# Database
DB_PASSWORD=<generate-strong-password>

# Auth
AUTH_SECRET=<generate-with-openssl-rand-base64-32>

# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AI...

# Encryption (for storing ClickHouse connection passwords)
ENCRYPTION_KEY=<generate-with-openssl-rand-hex-32>
```

### Dokploy Deployment Configuration

1. **Create Project:** In Dokploy → Projects → New → Name: `shopmeta`
2. **Add Compose Service:** → Add Service → Docker Compose
3. **Connect Git:** Link to your GitHub repo (branch: `main`)
4. **Set Domain:** In the service settings → Domains → Add `app.shopmeta.app`
5. **Set Environment:** Paste env vars from above
6. **Enable Auto-Deploy:** On push to `main` → auto-build + deploy
7. **Health Check:** Dokploy will use the container healthcheck

### CI/CD Pipeline

```mermaid
graph LR
    A["Push to main"] --> B["Dokploy Webhook"]
    B --> C["Pull latest code"]
    C --> D["docker build"]
    D --> E["Run migrations"]
    E --> F["Health check"]
    F --> G["Route traffic"]
    G --> H["app.shopmeta.app live"]
```

**Rollback:** Dokploy keeps previous images. One-click rollback from the dashboard.

### Future: Sunset LibreChat (not now)

When ShopMeta is feature-complete and stable, the existing LibreChat stack can be sunset:

1. Optionally migrate conversation history from MongoDB → PostgreSQL
2. Redirect `chat.shopmeta.app` → `app.shopmeta.app` (or repurpose as landing page)
3. Remove LibreChat + admin containers
4. Reclaim server resources

> **This is a future decision.** Do not touch `chat.shopmeta.app` or `admin.shopmeta.app` until explicitly ready.

---

## Key Integrations

### TanStack AI ↔ assistant-ui

assistant-ui provides the chat UI components. TanStack AI provides the streaming/tool-calling backend. They connect via a runtime adapter:

```typescript
// app/components/chat/ChatRuntime.tsx
import { useChat } from '@tanstack/ai-react'
import { AssistantRuntimeProvider } from '@assistant-ui/react'
import { useTanStackAIRuntime } from './tanstack-ai-runtime'

export function ChatProvider({ children }) {
  const chat = useChat({
    // TanStack AI config
  })

  const runtime = useTanStackAIRuntime(chat)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  )
}
```

### TanStack Table ↔ ClickHouse Results

Query results flow: MCP tool call → parsed output → TanStack Table:

```typescript
// app/components/chat/DataTableView.tsx
import { useReactTable, getCoreRowModel, getPaginationRowModel,
         getSortedRowModel, getFilteredRowModel, flexRender } from '@tanstack/react-table'

export function DataTableView({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = useMemo(
    () => Object.keys(rows[0] || {}).map(key => ({
      accessorKey: key,
      header: key,
      cell: ({ getValue }) => formatCellValue(getValue()),
    })),
    [rows]
  )

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  // ... render table with sorting, pagination, column visibility
}
```

---

## What This Replaces from LibreChat

| LibreChat Feature | ShopMeta Implementation |
|-------------------|------------------------|
| Chat UI | assistant-ui `<Thread />` + `<Composer />` |
| Streaming | TanStack AI `chat()` with SSE |
| Multi-model | TanStack AI provider adapters |
| MCP tools | `@tanstack/ai-mcp` with `createMCPClients` |
| Tool call rendering | `makeToolUI()` + custom components |
| Agents | Custom CRUD + TanStack AI config |
| Auth | Better Auth (more features than LibreChat's) |
| Admin panel | Custom pages (full control) |
| Conversations | Drizzle + PostgreSQL (not MongoDB) |
| **NEW: Dashboard** | react-grid-layout + Recharts + SQL executor |
| **NEW: Save to Dashboard** | Tool result → chart config → widget |
| **NEW: Auto charts** | Data shape analysis → suggested chart type |
| **NEW: Team dashboards** | Better Auth Organizations |
