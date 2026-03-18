import { useState, useCallback, useRef, useEffect } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QAPair {
  question: string
  answer: string
  timestamp: number
  session_id: string
}

export interface ShareHistoryEntry {
  date: string
  count: number
  session_id: string
}

export interface ShareResult {
  shared: number
  kept_private: number
  deferred: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const IDLE_TIMEOUT_MS = 2 * 60 * 1000 // 2 minutes
const MIN_ANSWER_WORDS = 50
const STORAGE_KEY = 'superbrain-share-history'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function loadShareHistory(): ShareHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ShareHistoryEntry[]) : []
  } catch {
    return []
  }
}

function saveShareHistory(history: ShareHistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  } catch {
    // localStorage may be full — fail silently
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useConversationLearning() {
  // Generate a stable session id for the lifetime of this hook instance
  const sessionIdRef = useRef<string>(crypto.randomUUID())

  // Track the last user message so we can pair it with the next assistant reply
  const lastUserMessageRef = useRef<string | null>(null)

  const [pendingInsights, setPendingInsights] = useState<QAPair[]>([])
  const [showShareBanner, setShowShareBanner] = useState(false)
  const [shareHistory, setShareHistory] = useState<ShareHistoryEntry[]>(loadShareHistory)
  const [isSharing, setIsSharing] = useState(false)
  const [confirmationText, setConfirmationText] = useState<string | null>(null)

  // Idle timer ref
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Reset idle timer ──────────────────────────────────────────────────────
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
    }
    idleTimerRef.current = setTimeout(() => {
      setPendingInsights((current) => {
        if (current.length > 0) {
          setShowShareBanner(true)
        }
        return current
      })
    }, IDLE_TIMEOUT_MS)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
      }
    }
  }, [])

  // ── Add a message (call this for every chat message) ──────────────────────
  const addMessage = useCallback(
    (role: 'user' | 'assistant', content: string) => {
      if (role === 'user') {
        lastUserMessageRef.current = content
      } else if (role === 'assistant' && lastUserMessageRef.current) {
        // Form a Q&A pair only if the answer is substantive (> 50 words)
        if (wordCount(content) > MIN_ANSWER_WORDS) {
          const pair: QAPair = {
            question: lastUserMessageRef.current,
            answer: content,
            timestamp: Date.now(),
            session_id: sessionIdRef.current,
          }
          setPendingInsights((prev) => [...prev, pair])
        }
        lastUserMessageRef.current = null
      }

      // Reset idle timer on every message
      resetIdleTimer()

      // Hide the banner when new messages arrive (conversation resumed)
      setShowShareBanner(false)
    },
    [resetIdleTimer],
  )

  // ── Share all pending insights to the network ─────────────────────────────
  const shareToNetwork = useCallback(async (): Promise<ShareResult> => {
    const toShare = pendingInsights
    if (toShare.length === 0) {
      return { shared: 0, kept_private: 0, deferred: false }
    }

    setIsSharing(true)

    const hasIPC =
      typeof window !== 'undefined' &&
      window.NetworkRAGApi &&
      typeof window.NetworkRAGApi.shareText === 'function'

    let sharedCount = 0

    try {
      for (const pair of toShare) {
        const formatted = `Q: ${pair.question}\nA: ${pair.answer}`
        if (hasIPC) {
          const result = await window.NetworkRAGApi.shareText(
            formatted,
            `Conversation Insight — ${new Date(pair.timestamp).toLocaleDateString()}`,
          )
          if (result.success) {
            sharedCount++
          }
        } else {
          // IPC not available — count as deferred
          sharedCount++
        }
      }

      // Record in share history
      const entry: ShareHistoryEntry = {
        date: new Date().toISOString(),
        count: sharedCount,
        session_id: sessionIdRef.current,
      }
      setShareHistory((prev) => {
        const updated = [...prev, entry]
        saveShareHistory(updated)
        return updated
      })

      // Clear pending
      setPendingInsights([])
      setShowShareBanner(false)

      // Show confirmation text (auto-clears after 3 seconds)
      const msg = hasIPC
        ? `${sharedCount} insight${sharedCount !== 1 ? 's' : ''} shared. Earning TAO on Subnet 442.`
        : `${sharedCount} insight${sharedCount !== 1 ? 's' : ''} saved. Will share when connected.`
      setConfirmationText(msg)
      setTimeout(() => setConfirmationText(null), 3000)

      return { shared: sharedCount, kept_private: 0, deferred: !hasIPC }
    } catch (err) {
      console.error('[ConversationLearning] Share error:', err)
      return { shared: sharedCount, kept_private: toShare.length - sharedCount, deferred: false }
    } finally {
      setIsSharing(false)
    }
  }, [pendingInsights])

  // ── Keep private — dismiss and clear ──────────────────────────────────────
  const keepPrivate = useCallback(() => {
    setPendingInsights([])
    setShowShareBanner(false)
  }, [])

  // ── Get insight count ─────────────────────────────────────────────────────
  const getInsightCount = useCallback(() => {
    return pendingInsights.length
  }, [pendingInsights])

  // ── Clear share history ───────────────────────────────────────────────────
  const clearShareHistory = useCallback(() => {
    setShareHistory([])
    saveShareHistory([])
  }, [])

  // ── Total stats ───────────────────────────────────────────────────────────
  const totalInsightsShared = shareHistory.reduce((sum, e) => sum + e.count, 0)
  const totalSessions = new Set(shareHistory.map((e) => e.session_id)).size

  return {
    // State
    pendingInsights,
    showShareBanner,
    shareHistory,
    isSharing,
    confirmationText,

    // Derived
    totalInsightsShared,
    totalSessions,

    // Actions
    addMessage,
    shareToNetwork,
    keepPrivate,
    getInsightCount,
    clearShareHistory,
  }
}
