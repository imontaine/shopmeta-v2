// src/components/chat/MarkdownRenderer.tsx
// Thin wrapper around prompt-kit's Markdown component.
// Kept for backward compatibility — new code should import
// Markdown directly from '@/components/ui/markdown'.

import { Markdown } from '@/components/ui/markdown'
import { cn } from '@/lib/utils'

interface MarkdownRendererProps {
  content: string
  className?: string
}

/**
 * Renders markdown content using prompt-kit's Markdown component.
 * Includes syntax highlighting via CodeBlock and remark-gfm support.
 *
 * @deprecated Import `Markdown` from `@/components/ui/markdown` directly.
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
      data-testid="markdown-renderer"
      className={cn(
        'prose prose-neutral dark:prose-invert max-w-none text-sm leading-relaxed break-words',
        className,
      )}
    >
      <Markdown>{content}</Markdown>
    </div>
  )
}
