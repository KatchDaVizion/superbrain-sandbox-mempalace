// services/chatService.ts
// Adaptive context budgeting & query rewriting ported from
// Project N.O.M.A.D. (Apache 2.0, Crosstalk Solutions LLC)
import { ChatOllama } from '@langchain/ollama'
import { initializeVectorStore } from './vectorStore'
import { hybridSearch } from './hybridSearch'
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import axios from 'axios'
import { ZimService, type ZimResult } from '../../../lib/zim/zimService'
import { mempalace, type PalaceResult } from '../../../lib/mempalace'

export interface ChatResponse {
  answer: string
  sources: SourceReference[]
}

export interface SourceReference {
  content: string
  source: string
  type: string
  url?: string
  fileName?: string
  pageNumber?: number
}

export interface ChatOptions {
  onChunk?: (chunk: string) => void
  k?: number // Number of docs to retrieve
  model?: string // Ollama model name
  temperature?: number // Temperature for generation
  collectionName?: string // Qdrant collection name
  baseUrl?: string // Ollama base URL
  history?: Array<{ role: string; content: string }> // Conversation history for query rewriting
}

// Default configuration
const DEFAULT_CHAT_CONFIG = {
  MODEL: 'llama2',
  TEMPERATURE: 0.7,
  BASE_URL: 'http://localhost:11434',
  K: 5,
} as const

// ── Adaptive Context Budget (ported from N.O.M.A.D.) ──────────────────────

interface ContextBudget {
  maxResults: number
  maxTokens: number
}

/**
 * Returns context limits based on model size.
 * Small models choke on too much context; large models benefit from more.
 */
export function getContextBudget(modelName: string): ContextBudget {
  const name = modelName.toLowerCase()
  if (name.includes('0.5b') || name.includes('1b') || name.includes('3b') || name.includes('tinyllama'))
    return { maxResults: 2, maxTokens: 1000 }
  if (name.includes('7b') || name.includes('8b'))
    return { maxResults: 4, maxTokens: 2500 }
  return { maxResults: 5, maxTokens: 4000 }
}

// ── Query Rewriting (ported from N.O.M.A.D.) ──────────────────────────────

/**
 * Rewrites a user query into a standalone, searchable form using conversation context.
 * Uses the smallest available model to keep latency low.
 * Falls back to the original query on any error.
 */
async function rewriteQuery(
  userQuery: string,
  history: Array<{ role: string; content: string }>,
  baseUrl: string = DEFAULT_CHAT_CONFIG.BASE_URL
): Promise<string> {
  if (!history || history.length === 0) return userQuery

  try {
    const historyContext = history
      .slice(-6)
      .map((m) => `${m.role}: ${m.content.substring(0, 200)}`)
      .join('\n')

    const resp = await axios.post(
      `${baseUrl}/api/generate`,
      {
        model: 'qwen2.5:0.5b',
        prompt: `Given this conversation:\n${historyContext}\n\nRewrite this as a standalone search query (max 150 words, return ONLY the rewritten query): "${userQuery}"`,
        stream: false,
      },
      { timeout: 10_000 }
    )

    const rewritten = resp.data?.response?.trim()
    if (rewritten && rewritten.length > 3 && rewritten.length < 500) {
      console.log(`[QueryRewrite] "${userQuery}" → "${rewritten.substring(0, 80)}..."`)
      return rewritten
    }
    return userQuery
  } catch (error) {
    console.warn('[QueryRewrite] Rewrite failed, using original query:', (error as Error).message)
    return userQuery
  }
}

// ── MemPalace Context (Layer 0 — cross-session memory) ───────────────────

/**
 * Search MemPalace for past-session context relevant to the current query.
 * Layer 0 in the 5-layer knowledge hierarchy:
 *   MemPalace → ZIM → Qdrant → SN442 → Ollama
 *
 * Returns a formatted context string ready to inject into the system prompt.
 * Graceful: returns empty on any failure (mempalace not installed, palace
 * empty, subprocess timeout, parse error).
 *
 * Subprocess cost: ~500-800ms cold, ~200-400ms warm. Acceptable when
 * running before generation, not on every keystroke.
 */
