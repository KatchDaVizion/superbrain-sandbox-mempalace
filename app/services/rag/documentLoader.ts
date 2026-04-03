// services/documentLoader.ts
import { Document } from '@langchain/core/documents'
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf'
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx'
import { TextLoader } from '@langchain/classic/document_loaders/fs/text'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import axios from 'axios'
import * as cheerio from 'cheerio'
import * as crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'

export type DocumentType = 'pdf' | 'docx' | 'txt' | 'url' | 'text'

/**
 * Sanitize text before embedding — removes characters that cause Qdrant JSON errors.
 * Ported from Project N.O.M.A.D. (Apache 2.0, Crosstalk Solutions LLC)
 */
export function sanitizeText(text: string): string {
  return text
    .replace(/\0/g, '')                              // null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')  // control chars (preserve \t \n \r)
    .replace(/\uFFFD/g, '')                           // Unicode replacement chars
    .trim()
}

export interface LoadDocumentOptions {
  type: DocumentType
  source: string // file path, URL, or raw text
  collectionName: string
  userId?: string
  teamId?: string
  tags?: string[]
  chunkSize?: number
  chunkOverlap?: number
}

export async function loadDocuments(options: LoadDocumentOptions): Promise<Document[]> {
  // Token-aware chunking: 5100 chars ≈ 1700 tokens (N.O.M.A.D. pattern)
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: options.chunkSize || 5100,
    chunkOverlap: options.chunkOverlap || 450,
  })

  let docs: Document[] = []
  const docId = uuidv4()

  switch (options.type) {
    case 'pdf':
      docs = await loadPDF(options.source)
      break
    case 'docx':
      docs = await loadDOCX(options.source)
      break
    case 'txt':
      docs = await loadText(options.source)
      break
    case 'url':
      docs = await loadURL(options.source)
      break
    case 'text':
      docs = await loadRawText(options.source)
      break
  }

  // Add base metadata to track source
  const docsWithBaseMetadata = docs.map((doc, index) => ({
    ...doc,
    metadata: {
      ...doc.metadata,
      doc_id: docId,
      source: options.source,
      type: options.type,
      collectionName: options.collectionName,
      user_id: options.userId,
      team_id: options.teamId,
      tags: options.tags || [],
      page: doc.metadata.page || index + 1,
    },
  }))

  // Split into chunks
  const splits = await splitter.splitDocuments(docsWithBaseMetadata)

  // Add chunk-specific metadata with hashing + sanitization
  const documentsWithMetadata = splits.map((chunk, index) => {
    const cleanContent = sanitizeText(chunk.pageContent)
    const contentHash = crypto.createHash('sha256').update(cleanContent).digest('hex')

    const finalMetadata = {
      ...chunk.metadata,
      chunk_id: `${docId}-${index}`,
      text: cleanContent, // Keep sanitized text for reference
      hash: contentHash,
      created_at: new Date().toISOString(),
    }

    return new Document({
      pageContent: cleanContent,
      metadata: finalMetadata as Record<string, any>,
    })
  })

  return documentsWithMetadata
}

/**
 * OCR fallback for scanned/image-based PDFs.
 * Converts pages to images, preprocesses with sharp, then OCR with Tesseract.js.
 * Ported from Project N.O.M.A.D. (Apache 2.0, Crosstalk Solutions LLC)
 */
async function extractWithOCR(filePath: string): Promise<string> {
  const { fromPath } = await import('pdf2pic')
  const sharp = (await import('sharp')).default
  const Tesseract = await import('tesseract.js')

  const converter = fromPath(filePath, {
    density: 300,
    saveFilename: 'ocr_page',
    savePath: '/tmp',
    format: 'png',
    width: 2480,
    height: 3508,
  })

  let text = ''
  let pageNum = 1

  // Process pages one at a time to limit memory on low-RAM systems
  while (true) {
    try {
      const page = await converter(pageNum)
      if (!page?.path) break

      // Preprocess: grayscale + normalize + sharpen (N.O.M.A.D. pattern)
      const processed = await sharp(page.path)
        .grayscale()
        .normalize()
        .sharpen()
        .toBuffer()

      const { data } = await Tesseract.recognize(processed, 'eng')
      text += data.text + '\n'
      pageNum++
    } catch {
      break // No more pages
    }
  }

  return text.trim()
}

async function loadPDF(filePath: string): Promise<Document[]> {
  const loader = new PDFLoader(filePath, {
    splitPages: true,
  })
  const docs = await loader.load()

  // Check if PDF is scanned/image-based (< 100 chars of actual text)
  const totalText = docs.reduce((sum, doc) => sum + doc.pageContent.length, 0)

  if (totalText < 100) {
    console.log(`[OCR] PDF has only ${totalText} chars — triggering OCR fallback`)
    try {
      const ocrText = await extractWithOCR(filePath)
      if (ocrText.length > totalText) {
        return [{
          pageContent: ocrText,
          metadata: {
            sourceType: 'pdf',
            fileName: filePath.split('/').pop(),
            page: 1,
            extractionMethod: 'ocr',
          },
        }]
      }
    } catch (ocrError) {
      console.warn('[OCR] Fallback failed, using original text:', (ocrError as Error).message)
    }
  }

  return docs.map((doc, index) => ({
    pageContent: doc.pageContent,
    metadata: {
      ...doc.metadata,
      sourceType: 'pdf',
      fileName: filePath.split('/').pop(),
      page: doc.metadata.loc?.pageNumber || index + 1,
      extractionMethod: 'text',
    },
  }))
}

async function loadDOCX(filePath: string): Promise<Document[]> {
  const loader = new DocxLoader(filePath)
  const docs = await loader.load()

  return docs.map((doc) => ({
    pageContent: doc.pageContent,
    metadata: {
      ...doc.metadata,
      sourceType: 'docx',
      fileName: filePath.split('/').pop(),
    },
  }))
}

async function loadText(filePath: string): Promise<Document[]> {
  const loader = new TextLoader(filePath)
  const docs = await loader.load()

  return docs.map((doc) => ({
    pageContent: doc.pageContent,
    metadata: {
      ...doc.metadata,
      sourceType: 'txt',
      fileName: filePath.split('/').pop(),
    },
  }))
}

async function loadURL(url: string): Promise<Document[]> {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    // Parse HTML
    const $ = cheerio.load(response.data)

    // Remove script and style tags
    $('script, style').remove()

    // Extract text
    const text = $('body').text()
    const cleanText = text.replace(/\s+/g, ' ').trim().slice(0, 50000) // Limit text

    return [
      {
        pageContent: cleanText,
        metadata: {
          sourceType: 'url',
          url,
          title: $('title').text() || 'Web Page',
        },
      },
    ]
  } catch (error) {
    console.error(`Failed to load URL ${url}:`, error)
    throw new Error(`Failed to load URL: ${(error as Error).message}`)
  }
}

async function loadRawText(text: string): Promise<Document[]> {
  return [
    {
      pageContent: text,
      metadata: {
        sourceType: 'text',
        title: 'Pasted Text',
      },
    },
  ]
}

/**
 * Utility function to get supported file types
 */
export function getSupportedFileTypes(): string[] {
  return ['pdf', 'docx', 'txt', 'url', 'text']
}

/**
 * Utility function to get file type from extension
 */
export function getFileTypeFromExtension(filename: string): DocumentType | null {
  const ext = filename.toLowerCase().split('.').pop()
  switch (ext) {
    case 'pdf':
      return 'pdf'
    case 'docx':
    case 'doc':
      return 'docx'
    case 'txt':
    case 'text':
      return 'txt'
    default:
      return null
  }
}
