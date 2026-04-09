/**
 * ZimService — manages kiwix-serve as a child process for offline knowledge access.
 *
 * Serves ZIM files (Wikipedia, Stack Overflow, etc.) via a local HTTP server.
 * Provides search API consumed by the RAG chat pipeline.
 *
 * Architecture:
 *   kiwix-serve (child process, port 8383)
 *     ↓ HTTP search API
 *   ZimService.search(query)
 *     ↓ parsed results
 *   chatService.ts (added as context before Ollama)
 */

import { spawn, ChildProcess } from 'child_process'
import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export const KIWIX_PORT = 8383
export const KIWIX_URL = `http://localhost:${KIWIX_PORT}`
export const ZIM_DIR = path.join(os.homedir(), '.superbrain', 'zim')

export interface ZimResult {
  title: string
  snippet: string
  source: string
  url: string
}

export interface ZimStatus {
  running: boolean
  zimCount: number
  zims: string[]
  port: number
}

export class ZimService {
  private static instance: ZimService | null = null
  private process: ChildProcess | null = null
  private _isRunning = false
  private _availableZims: string[] = []

  constructor() {
    fs.mkdirSync(ZIM_DIR, { recursive: true })
    this.refreshZimList()
  }

  static getInstance(): ZimService {
    if (!ZimService.instance) {
      ZimService.instance = new ZimService()
    }
    return ZimService.instance
  }

  get isRunning(): boolean {
    return this._isRunning
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  /**
   * Start kiwix-serve with all ZIM files in ~/.superbrain/zim/
   * Does nothing if no ZIM files present or already running.
   */
  async start(): Promise<void> {
    if (this._isRunning) return

    this.refreshZimList()
    if (this._availableZims.length === 0) {
      console.log('[ZIM] No ZIM files found in', ZIM_DIR)
      return
    }

    const zimPaths = this._availableZims.map((z) => path.join(ZIM_DIR, z))

    return new Promise<void>((resolve, reject) => {
      const args = [
        '--port', String(KIWIX_PORT),
        '--address', '127.0.0.1',
        '--threads', '2',
        '--nodatealiases',
        ...zimPaths,
      ]

      console.log(`[ZIM] Starting kiwix-serve on port ${KIWIX_PORT} with ${zimPaths.length} file(s)`)

      this.process = spawn('kiwix-serve', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let started = false

      this.process.stdout?.on('data', (data: Buffer) => {
        const msg = data.toString().trim()
        if (msg) console.log(`[ZIM:stdout] ${msg}`)
      })

      this.process.stderr?.on('data', (data: Buffer) => {
        const msg = data.toString().trim()
        if (msg) console.log(`[ZIM:stderr] ${msg}`)
      })

      this.process.on('error', (err) => {
        console.error('[ZIM] Failed to start kiwix-serve:', err.message)
        this._isRunning = false
        if (!started) reject(err)
      })

      this.process.on('exit', (code) => {
        console.log(`[ZIM] kiwix-serve exited with code ${code}`)
        this._isRunning = false
        this.process = null
      })

      // Poll for readiness — kiwix-serve doesn't print "ready" consistently
      const pollReady = async (retries = 20): Promise<void> => {
        for (let i = 0; i < retries; i++) {
          await new Promise((r) => setTimeout(r, 300))
          try {
            const resp = await axios.get(KIWIX_URL, { timeout: 2000 })
            if (resp.status === 200) {
              this._isRunning = true
              started = true
              console.log(`[ZIM] kiwix-serve ready on port ${KIWIX_PORT}`)
              resolve()
              return
            }
          } catch {
            // Not ready yet
          }
        }
        // Timed out but process may still be starting
        if (this.process && !this.process.killed) {
          this._isRunning = true
          started = true
          console.log('[ZIM] kiwix-serve assumed ready (timeout on health poll)')
          resolve()
        } else {
          reject(new Error('kiwix-serve failed to start within 6 seconds'))
        }
      }

      pollReady().catch(reject)
    })
  }

  /**
   * Stop kiwix-serve cleanly.
   */
  async stop(): Promise<void> {
    if (!this.process) {
      this._isRunning = false
      return
    }

    return new Promise<void>((resolve) => {
      const proc = this.process!
      const timeout = setTimeout(() => {
        console.log('[ZIM] Force-killing kiwix-serve')
        proc.kill('SIGKILL')
        resolve()
      }, 5000)

      proc.on('exit', () => {
        clearTimeout(timeout)
        this._isRunning = false
        this.process = null
        console.log('[ZIM] kiwix-serve stopped')
        resolve()
      })

      proc.kill('SIGTERM')
    })
  }

  /**
   * Restart kiwix-serve (e.g., after downloading a new ZIM file).
   */
  async restart(): Promise<void> {
    await this.stop()
    await this.start()
  }

  // ── Search ─────────────────────────────────────────────────────────────

  /**
   * Search ZIM content via kiwix-serve search API.
   * Returns parsed results with title, snippet, source ZIM name.
   *
   * kiwix-serve 3.7.0 exposes: GET /search?pattern=<query>&pageLength=<n>
   * Response is HTML — we parse the result links and snippets.
   */
  async search(query: string, limit = 5): Promise<ZimResult[]> {
    if (!this._isRunning) return []

    try {
      const resp = await axios.get(`${KIWIX_URL}/search`, {
        params: {
          pattern: query,
          pageLength: limit,
        },
        timeout: 5000,
        headers: { Accept: 'text/html' },
      })

      return this.parseSearchResults(resp.data, limit)
    } catch (error) {
      console.warn('[ZIM] Search failed:', (error as Error).message)
      return []
    }
  }

  /**
   * Parse kiwix-serve search result HTML.
   * The results are in <article> or <div class="kiwix"> blocks with links and snippets.
   * We use regex since we can't add cheerio as a main-process dependency easily
   * (it's already a renderer dep via documentLoader).
   */
  private parseSearchResults(html: string, limit: number): ZimResult[] {
    const results: ZimResult[] = []

    // kiwix-serve search results contain links in pattern:
    // <a href="/zimbook/article_path">Title</a> ... <p class="snippet">...</p>
    // The exact format varies by kiwix version. We extract broadly.

    // Pattern 1: Extract from search result entries
    // kiwix-serve wraps results in elements with article links
    const entryPattern = /<a[^>]+href="(\/[^"]+)"[^>]*>([^<]+)<\/a>/g
    const snippetPattern = /<(?:p|cite)[^>]*>([^<]{10,500})<\/(?:p|cite)>/g

    const links: Array<{ url: string; title: string }> = []
    let match: RegExpExecArray | null

    while ((match = entryPattern.exec(html)) !== null) {
      const url = match[1]
      const title = match[2].trim()
      // Skip navigation/UI links — only take article links
      if (
        url.includes('/search') ||
        url.includes('/catalog') ||
        url.includes('/skin/') ||
        url === '/' ||
        title.length < 2
      )
        continue
      links.push({ url, title })
    }

    // Extract snippets
    const snippets: string[] = []
    while ((match = snippetPattern.exec(html)) !== null) {
      const text = match[1].replace(/<[^>]*>/g, '').trim()
      if (text.length > 20) snippets.push(text)
    }

    // Combine links and snippets
    for (let i = 0; i < Math.min(links.length, limit); i++) {
      const link = links[i]
      // Extract ZIM name from URL path: /zimbook/article → zimbook
      const zimName = link.url.split('/')[1] || 'unknown'

      results.push({
        title: this.decodeHtmlEntities(link.title),
        snippet: snippets[i]
          ? this.decodeHtmlEntities(snippets[i]).substring(0, 500)
          : '',
        source: `${zimName}.zim`,
        url: `${KIWIX_URL}${link.url}`,
      })
    }

    return results
  }

