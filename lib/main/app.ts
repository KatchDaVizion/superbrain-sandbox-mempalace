import { BrowserWindow, shell, app, protocol, net, ipcMain } from 'electron'
import { join } from 'path'
import { registerWindowIPC } from '@/lib/window/ipcEvents'
import appIcon from '@/resources/build/supericon.png'
import { pathToFileURL } from 'url'
import os from 'os'
import { execSync, exec, execFile } from 'child_process'
import crypto from 'crypto'
import { ZimService } from '../zim/zimService'
import { p2pSync } from '../p2p/p2pSyncService'
import { mesh } from '../p2p/meshNetwork'
import { mempalace } from '../mempalace'
import { signShare, getIdentityPublicKeyHex } from './signing'
import { downloadZim, cancelDownload, getInstalledPacks, KNOWLEDGE_PACKS } from '../zim/zimDownloader'
import { runBenchmark, getCachedBenchmark, getTierInfo } from '../benchmark/benchmarkService'
import { submitScore, fetchLeaderboard, calculateUserRank } from '../benchmark/leaderboardService'

import {
  createThread,
  initStore,
  Message,
  Role,
  Store,
  touchThread,
  upsertThread,
  writeStore
} from '../chat/chatStore'
import { getBittensorStats, loadWalletConfig, saveWalletConfig, registerBittensorWallet, downloadMinerScript } from '../bittensor/eventHandler'
import { getBtcliPathSafe } from '../bittensor/btcliPath'
import { miningService } from '../bittensor/miningService'
import { WalletConfig } from '../bittensor/types'
import { subnetMinerService } from '../bittensor/subnetMinerService'
import { getOsConfig, saveOsConfig } from '../bittensor/config'
import { ingestFilePath, ingestTextContent, ingestURLContent } from '@/app/services/rag/ingest'
import {
  initRagStore,
  writeRagStore,
  ragCreateThread,
  ragUpsertThread,
  ragTouchThread,
  ragAppendMessage,
  ragDeleteThread,
  RagThread,
  RagMessage,
} from '../chat/ragChatStore'

// -----------------------
// Local Machine Info IPC
// -----------------------
function getDiskInfo() {
  try {
    const platform = os.platform()
    let freeDiskGB: number | null = null
    let totalDiskGB: number | null = null

    if (platform === 'win32') {
      const stdout = execSync(`wmic logicaldisk get caption,freespace,size`)
      const lines = stdout.toString().trim().split('\n').slice(1)
      const disks = lines.map((line) => line.trim().split(/\s+/))
      const cDrive = disks.find((d) => d[0] === 'C:')
      if (cDrive && cDrive.length >= 3) {
        const free = parseInt(cDrive[1], 10)
        const total = parseInt(cDrive[2], 10)

        // Check if parsing was successful and values are valid numbers
        if (!isNaN(free) && free > 0) {
          freeDiskGB = Math.round(free / 1024 ** 3)
        }
        if (!isNaN(total) && total > 0) {
          totalDiskGB = Math.round(total / 1024 ** 3)
        }
      }
    } else if (platform === 'darwin' || platform === 'linux') {
      const stdout = execSync(`df -k /`).toString().split('\n')[1]
      if (stdout) {
        const parts = stdout.trim().split(/\s+/)
        if (parts.length >= 4) {
          const totalKB = parseInt(parts[1], 10)
          const freeKB = parseInt(parts[3], 10)

          // Check if parsing was successful and values are valid numbers
          if (!isNaN(totalKB) && totalKB > 0) {
            totalDiskGB = Math.round(totalKB / 1024 ** 2)
          }
          if (!isNaN(freeKB) && freeKB > 0) {
            freeDiskGB = Math.round(freeKB / 1024 ** 2)
          }
        }
      }
    }

    return { freeDiskGB, totalDiskGB }
  } catch (err) {
    console.error('Disk info error:', err)
    return { freeDiskGB: null, totalDiskGB: null }
  }
}

ipcMain.handle('get-machine-info', async () => {
  const { freeDiskGB, totalDiskGB } = getDiskInfo()
  return {
    OS: os.type(),
    Arch: os.arch(),
    totalRAMGB: Math.round(os.totalmem() / 1024 ** 3),
    freeRAMGB: Math.round(os.freemem() / 1024 ** 3),
    cpuModel: os.cpus()[0]?.model || 'Unknown',
    cpuCores: os.cpus().length,
    totalDiskGB,
    freeDiskGB,
  }
})

// -----------------------
// INIT CHAT STORE
// -----------------------
let store: Store
app.whenReady().then(() => {
  store = initStore('chat')
})

// -----------------------
// INIT ZIM SERVICE (Offline Knowledge Packs)
// -----------------------
const zimService = ZimService.getInstance()

app.whenReady().then(async () => {
  const zims = zimService.listZims()
  if (zims.length > 0) {
    try {
      await zimService.start()
      console.log(`[ZIM] Serving ${zims.length} knowledge pack(s) offline`)
    } catch (err) {
      console.error('[ZIM] Failed to start kiwix-serve:', (err as Error).message)
    }
  } else {
    console.log('[ZIM] No knowledge packs installed — download via Settings')
  }
})

