// src/routes/_authenticated/mcp-servers.tsx
// MCP Servers catalog page — accessible at /mcp-servers

import { createFileRoute } from '@tanstack/react-router'
import { McpServersPage } from '#/components/mcp/McpServersPage'

export const Route = createFileRoute('/_authenticated/mcp-servers')({
  component: McpServersPage,
})
