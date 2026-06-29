// src/components/chat/ModelSelector.tsx
// Dropdown for selecting the AI model/provider.
// Shows all available models grouped by provider.
// Restyled with Tailwind classes (prompt-kit migration).

import { useState, useRef, useEffect } from 'react'
import { modelList, type ModelInfo } from '#/lib/ai/providers'
import { cn } from '@/lib/utils'

interface ModelSelectorProps {
  currentProvider: string
  currentModel: string
  onModelChange: (provider: string, model: string) => void
  disabled?: boolean
}

const providerLabels: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
}

const providerIcons: Record<string, string> = {
  openai: 'OAI',
  anthropic: 'ANT',
  google: 'GGL',
}

export function ModelSelector({
  currentProvider,
  currentModel,
  onModelChange,
  disabled = false,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentInfo = modelList.find(
    (m) => m.provider === currentProvider && m.model === currentModel,
  )

  // Close on outside click.
  // Use a setTimeout(0) guard so the mousedown that OPENED the dropdown
  // doesn't immediately close it again (a known issue in Playwright and
  // some React testing environments where events fire synchronously).
  useEffect(() => {
    if (!isOpen) return
    let active = false
    const timer = setTimeout(() => {
      active = true
    }, 0)
    function handleClickOutside(e: MouseEvent) {
      if (!active) return
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Group models by provider
  const grouped = modelList.reduce<Record<string, ModelInfo[]>>((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = []
    acc[m.provider]!.push(m)
    return acc
  }, {})

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        id="model-selector-trigger"
        data-testid="model-selector"
        onClick={() => setIsOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={cn(
          'border-input flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-background px-2.5 py-1.5 text-sm shadow-xs transition-colors',
          isOpen ? 'bg-muted' : 'hover:bg-muted',
          disabled && 'cursor-not-allowed opacity-50',
          !disabled && 'cursor-pointer',
        )}
      >
        <span>{providerIcons[currentProvider] ?? '🤖'}</span>
        <span className="font-medium">{currentInfo?.label ?? currentModel}</span>
        <span className="text-xs opacity-50">{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          role="listbox"
          data-testid="model-dropdown"
          className="bg-popover border-border absolute bottom-[calc(100%+0.5rem)] left-0 z-50 min-w-[220px] overflow-hidden rounded-xl border shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {Object.entries(grouped).map(([provider, models]) => (
            <div key={provider}>
              <div className="px-3 py-1.5 text-xs font-medium uppercase tracking-widest opacity-40">
                {providerIcons[provider]} {providerLabels[provider] ?? provider}
              </div>
              {models.map((info) => {
                const isSelected = info.provider === currentProvider && info.model === currentModel
                return (
                  <button
                    key={info.model}
                    role="option"
                    aria-selected={isSelected}
                    data-testid={`model-option-${info.model}`}
                    onClick={() => {
                      onModelChange(info.provider, info.model)
                      setIsOpen(false)
                    }}
                    className={cn(
                      'block w-full cursor-pointer border-none text-left text-sm transition-colors',
                      'px-3 py-2 pl-5',
                      isSelected
                        ? 'bg-primary/15 font-semibold'
                        : 'bg-transparent font-normal hover:bg-muted',
                    )}
                  >
                    <div>{info.label}</div>
                    {info.description && (
                      <div className="mt-0.5 text-xs opacity-45">
                        {info.description}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
