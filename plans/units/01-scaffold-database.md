# Unit 1: Project Scaffold + Database

**Build:** TanStack Start project, Drizzle schema, migrations, CI pipeline

**Depends on:** —

## Tests

| Type | What to test | Example assertion |
|------|-------------|-------------------|
| Unit | Drizzle schema exports | `expect(conversations).toBeDefined()` |
| Unit | Schema relations are correct | FK from `messages.conversationId` → `conversations.id` |
| Integration | Migrations run clean on fresh DB | `migrate(db)` → no errors, all tables exist |
| Integration | Seed data inserts correctly | Insert user + org + conversation → SELECT returns them |
| Unit | Env config validation | Missing `DATABASE_URL` throws descriptive error |

## Example Tests

```typescript
// tests/unit/db/schema.test.ts
test('conversations table has all required columns', () => {
  const cols = Object.keys(conversations)
  expect(cols).toContain('id')
  expect(cols).toContain('userId')
  expect(cols).toContain('orgId')
  expect(cols).toContain('title')
})

// tests/integration/db/migrations.test.ts
test('migrations create all tables', async () => {
  const pg = await new PostgreSqlContainer().start()
  const db = drizzle(pg.getConnectionUri())
  await migrate(db, { migrationsFolder: './drizzle' })
  const tables = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname='public'`)
  expect(tables.map(t => t.tablename)).toContain('conversations')
  expect(tables.map(t => t.tablename)).toContain('messages')
  expect(tables.map(t => t.tablename)).toContain('widgets')
})
```

## Gate

`pnpm test:unit -- db` and `pnpm test:integration -- db` both pass green.

## Status: ✅ Complete
