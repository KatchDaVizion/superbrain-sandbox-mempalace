/**
 * SuperBrain P2P Sync Service
 * Frankfurt = seed node (phone book only)
 * Nodes talk directly after introduction
 */
import axios from 'axios'
import * as http from 'http'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { EventEmitter } from 'events'

const SEED_NODE = process.env.SB_API_URL || 'http://46.225.114.202:8400'
const P2P_PORT = 8500
const SYNC_INTERVAL = 30_000
const ANNOUNCE_INTERVAL = 60_000
const DATA_DIR = path.join(os.homedir(), '.superbrain')

export interface Peer {
  url: string
  node_id: string
  city: string
  chunks: number
  online: boolean
  last_seen: number
}

export interface P2PChunk {
  id: string
  content: string
  content_preview?: string
  title: string
  source: string
  privacy: string
  peer_url: string
  received_at: number
}

export class P2PSyncService extends EventEmitter {
  private server: http.Server | null = null
  private peers: Map<string, Peer> = new Map()
  private syncTimer: NodeJS.Timeout | null = null
  private announceTimer: NodeJS.Timeout | null = null
  private myUrl: string = ''
  private publicUrl: string | null = null
  private nodeId: string = ''
  private localChunks: P2PChunk[] = []
  private receivedChunks: P2PChunk[] = []
  private isRunning = false
  // Track peer URLs we've already logged as offline this session so the
  // 30s sync loop doesn't spam "[P2P] Peer offline: ..." every interval.
  // Cleared on successful re-sync so we log a fresh transition next time.
  private loggedOfflinePeers: Set<string> = new Set()

  constructor() {
    super()
    this.nodeId = this.getOrCreateNodeId()
  }

  private getOrCreateNodeId(): string {
    const idFile = path.join(DATA_DIR, 'node_id')
    fs.mkdirSync(DATA_DIR, { recursive: true })
    if (fs.existsSync(idFile)) return fs.readFileSync(idFile, 'utf8').trim()
    const id = 'sb-' + crypto.randomBytes(8).toString('hex')
    fs.writeFileSync(idFile, id)
    return id
  }

  async start(): Promise<void> {
    if (this.isRunning) return
    this.isRunning = true
    await this.startLocalServer()
    this.myUrl = await this.detectMyUrl()
    console.log(`[P2P] Node ${this.nodeId} at ${this.myUrl}`)
    await this.announceToSeed()
    await this.refreshPeers()
    await this.syncFromAllPeers()
    this.syncTimer = setInterval(() => this.syncFromAllPeers(), SYNC_INTERVAL)
    this.announceTimer = setInterval(async () => {
      await this.announceToSeed()
      await this.refreshPeers()
    }, ANNOUNCE_INTERVAL)
    this.emit('ready', { nodeId: this.nodeId, url: this.myUrl })
  }

  async stop(): Promise<void> {
    this.isRunning = false
    if (this.syncTimer) clearInterval(this.syncTimer)
    if (this.announceTimer) clearInterval(this.announceTimer)
    if (this.server) this.server.close()
  }

