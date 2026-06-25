// tests/unit/conversations/message-serialization.test.ts
// Unit tests for TanStack AI message parts → JSON → back to parts (no data loss).
// Ensures message content can be safely stored and retrieved from JSONB columns.

import { describe, test, expect } from 'vitest'

// ─── TanStack AI message part types ───────────────────────────────────────────
// These mirror the TanStack AI library message part shapes.

interface TextPart {
  type: 'text'
  text: string
}

interface ToolCallPart {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  args: unknown
}

interface ToolResultPart {
  type: 'tool-result'
  toolCallId: string
  toolName: string
  result: unknown
  isError?: boolean
}

interface ImagePart {
  type: 'image'
  image: string // base64 or URL
  mimeType?: string
}

type MessagePart = TextPart | ToolCallPart | ToolResultPart | ImagePart

interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: MessagePart | MessagePart[]
  toolCalls?: unknown
  metrics?: unknown
}

// ─── Serialization helpers (mirror the DB save/load logic) ────────────────────

/** Serialize a message for storage in JSONB */
function serializeMessage(msg: Message): string {
  return JSON.stringify({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    toolCalls: msg.toolCalls ?? null,
    metrics: msg.metrics ?? null,
  })
}

/** Deserialize a message from JSONB storage */
function deserializeMessage(raw: string): Message {
  const parsed = JSON.parse(raw) as Message
  return parsed
}

