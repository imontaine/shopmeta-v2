// src/components/dashboard/Widget.tsx
// Individual widget container for the dashboard grid.
// Provides: drag handle, header, loading/error states, remove button.

import React from 'react'

export interface WidgetProps {
  /** Widget ID (must match layout item `i`) */
  id: string
  /** Widget display name */
  title: string
  /** Widget type: chart | table | kpi */
  type?: 'chart' | 'table' | 'kpi' | string
  /** If true, shows loading skeleton */
  loading?: boolean
  /** If set, shows error message instead of content */
  error?: string
  /** Called when the remove button is clicked */
  onRemove?: (id: string) => void
  /** Called when the edit button is clicked */
  onEdit?: (id: string) => void
  children?: React.ReactNode
  className?: string
}

const TYPE_ICONS: Record<string, string> = {
  chart: 'C',
  table: 'T',
  kpi: '#',
}

export function Widget({
  id,
  title,
  type = 'chart',
  loading = false,
  error,
  onRemove,
  onEdit,
  children,
  className,
}: WidgetProps) {
  return (
    <div
      data-testid={`widget-${id}`}
      data-widget-id={id}
      data-widget-type={type}
      className={className}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'hsl(var(--muted, 240 4.8% 15.88%) / 0.4)',
        border: '1px solid hsl(var(--border, 240 3.7% 25%))',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {/* Header with drag handle */}
      <div
        className="widget-drag-handle"
        data-testid={`widget-header-${id}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          borderBottom: '1px solid hsl(var(--border, 240 3.7% 25%))',
          background: 'hsl(var(--muted, 240 4.8% 15.88%))',
          cursor: 'grab',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        {/* Drag indicator */}
        <span aria-hidden="true" style={{ opacity: 0.4, fontSize: '0.85rem' }}>⠿</span>

        {/* Type icon */}
        <span aria-hidden="true" style={{ fontSize: '0.85rem' }}>
          {TYPE_ICONS[type] ?? 'C'}
        </span>

        {/* Title */}
        <h3
          data-testid={`widget-title-${id}`}
          style={{
            flex: 1,
            margin: 0,
            fontSize: '0.82rem',
            fontWeight: 600,
            color: 'hsl(var(--foreground, 0 0% 98%))',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </h3>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {onEdit && (
            <button
              data-testid={`widget-edit-${id}`}
              onClick={() => onEdit(id)}
              aria-label={`Edit ${title} widget`}
              style={{
                padding: '2px 6px',
                fontSize: '0.72rem',
                border: '1px solid hsl(var(--border, 240 3.7% 25%))',
                borderRadius: '3px',
                background: 'transparent',
                color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
                cursor: 'pointer',
              }}
            >
              Edit
            </button>
          )}
          {onRemove && (
            <button
              data-testid={`widget-remove-${id}`}
              onClick={() => onRemove(id)}
              aria-label={`Remove ${title} widget`}
              style={{
                padding: '2px 6px',
                fontSize: '0.72rem',
                border: '1px solid hsl(var(--border, 240 3.7% 25%))',
                borderRadius: '3px',
                background: 'transparent',
                color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
                cursor: 'pointer',
              }}
            >
              x
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div
        data-testid={`widget-body-${id}`}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '8px',
        }}
      >
        {loading ? (
          <div
            data-testid={`widget-loading-${id}`}
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'hsl(var(--muted-foreground, 240 5% 64.9%))',
              fontSize: '0.82rem',
            }}
          >
            Loading…
          </div>
        ) : error ? (
          <div
            data-testid={`widget-error-${id}`}
            style={{
              padding: '8px',
              color: 'hsl(0 72% 70%)',
              fontSize: '0.82rem',
              background: 'hsl(0 72% 51% / 0.1)',
              borderRadius: '4px',
            }}
          >
            {error}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