async function getPalaceContext(query: string): Promise<{ context: string; results: PalaceResult[] }> {
  try {
    const results = await mempalace.search(query, 3)
    if (!results || results.length === 0) return { context: '', results: [] }

    const context =
      '[Memory Palace — Past Sessions]\n' +
      results
        .map((r) => `${r.title} (${r.wing}/${r.room}, sim=${r.similarity}):\n${r.snippet}`)
        .join('\n\n')

    console.log(`[Palace] ${results.length} past-session result(s) for: "${query.substring(0, 50)}"`)
    return { context, results }
  } catch {
    // Best-effort — never crash chat if mempalace is unavailable.
    return { context: '', results: [] }
  }
}

// ── ZIM Context (offline Wikipedia / knowledge packs) ─────────────────────

/**
 * Search ZIM knowledge packs for context. Returns formatted context string.
 * Layer 1 in the 4-layer knowledge hierarchy (ZIM → Qdrant → SN442 → Ollama).
 * Graceful: returns empty on any failure.
 */
async function getZimContext(query: string): Promise<{ context: string; results: ZimResult[] }> {
  try {
    const zimService = ZimService.getInstance()
    if (!zimService.isRunning) return { context: '', results: [] }

    const results = await zimService.search(query, 3)
    if (results.length === 0) return { context: '', results: [] }

    const context = results
      .map((r) => `[Wikipedia: ${r.title}]\n${r.snippet}`)
      .join('\n\n')

    console.log(`[ZIM] Found ${results.length} offline result(s) for: "${query.substring(0, 50)}"`)
    return { context, results }
  } catch {
    return { context: '', results: [] }
  }
}

// ── SN442 Network fallback ────────────────────────────────────────────────

const SN442_NODE = import.meta.env.VITE_SB_API_URL || 'http://46.225.114.202:8400'

/**
 * Query SN442 network for validated knowledge chunks.
 * Layer 3: only called when local sources (ZIM + Qdrant) are insufficient.
 * Graceful: returns empty on any failure.
 */
async function getNetworkContext(query: string): Promise<{ context: string; sources: SourceReference[] }> {
  try {
    const t0 = Date.now()
    const resp = await axios.post(
      `${SN442_NODE}/query`,
      { question: query, mode: 'auto' },
      { timeout: 10_000 }
    )
    const latency = Date.now() - t0
    const answer = resp.data?.answer || ''
    const method = resp.data?.method || 'unknown'
    const tier = resp.data?.tier || 'unknown'
    if (!answer || answer.length < 10) return { context: '', sources: [] }

    console.log(`[chat] Network: got response (method: ${method}, tier: ${tier}, latency: ${latency}ms)`)

    return {
      context: `[SN442 Network]\n${answer.substring(0, 1000)}`,
      sources: [{
        content: answer.substring(0, 300),
        source: 'SN442 Network (peer-validated)',
        type: 'network',
      }],
    }
  } catch {
    return { context: '', sources: [] }
  }
}