app.whenReady().then(async () => {
  // Start P2P sync service
  p2pSync.start().catch(err => console.warn('[P2P] Start failed:', err))

  // When peer sends us a chunk — ingest into local Qdrant automatically
  p2pSync.on('new-chunk', async (chunk: any) => {
    try {
      await ingestTextContent(chunk.content, chunk.title || 'P2P Chunk', {
        tags: ['p2p-received', 'peer-knowledge'],
        source: chunk.peer_url || 'unknown-peer'
      })
      console.log(`[P2P→Qdrant] Ingested: ${chunk.title}`)
    } catch (err) {
      console.warn('[P2P→Qdrant] Failed:', (err as Error).message)
    }
  })

  p2pSync.on('ready', ({ nodeId, url }: { nodeId: string, url: string }) => {
    console.log(`[P2P] Ready — ${nodeId} at ${url}`)
  })

  // Start the Hyperswarm mesh layer (silent fail — Frankfurt remains authoritative)
  mesh.start().then((ok) => {
    if (ok) console.log('[mesh] Hyperswarm mesh active')
  }).catch((err) => console.warn('[mesh] start failed:', err?.message))

  // Forward mesh status updates to all renderer windows
  mesh.on('status-update', (stats) => {
    for (const win of BrowserWindow.getAllWindows()) {
      try { win.webContents.send('mesh:status-update', stats) } catch { /* noop */ }
    }
  })

  // Startup connectivity banner — one-shot check against the Frankfurt seed.
  // Logs a 3-line summary so we can confirm in the dev console that the app
  // came up with a healthy view of the network. Times out cleanly at 5s and
  // never blocks app boot — failure path is a single warn line.
  ;(async () => {
    const seed = process.env.SB_API_URL || 'http://46.225.114.202:8400'
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 5_000)
    try {
      const [healthRes, peersRes, chunksRes] = await Promise.all([
        fetch(`${seed}/health`, { signal: ctrl.signal }),
        fetch(`${seed}/peers`, { signal: ctrl.signal }),
        fetch(`${seed}/chunks`, { signal: ctrl.signal }),
      ])
      const health = (await healthRes.json()) as { status?: string }
      const peers = (await peersRes.json()) as { peers?: unknown[]; total?: number }
      const chunks = (await chunksRes.json()) as { total?: number }
      const peerCount = Array.isArray(peers?.peers) ? peers.peers.length : (peers?.total ?? 0)
      const chunkCount = chunks?.total ?? 0
      if (health?.status === 'ok') {
        console.log(`[startup] Frankfurt API: OK (${chunkCount} chunks, ${peerCount} peers)`)
      } else {
        console.warn(`[startup] Frankfurt API: degraded — ${JSON.stringify(health).slice(0, 80)}`)
      }
      const meshStats = mesh.getStats()
      console.log(`[startup] Mesh: joined topic ${meshStats.topic}`)
      console.log('[startup] DHT bootstrap: 46.225.114.202:49737 (Hyperswarm)')
    } catch (err) {
      console.warn(`[startup] Frankfurt unreachable: ${(err as Error).message}`)
    } finally {
      clearTimeout(timeout)
    }
  })()
})

ipcMain.handle('p2p:public-url', () => null)
ipcMain.handle('mesh:status', () => mesh.getStats())

app.on('before-quit', async () => {
  await p2pSync.stop()
  await zimService.stop()
  await mesh.stop()
})

// -----------------------
// CHAT IPC HANDLERS
// -----------------------
ipcMain.handle('chat:list-models', () => {
  return Object.entries(store.models).map(([modelId, v]) => ({
    modelId,
    modelName: v.modelName || modelId,
    threads: v.threads,
  }))
})

ipcMain.handle('chat:list-threads', (_e, modelId: string) => {
  const allThreads = store.models[modelId]?.threads || []

  // Filter out empty threads for the UI
  return allThreads.filter((thread) => thread.messages && thread.messages.length > 0)
})

ipcMain.handle('chat:create-thread', (_e, payload: { modelId: string; modelName?: string; title?: string }) => {
  const thread = createThread(payload.modelId, payload.modelName, payload.title)
  upsertThread(store, thread)
  writeStore(store)
  return thread
})

ipcMain.handle(
  'chat:append-message',
  (
    _e,
    payload: { threadId: string; modelId: string; message: { role: Role; content: string; createdAt?: string } }
  ) => {
    const list = store.models[payload.modelId]?.threads || []
    const t = list.find((x) => x.id === payload.threadId)
    if (!t) return { ok: false }

    const msg: Message = {
      id: crypto.randomUUID(),
      role: payload.message.role,
      content: payload.message.content,
      createdAt: payload.message.createdAt || new Date().toISOString(),
    }

    t.messages.push(msg)
    touchThread(t)
    upsertThread(store, t)
    writeStore(store)

    // return updated thread
    return { ok: true, message: msg, thread: t }
  }
)

ipcMain.handle('chat:get-thread', (_e, threadId: string, modelId: string) => {
  try {
    if (!store.models[modelId]) {
      console.warn('Model not found:', modelId)
      return null
    }

    const thread = store.models[modelId].threads.find((x) => x.id === threadId)

    if (!thread) {
      console.warn('Thread not found:', threadId)
      return null
    }

    // Ensure messages array exists and return complete thread data
    const result = {
      ...thread,
      messages: thread.messages || [],
      lastMessage: thread.messages?.[thread.messages.length - 1]?.content || '',
      lastTimestamp: thread.messages?.[thread.messages.length - 1]?.createdAt || thread.createdAt,
    }

    return result
  } catch (error) {
    console.error('Failed to get thread:', error)
    return null
  }
})

ipcMain.handle('chat:delete-thread', (_e, threadId: string, modelId: string) => {
  if (!store.models[modelId]) return { ok: false, threads: [] }

  store.models[modelId].threads = store.models[modelId].threads.filter((t) => t.id !== threadId)
  writeStore(store)

  // return updated threads for frontend sync
  return { ok: true, threads: store.models[modelId].threads }
})

ipcMain.handle('chat:rename-thread', (_e, threadId: string, modelId: string, newTitle: string) => {
  const list = store.models[modelId]?.threads || []
  const t = list.find((x) => x.id === threadId)
  if (!t) return { ok: false }
  t.title = newTitle
  touchThread(t)
  upsertThread(store, t)
  writeStore(store)
  return { ok: true }
})

ipcMain.handle('chat:clear-messages', (_e, threadId: string, modelId: string) => {
  const t = store.models[modelId]?.threads.find((x) => x.id === threadId)
  if (!t) return { ok: false }
  t.messages = []
  touchThread(t)
  upsertThread(store, t)
  writeStore(store)
  return { ok: true }
})

// -----------------------
// RAG STORE IMPLEMENTATION
// -----------------------

// Initialize RAG store
let ragStore: any
app.whenReady().then(() => {
  ragStore = initRagStore()
})

// -----------------------
// RAG STORE IPC HANDLERS
// -----------------------

ipcMain.handle('rag:list-threads', (_e, collectionName: string) => {
  const threads = ragStore.collections[collectionName]?.threads || []
  return threads.filter((t: RagThread) => t.messages.length > 0)
})

