/**
 * Enhanced useOllama Hook - Main chat management hook with RAG integration
 *
 * This hook manages the complete chat flow including:
 * - Model selection and availability (TEXT MODELS ONLY - Embedding models are filtered out)
 * - Chat message state management
 * - Thread creation and management
 * - Message sending with proper error handling
 * - Model readiness checking for newly installed models
 * - RAG context injection from local Qdrant vector store
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { useChatManager } from './useChatManager'
import { useChatHistory } from './useChatHistory'
import {
  searchSimilarDocuments,
  checkConnection,
  initializeVectorStore,
  type RetrievedDocWithScore,
} from '../services/rag/vectorStore'

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
  type?: 'text' | 'embedding' | 'vision'
  isEmbedding?: boolean
}

/**
 * A source reference returned from RAG search
 */
export type RAGSource = {
  content: string
  source: string
  score: number
  metadata: Record<string, any>
}

/**
 * Represents a chat message in the conversation
 */
export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date | undefined
  thinking?: string
  sources?: RAGSource[]
}

/**
 * Configuration for creativity levels (temperature settings)
 */
type CreativityLevel = {
  value: number
  label: string
  desc: string
}

/**
 * Chat mode presets for the creativity toggle
 */
export type ChatMode = 'precise' | 'balanced' | 'creative'

export type ChatModeConfig = {
  temperature: number
  top_p: number
  label: string
  desc: string
}

export const CHAT_MODE_CONFIGS: Record<ChatMode, ChatModeConfig> = {
  precise: { temperature: 0.1, top_p: 0.5, label: 'Precise', desc: 'Factual, deterministic responses' },
  balanced: { temperature: 0.5, top_p: 0.8, label: 'Balanced', desc: 'Mix of accuracy and creativity' },
  creative: { temperature: 0.9, top_p: 0.95, label: 'Creative', desc: 'Imaginative, varied responses' },
}

// ------------------ Main Hook ------------------