export async function* streamChatWithRAG(
  query: string,
  options: ChatOptions = {}
): AsyncGenerator<string | ChatResponse, void, unknown> {
  const {
    model = DEFAULT_CHAT_CONFIG.MODEL,
    temperature = DEFAULT_CHAT_CONFIG.TEMPERATURE,
    baseUrl = DEFAULT_CHAT_CONFIG.BASE_URL,
  } = options

  // 0. Adaptive context budget based on model size
  const budget = getContextBudget(model)
  const k = Math.min(options.k || DEFAULT_CHAT_CONFIG.K, budget.maxResults)

  // 0.5. Query rewriting — produce standalone searchable query
  const searchQuery = await rewriteQuery(query, options.history || [], baseUrl)

  // ━━━ LAYER 0: MEMPALACE (cross-session memory — verbatim past exchanges) ━
  const palaceData = await getPalaceContext(searchQuery)
  const palaceResultCount = palaceData.results.length
  console.log(`[chat] Palace: ${palaceResultCount > 0 ? `${palaceResultCount} past-session result(s)` : 'skipped (empty palace or unavailable)'}`)

  // ━━━ LAYER 1: ZIM (offline Wikipedia — instant, zero internet) ━━━━━━━
  const zimData = await getZimContext(searchQuery)
  const zimResultCount = zimData.results.length
  console.log(`[chat] ZIM: ${zimResultCount > 0 ? `${zimResultCount} result(s)` : 'skipped (no packs or no results)'}`)

  // ━━━ LAYER 2: QDRANT (local knowledge base — fast, zero internet) ━━━━
  let retrievedDocs: Awaited<ReturnType<typeof hybridSearch>> = []
  try {
    await initializeVectorStore(options.baseUrl, options.collectionName)
    retrievedDocs = await hybridSearch(searchQuery, k)
  } catch (error) {
    console.warn('[chat] Qdrant: not running or error —', (error as Error).message)
  }
  console.log(`[chat] Qdrant: ${retrievedDocs.length > 0 ? `${retrievedDocs.length} result(s) (local + p2p-received)` : 'skipped (not running or empty)'}`)

  // ━━━ NETWORKTEST MODE — force network layer ━━━━━━━━━━━━━━━━━━━━━━━━━━
  const isNetworkTest = query.startsWith('NETWORKTEST')
  if (isNetworkTest) {
    console.log('[chat] NETWORKTEST mode — forcing network layer')
    const networkData = await getNetworkContext(searchQuery.replace(/^NETWORKTEST\s*/, ''))
    // Skip ZIM + Qdrant, go straight to network + Ollama
    const context = networkData.context
    const sourceMap = new Map<string, SourceReference>()
    networkData.sources.forEach((s, i) => sourceMap.set(`[N${i + 1}]`, s))

    const modelInstance = new ChatOllama({ model, baseUrl, temperature })
    const systemPrompt = context
      ? `You are a helpful assistant. Use the following context to answer accurately.\n\nContext:\n${context}\n\nIMPORTANT: Cite your sources using [N1] etc. notation.`
      : 'You are a helpful assistant.'
    const messages: BaseMessage[] = [new SystemMessage(systemPrompt), new HumanMessage(query.replace(/^NETWORKTEST\s*/, ''))]
    let fullResponse = ''
    const stream = await modelInstance.stream(messages)
    for await (const chunk of stream) {
      if (chunk.content) {
        const text = typeof chunk.content === 'string' ? chunk.content : ''
        fullResponse += text
        yield text
      }
    }
    yield { answer: fullResponse, sources: extractSourcesFromResponse(fullResponse, sourceMap) }
    return
  }

  // ━━━ LAYER 3: SN442 NETWORK (fallback — only if local is insufficient) ━
  let networkData: { context: string; sources: SourceReference[] } = { context: '', sources: [] }
  const localResultCount = zimResultCount + retrievedDocs.length
  if (localResultCount < 2) {
    console.log('[chat] Network: querying SN442 (local context insufficient)...')
    networkData = await getNetworkContext(searchQuery)
    console.log(`[chat] Network: ${networkData.context ? 'got response' : 'unreachable or empty'}`)
  } else {
    console.log('[chat] Network: skipped (sufficient local context)')
  }

  // ━━━ BUILD CONTEXT from all sources (respecting token budget) ━━━━━━━━
  const contextParts: string[] = []
  const sourceMap = new Map<string, SourceReference>()
  let tokenEstimate = 0
  const charBudget = budget.maxTokens * 4 // ~4 chars per token

  // Layer 0 — MemPalace past-session memory goes FIRST (highest priority)
  if (palaceData.context) {
    tokenEstimate += palaceData.context.length
    contextParts.push(palaceData.context)

    palaceData.results.forEach((r, i) => {
      const sourceId = `[P${i + 1}]`
      sourceMap.set(sourceId, {
        content: r.snippet,
        source: `Memory Palace: ${r.title} (${r.wing}/${r.room})`,
        type: 'palace',
      })
    })
  }

  // ZIM context goes next (offline knowledge is primary among external sources)
  if (zimData.context) {
    tokenEstimate += zimData.context.length
    contextParts.push(zimData.context)

    zimData.results.forEach((r, i) => {
      const sourceId = `[W${i + 1}]`
      sourceMap.set(sourceId, {
        content: r.snippet.substring(0, 300),
        source: `Wikipedia: ${r.title}`,
        type: 'zim',
        url: r.url,
      })
    })
  }

  // Then Qdrant results
  retrievedDocs.forEach((doc, index) => {
    const snippet = doc.pageContent.substring(0, 500)
    const snippetChars = snippet.length + 20

    if (index > 0 && tokenEstimate + snippetChars > charBudget) return

    tokenEstimate += snippetChars
    const sourceId = `[${index + 1}]`
    contextParts.push(`${sourceId} ${snippet}...`)

    sourceMap.set(sourceId, {
      content: snippet,
      source: doc.metadata.source || 'Unknown',
      type: doc.metadata.type || doc.metadata.sourceType || 'unknown',
      url: doc.metadata.url,
      fileName: doc.metadata.fileName,
      pageNumber: doc.metadata.loc?.pageNumber,
    })
  })

  // Then network context (last priority)
  if (networkData.context && tokenEstimate + networkData.context.length <= charBudget) {
    tokenEstimate += networkData.context.length
    contextParts.push(networkData.context)

    networkData.sources.forEach((s, i) => {
      sourceMap.set(`[N${i + 1}]`, s)
    })
  }

  const context = contextParts.join('\n\n')

  // ━━━ LAYER 4: OLLAMA (always local, always last) ━━━━━━━━━━━━━━━━━━━
  console.log(`[chat] Generating with ${model}... (${contextParts.length} context block(s))`)

  const modelInstance = new ChatOllama({
    model,
    baseUrl,
    temperature,
  })

  const systemPrompt = context
    ? `You are a helpful assistant with access to multiple knowledge sources. Use the following context to answer accurately.

  Context:
  ${context}

  Source labels:
    [P1], [P2] — Memory Palace (verbatim past-session memory)
    [W1], [W2] — Wikipedia (offline knowledge packs)
    [1], [2]   — Your Documents (RAG knowledge base)
    [N1], [N2] — SN442 Network (peer-validated)

  IMPORTANT: Cite your sources using the bracket notation above.
  Past-session memory ([P]) is the highest-priority context — use it when the user references prior conversations.
  If context doesn't contain relevant information, say so clearly.`
    : 'You are a helpful assistant. Answer the user\'s question to the best of your ability.'

  const messages: BaseMessage[] = [new SystemMessage(systemPrompt), new HumanMessage(query)]

  // Stream response token-by-token
  let fullResponse = ''
  const stream = await modelInstance.stream(messages)

  for await (const chunk of stream) {
    if (chunk.content) {
      const text = typeof chunk.content === 'string' ? chunk.content : ''
      fullResponse += text
      yield text
    }
  }

  // Extract sources and return final result
  const sources = extractSourcesFromResponse(fullResponse, sourceMap)

  yield {
    answer: fullResponse,
    sources,
  }
}