ipcMain.handle('rag:create-thread', (_e, payload: { collectionName: string; title?: string }) => {
  const thread = ragCreateThread(payload.collectionName, payload.title)
  ragUpsertThread(ragStore, payload.collectionName, thread)
  writeRagStore(ragStore)
  return thread
})

ipcMain.handle(
  'chat:append-message-rag',
  (
    _e,
    payload: { threadId: string; collectionName: string; message: { role: Role; content: string; createdAt?: string } }
  ) => {
    const { threadId, collectionName, message } = payload

    const msg: RagMessage = {
      id: crypto.randomUUID(),
      role: message.role,
      content: message.content,
      createdAt: message.createdAt || new Date().toISOString(),
    }

    const result = ragAppendMessage(ragStore, collectionName, threadId, msg)

    if (!result) return { ok: false }

    const thread = ragStore.collections[collectionName].threads.find((t: RagThread) => t.id === threadId)
    return { ok: true, message: msg, thread }
  }
)

ipcMain.handle('rag:get-thread', (_e, threadId: string, collectionName: string) => {
  const thread = ragStore.collections[collectionName]?.threads.find((t: RagThread) => t.id === threadId)
  if (!thread) return null

  return {
    ...thread,
    messages: thread.messages || [],
    lastMessage: thread.messages[thread.messages.length - 1]?.content || '',
    lastTimestamp: thread.messages[thread.messages.length - 1]?.createdAt || thread.createdAt,
  }
})

ipcMain.handle('rag:delete-thread', (_e, threadId: string, collectionName: string) => {
  return ragDeleteThread(ragStore, collectionName, threadId)
})

ipcMain.handle('rag:rename-thread', (_e, threadId: string, collectionName: string, newTitle: string) => {
  const thread = ragStore.collections[collectionName]?.threads.find((t: RagThread) => t.id === threadId)
  if (!thread) return { ok: false }
  thread.title = newTitle
  ragTouchThread(thread)
  ragUpsertThread(ragStore, collectionName, thread)
  writeRagStore(ragStore)
  return { ok: true }
})

ipcMain.handle('rag:clear-messages', (_e, threadId: string, collectionName: string) => {
  const thread = ragStore.collections[collectionName]?.threads.find((t: RagThread) => t.id === threadId)
  if (!thread) return { ok: false }
  thread.messages = []
  ragTouchThread(thread)
  ragUpsertThread(ragStore, collectionName, thread)
  writeRagStore(ragStore)
  return { ok: true }
})

// -----------------------
// RAG Chat
// -----------------------
import { streamChatWithRAG, chatWithRAG, ChatOptions, ChatResponse } from '@/app/services/rag/chatService'

// Store active streams for cancellation
const activeStreams = new Map<string, { cancel: () => void }>()

// ------------------ Chat Handlers ------------------

/**
 * Non-streaming RAG chat
 */
ipcMain.handle('rag:chat:stream', async (event, query: string, options: ChatOptions = {}): Promise<ChatResponse> => {
  try {
    const response = await chatWithRAG(query, options)
    return response
  } catch (error) {
    console.error('[IPC Main] Error in RAG chat:', error)
    throw new Error(`RAG chat failed: ${(error as Error).message}`)
  }
})

/**
 * Streaming RAG chat
 */
/**
 * Streaming RAG chat with proper error handling
 */
ipcMain.handle(
  'rag:chat:start-stream',
  async (event, query: string, options: ChatOptions = {}): Promise<{ streamId: string; success: boolean }> => {
    const streamId = Date.now().toString()

    const abortController = new AbortController()
    activeStreams.set(streamId, {
      cancel: () => {
        abortController.abort()
        console.log(`Stream ${streamId} cancelled`)
      },
    })

    try {
      let fullContent = ''
      let finalResult: ChatResponse | null = null

      // Create async task without awaiting it
      ;(async () => {
        try {
          for await (const chunk of streamChatWithRAG(query, {
            ...options,
            // Don't use onChunk callback here, send directly via IPC
          })) {
            if (abortController.signal.aborted) break

            // Check if this chunk is the final ChatResponse object
            if (typeof chunk === 'string') {
              fullContent += chunk
              // Send string chunks immediately
              event.sender.send('rag:chat:chunk', { streamId, chunk })
            } else {
              // This is the final ChatResponse object
              finalResult = chunk
              // Send completion event with final result
              event.sender.send('rag:chat:complete', { streamId, result: finalResult })
              break
            }
          }

          // Cleanup
          activeStreams.delete(streamId)
        } catch (error) {
          activeStreams.delete(streamId)
          console.error('[IPC Main] Error in RAG chat stream:', error)
          event.sender.send('rag:chat:error', { streamId, error: (error as Error).message })
        }
      })()

      return { streamId, success: true }
    } catch (error) {
      activeStreams.delete(streamId)
      console.error('[IPC Main] Error starting stream:', error)
      throw error
    }
  }
)

/**
 * Cancel stream
 */
ipcMain.handle('rag:chat:cancel-stream', (event, streamId: string): { success: boolean; message: string } => {
  console.log(`[IPC Main] Cancelling stream: ${streamId}`)

  const stream = activeStreams.get(streamId)
  if (stream) {
    stream.cancel()
    activeStreams.delete(streamId)
    return { success: true, message: `Stream ${streamId} cancelled` }
  } else {
    return { success: false, message: `Stream ${streamId} not found` }
  }
})

// Cleanup on app quit
export const cleanupRAGHandlers = () => {
  activeStreams.forEach((stream, streamId) => {
    stream.cancel()
    console.log(`Cleaned up RAG stream: ${streamId}`)
  })
  activeStreams.clear()
}
// -----------------------
// Network RAG Query (SuperBrain Knowledge Pool)
// -----------------------

/**
 * Helper to run a Python script and return parsed JSON output.
 * Uses the same pattern as miningService.execute() — exec with promise wrapper.
 */