export const useOllama = () => {
  // UI State
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false)

  // Model Management State
  const [availableModels, setAvailableModels] = useState<Model[]>([])
  const [selectedModel, setSelectedModel] = useState<string | null>(null)

  // Chat Configuration State
  const [creativity, setCreativity] = useState<number[]>([0.5])

  // Chat Mode (3-button toggle, persisted to localStorage)
  const [chatMode, setChatModeState] = useState<ChatMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('superbrain-chat-mode') as ChatMode) || 'balanced'
    }
    return 'balanced'
  })

  const setChatMode = useCallback((mode: ChatMode) => {
    setChatModeState(mode)
    localStorage.setItem('superbrain-chat-mode', mode)
    // Sync the creativity slider to match the mode
    setCreativity([CHAT_MODE_CONFIGS[mode].temperature])
  }, [])

  // Message Management State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false)

  // RAG State
  const [ragSources, setRagSources] = useState<RAGSource[]>([])
  const [useRAG, setUseRAG] = useState<boolean>(true)
  const [useNetworkKnowledge, setUseNetworkKnowledge] = useState<boolean>(false)
  const [docCount, setDocCount] = useState<number>(0)
  const [qdrantConnected, setQdrantConnected] = useState<boolean>(false)

  // Chat thread management via external hook
  const chatManager = useChatManager(selectedModel)
  const { currentThread, createThread, refreshCurrentThread, isLoadingThread } = chatManager

  // Chat history persistence
  const { addConversation } = useChatHistory()

  const abortControllerRef = useRef<AbortController | null>(null)
  const [canStop, setCanStop] = useState<boolean>(false)

  // Predefined creativity levels with user-friendly labels
  const creativityLevels: CreativityLevel[] = [
    { value: 0.1, label: 'Logical', desc: 'Precise, factual responses' },
    { value: 0.3, label: 'Conservative', desc: 'Structured with slight creativity' },
    { value: 0.5, label: 'Balanced', desc: 'Mix of logic and creativity' },
    { value: 0.7, label: 'Creative', desc: 'Imaginative and varied responses' },
    { value: 0.9, label: 'Wild', desc: 'Maximum creativity, unique outputs' },
  ]

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

  // ------------------- Qdrant Connection Check -------------------

  /**
   * Check Qdrant connection and count documents on mount
   */
  useEffect(() => {
    const checkQdrant = async () => {
      try {
        const connected = await checkConnection()
        setQdrantConnected(connected)

        if (connected) {
          // Initialize the vector store so search works later
          await initializeVectorStore()

          // Try to get document count from Qdrant
          try {
            const response = await fetch('http://localhost:6333/collections/sb_docs_v1_ollama')
            if (response.ok) {
              const data = await response.json()
              const count = data?.result?.points_count || 0
              setDocCount(count)
            }
          } catch {
            // Qdrant is up but collection may not exist yet
            setDocCount(0)
          }
        }
      } catch {
        setQdrantConnected(false)
        setDocCount(0)
      }
    }

    checkQdrant()
  }, [])

  // ------------------- Model Management -------------------

  /**
   * Fetch available models from local Ollama server
   * FILTERS OUT EMBEDDING MODELS - Only shows text/language models
   */
  useEffect(() => {
    const fetchLocalModels = async (): Promise<void> => {
      try {
        const res = await axios.get('http://localhost:11434/api/tags')

        const allModels: Model[] = res.data.models.map((m: any) => {
          // Detect if it's an embedding model
          const isEmbedding = m.name.toLowerCase().includes('embed') ||
                             m.model.toLowerCase().includes('embed') ||
                             m.details?.family?.toLowerCase().includes('embed')

          return {
            name: m.name,
            model: m.model,
            modified_at: m.modified_at,
            size: m.size,
            description: m.details?.format || 'Local model',
            speed: 'N/A',
            specialty: m.details?.family || 'General',
            type: isEmbedding ? 'embedding' : 'text',
            isEmbedding: isEmbedding,
          }
        })

        // FILTER OUT EMBEDDING MODELS - Only show text/language models
        const textModels = allModels.filter(m => !m.isEmbedding && m.type !== 'embedding')

        setAvailableModels(textModels)

        // Auto-select first text model if none selected and models available
        if (textModels.length > 0 && !selectedModel) {
          setSelectedModel(textModels[0].model)
          console.log('Auto-selected first text model:', textModels[0].model)
        }
      } catch (err) {
        console.error('Failed to fetch local models:', err)
        setAvailableModels([])
      }
    }

    fetchLocalModels()
  }, [selectedModel])

  // ------------------- Chat State Synchronization -------------------
  useEffect(() => {
    // If no thread, clear messages
    if (!currentThread) {
      setChatMessages([])
      return
    }

    // If thread exists but has no messages, show welcome message
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

    // Convert thread messages to ChatMessage format
    const threadMessages: ChatMessage[] = (currentThread?.messages || []).map((msg) => ({
      id: msg.id || `${Date.now()}-${msg.role}`,
      role: msg.role,
      content: msg.content || '',
      timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
      thinking: msg.thinking,
    }))

    // Check if we need to preserve welcome message
    setChatMessages((prevMessages) => {
      // Find existing welcome message
      const welcomeMessage = prevMessages.find((msg) => msg.id.includes('welcome'))

      // If there's a welcome message and thread has real messages, combine them
      if (welcomeMessage && threadMessages.length > 0) {
        return [welcomeMessage, ...threadMessages]
      }

      return threadMessages
    })
  }, [currentThread?.id, currentThread?.__version, currentThread?.messages])

  // Add this useEffect to handle model changes and load latest chat
  useEffect(() => {
    const loadLatestChatForModel = async () => {
      if (!selectedModel || !chatManager.threads.length) {
        setIsLoadingHistory(false)
        return
      }

      setIsLoadingHistory(true)
      try {
        // Add a small delay to show loader (optional)
        await new Promise(resolve => setTimeout(resolve, 300))

        // Find the latest thread for the current model
        const modelThreads = chatManager.threads.filter(thread =>
          thread.modelId === selectedModel
        )

        if (modelThreads.length > 0) {
          // Sort by lastTimestamp to get the most recent
          const latestThread = modelThreads.sort((a, b) => {
            const timeA = a.lastTimestamp ? new Date(a.lastTimestamp).getTime() : 0
            const timeB = b.lastTimestamp ? new Date(b.lastTimestamp).getTime() : 0
            return timeB - timeA
          })[0]

          // Select the latest thread
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
        // Clear input immediately
        setInputMessage('')

        // Create welcome message with thread-specific ID
        const welcomeMessage: ChatMessage = {
          id: `welcome-${newThread.id}`,
          role: 'assistant',
          content: `Hello! I'm ready to help you. What would you like to talk about today?`,
          timestamp: new Date(),
        }

        // Set welcome message immediately in UI
        setChatMessages([welcomeMessage])
      } else {
        console.error('Failed to create new thread - createThread returned null')
      }
    } catch (error) {
      console.error('Failed to create new chat:', error)
    }
  }, [selectedModel, createThread])

  /**
   * Generate a descriptive title from the first message
   */
  const generateThreadTitle = (message: string): string => {
    const title = message.substring(0, 50).trim()
    return title.length < message.length ? title + '...' : title
  }

  /**
   * Check if a model is ready to handle requests
   * This is especially important for newly installed models
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

    // Save partial content to backend first
    if (currentThread && selectedModel) {
      const lastMessage = chatMessages[chatMessages.length - 1]
      if (lastMessage && lastMessage.role === 'assistant' && lastMessage.content.trim()) {
        try {
          await (window as any).electron.invoke('chat:append-message', {
            modelId: selectedModel,
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

    // Then update UI with stopped indicator
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
   * Search Qdrant for relevant documents to use as context.
   * Best-effort: returns empty array if anything fails.
   */
  const searchRAGContext = useCallback(
    async (query: string): Promise<RetrievedDocWithScore[]> => {
      if (!useRAG || !qdrantConnected) {
        return []
      }

      try {
        const results = await searchSimilarDocuments(query, 3)
        return results
      } catch (error) {
        console.warn('RAG search failed (best-effort skip):', error)
        return []
      }
    },
    [useRAG, qdrantConnected]
  )

  /**
   * Build a system message with RAG context
   */
  const buildSystemMessage = useCallback((ragDocs: RetrievedDocWithScore[]): string | null => {
    if (ragDocs.length === 0) return null

    const contextParts = ragDocs.map((doc, idx) => {
      const source = doc.metadata?.source || doc.metadata?.fileName || 'Unknown'
      return `[${idx + 1}] (Source: ${source})\n${doc.pageContent.substring(0, 500)}`
    })

    return `You are a helpful AI assistant. Use the following knowledge base documents to inform your answers when relevant. If the context is not relevant to the question, you may ignore it and answer from your general knowledge.

Knowledge Base Context:
${contextParts.join('\n\n')}

When you use information from the context above, cite the source using [1], [2], etc. notation. If you do not use the context, no citation is needed.`
  }, [])

  /**
   * Enhanced message sending with RAG context injection
   */
  const handleSendMessage = useCallback(async (): Promise<void> => {
    // Pre-flight checks
    if (!inputMessage.trim() || isLoading || !selectedModel) {
      console.warn('handleSendMessage: Pre-flight check failed')
      return
    }

    // Store current input and clear input field immediately
    const currentInput = inputMessage.trim()
    setInputMessage('')

    // Create user message object
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
      // Check if this is the first real message
      const realMessages = chatMessages.filter((msg) => !msg.id.includes('welcome'))
      const isFirstMessage = !workingThread || realMessages.length === 0

      if (isFirstMessage && selectedModel) {
        console.log('First message detected, checking model readiness...')
        const isReady = await checkModelReadiness(selectedModel)
        if (!isReady) {
          throw new Error('Model is not ready yet. Please wait a moment and try again.')
        }
      }

      // Create thread if none exists
      if (!workingThread) {
        console.log('useOllama - Auto-creating thread for message')
        const threadTitle = generateThreadTitle(currentInput)
        workingThread = await createThread(threadTitle)

        if (!workingThread) {
          throw new Error('Failed to create chat thread')
        }

        await new Promise((resolve) => setTimeout(resolve, 100))
      }

      // Save user message to backend
      try {
        await (window as any).electron.invoke('chat:append-message', {
          modelId: selectedModel,
          threadId: workingThread.id,
          message: { role: 'user', content: currentInput },
        })
      } catch (backendError) {
        console.error('Failed to save user message to backend:', backendError)
      }

      // --- RAG Context Injection (best-effort) ---
      const ragDocs = await searchRAGContext(currentInput)
      const systemPrompt = buildSystemMessage(ragDocs)

      // Convert RAG docs to sources for display
      const messageSources: RAGSource[] = ragDocs.map((doc) => ({
        content: doc.pageContent.substring(0, 300),
        source: doc.metadata?.source || doc.metadata?.fileName || 'Unknown',
        score: doc.score,
        metadata: doc.metadata,
      }))

      // Update current ragSources state
      setRagSources(messageSources)

      // Build the messages array for Ollama
      const ollamaMessages: Array<{ role: string; content: string }> = []
      if (systemPrompt) {
        ollamaMessages.push({ role: 'system', content: systemPrompt })
      }
      chatMessages.filter(msg => !msg.id.includes('welcome') && msg.content).forEach(msg => ollamaMessages.push({ role: msg.role, content: msg.content }));
      ollamaMessages.push({ role: 'user', content: currentInput })

      // Create assistant message placeholder
      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        sources: messageSources.length > 0 ? messageSources : undefined,
      }

      setChatMessages((prev) => [...prev, assistantMessage])

      // Create AbortController for this request
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      // Send request to Ollama API with streaming and abort signal
      const modeConfig = CHAT_MODE_CONFIGS[chatMode]
      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: ollamaMessages,
          stream: true,
          options: {
            temperature: modeConfig.temperature,
            top_p: modeConfig.top_p,
            top_k: 40,
            num_ctx: 4096,
            repeat_penalty: 1.1,
          },
        }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      if (!response.body) {
        throw new Error('No response stream available')
      }

      // Process streaming response with abort handling
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''
      let hasReceivedContent = false

      try {
        let buffer = '';
        while (true) {
          // Check if request was aborted
          if (abortController.signal.aborted) {
            console.log('Request was aborted')
            break
          }

          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines.filter(line => line.trim())) {
            try {
              const data = JSON.parse(line)

              if (data.message?.content) {
                hasReceivedContent = true
                fullContent += data.message.content

                // Update UI with streaming content (preserve sources)
                setChatMessages((prev) => {
                  const msgs = [...prev]
                  const idx = msgs.findIndex((m) => m.id === assistantMessage.id)
                  if (idx !== -1) {
                    msgs[idx] = {
                      ...msgs[idx],
                      content: fullContent,
                      sources: messageSources.length > 0 ? messageSources : undefined,
                    }
                  }
                  return msgs
                })
              }

              if (data.error) {
                throw new Error(data.error)
              }
            } catch (parseError) {
              // Suppress incomplete JSON parse errors during streaming
              if (parseError instanceof Error && parseError.message.includes('Unexpected')) {
                // Expected during streaming - chunks may be partial
              } else {
                console.warn('Failed to parse streaming chunk:', parseError)
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }

      // Only save to backend if not aborted and has content
      if (!abortController.signal.aborted && hasReceivedContent && fullContent.trim()) {
        try {
          await (window as any).electron.invoke('chat:append-message', {
            modelId: selectedModel,
            threadId: workingThread.id,
            message: { role: 'assistant', content: fullContent },
          })

          await refreshCurrentThread()
        } catch (backendError) {
          console.error('Failed to save assistant message to backend:', backendError)
        }

        // Save to chat history for the History page
        try {
          const title = currentInput.length > 40
            ? currentInput.substring(0, 40) + '...'
            : currentInput
          const realMsgs = chatMessages.filter((m) => !m.id.includes('welcome'))
          addConversation({
            id: workingThread.id,
            title,
            model: selectedModel,
            createdAt: new Date().toISOString(),
            messageCount: realMsgs.length + 2, // +2 for user + assistant just added
            lastMessage: fullContent.length > 80 ? fullContent.substring(0, 80) + '...' : fullContent,
          })
        } catch (historyError) {
          console.error('Failed to save to chat history:', historyError)
        }
      }
    } catch (error: any) {
      // Handle different types of errors
      if (error.name === 'AbortError') {
        console.log('Request was aborted by user')
      } else {
        console.error('Chat operation failed:', error)

        setChatMessages((prev) =>
          prev.map((m) => {
            if (m.id.includes('assistant') && m.content === '') {
              return {
                ...m,
                content: `Failed to generate response: ${error instanceof Error ? error.message : 'Unknown error'}`,
              }
            }
            return m
          })
        )
      }
    } finally {
      setIsLoading(false)
      setCanStop(false)
      abortControllerRef.current = null
    }
  }, [
    inputMessage,
    isLoading,
    selectedModel,
    creativity,
    chatMode,
    currentThread,
    createThread,
    refreshCurrentThread,
    chatMessages,
    searchRAGContext,
    buildSystemMessage,
    addConversation,
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
    console.log('useOllama - Clearing conversation')
    setChatMessages([])
    setRagSources([])
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

    // Model Management (TEXT MODELS ONLY)
    availableModels,
    selectedModel,
    setSelectedModel,
    selectedModelData,

    // Chat Configuration
    creativity,
    setCreativity,
    getCurrentCreativityLevel,
    chatMode,
    setChatMode,

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

    // RAG State
    ragSources,
    useRAG,
    setUseRAG,
    useNetworkKnowledge,
    setUseNetworkKnowledge,
    docCount,
    qdrantConnected,
  }
}
