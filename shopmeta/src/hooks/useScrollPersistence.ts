// src/hooks/useScrollPersistence.ts
// Saves and restores scroll position for chat threads keyed by conversationId.
// Uses sessionStorage so positions survive navigation within a session
// but don't persist across browser restarts (matches expected UX).

import { useEffect, useRef, useCallback } from 'react'

const STORAGE_PREFIX = 'shopmeta_scroll_'

/**
 * Persists scroll position for a scrollable container keyed by a unique ID.
 *
 * - On mount: restores saved position (if any)
 * - On unmount or ID change: saves current position
 * - On manual save: call `savePosition()` explicitly
 */
export function useScrollPersistence(
  containerRef: React.RefObject<HTMLElement | null>,
  key?: string,
) {
  const keyRef = useRef(key)
  keyRef.current = key

  // Save scroll position to sessionStorage
  const savePosition = useCallback(() => {
    const container = containerRef.current
    const currentKey = keyRef.current
    if (!container || !currentKey) return

    try {
      const scrollTop = container.scrollTop
      const scrollHeight = container.scrollHeight
      const clientHeight = container.clientHeight

      // Don't save if at the very bottom — reopening should go to bottom naturally
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10
      if (isAtBottom) {
        sessionStorage.removeItem(STORAGE_PREFIX + currentKey)
        return
      }

      // Save the ratio instead of absolute pixels (handles content changes)
      const ratio = scrollTop / Math.max(1, scrollHeight - clientHeight)
      sessionStorage.setItem(STORAGE_PREFIX + currentKey, JSON.stringify({
        ratio,
        scrollTop,
        timestamp: Date.now(),
      }))
    } catch {
      // sessionStorage might be unavailable
    }
  }, [containerRef])

  // Restore scroll position on mount / key change
  useEffect(() => {
    if (!key) return

    const container = containerRef.current
    if (!container) return

    try {
      const saved = sessionStorage.getItem(STORAGE_PREFIX + key)
      if (!saved) return

      const { scrollTop, timestamp } = JSON.parse(saved) as {
        ratio: number
        scrollTop: number
        timestamp: number
      }

      // Don't restore positions older than 30 minutes
      if (Date.now() - timestamp > 30 * 60 * 1000) {
        sessionStorage.removeItem(STORAGE_PREFIX + key)
        return
      }

      // Use requestAnimationFrame to ensure content is rendered
      requestAnimationFrame(() => {
        container.scrollTop = scrollTop
      })
    } catch {
      // Ignore parsing errors
    }
  }, [key, containerRef])

  // Save on unmount
  useEffect(() => {
    return () => {
      savePosition()
    }
  }, [savePosition])

  return { savePosition }
}