function execPython(args: string[], options: { cwd?: string; timeout?: number } = {}): Promise<string> {
  const cwd = options.cwd || join(__dirname, '../../')
  const timeout = options.timeout || 30000
  const cmd = `python3 ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`

  return new Promise((resolve, reject) => {
    exec(cmd, { cwd, timeout, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error('[NetworkRAG] Python error:', stderr || error.message)
        reject(new Error(stderr || error.message))
      } else {
        resolve(stdout)
      }
    })
  })
}

export interface NetworkQueryResult {
  text: string
  citations: number[]
  sources: NetworkSource[]
  method: string
  query: string
  generation_time: number
}

export interface NetworkSource {
  content: string
  content_hash: string
  score: number
  relevance: number
  freshness: number
  source: string
  timestamp: number
  node_id: string
}

export interface NetworkSearchResult {
  results: NetworkSource[]
}

export interface NetworkPoolStats {
  total_chunks: number
  unique_nodes: number
  oldest_chunk: number | null
  newest_chunk: number | null
  embedding_backend: string
  ollama_available: boolean
}

/**
 * Network RAG query — query the SN442 knowledge pool via Frankfurt API.
 */
ipcMain.handle(
  'superbrain:network:query',
  async (
    _event,
    query: string,
    options: { dbPath?: string; topK?: number; searchOnly?: boolean } = {}
  ): Promise<NetworkQueryResult | NetworkSearchResult> => {
    const SN442 = process.env.SB_API_URL || 'http://46.225.114.202:8400'
    try {
      if (options.searchOnly) {
        // Real network search: POST to Frankfurt /query which runs extractive
        // keyword scoring (title+content) across the ENTIRE public_chunks
        // table — not just a recent /feed window. The endpoint returns top-3
        // sources with full metadata (title, source URL, preview, timestamp,
        // category, content_hash, hotkey, node_id) which we map 1:1 to
        // NetworkSource so the renderer can show honest cards.
        const resp = await fetch(`${SN442}/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: query, mode: 'auto' }),
          signal: AbortSignal.timeout(20000),
        })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const data = await resp.json()
        const sources: any[] = data.sources || []
        const results = sources.map((s: any) => ({
          content: s.preview || '',
          content_hash: s.content_hash || '',
          source: s.title || s.source || 'Untitled',
          timestamp: typeof s.timestamp === 'number' ? s.timestamp : 0,
          node_id: s.node_id || 'frankfurt',
          category: s.category || 'general',
        }))
        return { results }
      }
      const resp = await fetch(`${SN442}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query, mode: 'auto' }),
        signal: AbortSignal.timeout(15000),
      })
      const data = await resp.json()
      // Answer mode uses /query's rich `sources` array (title, preview, category,
      // timestamp, content_hash, hotkey, node_id). Fall back to `citations` —
      // plain title strings — only when `sources` is absent.
      const sources: any[] = Array.isArray(data.sources) && data.sources.length
        ? data.sources.map((s: any) => ({
            content: s.preview || '',
            content_hash: s.content_hash || '',
            source: s.title || s.source || 'Untitled',
            timestamp: typeof s.timestamp === 'number' ? s.timestamp : 0,
            node_id: s.node_id || 'frankfurt',
            category: s.category || 'general',
          }))
        : (data.citations || []).map((c: any) => ({
            content: typeof c === 'string' ? c : JSON.stringify(c),
            content_hash: '',
            source: typeof c === 'string' ? c : 'SN442',
            timestamp: 0,
            node_id: 'frankfurt',
          }))
      return {
        text: data.answer || '',
        citations: data.citations ? data.citations.map((_c: any, i: number) => i) : [],
        sources,
        method: data.method || 'network',
        query,
        generation_time: data.latency_ms || 0,
      }
    } catch (error) {
      console.error('[NetworkRAG] Query failed:', (error as Error).message)
      return { text: 'Network unreachable', citations: [], sources: [], method: 'error', query, generation_time: 0 }
    }
  }
)

/**
 * Network RAG pool stats — get knowledge pool statistics from Frankfurt.
 */
ipcMain.handle(
  'superbrain:network:stats',
  async (_event, _options: { dbPath?: string } = {}): Promise<NetworkPoolStats> => {
    const SN442 = process.env.SB_API_URL || 'http://46.225.114.202:8400'
    try {
      // /feed/stats is authoritative for total_chunks — /knowledge/list is truncated and
      // /peers returns stale per-peer counters. See reference_frankfurt_endpoints.md.
      const [healthResp, feedStatsResp, feedResp, peersResp] = await Promise.all([
        fetch(`${SN442}/health`, { signal: AbortSignal.timeout(5000) }).then(r => r.json()).catch(() => ({})),
        fetch(`${SN442}/feed/stats`, { signal: AbortSignal.timeout(5000) }).then(r => r.json()).catch(() => null),
        fetch(`${SN442}/feed?limit=1`, { signal: AbortSignal.timeout(5000) }).then(r => r.json()).catch(() => null),
        fetch(`${SN442}/peers`, { signal: AbortSignal.timeout(5000) }).then(r => r.json()).catch(() => ({ peers: [] })),
      ])
      const peers = peersResp.peers || []
      const authoritativeTotal =
        typeof feedStatsResp?.total_chunks === 'number' ? feedStatsResp.total_chunks :
        typeof feedResp?.total === 'number' ? feedResp.total :
        null
      const newest = feedResp?.last_updated ?? (feedResp?.chunks?.[0]?.timestamp ?? null)
      return {
        total_chunks: authoritativeTotal ?? 0,
        unique_nodes: peers.length + 1,
        oldest_chunk: null,
        newest_chunk: typeof newest === 'number' ? newest : null,
        embedding_backend: 'frankfurt-api',
        ollama_available: healthResp.status === 'ok',
      }
    } catch (error) {
      console.error('[NetworkRAG] Stats failed:', (error as Error).message)
      return { total_chunks: 0, unique_nodes: 0, oldest_chunk: null, newest_chunk: null, embedding_backend: 'offline', ollama_available: false }
    }
  }
)

