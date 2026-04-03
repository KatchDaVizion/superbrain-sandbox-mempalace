/**
 * Enhanced useRagOllama Hook - Main chat management hook for RAG
 *
 * This hook manages the complete chat flow including:
 * - Model selection and availability (fetches from Ollama API)
 * - Chat message state management
 * - Thread creation and management
 * - Message sending with proper error handling
 * - Filters out embedding models from the list
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { ChatResponse } from '../services/rag/chatService'
import { useRagChatManager } from './useRagChatManager'
import { useCollections } from '@/lib/chat/CollectionsContext'

// ------------------ Type Definitions ------------------

/**
 * Represents an AI model available on the local Ollama server
 */
export type Model = {
  name: string
  model: string
  modified_at: string
  size: number
  description?: string
  speed?: string
  specialty?: string
}

/**
 * Represents a chat message in the conversation
 */
export type SourceReference = {
  content: string
  source: string
  type: string
  url?: string
  fileName?: string
  pageNumber?: number
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date | undefined
  thinking?: string
  sources?: SourceReference[] // Add this line
}

/**
 * Configuration for creativity levels (temperature settings)
 */
type CreativityLevel = {
  value: number
  label: string
  desc: string
}

// ------------------ Main Hook ------------------

export const useRagOllama = () => {
  // UI State
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false)

  // Model Management State
  const [availableModels, setAvailableModels] = useState<Model[]>([])
  const [selectedModel, setSelectedModel] = useState<string | null>(null)

  // Chat Configuration State
  const [creativity, setCreativity] = useState<number[]>([0.5])

  const { selectedCollection } = useCollections()

  // Message Management State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false)
  // const [collections, setCollections] = useState<string[]>([])
  // console.log('All Collections', collections)

  // //Vector DB collection state
  // const [selectedCollection, setSelectedCollection] = useState<string | null>(null)
  // console.log('Selected Collection: Main Hook', selectedCollection)

  // Chat thread management via external hook
  const chatManager = useRagChatManager(selectedCollection)
  const { currentThread, createThread, refreshCurrentThread, isLoadingThread } = chatManager

  const abortControllerRef = useRef<AbortController | null>(null)
  const [canStop, setCanStop] = useState<boolean>(false)
  const chatMessagesRef = useRef<ChatMessage[]>([])

  // Predefined creativity levels with user-friendly labels
  const creativityLevels: CreativityLevel[] = [
    { value: 0.1, label: 'Logical', desc: 'Precise, factual responses' },
    { value: 0.3, label: 'Conservative', desc: 'Structured with slight creativity' },
    { value: 0.5, label: 'Balanced', desc: 'Mix of logic and creativity' },
    { value: 0.7, label: 'Creative', desc: 'Imaginative and varied responses' },
    { value: 0.9, label: 'Wild', desc: 'Maximum creativity, unique outputs' },
  ]

  // --- Add near the top of the hook ---
  const generateId = (suffix = ''): string => {
    // Use crypto.randomUUID when available, otherwise fallback to Date+random
    if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) {
      return `${(crypto as any).randomUUID()}${suffix ? `-${suffix}` : ''}`
    }
    return `${Date.now()}-${Math.floor(Math.random() * 1e6)}${suffix ? `-${suffix}` : ''}`
  }

  /**
   * Get the current creativity level configuration object
   */
  const getCurrentCreativityLevel = useCallback((): CreativityLevel => {
    const current = creativity[0]
    return creativityLevels.reduce((prev, curr) =>
      Math.abs(curr.value - current) < Math.abs(prev.value - current) ? curr : prev
    )
  }, [creativity])

  /**
   * Get the selected model data object
   */
  const selectedModelData = availableModels.find((m) => m.model === selectedModel) || null

  // ------------------- Model Management -------------------

  /**
   * Fetch available models from local Ollama server
   * Filter out embedding models
   */
  useEffect(() => {
    const fetchLocalModels = async (): Promise<void> => {
      try {
        const res = await axios.get('http://localhost:11434/api/tags')

        const models: Model[] = res.data.models
          .filter((m: any) => {
            // Filter out embedding models
            const modelName = (m.name || '').toLowerCase()
            const modelId = (m.model || '').toLowerCase()
            return !modelName.includes('embed') && !modelId.includes('embed')
          })
          .map((m: any) => ({
            name: m.name,
            model: m.model,
            modified_at: m.modified_at,
            size: m.size,
            description: m.details?.format || 'Local model',
            speed: 'N/A',
            specialty: m.details?.family || 'General',
          }))

        setAvailableModels(models)

        // Auto-select first model if none selected and models available
        if (models.length > 0 && !selectedModel) {
          setSelectedModel(models[0].model)
          console.log('Auto-selected first model:', models[0].model)
        }
      } catch (err) {
        console.error('Failed to fetch local models:', err)
        setAvailableModels([])
      }
    }

    fetchLocalModels()
  }, [selectedModel])

  useEffect(() => {
    chatMessagesRef.current = chatMessages
  }, [chatMessages])

  // ------------------- Chat State Synchronization -------------------
  useEffect(() => {
    if (!currentThread) {
      setChatMessages([])
      return
    }

    if (currentThread && (!currentThread.messages || currentThread.messages.length === 0)) {
      const welcomeMessage: ChatMessage = {
        id: `welcome-${currentThread.id}`,
        role: 'assistant',
        content: `Hello! I'm ready to help you. What would you like to talk about today?`,
        timestamp: new Date(),
      }
      setChatMessages([welcomeMessage])
      return
    }

    const threadMessages: ChatMessage[] = (currentThread?.messages || []).map((msg) => ({
      id: msg.id || `${Date.now()}-${msg.role}`,
      role: msg.role,
      content: msg.content || '',
      timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
      thinking: msg.thinking,
    }))

    setChatMessages((prevMessages) => {
      const welcomeMessage = prevMessages.find((msg) => msg.id.includes('welcome'))
      if (welcomeMessage && threadMessages.length > 0) {
        return [welcomeMessage, ...threadMessages]
      }
      return threadMessages
    })
  }, [currentThread?.id, currentThread?.__version, currentThread?.messages])

  useEffect(() => {
    const loadLatestChatForModel = async () => {
      if (!selectedModel || !chatManager.threads.length) {
        setIsLoadingHistory(false)
        return
      }

      setIsLoadingHistory(true)
      try {
        await new Promise((resolve) => setTimeout(resolve, 300))

        const modelThreads = chatManager.threads.filter((thread) => thread.modelId === selectedModel)

        if (modelThreads.length > 0) {
          const latestThread = modelThreads.sort((a, b) => {
            const timeA = a.lastTimestamp ? new Date(a.lastTimestamp).getTime() : 0
            const timeB = b.lastTimestamp ? new Date(b.lastTimestamp).getTime() : 0
            return timeB - timeA
          })[0]

          await chatManager.selectThread(latestThread.id)
        }
      } catch (error) {
        console.error('Failed to load latest chat:', error)
      } finally {
        setIsLoadingHistory(false)
      }
    }

    loadLatestChatForModel()
  }, [selectedModel, chatManager.threads.length])

  /**
   * Create a new chat thread with welcome message
   */
  const createNewChat = useCallback(async (): Promise<void> => {
    if (!selectedModel) {
      console.warn('createNewChat: No selected model')
      return
    }

    try {
      const newThread = await createThread('New Chat')

      if (newThread) {
        setInputMessage('')

        const welcomeMessage: ChatMessage = {
          id: `welcome-${newThread.id}`,
          role: 'assistant',
          content: `Hello! I'm ready to help you. What would you like to talk about today?`,
          timestamp: new Date(),
        }

        setChatMessages([welcomeMessage])
      } else {
        console.error('Failed to create new thread - createThread returned null')
      }
    } catch (error) {
      console.error('Failed to create new chat:', error)
    }
  }, [selectedModel, createThread])

  /**
   * Generate a descriptive title from the first message (simple fallback)
   */
  const generateThreadTitle = (message: string): string => {
    const title = message.substring(0, 50).trim()
    return title.length < message.length ? title + '...' : title
  }

  /**
   * AI-powered title generation for RAG threads.
   * Ported from N.O.M.A.D. auto-title pattern (Apache 2.0, Crosstalk Solutions LLC).
   */
  const generateSmartTitle = useCallback(async (userMsg: string, threadId: string): Promise<void> => {
    if (!selectedCollection) return
    try {
      const resp = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5:0.5b',
          prompt: `Generate a concise title (under 50 chars) for a knowledge base question:\n"${userMsg.substring(0, 200)}"\n\nReturn ONLY the title text:`,
          stream: false,
          options: { temperature: 0.3, num_predict: 30 },
        }),
      })
      if (!resp.ok) return
      const data = await resp.json()
      const title = (data.response || '').trim().replace(/^["']|["']$/g, '').substring(0, 57)
      if (title.length < 3) return

      await (window as any).electron.invoke('rag:rename-thread', threadId, selectedCollection, title)
    } catch {
      // Best-effort
    }
  }, [selectedCollection])

  /**
   * Check if a model is ready to handle requests
   */
  const checkModelReadiness = useCallback(async (modelName: string): Promise<boolean> => {
    try {
      console.log('Checking model readiness for:', modelName)

      const testResponse = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: 'Hi' }],
          stream: false,
          options: {
            temperature: 0.1,
            num_predict: 1,
          },
        }),
      })

      if (!testResponse.ok) {
        console.warn('Model readiness check failed with status:', testResponse.status)
        return false
      }

      const data = await testResponse.json()
      const hasValidResponse = data.message?.content !== undefined

      console.log('Model readiness check result:', hasValidResponse)
      return hasValidResponse
    } catch (error) {
      console.error('Model readiness check error:', error)
      return false
    }
  }, [])

  /**
   * Stop the current streaming response
   */
  const stopResponse = useCallback(async () => {
    console.log('Stopping response...')

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    setIsLoading(false)
    setCanStop(false)

    if (currentThread && selectedModel) {
      const lastMessage = chatMessages[chatMessages.length - 1]
      if (lastMessage && lastMessage.role === 'assistant' && lastMessage.content.trim()) {
        try {
          // CHANGE: Use chat:append-message-rag instead of chat:append-message
          await (window as any).electron.invoke('chat:append-message-rag', {
            collectionName: selectedCollection,
            threadId: currentThread.id,
            message: {
              role: 'assistant',
              content: lastMessage.content,
            },
          })
        } catch (error) {
          console.error('Failed to save partial message to backend:', error)
        }
      }
    }

    setChatMessages((prev) => {
      const messages = [...prev]
      const lastMessage = messages[messages.length - 1]

      if (lastMessage && lastMessage.role === 'assistant') {
        messages[messages.length - 1] = {
          ...lastMessage,
          content: lastMessage.content + '\n\n*[Response stopped by user]*',
        }
      }

      return messages
    })
  }, [currentThread, selectedModel, chatMessages])

  /**
   * Enhanced message sending with proper user message display
   */
  const handleSendMessage = useCallback(async (): Promise<void> => {
    if (!inputMessage.trim() || isLoading || !selectedModel) {
      console.warn('handleSendMessage: Pre-flight check failed')
      return
    }

    const currentInput = inputMessage.trim()
    setInputMessage('')

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      content: currentInput,
      timestamp: new Date(),
    }

    setChatMessages((prev) => [...prev, userMessage])
    setIsLoading(true)
    setCanStop(true)

    let workingThread = currentThread

    try {
      const realMessages = chatMessagesRef.current.filter((msg) => !msg.id.includes('welcome'))

      const isFirstMessage = !workingThread || realMessages.length === 0

      if (isFirstMessage && selectedModel) {
        console.log('First message detected, checking model readiness...')
        const isReady = await checkModelReadiness(selectedModel)
        if (!isReady) {
          throw new Error('Model is not ready yet. Please wait a moment and try again.')
        }
      }

      if (!workingThread) {
        console.log('useRagOllama - Auto-creating thread for message')
        const threadTitle = generateThreadTitle(currentInput)
        workingThread = await createThread(threadTitle)

        if (!workingThread) {
          throw new Error('Failed to create chat thread')
        }

        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      // Save user message
      try {
        await (window as any).electron.invoke('chat:append-message-rag', {
          collectionName: selectedCollection,
          threadId: workingThread.id,
          message: { role: 'user', content: currentInput },
        })
      } catch (backendError) {
        console.error('Failed to save user message to backend:', backendError)
      }

      const assistantMessageId = generateId('-assistant')
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      }

      setChatMessages((prev) => [...prev, assistantMessage])

      // We'll scope listeners by a local stream id variable
      let localStreamId: string | null = null

      // Chunk handler only updates the message for matching stream
      const handleChunk = (data: { streamId: string; chunk: string }) => {
        // ignore chunks for other streams
        if (!localStreamId || data.streamId !== localStreamId) return

        setChatMessages((prev) => {
          const msgs = [...prev]
          const idx = msgs.findIndex((m) => m.id === assistantMessageId)
          if (idx !== -1) {
            msgs[idx] = { ...msgs[idx], content: msgs[idx].content + data.chunk }
          }
          return msgs
        })
      }

      const handleComplete = (data: { streamId: string; result: ChatResponse }) => {
        if (!localStreamId || data.streamId !== localStreamId) return

        setChatMessages((prev) => {
          const msgs = [...prev]
          const idx = msgs.findIndex((m) => m.id === assistantMessageId)
          if (idx !== -1) {
            msgs[idx] = {
              ...msgs[idx],
              content: data.result.answer,
              sources: data.result.sources,
            }
          }
          return msgs
        })

        // Auto-generate smart title on first exchange
        const realMsgs = chatMessagesRef.current.filter((m) => !m.id.includes('welcome'))
        if (realMsgs.length <= 1 && workingThread) {
          generateSmartTitle(currentInput, workingThread.id)
        }

        // Save to backend (unchanged)
        if (workingThread && selectedModel) {
          ;(window as any).electron
            .invoke('chat:append-message-rag', {
              collectionName: selectedCollection,
              threadId: workingThread.id,
              message: {
                role: 'assistant',
                content: data.result.answer,
              },
            })
            .catch((error: any) => console.error('Failed to save assistant message:', error))
        }

        // clean up
        window.RAGApi.removeChatChunkListener(handleChunk)
        window.RAGApi.removeChatCompleteListener(handleComplete)
        window.RAGApi.removeChatErrorListener(handleError)

        setIsLoading(false)
        setCanStop(false)
      }

      const handleError = (data: { streamId: string; error: string }) => {
        // if this error is from a different stream, ignore it
        if (!localStreamId || data.streamId !== localStreamId) return

        console.error('Stream error:', data.error)

        setChatMessages((prev) => {
          const msgs = [...prev]
          const idx = msgs.findIndex((m) => m.id === assistantMessageId)
          if (idx !== -1) {
            msgs[idx] = {
              ...msgs[idx],
              content: `❌ RAG chat error: ${data.error}`,
            }
          }
          return msgs
        })

        // Clean up listeners
        window.RAGApi.removeChatChunkListener(handleChunk)
        window.RAGApi.removeChatCompleteListener(handleComplete)
        window.RAGApi.removeChatErrorListener(handleError)

        setIsLoading(false)
        setCanStop(false)
      }

      // Register handlers BEFORE starting the stream (so we don't miss any early chunks)
      window.RAGApi.onChatChunk(handleChunk)
      window.RAGApi.onChatComplete(handleComplete)
      window.RAGApi.onChatError(handleError)
      // Start the stream and capture the stream id, then assign it to localStreamId
      const started = await window.RAGApi.startStreamingChat(currentInput, {
        model: selectedModel,
        temperature: creativity[0],
        k: 5,
        collectionName: selectedCollection || undefined,
      })

      localStreamId = started?.streamId || null
      console.log('Stream started with ID:', localStreamId)
    } catch (error: any) {
      console.error('RAG chat operation failed:', error)

      setChatMessages((prev) =>
        prev.map((m) => {
          if (m.id.includes('assistant') && m.content === '') {
            return {
              ...m,
              content: `❌ Failed to generate RAG response: ${error.message}`,
            }
          }
          return m
        })
      )

      setIsLoading(false)
      setCanStop(false)
    }
  }, [
    inputMessage,
    isLoading,
    selectedModel,
    creativity,
    currentThread,
    createThread,
    selectedCollection,
    // chatMessages,
  ])
  /**
   * Handle Enter key press for message sending
   */
  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  /**
   * Clear current conversation and create new chat
   */
  const clearConversation = useCallback(async (): Promise<void> => {
    console.log('useRagOllama - Clearing conversation')
    setChatMessages([])
    await createNewChat()
  }, [createNewChat])

  /**
   * Toggle sidebar collapsed state
   */
  const toggleSidebar = (): void => {
    setSidebarCollapsed((prev) => !prev)
  }

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  // ------------------- Public API -------------------

  return {
    // UI State
    sidebarCollapsed,
    toggleSidebar,

    // Model Management
    availableModels,
    selectedModel,
    setSelectedModel,
    selectedModelData,

    // Chat Configuration
    creativity,
    setCreativity,
    getCurrentCreativityLevel,

    // Message Management
    chatMessages,
    setChatMessages,
    inputMessage,
    setInputMessage,

    // Chat Operations
    handleSendMessage,
    handleKeyPress,
    clearConversation,
    createNewChat,

    // State Indicators
    isLoading,
    isLoadingHistory,
    isLoadingThread,

    // External Dependencies
    chatManager,

    // Stop functionality
    stopResponse,
    canStop,

    //Vector db collection
    // setCollections,
    // collections,
    // selectedCollection,
    // setSelectedCollection,
  }
}