  private startLocalServer(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Access-Control-Allow-Origin', '*')

        // GET /health
        if (req.method === 'GET' && req.url === '/health') {
          res.writeHead(200)
          res.end(JSON.stringify({
            status: 'ok',
            node_id: this.nodeId,
            chunks: this.localChunks.length,
            received: this.receivedChunks.length,
            peers: this.peers.size
          }))
          return
        }

        // GET /knowledge/list — peers pull our public chunks
        if (req.method === 'GET' && req.url === '/knowledge/list') {
          const publicChunks = this.localChunks
            .filter(c => c.privacy === 'public')
            .map(c => ({
              id: c.id,
              content: c.content,
              content_preview: c.content.slice(0, 200),
              title: c.title,
              source: c.source,
              privacy: c.privacy
            }))
          res.writeHead(200)
          res.end(JSON.stringify({
            chunks: publicChunks,
            total: publicChunks.length,
            node_id: this.nodeId
          }))
          return
        }

        // POST /knowledge/share — peers gossip chunks to us
        if (req.method === 'POST' && req.url === '/knowledge/share') {
          let body = ''
          req.on('data', d => body += d)
          req.on('end', () => {
            try {
              const chunk = JSON.parse(body) as P2PChunk
              this.receiveChunk(chunk)
              res.writeHead(200)
              res.end(JSON.stringify({ success: true }))
            } catch {
              res.writeHead(400)
              res.end(JSON.stringify({ success: false }))
            }
          })
          return
        }

        res.writeHead(404)
        res.end(JSON.stringify({ error: 'not found' }))
      })

      this.server.listen(P2P_PORT, '0.0.0.0', () => {
        console.log(`[P2P] Local server on :${P2P_PORT}`)
        resolve()
      })

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[P2P] Port ${P2P_PORT} in use — P2P disabled`)
          resolve()
        }
      })
    })
  }

  private async detectMyUrl(): Promise<string> {
    const ifaces = os.networkInterfaces()
    for (const name of Object.keys(ifaces)) {
      for (const iface of ifaces[name] || []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return `http://${iface.address}:${P2P_PORT}`
        }
      }
    }
    return `http://127.0.0.1:${P2P_PORT}`
  }

  setPublicUrl(url: string): void {
    this.publicUrl = url
    console.log(`[P2P] Public URL set: ${url}`)
    // Re-announce with the public URL so peers can reach us
    this.announceToSeed().catch(() => {})
  }

  getPublicUrl(): string | null { return this.publicUrl }

  private async announceToSeed(): Promise<void> {
    const announceUrl = this.publicUrl || this.myUrl
    try {
      await axios.post(`${SEED_NODE}/announce`, {
        hotkey: this.nodeId,
        node_id: this.nodeId,
        url: announceUrl,
        chunks: this.localChunks.length,
        city: 'Unknown',
        lat: 0,
        lon: 0,
      }, { timeout: 5000 })
      console.log(`[P2P] Announced to seed: ${announceUrl}`)
    } catch {
      console.warn('[P2P] Seed unreachable — local mode only')
    }
  }

  async refreshPeers(): Promise<void> {
    try {
      const resp = await axios.get(`${SEED_NODE}/peers`, { timeout: 5000 })
      const peerList: any[] = resp.data?.peers || []
      for (const p of peerList) {
        const url = p.url || ''
        if (!url || url === this.myUrl) continue
        if (url.includes('46.225.114.202')) continue
        this.peers.set(url, {
          url,
          node_id: p.node_id || p.hotkey || url,
          city: p.city || 'Unknown',
          chunks: p.chunks || 0,
          online: true,
          last_seen: Date.now()
        })
      }
      console.log(`[P2P] ${this.peers.size} peer(s) known`)
      this.emit('peers-updated', Array.from(this.peers.values()))
    } catch {
      console.warn('[P2P] Could not refresh peers')
    }
  }

  async syncFromAllPeers(): Promise<void> {
    const peers = Array.from(this.peers.values())
    if (peers.length === 0) {
      console.log('[P2P] No peers to sync from')
      return
    }
    let totalNew = 0
    for (const peer of peers) {
      try {
        const newChunks = await this.syncFromPeer(peer)
        totalNew += newChunks
        peer.online = true
        peer.last_seen = Date.now()
        // Recovery: peer is back, allow a fresh "offline" log next time it drops
        if (this.loggedOfflinePeers.delete(peer.url)) {
          console.log(`[P2P] Peer back online: ${peer.url}`)
        }
      } catch {
        peer.online = false
        // Only log the first time per session — the next 30s sync would
        // otherwise re-log the same offline peer indefinitely.
        if (!this.loggedOfflinePeers.has(peer.url)) {
          console.warn(`[P2P] Peer offline: ${peer.url}`)
          this.loggedOfflinePeers.add(peer.url)
        }
      }
    }
    if (totalNew > 0) {
      console.log(`[P2P] Synced ${totalNew} new chunks`)
      this.emit('chunks-received', totalNew)
    }
  }

  private async syncFromPeer(peer: Peer): Promise<number> {
    const isTunnel = peer.url.startsWith('https://')
    const resp = await axios.get(`${peer.url}/knowledge/list`, { timeout: isTunnel ? 15000 : 8000 })
    const chunks: P2PChunk[] = resp.data?.chunks || []
    const existingIds = new Set([
      ...this.receivedChunks.map(c => c.id),
      ...this.localChunks.map(c => c.id)
    ])
    let newCount = 0
    for (const chunk of chunks) {
      if (existingIds.has(chunk.id)) continue
      if (chunk.privacy !== 'public') continue
      const received: P2PChunk = { ...chunk, peer_url: peer.url, received_at: Date.now() }
      this.receivedChunks.push(received)
      existingIds.add(chunk.id)
      newCount++
      this.emit('new-chunk', received)
    }
    return newCount
  }

  async shareChunk(content: string, title: string): Promise<string> {
    const id = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
    const chunk: P2PChunk = {
      id, content, title,
      content_preview: content.slice(0, 200),
      source: 'superbrain-desktop',
      privacy: 'public',
      peer_url: this.myUrl,
      received_at: Date.now()
    }
    this.localChunks.push(chunk)

    // Push to seed node
    try {
      await axios.post(`${SEED_NODE}/knowledge/share`, {
        content, title, source: 'superbrain-desktop-p2p'
      }, { timeout: 5000 })
    } catch {
      console.warn('[P2P] Could not push to seed')
    }

    // Gossip directly to all known peers
    const online = Array.from(this.peers.values()).filter(p => p.online)
    console.log(`[P2P] Gossiping to ${online.length} peer(s)`)
    for (const peer of online) {
      try {
        await axios.post(`${peer.url}/knowledge/share`, chunk, { timeout: 3000 })
        console.log(`[P2P] Gossiped to ${peer.city} (${peer.url})`)
      } catch {
        peer.online = false
      }
    }

    this.emit('chunk-shared', { id, peersReached: online.length })
    return id
  }

  private receiveChunk(chunk: P2PChunk): void {
    const existingIds = new Set([
      ...this.receivedChunks.map(c => c.id),
      ...this.localChunks.map(c => c.id)
    ])
    if (existingIds.has(chunk.id)) return
    if (chunk.privacy !== 'public') return
    this.receivedChunks.push(chunk)
    this.emit('new-chunk', chunk)
    console.log(`[P2P] Received chunk from peer: ${chunk.title}`)
    // Forward to other peers (1 hop gossip)
    this.forwardToOtherPeers(chunk, chunk.peer_url)
  }

  private async forwardToOtherPeers(chunk: P2PChunk, fromUrl: string): Promise<void> {
    const others = Array.from(this.peers.values())
      .filter(p => p.online && p.url !== fromUrl)
    for (const peer of others) {
      try {
        await axios.post(`${peer.url}/knowledge/share`, chunk, { timeout: 3000 })
      } catch {}
    }
  }

  searchChunks(query: string, limit = 5): P2PChunk[] {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    return [...this.receivedChunks, ...this.localChunks]
      .map(c => ({ c, score: words.filter(w => c.content.toLowerCase().includes(w)).length }))
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.c)
  }

  getPeers(): Peer[] { return Array.from(this.peers.values()) }
  getLocalChunks(): P2PChunk[] { return this.localChunks }
  getReceivedChunks(): P2PChunk[] { return this.receivedChunks }
  getNodeId(): string { return this.nodeId }
  getMyUrl(): string { return this.myUrl }
  getPeerCount(): number { return this.peers.size }
  getOnlinePeerCount(): number {
    return Array.from(this.peers.values()).filter(p => p.online).length
  }
}

export const p2pSync = new P2PSyncService()