function extractSourcesFromResponse(response: string, sourceMap: Map<string, SourceReference>): SourceReference[] {
  const sources: SourceReference[] = []
  // Match [1], [2], [W1], [W2], [N1], [P1] etc.
  const citationRegex = /\[([WNP]?\d+)\]/g
  const matches = response.matchAll(citationRegex)

  for (const match of matches) {
    const sourceId = `[${match[1]}]`
    const source = sourceMap.get(sourceId)
    if (source && !sources.some((s) => s.source === source.source)) {
      sources.push(source)
    }
  }

  // Also include all palace/ZIM/network sources if context was provided but not explicitly cited
  for (const [, ref] of sourceMap) {
    if (
      (ref.type === 'palace' || ref.type === 'zim' || ref.type === 'network') &&
      !sources.some((s) => s.source === ref.source)
    ) {
      sources.push(ref)
    }
  }

  return sources
}

// Non-streaming version if needed
export async function chatWithRAG(query: string, options: ChatOptions = {}): Promise<ChatResponse> {
  let fullResponse = ''

  for await (const chunk of streamChatWithRAG(query, options)) {
    if (typeof chunk !== 'string') {
      return chunk as ChatResponse
    }
    fullResponse += chunk
  }

  return {
    answer: fullResponse,
    sources: [],
  }
}

/**
 * Get default chat configuration
 */
export function getDefaultChatConfig(): ChatOptions {
  return {
    model: DEFAULT_CHAT_CONFIG.MODEL,
    temperature: DEFAULT_CHAT_CONFIG.TEMPERATURE,
    baseUrl: DEFAULT_CHAT_CONFIG.BASE_URL,
    k: DEFAULT_CHAT_CONFIG.K,
  }
}
