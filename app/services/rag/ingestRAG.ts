// app/services/ingestRAG.ts
import { QdrantClient } from '@qdrant/js-client-rest'
import { Document } from '@langchain/core/documents'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { OllamaEmbeddings } from '@langchain/ollama'
import { QdrantVectorStore } from '@langchain/qdrant'
import { v4 as uuidv4 } from 'uuid'
import * as crypto from 'crypto'
import * as fs from 'fs/promises' // Node.js File System module

// --- Default Configuration ---
const DEFAULT_QDRANT_URL = 'http://localhost:6333'
const DEFAULT_COLLECTION_NAME = 'sb_docs_v1_ollama'
const DEFAULT_OLLAMA_EMBED_MODEL = 'nomic-embed-text'
const DEFAULT_USER_ID = 'user-electron-123'
const DEFAULT_TEAM_ID = 'team-superbrain'
const DEFAULT_TAGS = ['electron', 'desktop']

// --- Interfaces for configuration ---
interface IngestConfig {
  collectionName?: string
  ollamaEmbedModel?: string
  userId?: string
  teamId?: string
  tags?: string[]
  qdrantUrl?: string
}

// --- Clients (will be initialized with config) ---
let qdrantClient: QdrantClient
let ollamaEmbeddings: OllamaEmbeddings

// Helper to ensure collection exists
async function createQdrantCollection(collectionName: string, qdrantUrl: string) {
  // Initialize client if not already done
  if (!qdrantClient) {
    qdrantClient = new QdrantClient({ url: qdrantUrl })
  }

  try {
    const dimensions = (await ollamaEmbeddings.embedQuery('test')).length
    await qdrantClient.createCollection(collectionName, {
      vectors: { size: dimensions, distance: 'Cosine' },
    })
  } catch (error: any) {
    /* Collection probably already exists, ignore */
  }
}

// Initialize embeddings with config
function initializeEmbeddings(ollamaEmbedModel: string) {
  if (!ollamaEmbeddings) {
    ollamaEmbeddings = new OllamaEmbeddings({ model: ollamaEmbedModel })
  }
  return ollamaEmbeddings
}

/**
 * Core Ingestion Logic: Chunks content, vectorizes, and upserts to Qdrant.
 * @param text The extracted text content.
 * @param path The source path/URL.
 * @param source The type of source (file, url, paste).
 * @param config Configuration parameters.
 */
async function coreIngestLogic(text: string, path: string, source: string, config: IngestConfig) {
  const {
    collectionName = DEFAULT_COLLECTION_NAME,
    ollamaEmbedModel = DEFAULT_OLLAMA_EMBED_MODEL,
    userId = DEFAULT_USER_ID,
    teamId = DEFAULT_TEAM_ID,
    tags = DEFAULT_TAGS,
    qdrantUrl = DEFAULT_QDRANT_URL,
  } = config

  const docId = uuidv4()
  console.log(`Starting core ingestion for Doc ID: ${docId} from source: ${path}`)

  // Initialize embeddings and Qdrant
  initializeEmbeddings(ollamaEmbedModel)
  await createQdrantCollection(collectionName, qdrantUrl)

  // 1. Chunking
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 900,
    chunkOverlap: 150,
  })

  const baseDocument = new Document({
    pageContent: text,
    metadata: {
      path,
      doc_id: docId,
      source,
      user_id: userId,
      team_id: teamId,
      tags,
    },
  })

  const chunks = await splitter.splitDocuments([baseDocument])

  // 2. Metadata & Hash Calculation (De-dup preparation)
  const documentsWithMetadata = chunks.map((chunk, index) => {
    const contentHash = crypto.createHash('sha256').update(chunk.pageContent).digest('hex')

    const finalMetadata = {
      ...chunk.metadata,
      chunk_id: `${docId}-${index}`,
      text: chunk.pageContent,
      page: Math.floor(index / 3) + 1, // Simple page simulation
      hash: contentHash,
      created_at: new Date().toISOString(),
    }

    return new Document({
      pageContent: chunk.pageContent,
      metadata: finalMetadata as Record<string, any>,
    })
  })

  // 3. Upsert to Qdrant
  await QdrantVectorStore.fromDocuments(documentsWithMetadata, ollamaEmbeddings, {
    url: qdrantUrl,
    collectionName,
  })

  console.log(`Successfully ingested ${documentsWithMetadata.length} chunks.`)
  return {
    docId,
    chunkCount: documentsWithMetadata.length,
    title: path.split('/').pop(),
    collectionName,
    userId,
    teamId,
    tags,
  }
}

/**
 * Public facing function for the IPC handler to call (for Files).
 * Reads the file content and calls the core ingest logic.
 */
export async function ingestFilePath(filePath: string, config: IngestConfig = {}) {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const path = filePath.replace(/\\/g, '/').split('/').pop() || 'Unknown_File'

    return coreIngestLogic(content, path, 'FILE_UPLOAD', config)
  } catch (error) {
    console.error('Error reading file path:', error)
    throw new Error(`Failed to read file: ${filePath}`)
  }
}

/**
 * Public facing function for the IPC handler to call (for URL/Text).
 */
export async function ingestRawData(
  content: string,
  source: 'URL' | 'TEXT_PASTE',
  path: string,
  config: IngestConfig = {}
) {
  const finalPath = source === 'URL' ? path : 'Pasted_Text_Snippet'
  return coreIngestLogic(content, finalPath, source, config)
}