/** Round-trip: serialize → JSON string → deserialize */
function roundTrip(msg: Message): Message {
  return deserializeMessage(serializeMessage(msg))
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Message serialization — TanStack AI parts → JSON → back to parts', () => {
  describe('Text messages', () => {
    test('plain text message round-trips without data loss', () => {
      const msg: Message = {
        id: 'msg-001',
        role: 'user',
        content: { type: 'text', text: 'What were sales yesterday?' },
      }

      const result = roundTrip(msg)

      expect(result.id).toBe(msg.id)
      expect(result.role).toBe('user')
      expect(result.content).toEqual({ type: 'text', text: 'What were sales yesterday?' })
    })

    test('assistant text message with metrics round-trips correctly', () => {
      const msg: Message = {
        id: 'msg-002',
        role: 'assistant',
        content: { type: 'text', text: 'Sales were 1,234 units.' },
        metrics: { inputTokens: 45, outputTokens: 12, elapsedMs: 823 },
      }

      const result = roundTrip(msg)

      expect(result.role).toBe('assistant')
      expect(result.content).toEqual({ type: 'text', text: 'Sales were 1,234 units.' })
      expect(result.metrics).toEqual({ inputTokens: 45, outputTokens: 12, elapsedMs: 823 })
    })

    test('text with unicode characters round-trips correctly', () => {
      const msg: Message = {
        id: 'msg-003',
        role: 'user',
        content: { type: 'text', text: 'Analyze 売上 data: €1,234.56 — Q4 2024 🚀' },
      }

      const result = roundTrip(msg)
      const content = result.content as TextPart

      expect(content.text).toBe('Analyze 売上 data: €1,234.56 — Q4 2024 🚀')
    })
  })

  describe('Multi-part messages (content array)', () => {
    test('array of message parts round-trips without data loss', () => {
      const parts: MessagePart[] = [
        { type: 'text', text: 'Here is the analysis:' },
        { type: 'text', text: 'Revenue grew by 23% YoY.' },
      ]

      const msg: Message = {
        id: 'msg-004',
        role: 'assistant',
        content: parts,
      }

      const result = roundTrip(msg)
      const resultParts = result.content as MessagePart[]

      expect(Array.isArray(resultParts)).toBe(true)
      expect(resultParts.length).toBe(2)
      expect(resultParts[0]).toEqual({ type: 'text', text: 'Here is the analysis:' })
      expect(resultParts[1]).toEqual({ type: 'text', text: 'Revenue grew by 23% YoY.' })
    })
  })

  describe('Tool call messages', () => {
    test('tool-call part round-trips correctly', () => {
      const msg: Message = {
        id: 'msg-005',
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call_abc123',
            toolName: 'query_clickhouse',
            args: { sql: 'SELECT sum(revenue) FROM orders WHERE date = today()', limit: 100 },
          },
        ],
      }

      const result = roundTrip(msg)
      const parts = result.content as ToolCallPart[]

      expect(parts[0]!.type).toBe('tool-call')
      expect(parts[0]!.toolCallId).toBe('call_abc123')
      expect(parts[0]!.toolName).toBe('query_clickhouse')
      expect(parts[0]!.args).toEqual({
        sql: 'SELECT sum(revenue) FROM orders WHERE date = today()',
        limit: 100,
      })
    })

    test('tool-result part round-trips correctly', () => {
      const msg: Message = {
        id: 'msg-006',
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_abc123',
            toolName: 'query_clickhouse',
            result: [{ revenue: '1234567.89', day: '2024-01-15' }],
            isError: false,
          },
        ],
      }

      const result = roundTrip(msg)
      const parts = result.content as ToolResultPart[]

      expect(parts[0]!.type).toBe('tool-result')
      expect(parts[0]!.toolCallId).toBe('call_abc123')
      expect(parts[0]!.result).toEqual([{ revenue: '1234567.89', day: '2024-01-15' }])
      expect(parts[0]!.isError).toBe(false)
    })

    test('tool error result round-trips correctly', () => {
      const msg: Message = {
        id: 'msg-007',
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_xyz789',
            toolName: 'query_clickhouse',
            result: 'Code: 62, e.displayText() = DB::Exception: Syntax error',
            isError: true,
          },
        ],
      }

      const result = roundTrip(msg)
      const parts = result.content as ToolResultPart[]

      expect(parts[0]!.isError).toBe(true)
      expect(parts[0]!.result).toBe('Code: 62, e.displayText() = DB::Exception: Syntax error')
    })
  })

  describe('Image messages', () => {
    test('image part round-trips with mimeType', () => {
      const msg: Message = {
        id: 'msg-008',
        role: 'user',
        content: [
          { type: 'text', text: 'What is in this chart?' },
          { type: 'image', image: 'data:image/png;base64,iVBORw0KGgo=', mimeType: 'image/png' },
        ],
      }

      const result = roundTrip(msg)
      const parts = result.content as (TextPart | ImagePart)[]

      expect(parts[0]!.type).toBe('text')
      expect(parts[1]!.type).toBe('image')
      const imgPart = parts[1] as ImagePart
      expect(imgPart.image).toBe('data:image/png;base64,iVBORw0KGgo=')
      expect(imgPart.mimeType).toBe('image/png')
    })
  })

  describe('Null/undefined handling', () => {
    test('null toolCalls is preserved as null', () => {
      const msg: Message = {
        id: 'msg-009',
        role: 'user',
        content: { type: 'text', text: 'Hello' },
        toolCalls: undefined,
      }

      const serialized = serializeMessage(msg)
      const parsed = JSON.parse(serialized)

      expect(parsed.toolCalls).toBeNull()
    })

    test('null metrics is preserved as null', () => {
      const msg: Message = {
        id: 'msg-010',
        role: 'user',
        content: { type: 'text', text: 'Hello' },
        metrics: undefined,
      }

      const serialized = serializeMessage(msg)
      const parsed = JSON.parse(serialized)

      expect(parsed.metrics).toBeNull()
    })

    test('complex nested tool args survive round-trip without data loss', () => {
      const complexArgs = {
        query: {
          sql: 'SELECT * FROM orders',
          filters: [
            { field: 'date', operator: '>=', value: '2024-01-01' },
            { field: 'amount', operator: '>', value: 100 },
          ],
          orderBy: { field: 'date', direction: 'desc' },
          limit: 50,
          offset: 0,
        },
        metadata: {
          requestedAt: '2024-01-15T10:30:00Z',
          userId: 'user_abc',
        },
      }

      const msg: Message = {
        id: 'msg-011',
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call_complex',
            toolName: 'advanced_query',
            args: complexArgs,
          },
        ],
      }

      const result = roundTrip(msg)
      const parts = result.content as ToolCallPart[]

      expect(parts[0]!.args).toEqual(complexArgs)
    })
  })

  describe('Full conversation round-trip', () => {
    test('a complete conversation message array round-trips with no data loss', () => {
      const messageArray: Message[] = [
        {
          id: 'msg-u1',
          role: 'user',
          content: { type: 'text', text: 'What were total sales last week?' },
        },
        {
          id: 'msg-a1',
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me query the database.' },
            {
              type: 'tool-call',
              toolCallId: 'call_q1',
              toolName: 'query_clickhouse',
              args: { sql: "SELECT sum(revenue) FROM orders WHERE date >= today() - 7" },
            },
          ],
          metrics: { inputTokens: 120, outputTokens: 45, elapsedMs: 1200 },
        },
        {
          id: 'msg-t1',
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call_q1',
              toolName: 'query_clickhouse',
              result: [{ revenue: '98765.43' }],
              isError: false,
            },
          ],
        },
        {
          id: 'msg-a2',
          role: 'assistant',
          content: { type: 'text', text: 'Total sales last week were $98,765.43.' },
          metrics: { inputTokens: 200, outputTokens: 22, elapsedMs: 600 },
        },
      ]

      // Serialize each message and deserialize it back
      const restored = messageArray.map((msg) => roundTrip(msg))

      expect(restored.length).toBe(4)
      expect(restored[0]!.role).toBe('user')
      expect(restored[1]!.role).toBe('assistant')
      expect(restored[2]!.role).toBe('tool')
      expect(restored[3]!.role).toBe('assistant')

      // Deep equality check — no data loss
      restored.forEach((msg, i) => {
        expect(msg.id).toBe(messageArray[i]!.id)
        expect(msg.role).toBe(messageArray[i]!.role)
        expect(msg.content).toEqual(messageArray[i]!.content)
        if (messageArray[i]!.metrics) {
          expect(msg.metrics).toEqual(messageArray[i]!.metrics)
        }
      })
    })
  })
})