  /**
   * Get full article text by fetching the kiwix-serve page and stripping HTML.
   */
  async getArticle(articleUrl: string): Promise<string> {
    if (!this._isRunning) return ''

    try {
      const url = articleUrl.startsWith('http') ? articleUrl : `${KIWIX_URL}${articleUrl}`
      const resp = await axios.get(url, { timeout: 5000 })
      // Strip HTML tags to get plain text
      return resp.data
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 10000) // Cap at 10k chars
    } catch {
      return ''
    }
  }

  // ── ZIM file management ────────────────────────────────────────────────

  /**
   * Refresh the list of available ZIM files.
   */
  refreshZimList(): void {
    try {
      this._availableZims = fs
        .readdirSync(ZIM_DIR)
        .filter((f) => f.endsWith('.zim'))
        .sort()
    } catch {
      this._availableZims = []
    }
  }

  /**
   * List all installed ZIM files.
   */
  listZims(): string[] {
    this.refreshZimList()
    return [...this._availableZims]
  }

  /**
   * Remove a ZIM file and restart kiwix-serve.
   */
  async removeZim(filename: string): Promise<boolean> {
    const filePath = path.join(ZIM_DIR, filename)
    if (!fs.existsSync(filePath)) return false

    await this.stop()
    fs.unlinkSync(filePath)
    this.refreshZimList()

    if (this._availableZims.length > 0) {
      await this.start()
    }
    return true
  }

  /**
   * Get total disk usage of installed ZIM files.
   */
  getDiskUsage(): { totalBytes: number; files: Array<{ name: string; bytes: number }> } {
    const files = this.listZims().map((name) => {
      const filePath = path.join(ZIM_DIR, name)
      try {
        const stat = fs.statSync(filePath)
        return { name, bytes: stat.size }
      } catch {
        return { name, bytes: 0 }
      }
    })
    return {
      totalBytes: files.reduce((sum, f) => sum + f.bytes, 0),
      files,
    }
  }

  /**
   * Health check — is kiwix-serve responding?
   */
  async healthCheck(): Promise<boolean> {
    if (!this._isRunning) return false
    try {
      const resp = await axios.get(KIWIX_URL, { timeout: 2000 })
      return resp.status === 200
    } catch {
      return false
    }
  }

  /**
   * Full status object.
   */
  async getStatus(): Promise<ZimStatus> {
    return {
      running: await this.healthCheck(),
      zimCount: this._availableZims.length,
      zims: [...this._availableZims],
      port: KIWIX_PORT,
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&nbsp;/g, ' ')
  }
}
