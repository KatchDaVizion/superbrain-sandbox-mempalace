// lib/node/networkChunkStore.ts
// Main-process service: ingests network chunks into Qdrant "network-chunks",
// provides local vector search with Ollama-generated answers.
// Phase 2 of Node Mode — desktop-side only.

import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { exec } from 'child_process'

const COLLECTION = 'network-chunks'
const QDRANT_URL = 'http://localhost:6333'
const OLLAMA_URL = 'http://localhost:11434'
const EMBED_MODEL = 'nomic-embed-text'
const ANSWER_MODEL = 'qwen2.5:0.5b'
const MIN_SCORE = 0.45
const MIN_RESULTS = 3
const POLL_INTERVAL_MS = 60_000
const INGEST_BATCH = 50

export interface LocalChunkResult {
  content: string
  content_hash: string
  score: number
  source: string
  timestamp: number
  node_id: string
}

export interface LocalQueryResult {
  results: LocalChunkResult[]
  sufficient: boolean
}

export interface LocalAnswerResult {
  text: string
  citations: number[]
  time: number
}

export class NetworkChunkStore {
  private _dbPath: string
  private _cursorPath: string
  private _scriptPath: string
  private _cursor = 0
  private _timer: NodeJS.Timeout | null = null
  private _running = false
  private _storageCapMb = 512

  constructor() {
    const userData = app.getPath('userData')
    this._dbPath = join(userData, 'node-chunks.db')
    this._cursorPath = join(userData, 'network-chunk-cursor.json')
    // Resolve script relative to app root (works in dev; packaged builds bundle differently)
    const appRoot = app.isPackaged ? join(process.resourcesPath, 'app') : app.getAppPath()
    this._scriptPath = join(appRoot, 'lib', 'node', 'ingest_chunks.py')
    this._loadCursor()
  }

  private _loadCursor(): void {
    try {
      if (existsSync(this._cursorPath)) {
        this._cursor = JSON.parse(readFileSync(this._cursorPath, 'utf8')).cursor ?? 0
      }
    } catch {
      this._cursor = 0
    }
  }

  private _saveCursor(cursor: number): void {
    try {
      writeFileSync(this._cursorPath, JSON.stringify({ cursor }))
    } catch {}
  }

  configure(storageCapMb: number): void {
    this._storageCapMb = storageCapMb
  }

  start(): void {
    if (this._running) return
    this._running = true
    this._schedule(5_000) // first sync after 5s startup grace
  }

  stop(): void {
    this._running = false
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
  }

  // Called when nodeModeService receives new chunks — sync sooner
  scheduleSync(): void {
    if (!this._running) return
    if (this._timer) clearTimeout(this._timer)
    this._schedule(0)
  }

  private _schedule(delayMs = POLL_INTERVAL_MS): void {
    this._timer = setTimeout(() => {
      this._doSync().finally(() => {
        if (this._running) this._schedule()
      })
    }, delayMs)
  }

  private _doSync(): Promise<void> {
    return new Promise((resolve) => {
      if (!existsSync(this._dbPath) || !existsSync(this._scriptPath)) {
        resolve()
        return
      }

      const jsonArgs = JSON.stringify({
        db_path: this._dbPath,
        cursor: this._cursor,
        batch: INGEST_BATCH,
        storage_cap_mb: this._storageCapMb,
      }).replace(/'/g, "'\\''")

      const scriptPath = this._scriptPath.replace(/'/g, "'\\''")
      exec(
        `python3 '${scriptPath}' '${jsonArgs}'`,
        { timeout: 120_000 },
        (err, stdout, stderr) => {
          if (err) {
            console.error('[NetworkChunkStore] ingest error:', err.message)
            resolve()
            return
          }
          if (stderr) console.warn('[NetworkChunkStore]', stderr.trim())
          try {
            const r = JSON.parse(stdout.trim())
            if (r.new_cursor > this._cursor) {
              this._cursor = r.new_cursor
              this._saveCursor(this._cursor)
              console.log(`[NetworkChunkStore] ingested=${r.processed} cursor=${this._cursor} errors=${r.errors}`)
            }
          } catch {}
          resolve()
        }
      )
    })
  }

  private async _embed(text: string): Promise<number[]> {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text.slice(0, 2000) }),
    })
    if (!res.ok) throw new Error(`Ollama embed ${res.status}`)
    return ((await res.json()) as any).embedding as number[]
  }

  async query(queryText: string, topK = 5): Promise<LocalQueryResult> {
    try {
      const colRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`)
      if (!colRes.ok) return { results: [], sufficient: false }

      const vector = await this._embed(queryText)

      const searchRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vector, limit: topK, with_payload: true, score_threshold: 0.2 }),
      })

      if (!searchRes.ok) return { results: [], sufficient: false }

      const hits = (((await searchRes.json()) as any).result ?? []) as any[]
      const results: LocalChunkResult[] = hits.map((h) => ({
        content: h.payload.content,
        content_hash: h.payload.content_hash,
        score: h.score,
        source: h.payload.source,
        timestamp: h.payload.timestamp,
        node_id: h.payload.node_id,
      }))

      const sufficient = results.filter((r) => r.score >= MIN_SCORE).length >= MIN_RESULTS
      return { results, sufficient }
    } catch (e) {
      console.error('[NetworkChunkStore] query error:', e)
      return { results: [], sufficient: false }
    }
  }

  async generateAnswer(query: string, chunks: LocalChunkResult[]): Promise<LocalAnswerResult> {
    const start = Date.now()
    try {
      const context = chunks
        .slice(0, 5)
        .map((c, i) => `[${i + 1}] ${c.content.slice(0, 500)}`)
        .join('\n\n')

      const prompt =
        `Answer the question using the context below. Cite sources as [1], [2], etc.\n\n` +
        `Context:\n${context}\n\nQuestion: ${query}\n\nAnswer:`

      const res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: ANSWER_MODEL, prompt, stream: false }),
      })

      if (!res.ok) throw new Error(`Ollama generate ${res.status}`)

      const text = (((await res.json()) as any).response as string) || ''
      const citations = [...text.matchAll(/\[(\d+)\]/g)]
        .map((m) => parseInt(m[1]))
        .filter((n, i, a) => a.indexOf(n) === i)

      return { text, citations, time: (Date.now() - start) / 1000 }
    } catch {
      return { text: '', citations: [], time: (Date.now() - start) / 1000 }
    }
  }
}

let _instance: NetworkChunkStore | null = null

export function getNetworkChunkStore(): NetworkChunkStore {
  if (!_instance) _instance = new NetworkChunkStore()
  return _instance
}
