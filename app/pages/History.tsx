import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from 'next-themes'
import { Clock, Trash2, MessageSquare, AlertTriangle } from 'lucide-react'
import DashboardLayout from '../components/shared/DashboardLayout'
import { useChatHistory, type ConversationSummary } from '../hooks/useChatHistory'

type DateGroup = 'Today' | 'Yesterday' | 'This Week' | 'Older'

function getDateGroup(dateStr: string): DateGroup {
  const date = new Date(dateStr)
  const now = new Date()

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfWeek.getDate() - startOfToday.getDay())

  if (date >= startOfToday) return 'Today'
  if (date >= startOfYesterday) return 'Yesterday'
  if (date >= startOfWeek) return 'This Week'
  return 'Older'
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const History = () => {
  const { theme, resolvedTheme } = useTheme()
  const navigate = useNavigate()
  const { conversations, deleteConversation, clearAll } = useChatHistory()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)

  // Sort by date descending
  const sorted = useMemo(() => {
    return [...conversations].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }, [conversations])

  // Group by date
  const grouped = useMemo(() => {
    const groups: Record<DateGroup, ConversationSummary[]> = {
      Today: [],
      Yesterday: [],
      'This Week': [],
      Older: [],
    }
    for (const conv of sorted) {
      const group = getDateGroup(conv.createdAt)
      groups[group].push(conv)
    }
    return groups
  }, [sorted])

  const groupOrder: DateGroup[] = ['Today', 'Yesterday', 'This Week', 'Older']

  const handleOpen = (conv: ConversationSummary) => {
    navigate('/chat', { state: { loadConversationId: conv.id, loadModel: conv.model } })
  }

  const handleDelete = (id: string) => {
    if (confirmDeleteId === id) {
      deleteConversation(id)
      setConfirmDeleteId(null)
    } else {
      setConfirmDeleteId(id)
    }
  }

  const handleClearAll = () => {
    if (confirmClearAll) {
      clearAll()
      setConfirmClearAll(false)
    } else {
      setConfirmClearAll(true)
    }
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full w-full max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 mt-4">
          <div className="flex items-center gap-3">
            <Clock className="text-blue-500" size={28} />
            <h1 className={`text-3xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              History
            </h1>
          </div>
          {sorted.length > 0 && (
            <button
              onClick={handleClearAll}
              className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-all ${
                confirmClearAll
                  ? 'bg-red-600 text-white border-red-600'
                  : isDark
                    ? 'border-gray-600 text-gray-400 hover:text-red-400 hover:border-red-500/40'
                    : 'border-gray-300 text-gray-500 hover:text-red-500 hover:border-red-300'
              }`}
            >
              {confirmClearAll && <AlertTriangle size={14} />}
              {confirmClearAll ? 'Confirm Clear All' : 'Clear All'}
            </button>
          )}
        </div>

        {/* Empty State */}
        {sorted.length === 0 && (
          <div
            className={`flex flex-col items-center justify-center py-20 rounded-lg border ${
              isDark ? 'bg-gray-800/30 border-gray-700' : 'bg-gray-50 border-gray-200'
            }`}
          >
            <MessageSquare
              className={`mb-4 ${isDark ? 'text-gray-600' : 'text-gray-300'}`}
              size={48}
            />
            <p className={`text-lg font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              No conversations yet
            </p>
            <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              Start chatting with an AI model and your conversations will appear here.
            </p>
            <button
              onClick={() => navigate('/chat')}
              className="mt-6 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
            >
              Start a Chat
            </button>
          </div>
        )}

        {/* Grouped Conversations */}
        {groupOrder.map((group) => {
          const items = grouped[group]
          if (items.length === 0) return null
          return (
            <div key={group} className="mb-6">
              <h2
                className={`text-xs font-semibold uppercase tracking-wider mb-3 ${
                  isDark ? 'text-gray-500' : 'text-gray-400'
                }`}
              >
                {group}
              </h2>
              <div className="space-y-2">
                {items.map((conv) => (
                  <div
                    key={conv.id}
                    className={`group flex items-center justify-between rounded-lg border p-4 cursor-pointer transition-all ${
                      isDark
                        ? 'bg-gray-800/50 border-gray-700 hover:border-blue-500/40 hover:bg-gray-800'
                        : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-sm'
                    }`}
                    onClick={() => handleOpen(conv)}
                  >
                    <div className="flex-1 min-w-0 mr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <h3
                          className={`text-sm font-medium truncate ${
                            isDark ? 'text-white' : 'text-gray-900'
                          }`}
                        >
                          {conv.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            isDark
                              ? 'bg-blue-900/40 text-blue-300'
                              : 'bg-blue-50 text-blue-600'
                          }`}
                        >
                          {conv.model}
                        </span>
                        <span
                          className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}
                        >
                          {conv.messageCount} message{conv.messageCount !== 1 ? 's' : ''}
                        </span>
                        <span
                          className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}
                        >
                          {formatTime(conv.createdAt)} &middot; {formatDate(conv.createdAt)}
                        </span>
                      </div>
                      {conv.lastMessage && (
                        <p
                          className={`text-xs mt-1.5 truncate ${
                            isDark ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        >
                          {conv.lastMessage}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(conv.id)
                      }}
                      className={`flex-shrink-0 p-2 rounded-lg transition-all ${
                        confirmDeleteId === conv.id
                          ? 'bg-red-600 text-white'
                          : isDark
                            ? 'text-gray-600 hover:text-red-400 hover:bg-gray-700 opacity-0 group-hover:opacity-100'
                            : 'text-gray-300 hover:text-red-500 hover:bg-gray-100 opacity-0 group-hover:opacity-100'
                      }`}
                      title={confirmDeleteId === conv.id ? 'Click again to confirm' : 'Delete'}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </DashboardLayout>
  )
}

export default History
