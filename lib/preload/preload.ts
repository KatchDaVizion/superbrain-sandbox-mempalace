/* eslint-disable @typescript-eslint/no-unsafe-function-type */
// lib/preload/preload.ts
import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron'
import api from './api'
import { BtcliConfig, Subnet, WalletConfig } from '../bittensor/types'

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
})

export const walletAPI = {
  saveConfig: (data: WalletConfig): Promise<boolean> =>
    ipcRenderer.invoke("save-wallet-config", data),
  saveBtcliConfig: (data: BtcliConfig): Promise<boolean> =>
    ipcRenderer.invoke("save-os-config", data),
  loadConfig: (): Promise<WalletConfig[]> =>
    ipcRenderer.invoke("load-wallet-config"),
  loadBtcliConfig: (): Promise<BtcliConfig> =>
    ipcRenderer.invoke("load-os-config"),
  registerWallet: (data: WalletConfig, subnet_id: number) =>
    ipcRenderer.invoke("register-bittensor-wallet", data, subnet_id),
  getMinerLogs: (walletName: string, hotkey: string, subnetId: string, lines: number = 100) => 
    ipcRenderer.invoke("get-miner-logs", walletName, hotkey, subnetId, lines),
  getAllMinerLogs: (lines: number = 100): Promise<string[]> => 
    ipcRenderer.invoke("get-all-miner-logs", lines),
  getAllMiners: () => ipcRenderer.invoke("get-all-miners"),
  getWalletStats: (name) => ipcRenderer.invoke("get-wallet-stats", name),
  getOverallStats: () => ipcRenderer.invoke("get-overall-stats"),
  getSubnets: () : Promise<Subnet[]> => ipcRenderer.invoke("get-subnets"),
  executeCommand: (cmd, includePath = false) => ipcRenderer.invoke("exec-btcli-cmd", cmd, includePath),
  downloadScripts: (name) => ipcRenderer.invoke("download-miner-script", name),
};
contextBridge.exposeInMainWorld("bittensorWalletAPI", walletAPI);

// Add global typing
declare global {
  interface Window {
    bittensorWalletAPI: typeof walletAPI
  }
}

contextBridge.exposeInMainWorld('api', api)

export interface IngestResult {
  docId: string
  chunkCount: number
  title: string
  collectionName?: string
  userId?: string
  teamId?: string
  tags?: string[]
}

export interface IngestConfig {
  collectionName?: string
  ollamaEmbedModel?: string
  userId?: string
  teamId?: string
  tags?: string[]
  qdrantUrl?: string
}

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
  model?: string
  temperature?: number
  k?: number
  baseUrl?: string
  collectionName?: string
}

export interface RAGApiInterface {
  ingestFilePath: (filePath: string, tags?: string[], config?: IngestConfig) => Promise<IngestResult>
  ingestURLContent: (content: string, url: string, config?: IngestConfig) => Promise<IngestResult>
  ingestTextContent: (content: string, title?: string, config?: IngestConfig) => Promise<IngestResult>
  checkQdrantStatus: () => Promise<{ running: boolean }>
  listCollections: () => Promise<string[]>

  // Chat Operations
  chatWithRAG: (query: string, options?: ChatOptions) => Promise<ChatResponse>
  startStreamingChat: (query: string, options?: ChatOptions) => Promise<{ streamId: string; success: boolean }>
  cancelStream: (streamId: string) => Promise<{ success: boolean; message: string }>

  // Event Listeners for Streaming
  onChatChunk: (callback: (data: { streamId: string; chunk: string }) => void) => void
  onChatComplete: (callback: (data: { streamId: string; result: ChatResponse }) => void) => void
  onChatError: (callback: (data: { streamId: string; error: string }) => void) => void

  // Remove specific listeners
  removeChatChunkListener: (callback: Function) => void
  removeChatCompleteListener: (callback: Function) => void
  removeChatErrorListener: (callback: Function) => void
}

