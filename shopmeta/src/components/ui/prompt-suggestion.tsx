"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type PromptSuggestionProps = {
  children: React.ReactNode
  className?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>

function PromptSuggestion({
  children,
  className,
  ...props
}: PromptSuggestionProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn(
        "cursor-pointer rounded-full px-4 py-2 text-sm font-normal",
        className,
      )}
      {...props}
    >
      {children}
    </Button>
  )
}

export { PromptSuggestion }
