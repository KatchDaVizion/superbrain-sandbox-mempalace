/**
 * Simplified useChatManager Hook - Thread and message management
 * 
 * This hook provides comprehensive thread management functionality using:
 * - Simple object store with event emitters
 * - No classes or context - just plain JavaScript objects
 * - Thread creation, selection, and deletion
 * - Message appending with optimistic updates
 * - Proper error handling and state synchronization
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChatManager, ChatMessage, Role, Thread } from '../types/chat'

// ------------------ Simple Global Store ------------------

type StoreState = {
  threads: Thread[]
  currentThread: Thread | null
  selectedModel: string | null
  isLoadingThread: boolean // NEW: Track thread loading state
}

type StoreListener = (state: StoreState) => void

// Simple store object with event emitter pattern
const createChatStore = () => {
  let state: StoreState = {
    threads: [],
    currentThread: null,
    selectedModel: null,
    isLoadingThread: false, // NEW: Initialize loading state
  }

  const listeners = new Set<StoreListener>()

  return {
    // Subscribe to state changes
    subscribe: (listener: StoreListener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    // Get current state
    getState: () => ({ ...state }),

    // Update state and notify listeners
    setState: (updates: Partial<StoreState>) => {
      state = { ...state, ...updates }
      listeners.forEach(listener => listener(state))
    },

    // Convenience methods with logging
    updateCurrentThread: (thread: Thread | null) => {
      console.log('Store: Updating current thread:', thread?.id, 'Messages:', thread?.messages?.length)
      state = { ...state, currentThread: thread }
      listeners.forEach(listener => listener(state))
    },

    updateThreads: (threads: Thread[]) => {
      console.log('Store: Updating threads:', threads.length)
      state = { ...state, threads }
      listeners.forEach(listener => listener(state))
    },

    setSelectedModel: (model: string | null) => {
      console.log('Store: Setting selected model:', model)
      state = { ...state, selectedModel: model }
      listeners.forEach(listener => listener(state))
    },

    clearCurrentThread: () => {
      console.log('Store: Clearing current thread')
      state = { ...state, currentThread: null }
      listeners.forEach(listener => listener(state))
    },

    // NEW: Thread loading state methods
    setLoadingThread: (isLoading: boolean) => {
      console.log('Store: Setting thread loading state:', isLoading)
      state = { ...state, isLoadingThread: isLoading }
      listeners.forEach(listener => listener(state))
    }
  }
}

// Global store instance
const chatStore = createChatStore()

// ------------------ Main Hook ------------------

/**
 * Enhanced chat manager hook with comprehensive error handling
 * @param selectedModel Currently selected model identifier
 * @returns ChatManager interface with all thread operations
 */
