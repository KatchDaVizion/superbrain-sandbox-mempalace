// services/chatService.ts
import { ChatOllama } from '@langchain/ollama'
import { initializeVectorStore, searchSimilarDocuments } from './vectorStore'
import { BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'

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
}

// Default configuration
const DEFAULT_CHAT_CONFIG = {
  MODEL: 'llama2',
  TEMPERATURE: 0.7,
  BASE_URL: 'http://localhost:11434',
  K: 5,
} as const

export async function* streamChatWithRAG(
  query: string,
  options: ChatOptions = {}
): AsyncGenerator<string | ChatResponse, void, unknown> {
  const {
    model = DEFAULT_CHAT_CONFIG.MODEL,
    temperature = DEFAULT_CHAT_CONFIG.TEMPERATURE,
    baseUrl = DEFAULT_CHAT_CONFIG.BASE_URL,
    k = DEFAULT_CHAT_CONFIG.K,
  } = options
  await initializeVectorStore(options.baseUrl, options.collectionName)

  // 1. Retrieve relevant documents with metadata
  const retrievedDocs = await searchSimilarDocuments(query, k)

  // 2. Build context from retrieved documents
  const contextParts: string[] = []
  const sourceMap = new Map<string, SourceReference>()

  retrievedDocs.forEach((doc, index) => {
    const sourceId = `[${index + 1}]`
    contextParts.push(`${sourceId} ${doc.pageContent.substring(0, 500)}...`)

    sourceMap.set(sourceId, {
      content: doc.pageContent.substring(0, 500),
      source: doc.metadata.source || 'Unknown',
      type: doc.metadata.type || doc.metadata.sourceType || 'unknown',
      url: doc.metadata.url,
      fileName: doc.metadata.fileName,
      pageNumber: doc.metadata.loc?.pageNumber,
    })
  })

  const context = contextParts.join('\n\n')

  // 3. Initialize Ollama chat model
  const modelInstance = new ChatOllama({
    model,
    baseUrl,
    temperature,
  })

  // 4. Build prompt with context
  const systemPrompt = `You are a helpful assistant. Use the following context to answer accurately.

  Context:
  ${context}

  IMPORTANT: Cite your sources using [1], [2], etc. notation.
  If context doesn't contain relevant information, say so clearly.`

  const messages: BaseMessage[] = [new SystemMessage(systemPrompt), new HumanMessage(query)]

  // 5. Stream response token-by-token
  let fullResponse = ''
  const stream = await modelInstance.stream(messages)

  for await (const chunk of stream) {
    if (chunk.content) {
      const text = typeof chunk.content === 'string' ? chunk.content : ''
      fullResponse += text
      // Yield each chunk as a string
      yield text
    }
  }

  // 6. Extract sources and return final result as object (not string)
  const sources = extractSourcesFromResponse(fullResponse, sourceMap)

  // Yield the final ChatResponse object to signal completion
  yield {
    answer: fullResponse,
    sources,
  }
}

function extractSourcesFromResponse(response: string, sourceMap: Map<string, SourceReference>): SourceReference[] {
  const sources: SourceReference[] = []
  const citationRegex = /\[(\d+)\]/g
  const matches = response.matchAll(citationRegex)

  for (const match of matches) {
    const sourceId = `[${match[1]}]`
    const source = sourceMap.get(sourceId)
    if (source && !sources.some((s) => s.source === source.source)) {
      sources.push(source)
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
