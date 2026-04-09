/**
 * ZIM Downloader — streams ZIM file downloads with progress events.
 *
 * Downloads knowledge packs (Wikipedia, Stack Overflow, etc.) to ~/.superbrain/zim/
 * and restarts kiwix-serve to pick up new files.
 */

import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import { pipeline } from 'stream/promises'
import { ZimService, ZIM_DIR } from './zimService'

// ── Available Knowledge Packs ────────────────────────────────────────────

export interface KnowledgePack {
  id: string
  name: string
  description: string
  size: string
  sizeBytes: number
  url: string
  filename: string
  recommended: boolean
}

export const KNOWLEDGE_PACKS: KnowledgePack[] = [
  {
    id: 'wikipedia-simple',
    name: 'Wikipedia Simple English',
    description: '200,000 articles. Best for everyday questions.',
    size: '~600MB',
    sizeBytes: 600_000_000,
    url: 'https://download.kiwix.org/zim/wikipedia/wikipedia_en_simple_all_mini_2026-02.zim',
    filename: 'wikipedia-simple.zim',
    recommended: true,
  },
  {
    id: 'wikipedia-en',
    name: 'Wikipedia English (Full)',
    description: '6.7 million articles. Everything.',
    size: '~22GB',
    sizeBytes: 22_000_000_000,
    url: 'https://download.kiwix.org/zim/wikipedia/wikipedia_en_all_mini_2026-02.zim',
    filename: 'wikipedia-en.zim',
    recommended: false,
  },
  {
    id: 'stackoverflow',
    name: 'Stack Overflow',
    description: 'Programming Q&A. Works offline.',
    size: '~4GB',
    sizeBytes: 4_000_000_000,
    url: 'https://download.kiwix.org/zim/stack_exchange/stackoverflow.com_en_all.zim',
    filename: 'stackoverflow.zim',
    recommended: false,
  },
  {
    id: 'medical',
    name: 'Wikipedia Medical',
    description: 'Medical references and drug information.',
    size: '~800MB',
    sizeBytes: 800_000_000,
    url: 'https://download.kiwix.org/zim/wikipedia/wikipedia_en_medicine_maxi_2026-02.zim',
    filename: 'medical.zim',
    recommended: false,
  },
  {
    id: 'gutenberg',
    name: 'Project Gutenberg',
    description: '70,000 free ebooks. Literature, philosophy, science.',
    size: '~65GB',
    sizeBytes: 65_000_000_000,
    url: 'https://download.kiwix.org/zim/gutenberg/gutenberg_en_all_2026-02.zim',
    filename: 'gutenberg.zim',
    recommended: false,
  },
]

// ── Download state ────────────────────────────────────────��──────────────

interface DownloadJob {
  packId: string
  abortController: AbortController
  downloadedBytes: number
  totalBytes: number
  status: 'downloading' | 'completed' | 'failed' | 'cancelled'
}

const activeDownloads = new Map<string, DownloadJob>()

// ── Public API ───────────────────────────────────────────────────────────

export interface DownloadProgress {
  packId: string
  progress: number // 0-100
  downloadedBytes: number
  totalBytes: number
  status: string
}

/**
 * Download a ZIM knowledge pack with streaming progress.
 * Sends 'zim:download:progress' events to the renderer via sender.
 */
