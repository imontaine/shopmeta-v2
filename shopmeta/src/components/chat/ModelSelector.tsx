// src/components/chat/ModelSelector.tsx
// Dropdown for selecting the AI model/provider.
// Shows all available models grouped by provider.

import { useState, useRef, useEffect } from 'react'
import { modelList, type ModelInfo } from '#/lib/ai/providers'

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
  openai: '⚡',
  anthropic: '🎭',
  google: '💎',
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
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        id="model-selector-trigger"
        data-testid="model-selector"
        onClick={() => setIsOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.35rem 0.65rem',
          borderRadius: '0.5rem',
          border: '1px solid rgba(255,255,255,0.12)',
          background: isOpen ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
          color: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: '0.8rem',
          opacity: disabled ? 0.5 : 1,
          transition: 'background 0.15s ease',
          whiteSpace: 'nowrap',
        }}
      >
        <span>{providerIcons[currentProvider] ?? '🤖'}</span>
        <span style={{ fontWeight: 500 }}>{currentInfo?.label ?? currentModel}</span>
        <span style={{ opacity: 0.5, fontSize: '0.65rem' }}>{isOpen ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          role="listbox"
          data-testid="model-dropdown"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 0.5rem)',
            left: 0,
            minWidth: '220px',
            background: 'hsl(220 13% 13%)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '0.75rem',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            zIndex: 100,
            overflow: 'hidden',
            animation: 'fadeInUp 0.12s ease',
          }}
        >
          {Object.entries(grouped).map(([provider, models]) => (
            <div key={provider}>
              <div
                style={{
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  opacity: 0.4,
                  color: 'inherit',
                }}
              >
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
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '0.45rem 0.75rem 0.45rem 1.25rem',
                      background: isSelected ? 'rgba(99,102,241,0.15)' : 'transparent',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      transition: 'background 0.1s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                    }}
                  >
                    <div style={{ fontWeight: isSelected ? 600 : 400 }}>{info.label}</div>
                    {info.description && (
                      <div style={{ fontSize: '0.7rem', opacity: 0.45, marginTop: '0.1rem' }}>
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