// Create a concrete implementation object
const RAGApi: RAGApiInterface = {
  ingestFilePath: (filePath, tags = [], config = {}) => ipcRenderer.invoke('rag:ingest:file', filePath, tags, config),

  ingestURLContent: (content, url, config = {}) => ipcRenderer.invoke('rag:ingest:url', content, url, config),

  ingestTextContent: (content, title = 'Pasted_Text_Snippet', config = {}) =>
    ipcRenderer.invoke('rag:ingest:text', content, title, config),

  checkQdrantStatus: () => ipcRenderer.invoke('rag:qdrant:status'),
  listCollections: () => ipcRenderer.invoke('rag:qdrant:listCollections'),
  // Chat Operations
  chatWithRAG: (query, options = {}) => ipcRenderer.invoke('rag:chat:stream', query, options),

  startStreamingChat: (query, options = {}) => ipcRenderer.invoke('rag:chat:start-stream', query, options),

  cancelStream: (streamId) => ipcRenderer.invoke('rag:chat:cancel-stream', streamId),

  // Event Listeners
  onChatChunk: (callback) => {
    const handler = (event: IpcRendererEvent, data: { streamId: string; chunk: string }) => callback(data)
    ipcRenderer.on('rag:chat:chunk', handler)
  },

  onChatComplete: (callback) => {
    const handler = (event: IpcRendererEvent, data: { streamId: string; result: ChatResponse }) => callback(data)
    ipcRenderer.on('rag:chat:complete', handler)
  },

  onChatError: (callback) => {
    const handler = (event: IpcRendererEvent, data: { streamId: string; error: string }) => callback(data)
    ipcRenderer.on('rag:chat:error', handler)
  },

  // Remove specific listeners
  removeChatChunkListener: (callback) => {
    ipcRenderer.removeListener('rag:chat:chunk', callback as any)
  },

  removeChatCompleteListener: (callback) => {
    ipcRenderer.removeListener('rag:chat:complete', callback as any)
  },

  removeChatErrorListener: (callback) => {
    ipcRenderer.removeListener('rag:chat:error', callback as any)
  },
}

// Remove all listeners utility
export const removeAllChatListeners = () => {
  ipcRenderer.removeAllListeners('rag:chat:chunk')
  ipcRenderer.removeAllListeners('rag:chat:complete')
  ipcRenderer.removeAllListeners('rag:chat:error')
}

contextBridge.exposeInMainWorld('RAGApi', RAGApi)

declare global {
  interface Window {
    RAGApi: RAGApiInterface
  }
}

// -----------------------
// Network RAG Query API (SuperBrain Knowledge Pool)
// -----------------------

export interface NetworkSource {
  content: string
  content_hash: string
  score: number
  relevance: number
  freshness: number
  source: string
  timestamp: number
  node_id: string
  hotkey?: string
  category?: string
}

export interface NetworkQueryResult {
  text: string
  citations: number[]
  sources: NetworkSource[]
  method: string
  query: string
  generation_time: number
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

export interface NetworkQueryOptions {
  dbPath?: string
  topK?: number
  searchOnly?: boolean
}

export interface ShareToNetworkResult {
  success: boolean
  total_chunks: number
  new_chunks: number
  duplicates: number
  db_path: string
  error?: string
}

export interface NetworkFeedChunk {
  id: string
  title: string
  category: string
  preview: string
  hotkey: string
  timestamp: number
  source: string
  node: string
}

export interface NetworkFeedResult {
  chunks: NetworkFeedChunk[]
  total: number
  chunks_today: number
  last_updated: number | null
  error?: string
}

export interface I2PStatus {
  installed: boolean
  sam_listening: boolean
  sam_handshake_ok: boolean
  http_proxy_listening: boolean
  netdb_routers: number
  sam_clients_connected: number
  routing_ok: boolean
  reachable: boolean
  error?: string
}

export interface NetworkRAGApiInterface {
  query: (query: string, options?: NetworkQueryOptions) => Promise<NetworkQueryResult>
  search: (query: string, options?: NetworkQueryOptions) => Promise<NetworkSearchResult>
  stats: (options?: { dbPath?: string }) => Promise<NetworkPoolStats>
  feed: (options?: { limit?: number; category?: string; hours?: number }) => Promise<NetworkFeedResult>
  i2pStatus: () => Promise<I2PStatus>
  shareText: (content: string, title?: string) => Promise<ShareToNetworkResult>
  shareFile: (filePath: string, title?: string) => Promise<ShareToNetworkResult>
}

const NetworkRAGApi: NetworkRAGApiInterface = {
  query: (query, options = {}) =>
    ipcRenderer.invoke('superbrain:network:query', query, { ...options, searchOnly: false }),

  search: (query, options = {}) =>
    ipcRenderer.invoke('superbrain:network:query', query, { ...options, searchOnly: true }),

  stats: (options = {}) => ipcRenderer.invoke('superbrain:network:stats', options),

  feed: (options = {}) => ipcRenderer.invoke('superbrain:network:feed', options),

  i2pStatus: () => ipcRenderer.invoke('superbrain:network:i2p-status'),

  shareText: (content, title) =>
    ipcRenderer.invoke('rag:share-to-network', { mode: 'text', content, title }),

  shareFile: (filePath, title) =>
    ipcRenderer.invoke('rag:share-to-network', { mode: 'file', filePath, title }),
}

contextBridge.exposeInMainWorld('NetworkRAGApi', NetworkRAGApi)

declare global {
  interface Window {
    NetworkRAGApi: NetworkRAGApiInterface
  }
}

contextBridge.exposeInMainWorld('fileSystem', {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
})

declare global {
  interface Window {
    fileSystem: {
      getPathForFile: (file: File) => string
    }
  }
}