export async function downloadZim(
  packId: string,
  sender: Electron.WebContents
): Promise<void> {
  const pack = KNOWLEDGE_PACKS.find((p) => p.id === packId)
  if (!pack) throw new Error(`Unknown knowledge pack: ${packId}`)

  // Check if already downloading
  if (activeDownloads.has(packId)) {
    throw new Error(`Already downloading: ${pack.name}`)
  }

  const destPath = path.join(ZIM_DIR, pack.filename)
  const tempPath = destPath + '.downloading'
  fs.mkdirSync(ZIM_DIR, { recursive: true })

  const abortController = new AbortController()
  const job: DownloadJob = {
    packId,
    abortController,
    downloadedBytes: 0,
    totalBytes: 0,
    status: 'downloading',
  }
  activeDownloads.set(packId, job)

  try {
    console.log(`[ZIM:DL] Starting download: ${pack.name} (${pack.size})`)
    sender.send('zim:download:progress', {
      packId,
      progress: 0,
      downloadedBytes: 0,
      totalBytes: pack.sizeBytes,
      status: 'downloading',
    } satisfies DownloadProgress)

    const response = await axios.get(pack.url, {
      responseType: 'stream',
      timeout: 30000, // 30s connect timeout
      signal: abortController.signal,
    })

    const totalBytes = parseInt(response.headers['content-length'] || '0') || pack.sizeBytes
    job.totalBytes = totalBytes

    const writer = fs.createWriteStream(tempPath)

    // Track progress
    let lastProgressUpdate = 0
    response.data.on('data', (chunk: Buffer) => {
      job.downloadedBytes += chunk.length

      // Throttle progress events to every 500ms
      const now = Date.now()
      if (now - lastProgressUpdate > 500) {
        lastProgressUpdate = now
        const progress = totalBytes > 0
          ? Math.round((job.downloadedBytes / totalBytes) * 100)
          : 0

        sender.send('zim:download:progress', {
          packId,
          progress,
          downloadedBytes: job.downloadedBytes,
          totalBytes,
          status: 'downloading',
        } satisfies DownloadProgress)
      }
    })

    await pipeline(response.data, writer)

    // Rename temp file to final
    fs.renameSync(tempPath, destPath)

    job.status = 'completed'
    activeDownloads.delete(packId)

    console.log(`[ZIM:DL] Download complete: ${pack.name}`)
    sender.send('zim:download:progress', {
      packId,
      progress: 100,
      downloadedBytes: job.downloadedBytes,
      totalBytes,
      status: 'completed',
    } satisfies DownloadProgress)

    // Restart kiwix-serve to pick up new ZIM
    const zimService = ZimService.getInstance()
    await zimService.restart()
    console.log(`[ZIM:DL] kiwix-serve restarted with new ZIM`)
  } catch (error: any) {
    // Clean up temp file
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
    } catch {}

    const status = error.name === 'CanceledError' ? 'cancelled' : 'failed'
    job.status = status
    activeDownloads.delete(packId)

    console.error(`[ZIM:DL] Download ${status}: ${pack.name} — ${error.message}`)
    sender.send('zim:download:progress', {
      packId,
      progress: 0,
      downloadedBytes: job.downloadedBytes,
      totalBytes: job.totalBytes,
      status,
    } satisfies DownloadProgress)

    if (status === 'failed') throw error
  }
}

/**
 * Cancel an in-progress download.
 */
export function cancelDownload(packId: string): boolean {
  const job = activeDownloads.get(packId)
  if (!job) return false
  job.abortController.abort()
  return true
}

/**
 * Get installed packs — cross-references KNOWLEDGE_PACKS with files on disk.
 */
export function getInstalledPacks(): Array<KnowledgePack & { installed: boolean; installedSizeBytes: number }> {
  const zimFiles = new Set(
    fs.existsSync(ZIM_DIR)
      ? fs.readdirSync(ZIM_DIR).filter((f) => f.endsWith('.zim'))
      : []
  )

  return KNOWLEDGE_PACKS.map((pack) => {
    const installed = zimFiles.has(pack.filename)
    let installedSizeBytes = 0
    if (installed) {
      try {
        installedSizeBytes = fs.statSync(path.join(ZIM_DIR, pack.filename)).size
      } catch {}
    }
    return { ...pack, installed, installedSizeBytes }
  })
}

/**
 * Check if any download is in progress.
 */
export function hasActiveDownload(): boolean {
  return activeDownloads.size > 0
}
