"use client"

import { TextShimmer } from "@/components/ui/text-shimmer"
import { cn } from "@/lib/utils"
import { ChevronRight } from "lucide-react"

type ThinkingBarProps = {
  className?: string
  text?: string
  onStop?: () => void
  stopLabel?: string
  onClick?: () => void
}

export function ThinkingBar({
  className,
  text = "Thinking",
  onStop,
  stopLabel = "Answer now",
  onClick,
}: ThinkingBarProps) {
  return (
    <div className={cn("flex w-full items-center justify-between", className)}>
      {onClick ? (
        <button
          onClick={onClick}
          className="flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-base transition-colors hover:bg-accent"
        >
          <ChevronRight className="h-4 w-4" />
          <TextShimmer className="text-muted-foreground text-base font-normal">
            {text}
          </TextShimmer>
        </button>
      ) : (
        <div className="flex items-center gap-1 px-1 py-0.5">
          <ChevronRight className="h-4 w-4" />
          <TextShimmer className="text-muted-foreground text-base font-normal">
            {text}
          </TextShimmer>
        </div>
      )}
      {onStop && (
        <button
          onClick={onStop}
          className="text-muted-foreground hover:text-foreground cursor-pointer text-base transition-colors"
        >
          {stopLabel}
        </button>
      )}
    </div>
  )
}
