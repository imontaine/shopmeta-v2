"use client"

import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { type VariantProps } from "class-variance-authority"
import { ChevronDown } from "lucide-react"
import { useStickToBottomContext } from "use-stick-to-bottom"

export type ScrollButtonProps = {
  className?: string
  variant?: VariantProps<typeof buttonVariants>["variant"]
  size?: VariantProps<typeof buttonVariants>["size"]
  /** When true, shows a pulsing indicator that content is actively streaming below */
  isStreaming?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>

function ScrollButton({
  className,
  variant = "outline",
  size = "sm",
  isStreaming = false,
  ...props
}: ScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()

  // Don't render at all when at bottom
  if (isAtBottom) return null

  return (
    <div className="pointer-events-none sticky bottom-4 flex w-full justify-center">
      <Button
        variant={variant}
        size={size}
        className={cn(
          "pointer-events-auto relative h-10 rounded-full shadow-lg transition-all duration-150 ease-out",
          isStreaming ? "w-auto gap-2 px-4" : "w-10",
          className
        )}
        onClick={() => scrollToBottom()}
        aria-label={isStreaming ? "New content streaming — click to scroll to bottom" : "Scroll to bottom"}
        {...props}
      >
        {isStreaming && (
          <>
            <span className="bg-primary relative flex h-2 w-2">
              <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" />
              <span className="bg-primary relative inline-flex h-2 w-2 rounded-full" />
            </span>
            <span className="text-xs font-medium">New content</span>
          </>
        )}
        <ChevronDown className="h-4 w-4" />
      </Button>
    </div>
  )
}

export { ScrollButton }
