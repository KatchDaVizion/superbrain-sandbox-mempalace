import { useState, useCallback, useEffect } from 'react'

export interface ConversationSummary {
  id: string
  title: string
  model: string
  createdAt: string
  messageCount: number
  lastMessage: string
}

const STORAGE_KEY = 'superbrain-chat-history'

function readStorage(): ConversationSummary[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as ConversationSummary[]
  } catch {
    return []
  }
}

function writeStorage(conversations: ConversationSummary[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations))
}

export const useChatHistory = () => {
  const [conversations, setConversations] = useState<ConversationSummary[]>(() => readStorage())

  // Keep state in sync if another tab/component writes to storage
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setConversations(readStorage())
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const getConversations = useCallback((): ConversationSummary[] => {
    const data = readStorage()
    return data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [])

  const addConversation = useCallback((summary: ConversationSummary) => {
    const current = readStorage()
    // Avoid duplicates - update if exists
    const exists = current.find((c) => c.id === summary.id)
    let updated: ConversationSummary[]
    if (exists) {
      updated = current.map((c) => (c.id === summary.id ? summary : c))
    } else {
      updated = [summary, ...current]
    }
    writeStorage(updated)
    setConversations(updated)
  }, [])

  const deleteConversation = useCallback((id: string) => {
    const current = readStorage()
    const updated = current.filter((c) => c.id !== id)
    writeStorage(updated)
    setConversations(updated)
  }, [])

  const clearAll = useCallback(() => {
    writeStorage([])
    setConversations([])
  }, [])

  return {
    conversations,
    getConversations,
    addConversation,
    deleteConversation,
    clearAll,
  }
}