export const useChatManager = (selectedModel: string | null): ChatManager & { isLoadingThread: boolean } => {
  const [state, setState] = useState(chatStore.getState())
  const isInitialized = useRef<boolean>(false)
  const modelRef = useRef<string | null>(selectedModel)

  // Subscribe to store changes
  useEffect(() => {
    const unsubscribe = chatStore.subscribe(setState)
    return unsubscribe
  }, [])

  // ------------------- Model Change Handling -------------------

  /**
   * Handle model changes with proper cleanup and reinitialization
   */
  useEffect(() => {
    if (selectedModel !== state.selectedModel) {
      console.log('Model changed from', state.selectedModel, 'to', selectedModel)
      chatStore.setSelectedModel(selectedModel)

      // Clear current thread when model actually changes (not initial load)
      if (modelRef.current && modelRef.current !== selectedModel) {
        console.log('Model changed, clearing current thread')
        chatStore.clearCurrentThread()
      }

      modelRef.current = selectedModel
    }
  }, [selectedModel, state.selectedModel])

  /**
   * Load and initialize threads for the selected model
   */
  useEffect(() => {
    // Reset state if no model selected
    if (!selectedModel) {
      chatStore.updateThreads([])
      chatStore.clearCurrentThread()
      chatStore.setLoadingThread(false)
      isInitialized.current = false
      return
    }

    // Skip if already initialized for this model
    if (isInitialized.current && selectedModel === state.selectedModel) {
      return
    }

    console.log('Loading threads for model:', selectedModel)

    // Load threads from backend
    ;(window as any).electron
      .invoke('chat:list-threads', selectedModel)
      .then((threads: Thread[]) => {
        // Filter out empty threads and initialize with metadata
        const threadsWithMessages = threads.filter((thread) => 
          thread.messages && thread.messages.length > 0
        )

        const initializedThreads = threadsWithMessages.map((thread) => ({
          ...thread,
          lastMessage: thread.messages[thread.messages.length - 1]?.content || '',
          lastTimestamp: thread.messages[thread.messages.length - 1]?.timestamp || thread.createdAt,
          __version: Date.now(),
        }))

        chatStore.updateThreads(initializedThreads)

        // Auto-select most recent thread if none currently selected
        if (initializedThreads.length > 0 && !state.currentThread) {
          console.log('Auto-selecting most recent thread:', initializedThreads[0].id)
          chatStore.updateCurrentThread(initializedThreads[0])
        }

        isInitialized.current = true
        console.log('Loaded threads for model:', selectedModel, initializedThreads.length)
      })
      .catch((error) => {
        console.error('Failed to load threads:', error)
        chatStore.updateThreads([])
        chatStore.clearCurrentThread()
      })
  }, [selectedModel])

  // ------------------- Thread Operations -------------------

  /**
   * Create a new thread with enhanced error handling
   * @param title Optional thread title (defaults to 'New Chat')
   * @returns Promise resolving to created thread or null if failed
   */
  const createThread = useCallback(
    async (title?: string): Promise<Thread | null> => {
      if (!selectedModel) {
        console.warn('createThread: No selected model')
        return null
      }

      console.log('ChatManager: Creating thread with title:', title)

      try {
        const newThread: Thread | null = await (window as any).electron.invoke('chat:create-thread', {
          modelId: selectedModel,
          title: title || 'New Chat',
        })

        if (newThread) {
          const initializedThread: Thread = {
            ...newThread,
            messages: newThread.messages || [],
            lastMessage: '',
            lastTimestamp: newThread.createdAt,
            __version: Date.now(),
          }

          // Update store state immediately
          const updatedThreads = [initializedThread, ...state.threads]
          chatStore.updateThreads(updatedThreads)
          chatStore.updateCurrentThread(initializedThread)

          console.log('Created new thread:', initializedThread.id, 'with title:', initializedThread.title)
          
          // Brief delay to ensure state synchronization
          await new Promise(resolve => setTimeout(resolve, 50))
          
          return initializedThread
        } else {
          throw new Error('Backend returned null thread')
        }
      } catch (error) {
        console.error('Failed to create thread:', error)
        
        // Clean up stale state if creation fails
        if (!state.currentThread || state.currentThread.messages?.length === 0) {
          chatStore.clearCurrentThread()
        }
        
        return null
      }
    },
    [selectedModel, state.threads]
  )

  /**
   * Refresh current thread data from backend
   * Ensures UI stays synchronized with persistent storage
   */
  const refreshCurrentThread = useCallback(async (): Promise<void> => {
    if (!selectedModel || !state.currentThread) {
      console.warn('refreshCurrentThread: Missing model or thread')
      return
    }

    try {
      console.log('Refreshing current thread:', state.currentThread.id)

      const freshThread = await (window as any).electron.invoke(
        'chat:get-thread',
        state.currentThread.id,
        selectedModel
      )

      if (freshThread && freshThread.messages) {
        const updatedThread = {
          ...freshThread,
          messages: freshThread.messages || [],
          lastMessage: freshThread.messages[freshThread.messages.length - 1]?.content || '',
          lastTimestamp: freshThread.messages[freshThread.messages.length - 1]?.timestamp || freshThread.createdAt,
          __version: Date.now(),
        }

        // Update both current thread and threads list
        const updatedThreads = state.threads.map((t) => 
          t.id === updatedThread.id ? updatedThread : t
        )
        chatStore.updateThreads(updatedThreads)
        chatStore.updateCurrentThread(updatedThread)

        console.log('Refreshed thread data:', {
          threadId: updatedThread.id,
          messageCount: updatedThread.messages.length,
        })
      } else {
        console.warn('No thread data received during refresh')
      }
    } catch (error) {
      console.error('Failed to refresh thread data:', error)
    }
  }, [selectedModel, state.currentThread, state.threads])

  /**
   * Select and load a specific thread with loading state
   * @param threadId Thread identifier to select
   */
  const selectThread = useCallback(
    async (threadId: string): Promise<void> => {
      console.log('selectThread called with:', threadId, 'selectedModel:', selectedModel)

      if (!selectedModel) {
        console.warn('selectThread: No selected model')
        return
      }

      // NEW: Set loading state at the beginning
      chatStore.setLoadingThread(true)

      // Clear current thread to avoid UI confusion during loading
      chatStore.clearCurrentThread()

      try {
        // Fetch fresh thread data from backend
        const freshThread = await (window as any).electron.invoke('chat:get-thread', threadId, selectedModel)

        if (freshThread && freshThread.messages) {
          const updatedThread = {
            ...freshThread,
            messages: freshThread.messages || [],
            lastMessage: freshThread.messages[freshThread.messages.length - 1]?.content || '',
            lastTimestamp: freshThread.messages[freshThread.messages.length - 1]?.timestamp || freshThread.createdAt,
            __version: Date.now(),
          }

          console.log('Fresh thread data from backend:', {
            threadId: updatedThread.id,
            messageCount: updatedThread.messages.length,
          })

          // Update threads list and set as current thread
          const updatedThreads = state.threads.map((t) => 
            t.id === threadId ? updatedThread : t
          )
          chatStore.updateThreads(updatedThreads)
          chatStore.updateCurrentThread(updatedThread)
        } else {
          console.warn('No thread data received from backend for thread:', threadId)
        }
      } catch (error) {
        console.error('Failed to fetch thread data:', error)
      } finally {
        // NEW: Clear loading state when done
        chatStore.setLoadingThread(false)
      }
    },
    [state.threads, selectedModel]
  )

  /**
   * Append a message to the current thread
   * Uses optimistic updates for immediate UI response
   * @param role Message role (user or assistant)
   * @param content Message content
   */
  const appendMessage = useCallback(
    async (role: Role, content: string): Promise<void> => {
      if (!selectedModel || !state.currentThread) {
        console.warn('appendMessage: Missing model or current thread')
        return
      }

      const newMessage: ChatMessage = {
        id: `${Date.now()}-${role}`,
        role,
        content,
        timestamp: new Date().toISOString(),
      }

      // Optimistic UI update
      const updatedThread = {
        ...state.currentThread,
        messages: [...(state.currentThread.messages || []), newMessage],
        lastMessage: content,
        lastTimestamp: newMessage.timestamp,
        __version: Date.now(),
      }

      // Update store immediately for UI responsiveness
      const updatedThreads = state.threads.map((t) => 
        t.id === updatedThread.id ? updatedThread : t
      )
      chatStore.updateThreads(updatedThreads)
      chatStore.updateCurrentThread(updatedThread)

      // Persist to backend
      try {
        const response = await (window as any).electron.invoke('chat:append-message', {
          modelId: selectedModel,
          threadId: state.currentThread.id,
          message: { role, content },
        })

        if (response.ok && response.thread) {
          const backendThread: Thread = {
            ...response.thread,
            messages: [...(response.thread.messages || [])],
            lastMessage: response.thread.messages[response.thread.messages.length - 1]?.content || '',
            lastTimestamp: response.thread.messages[response.thread.messages.length - 1]?.timestamp || new Date().toISOString(),
            __version: Date.now(),
          }

          // Update store with authoritative backend data
          const finalThreads = state.threads.map((t) => 
            t.id === backendThread.id ? backendThread : t
          )
          chatStore.updateThreads(finalThreads)
          chatStore.updateCurrentThread(backendThread)
        }
      } catch (error) {
        console.warn('Failed to persist message to backend:', error)
        // UI already updated optimistically, so don't revert
      }
    },
    [selectedModel, state.currentThread, state.threads]
  )

  /**
   * Delete a thread with smart auto-selection
   * @param threadId Thread identifier to delete
   */
  const deleteThread = useCallback(
    async (threadId: string): Promise<void> => {
      if (!selectedModel) {
        console.warn('deleteThread: No selected model')
        return
      }

      try {
        // Remember position for smart auto-selection
        const currentIndex = state.threads.findIndex((t) => t.id === threadId)
        const isCurrentThread = state.currentThread?.id === threadId

        const response = await (window as any).electron.invoke('chat:delete-thread', threadId, selectedModel)

        if (response.ok) {
          const updatedThreads = response.threads.map((thread: Thread) => ({
            ...thread,
            messages: thread.messages || [],
            lastMessage: thread.messages[thread.messages.length - 1]?.content || '',
            lastTimestamp: thread.messages[thread.messages.length - 1]?.timestamp || thread.createdAt,
            __version: Date.now(),
          }))

          chatStore.updateThreads(updatedThreads)

          // Smart auto-selection after deletion
          if (isCurrentThread && updatedThreads.length > 0) {
            // Select thread at same position, or previous if at end
            let nextThreadIndex = currentIndex
            if (nextThreadIndex >= updatedThreads.length) {
              nextThreadIndex = updatedThreads.length - 1
            }

            const nextThread = updatedThreads[nextThreadIndex]
            if (nextThread) {
              console.log(`Auto-selecting thread after deletion: ${nextThread.id} (index: ${nextThreadIndex})`)

              try {
                // Fetch fresh data for the next thread
                const freshThread = await (window as any).electron.invoke(
                  'chat:get-thread',
                  nextThread.id,
                  selectedModel
                )

                if (freshThread && freshThread.messages) {
                  const updatedThread = {
                    ...freshThread,
                    messages: freshThread.messages || [],
                    lastMessage: freshThread.messages[freshThread.messages.length - 1]?.content || '',
                    lastTimestamp: freshThread.messages[freshThread.messages.length - 1]?.timestamp || freshThread.createdAt,
                    __version: Date.now(),
                  }
                  chatStore.updateCurrentThread(updatedThread)
                } else {
                  // Fallback to thread from list
                  chatStore.updateCurrentThread(nextThread)
                }
              } catch (error) {
                console.error('Failed to auto-select next thread:', error)
                chatStore.updateCurrentThread(nextThread)
              }
            }
          } else if (isCurrentThread) {
            // No threads left, clear current thread
            console.log('No threads remaining after deletion, clearing current thread')
            chatStore.clearCurrentThread()
          }
        } else {
          throw new Error('Delete operation failed')
        }
      } catch (error) {
        console.error('Failed to delete thread:', error)
      }
    },
    [selectedModel, state.currentThread, state.threads]
  )

  /**
   * Clear all messages from the current thread
   */
  const clearMessages = useCallback(async (): Promise<void> => {
    if (!selectedModel || !state.currentThread) {
      console.warn('clearMessages: Missing model or current thread')
      return
    }

    try {
      const response = await (window as any).electron.invoke(
        'chat:clear-messages', 
        state.currentThread.id, 
        selectedModel
      )
      
      if (response.ok) {
        const clearedThread: Thread = {
          ...state.currentThread,
          messages: [],
          lastMessage: '',
          lastTimestamp: '',
          __version: Date.now(),
        }

        const updatedThreads = state.threads.map((t) => 
          t.id === clearedThread.id ? clearedThread : t
        )
        chatStore.updateThreads(updatedThreads)
        chatStore.updateCurrentThread(clearedThread)
        
        console.log('Messages cleared for thread:', clearedThread.id)
      } else {
        throw new Error('Clear messages operation failed')
      }
    } catch (error) {
      console.error('Failed to clear messages:', error)
    }
  }, [selectedModel, state.currentThread, state.threads])

  // ------------------- Public API -------------------

  return {
    // State
    threads: state.threads,
    currentThread: state.currentThread,
    currentMessages: state.currentThread?.messages || [],
    isLoadingThread: state.isLoadingThread,
    
    // Thread Operations
    createThread,
    selectThread,
    deleteThread,
    refreshCurrentThread,
    
    // Message Operations
    appendMessage,
    clearMessages,
  }
}