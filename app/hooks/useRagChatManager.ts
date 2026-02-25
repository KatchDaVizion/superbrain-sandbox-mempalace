/**
 * RAG-specific useRagChatManager Hook - Thread and message management for RAG
 *
 * This hook provides comprehensive thread management functionality using RAG-specific storage:
 * - Uses rag: prefixed IPC handlers for separate storage
 * - Thread creation, selection, and deletion for RAG chats
 * - Message appending with optimistic updates using chat:append-message-rag
 * - Proper error handling and state synchronization
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChatManager, ChatMessage, Role, Thread } from '../types/chat'

// ------------------ Simple Global Store ------------------

type StoreState = {
  threads: Thread[]
  currentThread: Thread | null
  selectedCollection: string | null
  isLoadingThread: boolean
}

type StoreListener = (state: StoreState) => void

// Simple store object with event emitter pattern
const createRagChatStore = () => {
  let state: StoreState = {
    threads: [],
    currentThread: null,
    selectedCollection: null,
    isLoadingThread: false,
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
      listeners.forEach((listener) => listener(state))
    },

    // Convenience methods with logging
    updateCurrentThread: (thread: Thread | null) => {
      console.log('RAG Store: Updating current thread:', thread?.id, 'Messages:', thread?.messages?.length)
      state = { ...state, currentThread: thread }
      listeners.forEach((listener) => listener(state))
    },

    updateThreads: (threads: Thread[]) => {
      console.log('RAG Store: Updating threads:', threads.length)
      state = { ...state, threads }
      listeners.forEach((listener) => listener(state))
    },

    setselectedCollection: (model: string | null) => {
      console.log('RAG Store: Setting selected model:', model)
      state = { ...state, selectedCollection: model }
      listeners.forEach((listener) => listener(state))
    },

    clearCurrentThread: () => {
      console.log('RAG Store: Clearing current thread')
      state = { ...state, currentThread: null }
      listeners.forEach((listener) => listener(state))
    },

    // Thread loading state methods
    setLoadingThread: (isLoading: boolean) => {
      console.log('RAG Store: Setting thread loading state:', isLoading)
      state = { ...state, isLoadingThread: isLoading }
      listeners.forEach((listener) => listener(state))
    },
  }
}

// Global store instance for RAG
const ragChatStore = createRagChatStore()

// ------------------ Main Hook ------------------

/**
 * Enhanced RAG chat manager hook with comprehensive error handling
 * @param selectedCollection Currently selected model identifier
 * @returns ChatManager interface with all thread operations for RAG
 */
