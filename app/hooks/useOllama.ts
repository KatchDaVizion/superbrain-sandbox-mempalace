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

// ── Thinking Model Detection (ported from N.O.M.A.D., Apache 2.0, Crosstalk Solutions LLC) ──

const THINKING_MODEL_PATTERNS = [
  'deepseek-r1', 'deepseek-r2', 'qwq', 'marco-o1',
  ':thinking', 'reflection',
]

/**
 * Check if a model name indicates a "thinking" / reasoning model.
 * These models emit <think>...</think> tags that should be separated from the final answer.
 */
export function isThinkingModel(modelName: string): boolean {
  const name = modelName.toLowerCase()
  return THINKING_MODEL_PATTERNS.some((p) => name.includes(p))
}

/**
 * Parse streaming content that may contain <think> tags.
 * Returns { thinking, content } where thinking is the reasoning text
 * and content is the final answer.
 */
export function parseThinkingContent(raw: string): { thinking: string; content: string } {
  const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/g)
  if (!thinkMatch) return { thinking: '', content: raw }

  let thinking = ''
  let content = raw

  for (const match of thinkMatch) {
    const inner = match.replace(/<\/?think>/g, '').trim()
    thinking += (thinking ? '\n' : '') + inner
    content = content.replace(match, '')
  }

  // Also handle unclosed <think> at end of stream
  const unclosedMatch = content.match(/<think>([\s\S]*)$/)
  if (unclosedMatch) {
    thinking += (thinking ? '\n' : '') + unclosedMatch[1].trim()
    content = content.replace(unclosedMatch[0], '')
  }

  return { thinking: thinking.trim(), content: content.trim() }
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

  // Source toggles for unified chat (all default ON — user can flip any off)
  const [useWikipedia, setUseWikipedia] = useState<boolean>(true)
  const [usePalaceMemory, setUsePalaceMemory] = useState<boolean>(true)

  // Chat thread management via external hook
  const chatManager = useChatManager(selectedModel)
  const { currentThread, createThread, refreshCurrentThread, isLoadingThread } = chatManager

  // Chat history persistence
  const { addConversation } = useChatHistory()

  const abortControllerRef = useRef<AbortController | null>(null)
  const [canStop, setCanStop] = useState<boolean>(false)

  // MemPalace wake-up text — fetched once on mount and prepended to every
  // system prompt. Stored in a ref so changes don't trigger re-renders.
  // Empty string is a valid fallback (mempalace unavailable).
  const palaceWakeupRef = useRef<string>('')

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
   * Generate a descriptive title from the first message (simple fallback)
   */
  const generateThreadTitle = (message: string): string => {
    const title = message.substring(0, 50).trim()
    return title.length < message.length ? title + '...' : title
  }

  /**
   * AI-powered title generation using smallest available model.
   * Ported from N.O.M.A.D. auto-title pattern (Apache 2.0, Crosstalk Solutions LLC).
   * Runs in background — does not block chat flow.
   */
  const generateSmartTitle = useCallback(async (userMsg: string, assistantMsg: string, threadId: string): Promise<void> => {
    if (!selectedModel) return
    try {
      const resp = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5:0.5b',
          prompt: `Generate a concise title (under 50 chars) for this conversation:\nUser: ${userMsg.substring(0, 200)}\nAssistant: ${assistantMsg.substring(0, 200)}\n\nReturn ONLY the title text, nothing else:`,
          stream: false,
          options: { temperature: 0.3, num_predict: 30 },
        }),
      })
      if (!resp.ok) return
      const data = await resp.json()
      const title = (data.response || '').trim().replace(/^["']|["']$/g, '').substring(0, 57)
      if (title.length < 3) return

      await (window as any).electron.invoke('chat:rename-thread', threadId, selectedModel, title)
      await refreshCurrentThread()
    } catch {
      // Best-effort — silent fail is fine
    }
  }, [selectedModel, refreshCurrentThread])

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
  const buildSystemMessage = useCallback((ragDocs: RetrievedDocWithScore[], zimContext?: string): string | null => {
    if (ragDocs.length === 0 && !zimContext) return null

    const parts: string[] = []

    if (zimContext) {
      parts.push(`[Wikipedia Offline]\n${zimContext}`)
    }

    ragDocs.forEach((doc, idx) => {
      const source = doc.metadata?.source || doc.metadata?.fileName || 'Unknown'
      parts.push(`[${idx + 1}] (Source: ${source})\n${doc.pageContent.substring(0, 500)}`)
    })

    return `You are a helpful AI assistant. Use the following context to inform your answers when relevant. Prefer Wikipedia facts for factual accuracy. If the context is not relevant, answer from your general knowledge.

Context:
${parts.join('\n\n')}

When you use information from the context above, cite the source using [1], [2], [W] etc. notation. If you do not use the context, no citation is needed.`
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

    // ── MemPalace auto-save helper ─────────────────────────────────────────
    // Fires after a completed exchange (any of the 3 finalization branches:
    // SN442 / ZIM extractive / Ollama streaming). Fire-and-forget — never
    // throws, never blocks. Gated on [🧠 Memory] toggle. Skips trivial
    // replies under 100 chars. Lands the drawer in superbrain/conversations
    // so the next session can recall this turn via Layer 0 wake-up.
    const autoSaveToPalace = (assistantText: string): void => {
      if (!usePalaceMemory) return
      if (!assistantText || assistantText.trim().length < 100) return
      try {
        const dateStr = new Date().toISOString().split('T')[0]
        const drawerContent = `${dateStr} conversation:\n\nUser: ${currentInput}\n\nAssistant: ${assistantText}`
        ;(window as any).electron
          .invoke('mempalace:add-drawer', drawerContent, 'superbrain', 'conversations')
          .then(() => console.log('[useOllama] Palace autosave OK'))
          .catch((e: any) => console.warn('[useOllama] Palace autosave failed:', e?.message))
      } catch {
        // never let palace failures break chat
      }
    }

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

      // --- SN442 Network Knowledge — bypass Ollama entirely when toggle is ON ---
      if (useNetworkKnowledge) {
        try {
          const netData = await (window as any).electron.invoke('superbrain:network:query', currentInput, {})
          const answer = netData?.text || netData?.answer || ''

          if (answer && answer !== 'Network unreachable') {
            const networkSource: RAGSource = {
              content: answer.substring(0, 300),
              source: 'SN442 Network | Bittensor Validated',
              score: 1.0,
              metadata: { provider: 'sn442', type: 'network' },
            }

            const assistantMessage: ChatMessage = {
              id: `${Date.now()}-assistant`,
              role: 'assistant',
              content: answer,
              timestamp: new Date(),
              sources: [networkSource],
            }

            setChatMessages((prev) => [...prev, assistantMessage])
            setRagSources([networkSource])

            // Save to backend
            try {
              await (window as any).electron.invoke('chat:append-message', {
                modelId: selectedModel,
                threadId: workingThread.id,
                message: { role: 'assistant', content: answer },
              })
              await refreshCurrentThread()
            } catch (backendError) {
              console.error('Failed to save network message to backend:', backendError)
            }

            // Auto-generate smart title on first exchange
            const realMsgs = chatMessages.filter((m) => !m.id.includes('welcome'))
            if (realMsgs.length <= 1 && workingThread) {
              generateSmartTitle(currentInput, answer, workingThread.id)
            }

            // Save to chat history
            try {
              const title = currentInput.length > 40
                ? currentInput.substring(0, 40) + '...'
                : currentInput
              addConversation({
                id: workingThread.id,
                title,
                model: selectedModel,
                createdAt: new Date().toISOString(),
                messageCount: (chatMessages.filter((m) => !m.id.includes('welcome')).length) + 2,
                lastMessage: answer.length > 80 ? answer.substring(0, 80) + '...' : answer,
              })
            } catch (historyError) {
              console.error('Failed to save to chat history:', historyError)
            }

            // Cross-session memory: auto-file this exchange to MemPalace
            autoSaveToPalace(answer)

            return // Skip Ollama entirely
          }
        } catch (netError) {
          console.warn('SN442 network query failed, falling back to Ollama:', netError)
        }
      }

      // --- ZIM Wikipedia Context (Layer 1 — offline, instant) ---
      // Gated on the [📚 Wikipedia] toggle. When OFF the layer is fully skipped.
      let zimContext = ''
      let zimResults: any[] | null = null
      if (useWikipedia) {
        try {
          zimResults = await (window as any).electron.invoke('zim:search', currentInput, 2)
          if (zimResults && zimResults.length > 0) {
            zimContext = zimResults
              .map((r: any) => `[Wikipedia: ${r.title}] ${r.snippet}`)
              .filter((s: string) => s.length > 20)
              .join('\n')
          }
        } catch {}
      }

      // --- MemPalace Per-Query Context (Layer 0 — cross-session memory) ---
      // Gated on the [🧠 Memory] toggle. Returns up to 3 verbatim past-session
      // hits relevant to the current query. Wakeup identity is separate (below).
      let palaceContext = ''
      if (usePalaceMemory) {
        try {
          const palaceResults = await (window as any).electron.invoke('mempalace:search', currentInput, 3)
          if (palaceResults && palaceResults.length > 0) {
            palaceContext = '[Memory Palace — Past Sessions]\n' +
              palaceResults
                .map((r: any) => `${r.title} (${r.room}, sim=${r.similarity}):\n${r.snippet}`)
                .join('\n\n')
            console.log(`[useOllama] Palace: ${palaceResults.length} past-session result(s)`)
          }
        } catch {}
      }

      // --- ZIM Extractive QA — factual questions skip Ollama ---
      const FACTUAL_PATTERNS = /^(who|what|when|where|how many|is|are|was|were|did|does|which)/i

      if (!useNetworkKnowledge && FACTUAL_PATTERNS.test(currentInput.trim()) && zimResults && zimResults.length > 0) {
        const keywords = currentInput.toLowerCase().split(' ').filter((w: string) => w.length > 3)
        let bestSnippet = ''
        let bestTitle = ''
        let bestScore = 0

        for (const r of zimResults) {
          const snippet = r.snippet || r.content || ''
          const score = keywords.filter((k: string) => snippet.toLowerCase().includes(k)).length
          if (score > bestScore && snippet.length > 30) {
            bestScore = score
            bestSnippet = snippet
            bestTitle = r.title || 'Wikipedia'
          }
        }

        if (bestSnippet && bestScore >= 1) {
          const extractiveAnswer = `${bestSnippet}\n\n[Source: Wikipedia Offline — ${bestTitle}]`

          const assistantMessage: ChatMessage = {
            id: `${Date.now()}-assistant`,
            role: 'assistant',
            content: extractiveAnswer,
            timestamp: new Date(),
            sources: [{ content: bestSnippet, source: `Wikipedia: ${bestTitle}`, score: 1.0, metadata: { type: 'zim' } }],
          }

          setChatMessages((prev) => [...prev, assistantMessage])
          setRagSources(assistantMessage.sources || [])

          try {
            await (window as any).electron.invoke('chat:append-message', {
              modelId: selectedModel,
              threadId: workingThread!.id,
              message: { role: 'assistant', content: extractiveAnswer },
            })
            await refreshCurrentThread()
          } catch {}

          // Auto-generate smart title on first exchange
          const realMsgs = chatMessages.filter((m) => !m.id.includes('welcome'))
          if (realMsgs.length <= 1 && workingThread) {
            generateSmartTitle(currentInput, extractiveAnswer, workingThread.id)
          }

          // Save to chat history
          try {
            const title = currentInput.length > 40
              ? currentInput.substring(0, 40) + '...'
              : currentInput
            addConversation({
              id: workingThread!.id,
              title,
              model: selectedModel,
              createdAt: new Date().toISOString(),
              messageCount: (chatMessages.filter((m) => !m.id.includes('welcome')).length) + 2,
              lastMessage: extractiveAnswer.length > 80 ? extractiveAnswer.substring(0, 80) + '...' : extractiveAnswer,
            })
          } catch {}

          // Cross-session memory: auto-file this extractive QA exchange
          autoSaveToPalace(extractiveAnswer)

          return // Skip Ollama
        }
      }

      // --- RAG Context Injection (best-effort, gated on [📄 My Docs] toggle) ---
      // searchRAGContext already checks useRAG internally — returns [] when off.
      const ragDocs = await searchRAGContext(currentInput)
      const baseSystemPrompt = buildSystemMessage(ragDocs, zimContext)

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

      // Compose final system prompt from all enabled layers, in priority order:
      //   1. MemPalace wake-up identity (always-loaded L0+L1, gated on [🧠 Memory])
      //   2. MemPalace per-query search results (palaceContext, gated on [🧠 Memory])
      //   3. ZIM Wikipedia + Qdrant RAG combined (baseSystemPrompt, gated above)
      const palaceWakeup = usePalaceMemory ? palaceWakeupRef.current : ''
      const systemParts: string[] = []
      if (palaceWakeup) systemParts.push(palaceWakeup)
      if (palaceContext) systemParts.push(palaceContext)
      if (baseSystemPrompt) systemParts.push(baseSystemPrompt)
      const fullSystem = systemParts.join('\n\n---\n\n')

      if (fullSystem) {
        // Diagnostic: prove the injected context is actually reaching Ollama
        console.log('[useOllama] System prompt preview:', fullSystem.substring(0, 200))
        console.log(`[useOllama] System prompt total: ${fullSystem.length} chars (~${Math.round(fullSystem.length / 4)} tokens) | layers: wakeup=${!!palaceWakeup} palace=${!!palaceContext} zim=${!!zimContext} rag=${ragDocs.length}`)
        ollamaMessages.push({ role: 'system', content: fullSystem })
      }

      // Within-session memory: ALL prior non-welcome messages from this thread
      // are forwarded to Ollama (no slice limit). The model sees the full
      // conversation history every turn — combined with palace wakeup that's
      // both short-term and cross-session memory.
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

      // Parse thinking content for reasoning models
      if (isThinkingModel(selectedModel) && fullContent.includes('<think>')) {
        const { thinking, content: cleanContent } = parseThinkingContent(fullContent)
        if (thinking) {
          setChatMessages((prev) => {
            const msgs = [...prev]
            const idx = msgs.findIndex((m) => m.id === assistantMessage.id)
            if (idx !== -1) {
              msgs[idx] = { ...msgs[idx], content: cleanContent, thinking }
            }
            return msgs
          })
          fullContent = cleanContent
        }
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

        // Auto-generate smart title on first exchange
        const realMsgs = chatMessages.filter((m) => !m.id.includes('welcome'))
        if (realMsgs.length <= 1 && workingThread) {
          // First exchange — generate title in background (non-blocking)
          generateSmartTitle(currentInput, fullContent, workingThread.id)
        }

        // Save to chat history for the History page
        try {
          const title = currentInput.length > 40
            ? currentInput.substring(0, 40) + '...'
            : currentInput
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

        // Cross-session memory: auto-file the completed Ollama exchange
        autoSaveToPalace(fullContent)
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
    useNetworkKnowledge,
    useWikipedia,
    usePalaceMemory,
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

  // ── MemPalace wake-up — load once on mount, silent failure ──────────────
  // Calls the mempalace:wakeup IPC handler exactly once when the chat hook
  // mounts, stores the L0 identity + L1 essential story text in a ref, then
  // prepends it to the system prompt of every outgoing message. The ref
  // pattern keeps this off the React render path — no UI flicker.
  useEffect(() => {
    let cancelled = false
    const loadWakeup = async () => {
      try {
        const text = await (window as any).electron.invoke('mempalace:wakeup', 'superbrain')
        if (!cancelled && typeof text === 'string') {
          palaceWakeupRef.current = text
          if (text.length > 0) {
            console.log(`[useOllama] Palace wake-up loaded: ~${Math.round(text.length / 4)} tokens`)
          }
        }
      } catch {
        // mempalace unavailable — chat continues normally
      }
    }
    loadWakeup()
    return () => {
      cancelled = true
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
    useWikipedia,
    setUseWikipedia,
    usePalaceMemory,
    setUsePalaceMemory,
    docCount,
    qdrantConnected,
  }
}
