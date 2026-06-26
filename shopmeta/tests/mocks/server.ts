// tests/mocks/server.ts
// MSW Node.js server setup for integration and unit tests.
// Exports setupServer() with all mock handlers.

import { setupServer } from 'msw/node'
import { chatHandlers } from './handlers/chat'
import { mcpHandlers } from './handlers/mcp'

// Combine all handlers
export const server = setupServer(...chatHandlers, ...mcpHandlers)

// Export convenience shorthand
export { chatHandlers, mcpHandlers }