export const useRagChatManager = (selectedCollection: string | null): ChatManager & { isLoadingThread: boolean } => {
  console.log('useRagChatManager called with collection:', selectedCollection)
  const [state, setState] = useState(ragChatStore.getState())
  const isInitialized = useRef<boolean>(false)
  const modelRef = useRef<string | null>(selectedCollection)
  const threadsRef = useRef<Thread[]>(state.threads)
  const currentThreadRef = useRef<Thread | null>(state.currentThread)

  // Subscribe to store changes
  useEffect(() => {
    const listener = (s: StoreState) => {
      // keep React state for rendering
      setState(s)
      // keep refs for callback use (stable identities)
      threadsRef.current = s.threads
      currentThreadRef.current = s.currentThread
    }
    const unsubscribe = ragChatStore.subscribe(listener)
    // initialize refs with current store
    const s0 = ragChatStore.getState()
    threadsRef.current = s0.threads
    currentThreadRef.current = s0.currentThread
    return unsubscribe
  }, [])

  // ------------------- Model Change Handling -------------------

  /**
   * Handle model changes with proper cleanup and reinitialization
   */
  useEffect(() => {
    // Only react to real change of the incoming prop `selectedCollection`
    const prev = modelRef.current
    if (selectedCollection === prev) {
      // nothing changed
      return
    }

    console.log('RAG Model changed from', prev, 'to', selectedCollection)

    // Update store's selected model (this will notify subscribers)
    ragChatStore.setselectedCollection(selectedCollection)

    // If there was a previous model selected, clear its current thread
    if (prev && prev !== selectedCollection) {
      console.log('RAG Model changed, clearing current thread for previous model:', prev)
      ragChatStore.clearCurrentThread()
    }

    modelRef.current = selectedCollection
  }, [selectedCollection])

  /**
   * Load and initialize threads for the selected model from RAG store
   */
  useEffect(() => {
    // Reset state if no model selected
    if (!selectedCollection) {
      ragChatStore.updateThreads([])
      ragChatStore.clearCurrentThread()
      ragChatStore.setLoadingThread(false)
      isInitialized.current = false
      return
    }

    // Skip if already initialized for this model
    if (isInitialized.current && selectedCollection === state.selectedCollection) {
      return
    }

    console.log('RAG: Loading threads for model:', selectedCollection)

    // Load threads from RAG backend
    ;(window as any).electron
      .invoke('rag:list-threads', selectedCollection)
      .then((threads: Thread[]) => {
        // Filter out empty threads and initialize with metadata
        const threadsWithMessages = threads.filter((thread) => thread.messages && thread.messages.length > 0)

        const initializedThreads = threadsWithMessages.map((thread) => ({
          ...thread,
          lastMessage: thread.messages[thread.messages.length - 1]?.content || '',
          lastTimestamp: thread.messages[thread.messages.length - 1]?.timestamp || thread.createdAt,
          __version: Date.now(),
        }))

        ragChatStore.updateThreads(initializedThreads)

        // Auto-select most recent thread if none currently selected
        // Auto-select most recent thread if there's no currentThread in the store
        if (initializedThreads.length > 0) {
          const storeState = ragChatStore.getState()
          if (!storeState.currentThread) {
            console.log('RAG: Auto-selecting most recent thread (store had none):', initializedThreads[0].id)
            ragChatStore.updateCurrentThread(initializedThreads[0])
          } else {
            console.log('RAG: store already has currentThread, skipping auto-select')
          }
        }

        isInitialized.current = true
        console.log('RAG: Loaded threads for model:', selectedCollection, initializedThreads.length)
      })
      .catch((error) => {
        console.error('RAG: Failed to load threads:', error)
        ragChatStore.updateThreads([])
        ragChatStore.clearCurrentThread()
      })
  }, [selectedCollection])

  // ------------------- Thread Operations -------------------

  /**
   * Create a new thread in RAG store with enhanced error handling
   * @param title Optional thread title (defaults to 'New Chat')
   * @returns Promise resolving to created thread or null if failed
   */
  const createThread = useCallback(
    async (title?: string): Promise<Thread | null> => {
      if (!selectedCollection) {
        console.warn('RAG createThread: No selected model')
        return null
      }

      console.log('RAG ChatManager: Creating thread with title:', title)

      try {
        const newThread: Thread | null = await (window as any).electron.invoke('rag:create-thread', {
          collectionName: selectedCollection,
          title: title || 'New Chat',
          // Additional metadata can be added here Like Model used
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
          ragChatStore.updateThreads([initializedThread, ...state.threads])
          ragChatStore.updateCurrentThread(initializedThread)

          console.log('RAG: Created new thread:', initializedThread.id, 'with title:', initializedThread.title)

          // Brief delay to ensure state synchronization
          await new Promise((resolve) => setTimeout(resolve, 50))

          return initializedThread
        } else {
          throw new Error('RAG Backend returned null thread')
        }
      } catch (error) {
        console.error('RAG: Failed to create thread:', error)

        // Clean up stale state if creation fails
        if (!state.currentThread || state.currentThread.messages?.length === 0) {
          ragChatStore.clearCurrentThread()
        }

        return null
      }
    },
    [selectedCollection]
  )

  /**
   * Refresh current thread data from RAG backend
   * Ensures UI stays synchronized with RAG persistent storage
   */
  const refreshCurrentThread = useCallback(async (): Promise<void> => {
    const curThread = currentThreadRef.current
    if (!selectedCollection || !curThread) return

    try {
      const freshThread = await (window as any).electron.invoke('rag:get-thread', curThread.id, selectedCollection)
      if (freshThread && freshThread.messages) {
        const updatedThread = {
          ...freshThread,
          messages: freshThread.messages,
          lastMessage: freshThread.messages.at(-1)?.content || '',
          lastTimestamp: freshThread.messages.at(-1)?.timestamp || freshThread.createdAt,
          __version: Date.now(),
        }

        const updatedThreads = threadsRef.current.map((t) => (t.id === updatedThread.id ? updatedThread : t))
        ragChatStore.updateThreads(updatedThreads)
        ragChatStore.updateCurrentThread(updatedThread)
      }
    } catch (err) {
      console.error('RAG: Failed to refresh thread data:', err)
    }
  }, [selectedCollection])

  /**
   * Select and load a specific thread from RAG store with loading state
   * @param threadId Thread identifier to select
   */
  const selectThread = useCallback(
    async (threadId: string): Promise<void> => {
      console.log('RAG selectThread called with:', threadId, 'selectedCollection:', selectedCollection)

      if (!selectedCollection) {
        console.warn('RAG selectThread: No selected model')
        return
      }

      // Set loading state at the beginning
      ragChatStore.setLoadingThread(true)

      // Clear current thread to avoid UI confusion during loading
      ragChatStore.clearCurrentThread()

      try {
        // Fetch fresh thread data from RAG backend
        const freshThread = await (window as any).electron.invoke('rag:get-thread', threadId, selectedCollection)

        if (freshThread && freshThread.messages) {
          const updatedThread = {
            ...freshThread,
            messages: freshThread.messages || [],
            lastMessage: freshThread.messages[freshThread.messages.length - 1]?.content || '',
            lastTimestamp: freshThread.messages[freshThread.messages.length - 1]?.timestamp || freshThread.createdAt,
            __version: Date.now(),
          }

          console.log('RAG: Fresh thread data from backend:', {
            threadId: updatedThread.id,
            messageCount: updatedThread.messages.length,
          })

          // Update threads list and set as current thread
          const updatedThreads = state.threads.map((t) => (t.id === threadId ? updatedThread : t))
          ragChatStore.updateThreads(updatedThreads)
          ragChatStore.updateCurrentThread(updatedThread)
        } else {
          console.warn('RAG: No thread data received from backend for thread:', threadId)
        }
      } catch (error) {
        console.error('RAG: Failed to fetch thread data:', error)
      } finally {
        // Clear loading state when done
        ragChatStore.setLoadingThread(false)
      }
    },
    [state.threads, selectedCollection]
  )

  /**
   * Append a message to the current thread using RAG storage
   * Uses optimistic updates for immediate UI response
   * @param role Message role (user or assistant)
   * @param content Message content
   */
  const appendMessage = useCallback(
    async (role: Role, content: string): Promise<void> => {
      if (!selectedCollection || !state.currentThread) {
        console.warn('RAG appendMessage: Missing model or current thread')
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
      const updatedThreads = state.threads.map((t) => (t.id === updatedThread.id ? updatedThread : t))
      ragChatStore.updateThreads(updatedThreads)
      ragChatStore.updateCurrentThread(updatedThread)

      // Persist to RAG backend using chat:append-message-rag
      try {
        const response = await (window as any).electron.invoke('chat:append-message-rag', {
          collectionName: selectedCollection,
          threadId: state.currentThread.id,
          message: { role, content },
        })

        if (response.ok && response.thread) {
          const backendThread: Thread = {
            ...response.thread,
            messages: [...(response.thread.messages || [])],
            lastMessage: response.thread.messages[response.thread.messages.length - 1]?.content || '',
            lastTimestamp:
              response.thread.messages[response.thread.messages.length - 1]?.timestamp || new Date().toISOString(),
            __version: Date.now(),
          }

          // Update store with authoritative backend data
          const finalThreads = state.threads.map((t) => (t.id === backendThread.id ? backendThread : t))
          ragChatStore.updateThreads(finalThreads)
          ragChatStore.updateCurrentThread(backendThread)
        }
      } catch (error) {
        console.warn('RAG: Failed to persist message to backend:', error)
        // UI already updated optimistically, so don't revert
      }
    },
    [selectedCollection, state.currentThread, state.threads]
  )

  /**
   * Delete a thread from RAG store with smart auto-selection
   * @param threadId Thread identifier to delete
   */
  const deleteThread = useCallback(
    async (threadId: string): Promise<void> => {
      if (!selectedCollection) {
        console.warn('RAG deleteThread: No selected model')
        return
      }

      try {
        // Remember position for smart auto-selection
        const currentIndex = state.threads.findIndex((t) => t.id === threadId)
        const isCurrentThread = state.currentThread?.id === threadId

        const response = await (window as any).electron.invoke('rag:delete-thread', threadId, selectedCollection)

        if (response.ok) {
          const updatedThreads = response.threads.map((thread: Thread) => ({
            ...thread,
            messages: thread.messages || [],
            lastMessage: thread.messages[thread.messages.length - 1]?.content || '',
            lastTimestamp: thread.messages[thread.messages.length - 1]?.timestamp || thread.createdAt,
            __version: Date.now(),
          }))

          ragChatStore.updateThreads(updatedThreads)

          // Smart auto-selection after deletion
          if (isCurrentThread && updatedThreads.length > 0) {
            // Select thread at same position, or previous if at end
            let nextThreadIndex = currentIndex
            if (nextThreadIndex >= updatedThreads.length) {
              nextThreadIndex = updatedThreads.length - 1
            }

            const nextThread = updatedThreads[nextThreadIndex]
            if (nextThread) {
              console.log(`RAG: Auto-selecting thread after deletion: ${nextThread.id} (index: ${nextThreadIndex})`)

              try {
                // Fetch fresh data for the next thread
                const freshThread = await (window as any).electron.invoke(
                  'rag:get-thread',
                  nextThread.id,
                  selectedCollection
                )

                if (freshThread && freshThread.messages) {
                  const updatedThread = {
                    ...freshThread,
                    messages: freshThread.messages || [],
                    lastMessage: freshThread.messages[freshThread.messages.length - 1]?.content || '',
                    lastTimestamp:
                      freshThread.messages[freshThread.messages.length - 1]?.timestamp || freshThread.createdAt,
                    __version: Date.now(),
                  }
                  ragChatStore.updateCurrentThread(updatedThread)
                } else {
                  // Fallback to thread from list
                  ragChatStore.updateCurrentThread(nextThread)
                }
              } catch (error) {
                console.error('RAG: Failed to auto-select next thread:', error)
                ragChatStore.updateCurrentThread(nextThread)
              }
            }
          } else if (isCurrentThread) {
            // No threads left, clear current thread
            console.log('RAG: No threads remaining after deletion, clearing current thread')
            ragChatStore.clearCurrentThread()
          }
        } else {
          throw new Error('RAG Delete operation failed')
        }
      } catch (error) {
        console.error('RAG: Failed to delete thread:', error)
      }
    },
    [selectedCollection, state.currentThread, state.threads]
  )

  /**
   * Clear all messages from the current thread in RAG store
   */
  const clearMessages = useCallback(async (): Promise<void> => {
    if (!selectedCollection || !state.currentThread) {
      console.warn('RAG clearMessages: Missing model or current thread')
      return
    }

    try {
      const response = await (window as any).electron.invoke(
        'rag:clear-messages',
        state.currentThread.id,
        selectedCollection
      )

      if (response.ok) {
        const clearedThread: Thread = {
          ...state.currentThread,
          messages: [],
          lastMessage: '',
          lastTimestamp: '',
          __version: Date.now(),
        }

        const updatedThreads = state.threads.map((t) => (t.id === clearedThread.id ? clearedThread : t))
        ragChatStore.updateThreads(updatedThreads)
        ragChatStore.updateCurrentThread(clearedThread)

        console.log('RAG: Messages cleared for thread:', clearedThread.id)
      } else {
        throw new Error('RAG Clear messages operation failed')
      }
    } catch (error) {
      console.error('RAG: Failed to clear messages:', error)
    }
  }, [selectedCollection, state.currentThread, state.threads])

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
