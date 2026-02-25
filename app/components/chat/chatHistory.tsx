// app/components/chat/chatHistory.tsx
import React, { useState } from 'react'
import { useChatManager } from '@/app/hooks/useChatManager'
import { MessageCircle, Trash2, Clock, Hash } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog'
import { formatTime } from '@/app/utils/timeFormatter'
import { getDisplayTitle } from '@/app/utils/title'
import { Thread } from '@/app/types/chat'
import { useTheme } from 'next-themes'
import { getChatHistoryTheme } from '@/app/utils/theme'
import HistoryMarkdownAssistance from './HistoryMarkdownAssistance'
import { useRagChatManager } from '@/app/hooks/useRagChatManager'

type ChatHistoryProps = {
  selectedModel: string | null
  chatType?: 'ollama' | 'rag'
  selectedCollection?: string | null
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ selectedModel, selectedCollection, chatType = 'ollama' }) => {
  const { theme } = useTheme()
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const manager = chatType === 'rag' ? useRagChatManager(selectedCollection!) : useChatManager(selectedModel!)
  const { threads, currentThread, selectThread, deleteThread } = manager
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [threadToDelete, setThreadToDelete] = useState<Thread | null>(null)

  // Filter out threads with no messages and sort by most recent
  const validThreads = threads
    .filter((thread) => thread.messages && thread.messages.length > 0)
    .sort((a, b) => {
      const timeA = a.lastTimestamp ? new Date(a.lastTimestamp).getTime() : 0
      const timeB = b.lastTimestamp ? new Date(b.lastTimestamp).getTime() : 0
      return timeB - timeA // Most recent first
    })

  // Show "no collection selected" for RAG
  if (chatType === 'rag' && !selectedCollection) {
    return (
      <div className="w-80 border-r border-border bg-card/50 backdrop-blur-sm p-6 flex flex-col items-center justify-center min-h-[400px]">
        <MessageCircle className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground text-center">Please select a collection to view RAG chat history.</p>
      </div>
    )
  }

  if (chatType === 'ollama' && !selectedModel) {
    return (
      <div className="w-80 border-r border-border bg-card/50 backdrop-blur-sm p-6 flex flex-col items-center justify-center min-h-[400px]">
        <MessageCircle className="w-12 h-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground text-center">Please select a model to view chat history.</p>
      </div>
    )
  }

  const handleDeleteClick = (thread: Thread, e: React.MouseEvent) => {
    e.stopPropagation()
    setThreadToDelete(thread)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!threadToDelete) return
    setDeletingThreadId(threadToDelete.id)
    setDeleteDialogOpen(false)
    try {
      await deleteThread(threadToDelete.id)
    } catch (error) {
      console.error('Failed to delete thread:', error)
    } finally {
      setDeletingThreadId(null)
      setThreadToDelete(null)
    }
  }

  const handleCancelDelete = () => {
    setDeleteDialogOpen(false)
    setThreadToDelete(null)
  }

  const handleThreadSelect = (threadId: string) => {
    if (deletingThreadId) return
    selectThread(threadId)
  }

  const isCurrentlySelected = threadToDelete?.id === currentThread?.id

  return (
    <>
      <div
        className={`w-40 lg:w-58 2xl:w-80 rounded-2xl border-r border-border backdrop-blur-sm flex flex-col h-full ${getChatHistoryTheme(theme || 'light', false).container}`}
      >
        {/* Header */}
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground flex items-center">
            <MessageCircle className="w-5 h-5 mr-2 text-primary" />
            Chat History ({validThreads.length})
          </h2>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {validThreads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <MessageCircle className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm mb-2">No conversations yet</p>
              <p className="text-xs text-muted-foreground">Start a new chat to see your history here</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {validThreads.map((thread: Thread) => {
                const displayTitle = getDisplayTitle(thread)
                const isDeleting = deletingThreadId === thread.id
                const styles = getChatHistoryTheme(theme || 'light', currentThread?.id === thread.id)

                return (
                  <div
                    key={thread.id}
                    className={`p-3 rounded-lg cursor-pointer transition-all group relative ${styles.thread} ${isDeleting ? 'opacity-50 pointer-events-none' : ''}`}
                    onClick={() => handleThreadSelect(thread.id)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className={`text-sm font-medium truncate flex-1 ${styles.title}`} title={displayTitle}>
                        {displayTitle}
                      </h3>

                      <button
                        onClick={(e) => handleDeleteClick(thread, e)}
                        disabled={isDeleting}
                        className="opacity-0 group-hover:opacity-100 ml-2 p-1 hover:bg-destructive/10 hover:text-destructive rounded transition-all shrink-0 disabled:opacity-50"
                        title="Delete conversation"
                      >
                        {isDeleting ? (
                          <div className="w-3 h-3 border border-destructive border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </button>
                    </div>

                    <p className={`text-xs truncate mb-2 leading-relaxed ${styles.text}`}>
                      <HistoryMarkdownAssistance content={thread.lastMessage || 'No messages yet'} />
                    </p>

                    <div className={`flex items-center justify-between text-xs ${styles.text}`}>
                      <div className="flex items-center">
                        <Hash className="w-3 h-3 mr-1" />
                        <span>{thread.messages?.length || 0} messages</span>
                      </div>
                      {thread.lastTimestamp && (
                        <div className="flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          <span>{formatTime(thread.lastTimestamp)}</span>
                        </div>
                      )}
                    </div>

                    {currentThread?.id === thread.id && (
                      <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-1 h-8 bg-blue-600 rounded-r-full"></div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
            <AlertDialogDescription>
              {isCurrentlySelected
                ? 'Are you sure you want to delete this conversation? This will automatically select the next available conversation. This action cannot be undone.'
                : 'Are you sure you want to delete this conversation? This action cannot be undone.'}
              {threadToDelete && (
                <div className="mt-3 p-3 bg-muted rounded-md">
                  <p className="text-sm font-medium text-foreground">"{getDisplayTitle(threadToDelete)}"</p>
                  <p className="text-xs text-muted-foreground mt-1">{threadToDelete.messages?.length || 0} messages</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDelete}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default ChatHistory
