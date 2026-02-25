// services/vectorStore.ts
import { QdrantVectorStore } from '@langchain/qdrant'
import { OllamaEmbeddings } from '@langchain/ollama'
import { Document } from '@langchain/core/documents'

// --- Configuration ---
const DEFAULT_CONFIG = {
  qdrantUrl: 'http://localhost:6333',
  collectionName: 'sb_docs_v1_ollama',
  embeddingsModelName: 'nomic-embed-text',
  ollamaUrl: 'http://localhost:11434',
} as const

// --- Types ---
export interface RetrievedDocWithScore {
  pageContent: string
  metadata: Record<string, any>
  score: number
}

// --- State ---
let vectorStore: QdrantVectorStore | null = null
let isInitialized = false

// --- Core Functions ---
export async function initializeVectorStore(
  qdrantUrl: string = DEFAULT_CONFIG.qdrantUrl,
  collectionName: string = DEFAULT_CONFIG.collectionName,
  embeddingsModelName: string = DEFAULT_CONFIG.embeddingsModelName
): Promise<QdrantVectorStore> {
  console.log('🔄 Initializing vector store...')

  if (isInitialized && vectorStore) {
    console.log('✅ Vector store already initialized, returning existing instance')
    return vectorStore
  }

  console.log(`📝 Config: Qdrant=${qdrantUrl}, Collection=${collectionName}, Model=${embeddingsModelName}`)

  const embeddings = new OllamaEmbeddings({
    model: embeddingsModelName,
    baseUrl: DEFAULT_CONFIG.ollamaUrl,
  })

  try {
    console.log('🔗 Connecting to existing Qdrant collection...')
    // Try to connect to existing collection first
    vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
      url: qdrantUrl,
      collectionName,
    })
    console.log('✅ Connected to existing collection')
  } catch (error) {
    console.log('📂 Collection does not exist, creating new instance...')
    // Create new instance if collection doesn't exist
    vectorStore = new QdrantVectorStore(embeddings, {
      url: qdrantUrl,
      collectionName,
    })
    console.log('✅ New vector store instance created')
  }

  isInitialized = true
  console.log('🎉 Vector store initialized successfully')
  return vectorStore
}

export async function addDocumentsToStore(docs: Document[]): Promise<void> {
  console.log(`📄 Adding ${docs.length} documents to vector store...`)

  if (!vectorStore) {
    console.error('❌ Vector store not initialized')
    throw new Error('Vector store not initialized. Call initializeVectorStore() first.')
  }

  await vectorStore.addDocuments(docs)
  console.log('✅ Documents added successfully')
}

export async function searchSimilarDocuments(query: string, limit: number = 5): Promise<RetrievedDocWithScore[]> {
  console.log(`🔍 Searching for similar documents: "${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"`)

  if (!vectorStore) {
    console.error('❌ Vector store not initialized')
    throw new Error('Vector store not initialized. Call initializeVectorStore() first.')
  }

  const results = await vectorStore.similaritySearchWithScore(query, limit)
  console.log(`✅ Found ${results.length} similar documents`)

  return results.map(([doc, score]) => ({
    pageContent: doc.pageContent,
    metadata: doc.metadata,
    score,
  }))
}

export async function checkConnection(): Promise<boolean> {
  console.log('🔌 Checking Qdrant connection...')
  try {
    const response = await fetch(`${DEFAULT_CONFIG.qdrantUrl}/healthz`)
    const isConnected = response.ok
    console.log(isConnected ? '✅ Qdrant connection successful' : '❌ Qdrant connection failed')
    return isConnected
  } catch (error) {
    console.error('❌ Qdrant connection error:', error)
    return false
  }
}

// Utility function to get the store instance
export function getVectorStore(): QdrantVectorStore {
  if (!vectorStore) {
    console.error('❌ Vector store not initialized')
    throw new Error('Vector store not initialized. Call initializeVectorStore() first.')
  }
  console.log('✅ Returning vector store instance')
  return vectorStore
}

// Reset function for testing/cleanup
export function resetVectorStore(): void {
  console.log('🔄 Resetting vector store...')
  vectorStore = null
  isInitialized = false
  console.log('✅ Vector store reset completed')
}
