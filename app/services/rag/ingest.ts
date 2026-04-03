// app/services/ingestRAG.ts
// Token-aware chunking ported from N.O.M.A.D. pattern (Apache 2.0, Crosstalk Solutions LLC)
import { OllamaEmbeddings } from '@langchain/ollama'
import { QdrantVectorStore } from '@langchain/qdrant'
import { loadDocuments, DocumentType } from './documentLoader'

// --- Default Configuration ---
const DEFAULT_CONFIG = {
  QDRANT_URL: 'http://localhost:6333',
  COLLECTION_NAME: 'sb_docs_v1_ollama',
  OLLAMA_EMBED_MODEL: 'nomic-embed-text',
  USER_ID: 'user-electron-123',
  TEAM_ID: 'team-superbrain',
  TAGS: ['electron', 'desktop'],
  // Token-aware chunking (N.O.M.A.D. pattern: 1700 tokens ≈ 5100 chars, 450 char overlap)
  CHUNK_SIZE: 5100,
  CHUNK_OVERLAP: 450,
} as const

// --- Interfaces ---
export interface IngestConfig {
  collectionName?: string
  ollamaEmbedModel?: string
  userId?: string
  teamId?: string
  tags?: string[]
  qdrantUrl?: string
  chunkSize?: number
  chunkOverlap?: number
}

export interface IngestResult {
  docId: string
  chunkCount: number
  title: string
  collectionName: string
}

/**
 * Core Ingestion Logic: Vectorizes and upserts documents to Qdrant
 */
async function coreIngestLogic(documents: any[], config: IngestConfig): Promise<IngestResult> {
  const {
    collectionName = DEFAULT_CONFIG.COLLECTION_NAME,
    qdrantUrl = DEFAULT_CONFIG.QDRANT_URL,
    ollamaEmbedModel = DEFAULT_CONFIG.OLLAMA_EMBED_MODEL,
  } = config

  // Initialize embeddings
  const embeddings = new OllamaEmbeddings({
    model: ollamaEmbedModel,
  })

  // Upsert to Qdrant
  await QdrantVectorStore.fromDocuments(documents, embeddings, {
    url: qdrantUrl,
    collectionName,
  })

  // Extract metadata from first document for result
  const firstDoc = documents[0]
  const result: IngestResult = {
    docId: firstDoc.metadata.doc_id,
    chunkCount: documents.length,
    title: firstDoc.metadata.fileName || firstDoc.metadata.title || 'Unknown',
    collectionName,
  }

  console.log(`✅ Successfully ingested ${documents.length} chunks into collection "${collectionName}"`)
  return result
}

/**
 * Ingest files (PDF, DOCX, TXT)
 */
export async function ingestFilePath(filePath: string, config: IngestConfig = {}): Promise<IngestResult> {
  try {
    const fileType = getFileTypeFromPath(filePath)
    if (!fileType) {
      throw new Error(`Unsupported file type: ${filePath}`)
    }

    const documents = await loadDocuments({
      type: fileType,
      source: filePath,
      collectionName: config.collectionName || DEFAULT_CONFIG.COLLECTION_NAME,
      userId: config.userId || DEFAULT_CONFIG.USER_ID,
      teamId: config.teamId || DEFAULT_CONFIG.TEAM_ID,
      tags: config.tags || [...DEFAULT_CONFIG.TAGS],
      chunkSize: config.chunkSize || DEFAULT_CONFIG.CHUNK_SIZE,
      chunkOverlap: config.chunkOverlap || DEFAULT_CONFIG.CHUNK_OVERLAP,
    })

    return coreIngestLogic(documents, config)
  } catch (error) {
    console.error('❌ Error ingesting file:', error)
    throw new Error(`Failed to ingest file: ${(error as Error).message}`)
  }
}

/**
 * Ingest URL content
 */
export async function ingestURLContent(url: string, config: IngestConfig = {}): Promise<IngestResult> {
  try {
    const documents = await loadDocuments({
      type: 'url',
      source: url,
      collectionName: config.collectionName || DEFAULT_CONFIG.COLLECTION_NAME,
      userId: config.userId || DEFAULT_CONFIG.USER_ID,
      teamId: config.teamId || DEFAULT_CONFIG.TEAM_ID,
      tags: config.tags || [...DEFAULT_CONFIG.TAGS],
      chunkSize: config.chunkSize || DEFAULT_CONFIG.CHUNK_SIZE,
      chunkOverlap: config.chunkOverlap || DEFAULT_CONFIG.CHUNK_OVERLAP,
    })

    return coreIngestLogic(documents, config)
  } catch (error) {
    console.error('❌ Error ingesting URL:', error)
    throw new Error(`Failed to ingest URL: ${(error as Error).message}`)
  }
}

/**
 * Ingest text content
 */
export async function ingestTextContent(
  content: string,
  title: string = 'Pasted_Text_Snippet',
  config: IngestConfig = {}
): Promise<IngestResult> {
  try {
    const documents = await loadDocuments({
      type: 'text',
      source: content,
      collectionName: config.collectionName || DEFAULT_CONFIG.COLLECTION_NAME,
      userId: config.userId || DEFAULT_CONFIG.USER_ID,
      teamId: config.teamId || DEFAULT_CONFIG.TEAM_ID,
      tags: config.tags || [...DEFAULT_CONFIG.TAGS],
      chunkSize: config.chunkSize || DEFAULT_CONFIG.CHUNK_SIZE,
      chunkOverlap: config.chunkOverlap || DEFAULT_CONFIG.CHUNK_OVERLAP,
    })

    return coreIngestLogic(documents, config)
  } catch (error) {
    console.error('❌ Error ingesting text:', error)
    throw new Error(`Failed to ingest text: ${(error as Error).message}`)
  }
}

/**
 * Utility function to determine file type from path
 */
function getFileTypeFromPath(filePath: string): DocumentType | null {
  const extension = filePath.toLowerCase().split('.').pop()

  switch (extension) {
    case 'pdf':
      return 'pdf'
    case 'docx':
    case 'doc':
      return 'docx'
    case 'txt':
      return 'txt'
    default:
      return null
  }
}

/**
 * Get default configuration
 */
export function getDefaultConfig(): IngestConfig {
  return {
    collectionName: DEFAULT_CONFIG.COLLECTION_NAME,
    ollamaEmbedModel: DEFAULT_CONFIG.OLLAMA_EMBED_MODEL,
    userId: DEFAULT_CONFIG.USER_ID,
    teamId: DEFAULT_CONFIG.TEAM_ID,
    tags: [...DEFAULT_CONFIG.TAGS],
    qdrantUrl: DEFAULT_CONFIG.QDRANT_URL,
    chunkSize: DEFAULT_CONFIG.CHUNK_SIZE,
    chunkOverlap: DEFAULT_CONFIG.CHUNK_OVERLAP,
  }
}
