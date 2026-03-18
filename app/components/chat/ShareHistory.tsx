import React, { useState, useEffect, useCallback } from 'react'
import { useTheme } from 'next-themes'
import { History, Trash2, Share2, Hash } from 'lucide-react'

interface ShareHistoryEntry {
  date: string
  count: number
  session_id: string
}

const STORAGE_KEY = 'superbrain-share-history'

function loadShareHistory(): ShareHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ShareHistoryEntry[]) : []
  } catch {
    return []
  }
}

interface ShareHistoryProps {
  /** Pass externally-managed history (from useConversationLearning) to stay in sync */
  history?: ShareHistoryEntry[]
  /** External clear function (from useConversationLearning) */
  onClear?: () => void
}

const ShareHistory: React.FC<ShareHistoryProps> = ({ history: externalHistory, onClear }) => {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  // Use external history if provided, otherwise load from localStorage directly
  const [localHistory, setLocalHistory] = useState<ShareHistoryEntry[]>([])

  useEffect(() => {
    if (!externalHistory) {
      setLocalHistory(loadShareHistory())
    }
  }, [externalHistory])

  const history = externalHistory ?? localHistory

  const handleClear = useCallback(() => {
    if (onClear) {
      onClear()
    } else {
      localStorage.removeItem(STORAGE_KEY)
      setLocalHistory([])
    }
  }, [onClear])

  const totalInsights = history.reduce((sum, e) => sum + e.count, 0)
  const totalSessions = new Set(history.map((e) => e.session_id)).size

  const formatDate = (iso: string): string => {
    try {
      const d = new Date(iso)
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  const truncateSessionId = (id: string): string => {
    if (id.length <= 12) return id
    return `${id.slice(0, 6)}...${id.slice(-4)}`
  }

  if (history.length === 0) {
    return (
      <div
        className={`rounded-xl border p-6 text-center ${
          isDark
            ? 'bg-slate-800/30 border-slate-700/40'
            : 'bg-slate-50 border-slate-200'
        }`}
      >
        <Share2
          className={`w-8 h-8 mx-auto mb-3 ${
            isDark ? 'text-slate-600' : 'text-slate-300'
          }`}
        />
        <p
          className={`text-sm font-medium ${
            isDark ? 'text-slate-400' : 'text-slate-500'
          }`}
        >
          No insights shared yet
        </p>
        <p
          className={`text-xs mt-1 ${
            isDark ? 'text-slate-500' : 'text-slate-400'
          }`}
        >
          When you share conversation insights, they will appear here.
        </p>
      </div>
    )
  }

  return (
    <div
      className={`rounded-xl border ${
        isDark
          ? 'bg-slate-800/30 border-slate-700/40'
          : 'bg-slate-50 border-slate-200'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-inherit">
        <div className="flex items-center space-x-2">
          <History
            className={`w-4 h-4 ${
              isDark ? 'text-blue-400' : 'text-blue-600'
            }`}
          />
          <h3
            className={`text-sm font-semibold ${
              isDark ? 'text-slate-200' : 'text-slate-700'
            }`}
          >
            Share History
          </h3>
        </div>
        <button
          onClick={handleClear}
          className={`inline-flex items-center space-x-1 px-2 py-1 rounded-md text-xs transition-colors ${
            isDark
              ? 'text-slate-500 hover:text-red-400 hover:bg-red-900/20'
              : 'text-slate-400 hover:text-red-500 hover:bg-red-50'
          }`}
        >
          <Trash2 className="w-3 h-3" />
          <span>Clear</span>
        </button>
      </div>

      {/* Summary */}
      <div
        className={`px-4 py-3 border-b border-inherit ${
          isDark ? 'bg-slate-800/20' : 'bg-slate-100/50'
        }`}
      >
        <p
          className={`text-xs ${
            isDark ? 'text-slate-300' : 'text-slate-600'
          }`}
        >
          You&apos;ve shared{' '}
          <span
            className={`font-semibold ${
              isDark ? 'text-blue-400' : 'text-blue-600'
            }`}
          >
            {totalInsights} insight{totalInsights !== 1 ? 's' : ''}
          </span>{' '}
          across{' '}
          <span
            className={`font-semibold ${
              isDark ? 'text-blue-400' : 'text-blue-600'
            }`}
          >
            {totalSessions} session{totalSessions !== 1 ? 's' : ''}
          </span>
          .
        </p>
      </div>

      {/* Entry list */}
      <div className="max-h-64 overflow-y-auto">
        {[...history].reverse().map((entry, idx) => (
          <div
            key={`${entry.date}-${idx}`}
            className={`flex items-center justify-between px-4 py-2.5 text-xs border-b last:border-b-0 border-inherit transition-colors ${
              isDark ? 'hover:bg-slate-700/20' : 'hover:bg-slate-100/80'
            }`}
          >
            <div className="flex flex-col space-y-0.5 min-w-0">
              <span
                className={`font-medium ${
                  isDark ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                {formatDate(entry.date)}
              </span>
              <span
                className={`flex items-center space-x-1 ${
                  isDark ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                <Hash className="w-3 h-3 flex-shrink-0" />
                <span className="font-mono">{truncateSessionId(entry.session_id)}</span>
              </span>
            </div>
            <div
              className={`flex items-center space-x-1 flex-shrink-0 px-2 py-0.5 rounded-full ${
                isDark
                  ? 'bg-blue-900/30 text-blue-400'
                  : 'bg-blue-100 text-blue-600'
              }`}
            >
              <Share2 className="w-3 h-3" />
              <span className="font-semibold">
                {entry.count} insight{entry.count !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ShareHistory