ipcMain.handle(
  'superbrain:network:i2p-status',
  async (): Promise<{
    installed: boolean
    sam_listening: boolean
    sam_handshake_ok: boolean
    http_proxy_listening: boolean
    netdb_routers: number
    sam_clients_connected: number
    routing_ok: boolean
    reachable: boolean
    error?: string
  }> => {
    const SN442 = process.env.SB_API_URL || 'http://46.225.114.202:8400'
    try {
      const r = await fetch(`${SN442}/i2p/status`, { signal: AbortSignal.timeout(6000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const d = await r.json()
      return {
        installed: !!d.installed,
        sam_listening: !!d.sam_listening,
        sam_handshake_ok: !!d.sam_handshake_ok,
        http_proxy_listening: !!d.http_proxy_listening,
        netdb_routers: typeof d.netdb_routers === 'number' ? d.netdb_routers : 0,
        sam_clients_connected: typeof d.sam_clients_connected === 'number' ? d.sam_clients_connected : 0,
        routing_ok: !!d.routing_ok,
        reachable: true,
      }
    } catch (error) {
      console.error('[NetworkRAG] i2p-status failed:', (error as Error).message)
      return {
        installed: false, sam_listening: false, sam_handshake_ok: false,
        http_proxy_listening: false, netdb_routers: 0, sam_clients_connected: 0,
        routing_ok: false, reachable: false, error: (error as Error).message,
      }
    }
  }
)

ipcMain.handle(
  'superbrain:network:feed',
  async (_event, opts: { limit?: number; category?: string; hours?: number } = {}) => {
    const SN442 = process.env.SB_API_URL || 'http://46.225.114.202:8400'
    const params = new URLSearchParams()
    if (opts.limit) params.set('limit', String(opts.limit))
    if (opts.category && opts.category !== 'all') params.set('category', opts.category)
    if (opts.hours) params.set('hours', String(opts.hours))
    const qs = params.toString() ? `?${params.toString()}` : ''
    try {
      const r = await fetch(`${SN442}/feed${qs}`, { signal: AbortSignal.timeout(10000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return await r.json()
    } catch (error) {
      console.error('[NetworkRAG] Feed failed:', (error as Error).message)
      return { chunks: [], total: 0, chunks_today: 0, last_updated: null, error: (error as Error).message }
    }
  }
)

/**
 * Share to Network — POST a single chunk to the SN442 Frankfurt seed.
 *
 * Replaces the previous spawn-python implementation that called
 * ~/superbrain-subnet/scripts/share_to_network.py and wrote into a local
 * miner_sync_queue.db. Neither path exists on Kali — the local miner queue
 * was retired when Frankfurt became seed/bootstrap-only. The handler now
 * speaks directly to /knowledge/share over HTTP.
 *
 * Return shape is preserved (ShareToNetworkResult) so existing renderer
 * call sites in IngestModal, useNetworkRAG, and useConversationLearning
 * continue to compile and read result.success / result.new_chunks.
 */
export interface ShareToNetworkResult {
  success: boolean
  total_chunks: number
  new_chunks: number
  duplicates: number
  db_path: string
  error?: string
}

ipcMain.handle(
  'rag:share-to-network',
  async (
    _event,
    payload: { mode: 'text' | 'file'; content?: string; filePath?: string; title?: string }
  ): Promise<ShareToNetworkResult> => {
    const seed = process.env.SB_API_URL || 'http://46.225.114.202:8400'
    const dbPath = `${seed}/knowledge/share`

    try {
      // Resolve content from either text or file mode.
      let content = ''
      if (payload.mode === 'text') {
        content = (payload.content || '').trim()
      } else if (payload.mode === 'file') {
        if (!payload.filePath) {
          return {
            success: false,
            total_chunks: 0,
            new_chunks: 0,
            duplicates: 0,
            db_path: dbPath,
            error: 'file mode requires filePath',
          }
        }
        // Cap the read at 64 KB so we don't try to ship a 50 MB PDF as one chunk.
        // Binary files will produce noisy text — caller should prefer
        // rag:share-chunks-to-network (Qdrant scroll path) for ingested docs.
        const fs = await import('fs/promises')
        const buf = await fs.readFile(payload.filePath)
        content = buf.toString('utf8').slice(0, 64_000).trim()
      }

      if (!content || content.length < 20) {
        return {
          success: false,
          total_chunks: 0,
          new_chunks: 0,
          duplicates: 0,
          db_path: dbPath,
          error: 'content too short (need >= 20 chars)',
        }
      }

      const ctrl = new AbortController()
      const timeout = setTimeout(() => ctrl.abort(), 10_000)
      let resp: Response
      try {
        const shareBody = {
          content: content.slice(0, 5_000),
          title: payload.title || 'Untitled',
          source: 'superbrain-desktop',
          contributor_hotkey: '',
        }
        // Attribution-proof: sign the canonical subset the server verifies.
        // On failure we fall back to unsigned (server accepts as legacy-unsigned).
        let envelope: Record<string, unknown> = shareBody
        try {
          const sig = signShare(shareBody)
          envelope = { ...shareBody, public_key: sig.public_key, signature: sig.signature }
        } catch (sigErr) {
          console.warn('[ShareToNetwork] signing failed, sending unsigned:', sigErr)
        }
        resp = await fetch(dbPath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(envelope),
          signal: ctrl.signal,
        })
      } finally {
        clearTimeout(timeout)
      }

      if (!resp.ok) {
        return {
          success: false,
          total_chunks: 0,
          new_chunks: 0,
          duplicates: 0,
          db_path: dbPath,
          error: `Frankfurt ${resp.status} ${resp.statusText}`,
        }
      }

      const data = (await resp.json()) as { success?: boolean; chunk_id?: string; message?: string }
      const ok = data?.success === true
      return {
        success: ok,
        total_chunks: 1,
        new_chunks: ok ? 1 : 0,
        duplicates: 0,
        db_path: dbPath,
        error: ok ? undefined : data?.message || 'share rejected by seed',
      }
    } catch (error) {
      console.error('[ShareToNetwork] Failed:', error)
      return {
        success: false,
        total_chunks: 0,
        new_chunks: 0,
        duplicates: 0,
        db_path: dbPath,
        error: (error as Error).message,
      }
    }
  }
)

// -----------------------
// Create Main Window
// -----------------------
export function createAppWindow() {
  registerResourcesProtocol()

  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    backgroundColor: '#1c1c1c',
    icon: appIcon,
    frame: false,
    titleBarStyle: 'hiddenInset',
    title: 'SuperBrain AI',
    webPreferences: {
      webSecurity: false,
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
    },
  })

  registerWindowIPC(mainWindow)

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// -----------------------
// Bittensor related inter process coms in here
// -----------------------
ipcMain.handle('get-bittensor-stats', getBittensorStats);
ipcMain.handle('register-bittensor-wallet', registerBittensorWallet);
ipcMain.handle("save-wallet-config", saveWalletConfig);
ipcMain.handle("load-wallet-config", loadWalletConfig);
ipcMain.handle("save-os-config", saveOsConfig);
ipcMain.handle("load-os-config", getOsConfig);
ipcMain.handle("download-miner-script", downloadMinerScript);
ipcMain.handle("get-miner-logs", async (event, walletName, hotkey, subnetId, lines = 100) => {
  return await miningService.getMinerLogs(walletName, hotkey, subnetId, lines);
});
ipcMain.handle("get-all-miner-logs", async (event, lines = 100) => {
  return await miningService.getAllMinerLogs(lines);
});
ipcMain.handle("get-all-miners", async () => {
  return miningService.getAllMiners();
});
ipcMain.handle("get-wallet-stats", async (_, name) => {
  return miningService.getWalletStats(name);
});
ipcMain.handle("get-overall-stats", async (_) => {
  return miningService.getOverallStats();
});
ipcMain.handle("get-subnets", async (_) => {
  return miningService.getSubnets();
});
ipcMain.handle("exec-btcli-cmd", async (_, cmd, includePath) => {
  return miningService.execute(cmd, includePath);
});
// end of bittensor stuff

// -----------------------
// Fetch Remote Browse Models
// -----------------------
ipcMain.handle('fetch-browse-models', async () => {
  try {
    const res = await fetch('https://ollamadb.dev/api/v1/models')
    if (!res.ok) throw new Error(`HTTP error: ${res.status}`)
    const data = await res.json()
    return data.models || []
  } catch (err) {
    console.error('Error fetching browse models:', err)
    throw err
  }
})

// -----------------------
// Register Custom Protocol
// -----------------------
function registerResourcesProtocol() {
  protocol.handle('res', async (request) => {
    try {
      const url = new URL(request.url)
      const fullPath = join(url.hostname, url.pathname.slice(1))
      const filePath = join(__dirname, '../../resources', fullPath)
      return net.fetch(pathToFileURL(filePath).toString())
    } catch (error) {
      console.error('Protocol error:', error)
      return new Response('Resource not found', { status: 404 })
    }
  })
}

// -----------------------
// RAG
// -----------------------

/**
 * Handles the 'rag:ingest:raw' channel for URL or pasted text ingestion.
 * This listener is called from window.RAGApi.ingestRawData() in the Renderer process.
 */
/**
 * Background ingestion with progress events.
 * Returns { jobId } immediately; sends progress events to renderer as processing continues.
 * Pattern inspired by N.O.M.A.D. BullMQ job queue (Apache 2.0, Crosstalk Solutions LLC).
 */
const activeIngestionJobs = new Map<string, { status: string; progress: number; error?: string }>()

function processInBackground(
  jobId: string,
  sender: Electron.WebContents,
  fn: () => Promise<any>
) {
  activeIngestionJobs.set(jobId, { status: 'processing', progress: 10 })
  sender.send('rag:ingest:progress', { jobId, progress: 10, status: 'processing' })

  fn()
    .then((result) => {
      activeIngestionJobs.set(jobId, { status: 'completed', progress: 100 })
      sender.send('rag:ingest:progress', { jobId, progress: 100, status: 'completed', result })
    })
    .catch((error) => {
      activeIngestionJobs.set(jobId, { status: 'failed', progress: 0, error: (error as Error).message })
      sender.send('rag:ingest:progress', { jobId, progress: 0, status: 'failed', error: (error as Error).message })
    })
}

ipcMain.handle('rag:ingest:file', async (event, filePath: string, tags: string[] = [], config: any = {}) => {
  const jobId = crypto.randomUUID()
  const ingestConfig = { ...config, tags: tags.length > 0 ? tags : config.tags }

  processInBackground(jobId, event.sender, () => ingestFilePath(filePath, ingestConfig))
  return { jobId }
})

ipcMain.handle('rag:ingest:url', async (event, content: string, url: string, config: any = {}) => {
  const jobId = crypto.randomUUID()
  processInBackground(jobId, event.sender, () => ingestURLContent(url, config))
  return { jobId }
})

ipcMain.handle(
  'rag:ingest:text',
  async (event, content: string, title: string = 'Pasted_Text_Snippet', config: any = {}) => {
    const jobId = crypto.randomUUID()
    processInBackground(jobId, event.sender, () => ingestTextContent(content, title, config))
    return { jobId }
  }
)

ipcMain.handle('rag:ingest:job-status', (_event, jobId: string) => {
  return activeIngestionJobs.get(jobId) || { status: 'unknown', progress: 0 }
})

ipcMain.handle('rag:qdrant:status', async () => {
  try {
    const res = await fetch('http://localhost:6333/healthz')
    return { running: res.ok }
  } catch (e) {
    return { running: false }
  }
})

ipcMain.handle('rag:qdrant:listCollections', async () => {
  try {
    const res = await fetch('http://localhost:6333/collections')
    const json = await res.json()

    return json?.result?.collections?.map((c: any) => c.name) || []
  } catch (err) {
    console.error('[QDRANT] list error:', err)
    return []
  }
})

// -----------------------
// EARNINGS
// -----------------------

ipcMain.handle('earnings:get', async (_event, hotkey: string) => {
  try {
    const resp = await fetch(`http://46.225.114.202:8400/earnings/${encodeURIComponent(hotkey)}`, { signal: AbortSignal.timeout(10000) })
    return await resp.json()
  } catch {
    return { error: 'Frankfurt unreachable', chunks: [], total_chunks: 0, total_retrievals: 0 }
  }
})

// Real on-chain coldkey balance via btcli (finney/mainnet by default).
// Returns { ok, walletName, coldkey, free, staked, total, fetchedAt } or { ok:false, error }.
ipcMain.handle('earnings:wallet-balance', async (_event, walletName = 'default', network = 'finney') => {
  const btp = getBtcliPathSafe()
  if (!btp.success || !btp.btcliPath) return { ok: false, error: btp.error || 'btcli not found' }
  return await new Promise((resolve) => {
    execFile(
      btp.btcliPath as string,
      ['wallet', 'balance', '--wallet.name', walletName, '--subtensor.network', network, '--json-out'],
      { timeout: 20000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve({ ok: false, error: err.message })
        try {
          const start = stdout.indexOf('{')
          const end = stdout.lastIndexOf('}')
          if (start < 0 || end <= start) return resolve({ ok: false, error: 'no JSON in btcli output' })
          const parsed = JSON.parse(stdout.slice(start, end + 1))
          const entry = parsed.balances?.[walletName]
          if (!entry) return resolve({ ok: false, error: `wallet '${walletName}' not in btcli output` })
          resolve({
            ok: true,
            walletName,
            network,
            coldkey: entry.coldkey,
            free: entry.free,
            staked: entry.staked,
            total: entry.total,
            fetchedAt: Date.now(),
          })
        } catch (e) {
          resolve({ ok: false, error: (e as Error).message })
        }
      },
    )
  })
})

// Frankfurt validator/miner live position from the SN442 demo API.
// Returns the requested UID row (default UID 1 = our validator) plus whichever
// UID currently has incentive > 0 (our miner) so the UI can show both.
ipcMain.handle('earnings:validator-position', async (_event, uid = 1) => {
  try {
    const resp = await fetch('http://46.225.114.202:8400/metagraph', { signal: AbortSignal.timeout(10000) })
    const data = await resp.json()
    const nodes: any[] = data.nodes || []
    const validator = nodes.find((n) => n.uid === uid) || null
    const miner = nodes.find((n) => typeof n.incentive === 'number' && n.incentive > 0) || null
    return { ok: true, validator, miner, fetchedAt: Date.now() }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
})

ipcMain.handle('earnings:share-with-hotkey', async (_event, content: string, title: string, hotkey: string) => {
  // Step 1: Frankfurt POST (unchanged behavior)
  let frankfurtResult: any
  try {
    const resp = await fetch('http://46.225.114.202:8400/knowledge/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, title, source: 'superbrain-desktop', contributor_hotkey: hotkey })
    })
    frankfurtResult = await resp.json()
  } catch {
    return { error: 'Share failed' }
  }

  // Step 2: ALSO broadcast to Hyperswarm mesh peers (best-effort, non-blocking
  // for the Frankfurt result). Runs the 4 flag rules; if accepted, hits every
  // connected SuperBrain peer directly. Mesh failures are silent — Frankfurt
  // remains authoritative.
  let mesh_success = false
  let mesh_peers_reached = 0
  let mesh_flag: { reason: string; explanation: string } | undefined

  if (frankfurtResult && (frankfurtResult.success || frankfurtResult.chunk_id)) {
    try {
      const meshResult = await mesh.shareChunk(content, 'general', hotkey)
      mesh_success = meshResult.success
      mesh_peers_reached = meshResult.peersReached
      if (meshResult.flag) {
        mesh_flag = { reason: meshResult.flag.reason, explanation: meshResult.flag.explanation }
        console.log(`[SHARE] Mesh flagged: ${meshResult.flag.reason} — ${meshResult.flag.explanation}`)
      } else if (meshResult.success) {
        console.log(`[SHARE] Mesh broadcast OK — ${meshResult.peersReached} direct peers reached`)
      }
    } catch (err) {
      console.warn('[SHARE] Mesh broadcast failed silently:', (err as Error).message)
    }
  }

  return {
    ...frankfurtResult,
    mesh_success,
    mesh_peers_reached,
    mesh_flag,
  }
})

// -----------------------
// ZIM (Offline Knowledge Packs)
// -----------------------

ipcMain.handle('zim:search', async (_event, query: string, limit = 5) => {
  return zimService.search(query, limit)
})

ipcMain.handle('zim:list', () => {
  return zimService.listZims()
})

ipcMain.handle('zim:health', async () => {
  return zimService.healthCheck()
})

ipcMain.handle('zim:status', async () => {
  return zimService.getStatus()
})

ipcMain.handle('zim:disk-usage', () => {
  return zimService.getDiskUsage()
})

ipcMain.handle('zim:packs', () => {
  return getInstalledPacks()
})

ipcMain.handle('zim:packs:catalog', () => {
  return KNOWLEDGE_PACKS
})

ipcMain.handle('zim:download', async (event, packId: string) => {
  try {
    await downloadZim(packId, event.sender)
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('zim:download:cancel', (_event, packId: string) => {
  return { cancelled: cancelDownload(packId) }
})

ipcMain.handle('zim:remove', async (_event, filename: string) => {
  const removed = await zimService.removeZim(filename)
  return { success: removed }
})

// -----------------------
// P2P SYNC IPC HANDLERS
// -----------------------

ipcMain.handle('p2p:status', () => ({
  nodeId: p2pSync.getNodeId(),
  myUrl: p2pSync.getMyUrl(),
  peerCount: p2pSync.getPeerCount(),
  onlinePeers: p2pSync.getOnlinePeerCount(),
  localChunks: p2pSync.getLocalChunks().length,
  receivedChunks: p2pSync.getReceivedChunks().length,
}))

ipcMain.handle('p2p:peers', () => p2pSync.getPeers())

ipcMain.handle('p2p:share', async (_event: any, content: string, title: string) => {
  const id = await p2pSync.shareChunk(content, title)
  return { success: true, chunk_id: id }
})

ipcMain.handle('p2p:sync-now', async () => {
  await p2pSync.refreshPeers()
  await p2pSync.syncFromAllPeers()
  return {
    peers: p2pSync.getPeerCount(),
    received: p2pSync.getReceivedChunks().length
  }
})

ipcMain.handle('p2p:search', (_event: any, query: string) => {
  return p2pSync.searchChunks(query, 5)
})

// -----------------------
// BENCHMARK (Hardware Score + TAO Estimator)
// -----------------------

ipcMain.handle('benchmark:run', async (event) => {
  const result = await runBenchmark((progress) => {
    event.sender.send('benchmark:progress', progress)
  })
  return result
})

ipcMain.handle('benchmark:submit', async (_event, result) => {
  return submitScore(result)
})

ipcMain.handle('benchmark:leaderboard', async () => {
  try {
    const data = await fetchLeaderboard(100)
    return JSON.parse(JSON.stringify(data))
  } catch {
    return { entries: [], totalMiners: 0, avgScore: 0, tierDistribution: {}, fetchedAt: '' }
  }
})

ipcMain.handle('benchmark:rank', async (_event, userScore: number) => {
  try {
    const lb = await fetchLeaderboard(100)
    return JSON.parse(JSON.stringify(calculateUserRank(userScore, lb)))
  } catch {
    return { rank: 0, totalMiners: 0, percentile: 0, betterThan: 0 }
  }
})

ipcMain.handle('benchmark:cached', () => {
  const cached = getCachedBenchmark()
  if (!cached) return null
  // Validate the cached result has the full structure (CLI writes a simplified version)
  if (!cached.cpu || !cached.ram || !cached.storage || !cached.ollama) return null
  return JSON.parse(JSON.stringify(cached))
})

ipcMain.handle('benchmark:tiers', () => {
  return getTierInfo()
})

// -----------------------
// SHARE QDRANT CHUNKS TO SN442 NETWORK
// -----------------------

const SN442_SEED = process.env.SB_API_URL || 'http://46.225.114.202:8400'

/**
 * Share already-ingested Qdrant documents to the SN442 network.
 * Fetches chunks by doc_id from Qdrant, POSTs each to Frankfurt /knowledge/add.
 * Rate-limited: 1 request per 800ms. Failures are logged but don't stop the pipeline.
 */
ipcMain.handle(
  'rag:share-chunks-to-network',
  async (
    event,
    payload: { docId: string; collectionName?: string }
  ): Promise<{ submitted: number; failed: number; total: number }> => {
    const collection = payload.collectionName || 'sb_docs_v1_ollama'
    const qdrantUrl = 'http://localhost:6333'

    let submitted = 0
    let failed = 0

    try {
      // Scroll through Qdrant to find chunks with matching doc_id
      const scrollResp = await fetch(`${qdrantUrl}/collections/${collection}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filter: {
            must: [{ key: 'doc_id', match: { value: payload.docId } }],
          },
          limit: 200,
          with_payload: true,
          with_vector: false,
        }),
      })

      if (!scrollResp.ok) {
        throw new Error(`Qdrant scroll failed: ${scrollResp.status}`)
      }

      const data = await scrollResp.json() as any
      const points = data?.result?.points || []

      if (points.length === 0) {
        return { submitted: 0, failed: 0, total: 0 }
      }

      console.log(`[ShareToNetwork] Found ${points.length} chunks for doc_id=${payload.docId}`)

      for (let i = 0; i < points.length; i++) {
        const point = points[i]
        const text = point.payload?.text || point.payload?.pageContent || ''
        const title = point.payload?.fileName || point.payload?.source || 'Shared Document'

        if (!text || text.length < 20) {
          failed++
          continue
        }

        try {
          await fetch(`${SN442_SEED}/knowledge/share`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: text.substring(0, 5000),
              title: typeof title === 'string' ? title : 'Shared Document',
              source: 'superbrain-desktop-rag',
            }),
            signal: AbortSignal.timeout(5000),
          })
          submitted++
        } catch {
          failed++
        }

        // Progress event
        event.sender.send('rag:share-progress', {
          docId: payload.docId,
          submitted,
          failed,
          total: points.length,
          progress: Math.round(((i + 1) / points.length) * 100),
        })

        // Rate limit: 800ms between requests
        if (i < points.length - 1) {
          await new Promise((r) => setTimeout(r, 800))
        }
      }

      console.log(`[ShareToNetwork] Done: ${submitted} submitted, ${failed} failed out of ${points.length}`)
      return { submitted, failed, total: points.length }
    } catch (error) {
      console.error('[ShareToNetwork] Error:', (error as Error).message)
      return { submitted, failed, total: 0 }
    }
  }
)

// ─────────────────────────────────────────────────────────────────────────────
// MemPalace — Layer 0 cross-session memory (subprocess to ~/.mempalace-venv)
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('mempalace:status', async () => {
  return mempalace.status()
})

ipcMain.handle('mempalace:wakeup', async (_event, wing: string = 'superbrain') => {
  return mempalace.wakeUp(wing)
})

ipcMain.handle('mempalace:search', async (_event, query: string, limit: number = 5) => {
  return mempalace.search(query, limit)
})

ipcMain.handle(
  'mempalace:add-drawer',
  async (_event, content: string, wing: string, room: string) => {
    return mempalace.addDrawer(content, wing, room)
  }
)

// User-editable identity (~/.mempalace/identity.txt — the L0 wake-up text).
// Read on Memory Palace page mount, written on Save click. Wakeup cache in
// the service is cleared on write so the next chat picks up the new identity.
ipcMain.handle('mempalace:get-identity', async () => {
  try {
    const fs = await import('fs')
    const path = await import('path')
    const file = path.join(os.homedir(), '.mempalace', 'identity.txt')
    if (!fs.existsSync(file)) return ''
    return fs.readFileSync(file, 'utf8')
  } catch (err) {
    console.warn('[mempalace:get-identity] failed:', (err as Error).message)
    return ''
  }
})

ipcMain.handle('mempalace:set-identity', async (_event, content: string) => {
  try {
    const fs = await import('fs')
    const path = await import('path')
    const dir = path.join(os.homedir(), '.mempalace')
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, 'identity.txt')
    fs.writeFileSync(file, content, 'utf8')
    // Invalidate the cached wake-up text so the next chat sees the new identity.
    mempalace.clearWakeupCache()
    return true
  } catch (err) {
    console.warn('[mempalace:set-identity] failed:', (err as Error).message)
    return false
  }
})
