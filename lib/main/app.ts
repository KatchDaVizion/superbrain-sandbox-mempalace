import { BrowserWindow, shell, app, protocol, net, ipcMain } from 'electron'
import { join } from 'path'
import { registerWindowIPC } from '@/lib/window/ipcEvents'
import appIcon from '@/resources/build/supericon.png'
import { pathToFileURL } from 'url'
import os from 'os'
import { execSync, exec } from 'child_process'
import crypto from 'crypto'
import { ZimService } from '../zim/zimService'
import { p2pSync } from '../p2p/p2pSyncService'
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

// -----------------------
// INIT P2P SYNC SERVICE
// -----------------------
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
})

app.on('before-quit', async () => {
  await p2pSync.stop()
  await zimService.stop()
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
 * Network RAG query — search the collective knowledge pool and get AI-generated answers.
 * Calls sync/query/network_rag.py via Python subprocess.
 */
ipcMain.handle(
  'superbrain:network:query',
  async (
    _event,
    query: string,
    options: { dbPath?: string; topK?: number; searchOnly?: boolean } = {}
  ): Promise<NetworkQueryResult | NetworkSearchResult> => {
    try {
      const subnetDir = join(os.homedir(), 'superbrain-subnet')
      const scriptPath = join(subnetDir, 'scripts', 'network_query_ipc.py')
      const dbPath =
        options.dbPath ||
        join(os.homedir(), '.bittensor', 'miners', 'sb_miner', 'default', 'netuid442', 'miner', 'miner_sync_queue.db')
      const topK = options.topK || 5
      const mode = options.searchOnly ? 'search' : 'answer'

      const jsonArgs = JSON.stringify({ query, db_path: dbPath, top_k: topK, mode })

      const stdout = await execPython([scriptPath, jsonArgs], {
        cwd: subnetDir,
        timeout: 60000,
      })

      const result = JSON.parse(stdout.trim())
      return result
    } catch (error) {
      console.error('[NetworkRAG] Query failed:', error)
      throw new Error(`Network query failed: ${(error as Error).message}`)
    }
  }
)

/**
 * Network RAG pool stats — get knowledge pool statistics.
 */
ipcMain.handle(
  'superbrain:network:stats',
  async (_event, options: { dbPath?: string } = {}): Promise<NetworkPoolStats> => {
    try {
      const subnetDir = join(os.homedir(), 'superbrain-subnet')
      const scriptPath = join(subnetDir, 'scripts', 'network_query_ipc.py')
      const dbPath =
        options.dbPath ||
        join(os.homedir(), '.bittensor', 'miners', 'sb_miner', 'default', 'netuid442', 'miner', 'miner_sync_queue.db')

      const jsonArgs = JSON.stringify({ query: '', db_path: dbPath, top_k: 0, mode: 'stats' })

      const stdout = await execPython([scriptPath, jsonArgs], {
        cwd: subnetDir,
        timeout: 15000,
      })

      return JSON.parse(stdout.trim())
    } catch (error) {
      console.error('[NetworkRAG] Stats failed:', error)
      throw new Error(`Network stats failed: ${(error as Error).message}`)
    }
  }
)

/**
 * Share to Network — bridge RAG ingestion to the Bittensor SyncQueue.
 * Creates Ed25519-signed KnowledgeChunks and adds them to the miner's queue.
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
    try {
      const subnetDir = join(os.homedir(), 'superbrain-subnet')
      const scriptPath = join(subnetDir, 'scripts', 'share_to_network.py')
      const dbPath = join(
        os.homedir(),
        '.bittensor',
        'miners',
        'sb_miner',
        'default',
        'netuid442',
        'miner',
        'miner_sync_queue.db'
      )

      const jsonArgs: Record<string, string> = {
        mode: payload.mode,
        db_path: dbPath,
        title: payload.title || '',
      }

      if (payload.mode === 'file' && payload.filePath) {
        jsonArgs.file_path = payload.filePath
      } else if (payload.content) {
        jsonArgs.content = payload.content
      }

      const stdout = await execPython([scriptPath, JSON.stringify(jsonArgs)], {
        cwd: subnetDir,
        timeout: 60000,
      })

      return JSON.parse(stdout.trim())
    } catch (error) {
      console.error('[ShareToNetwork] Failed:', error)
      return {
        success: false,
        total_chunks: 0,
        new_chunks: 0,
        duplicates: 0,
        db_path: '',
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
  return fetchLeaderboard(100)
})

ipcMain.handle('benchmark:rank', async (_event, userScore: number) => {
  const lb = await fetchLeaderboard(100)
  return calculateUserRank(userScore, lb)
})

ipcMain.handle('benchmark:cached', () => {
  return getCachedBenchmark()
})

ipcMain.handle('benchmark:tiers', () => {
  return getTierInfo()
})

// -----------------------
// SHARE QDRANT CHUNKS TO SN442 NETWORK
// -----------------------

const SN442_SEED = 'http://46.225.114.202:8400'

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
