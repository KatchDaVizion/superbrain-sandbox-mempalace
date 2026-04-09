/**
 * meshNetwork.ts — direct peer-to-peer chunk broadcast over Hyperswarm DHT.
 *
 * Sits alongside the Frankfurt seed POST in the share flow. After Frankfurt
 * accepts a chunk, this module also broadcasts it to every other SuperBrain
 * peer connected to the same DHT topic. Includes a 4-rule flag system for
 * basic content quality (duplicate, similarity, too-short, missing hotkey).
 *
 * PRIVACY GUARANTEE
 * -----------------
 * This module NEVER reads ~/.mempalace/. The cross-session memory layer
 * stays local. The mesh layer is opt-in per-chunk — only content the user
 * has explicitly clicked Share on flows through here.
 *
 * Storage is at ~/.superbrain/mesh-store/, deliberately separate from the
 * MemPalace data directory at ~/.mempalace/palace/.
 *
 * Failure mode: every method catches and returns safe defaults. The desktop
 * app must never crash because hyperswarm bindings or the DHT are unhappy.
 */

import { createHash } from 'crypto'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { EventEmitter } from 'events'

// ── Public Types ─────────────────────────────────────────────────────────────

export interface MeshFlag {
  reason: 'duplicate' | 'too_similar' | 'too_short' | 'no_hotkey'
  explanation: string
}

export interface MeshShareResult {
  success: boolean
  peersReached: number
  flag?: MeshFlag
}

export interface MeshStats {
  peers: number
  chunksShared: number
  chunksReceived: number
  topic: string
  started: boolean
}

// ── Internal Types ───────────────────────────────────────────────────────────

interface StoredChunk {
  content: string
  topic: string
  hotkey: string
  hash: string
  timestamp: number
  peerId?: string
}

interface PeerMessage {
  type: 'chunk'
  hash: string
  content: string
  topic: string
  hotkey: string
  timestamp: number
}

// ── Constants ────────────────────────────────────────────────────────────────

const TOPIC_STRING = 'superbrain-sn442-v1'
const BOOTSTRAP = [{ host: '46.225.114.202', port: 49737 }]
const STORE_DIR = path.join(os.homedir(), '.superbrain', 'mesh-store')

// CRITICAL: assert we never reach into the MemPalace data dir
const MEMPALACE_DIR = path.join(os.homedir(), '.mempalace')
if (STORE_DIR.startsWith(MEMPALACE_DIR)) {
  throw new Error('mesh STORE_DIR must not live inside ~/.mempalace/')
}

const FLAG_RULES = {
  MIN_LENGTH: 50,
  SIMILARITY_THRESHOLD: 0.85,
  RECENT_CHUNK_LIMIT: 1000,
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function topicBuffer(): Buffer {
  return createHash('sha256').update(TOPIC_STRING).digest()
}

/**
 * Jaccard similarity over word sets. Tokens are lowercased, split on
 * non-alphanumeric, words shorter than 3 chars dropped (stop-word filter).
 * Returns 0..1.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const tokenize = (s: string): Set<string> =>
    new Set(
      s
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2)
    )
  const setA = tokenize(a)
  const setB = tokenize(b)
  if (setA.size === 0 || setB.size === 0) return 0
  let intersection = 0
  for (const w of setA) if (setB.has(w)) intersection++
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

// ── Service ──────────────────────────────────────────────────────────────────

export class MeshNetwork extends EventEmitter {
  // Hyperswarm/Hyperbee/Corestore types are weak; treat as `any` at the
  // boundary. The internal contract is strongly typed via MeshShareResult.
  private swarm: any = null
  private store: any = null
  private bee: any = null
  private connections: Set<any> = new Set()
  private chunksShared = 0
  private chunksReceived = 0
  private isStarted = false

  /**
   * Initialize Hyperswarm + Hyperbee. Joins the SuperBrain DHT topic and
   * starts listening for peer connections. Returns false (not throws) on
   * any failure so the caller can degrade gracefully.
   */
  async start(): Promise<boolean> {
    if (this.isStarted) return true

    try {
      if (!fs.existsSync(STORE_DIR)) {
        fs.mkdirSync(STORE_DIR, { recursive: true })
      }

      // Lazy-load native deps so a missing/broken install doesn't crash app boot.
      const HyperswarmMod: any = await import('hyperswarm')
      const CorestoreMod: any = await import('corestore')
      const HyperbeeMod: any = await import('hyperbee')
      const Hyperswarm = HyperswarmMod.default || HyperswarmMod
      const Corestore = CorestoreMod.default || CorestoreMod
      const Hyperbee = HyperbeeMod.default || HyperbeeMod

      this.store = new Corestore(STORE_DIR)
      const core = this.store.get({ name: 'mesh-chunks' })
      await core.ready()
      this.bee = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'json' })
      await this.bee.ready()

      this.swarm = new Hyperswarm({ bootstrap: BOOTSTRAP })

      this.swarm.on('connection', (conn: any, info: any) => {
        const peerId =
          info?.publicKey?.toString('hex')?.substring(0, 12) || 'unknown'
        this.connections.add(conn)
        console.log(
          `[mesh] peer connected: ${peerId} (total ${this.connections.size})`
        )
        this.emitStatus()

        conn.on('data', (data: Buffer) => {
          this.handleIncoming(data, peerId).catch(() => {
            /* swallow — never let a bad peer message crash anything */
          })
        })
        conn.on('close', () => {
          this.connections.delete(conn)
          console.log(
            `[mesh] peer disconnected: ${peerId} (total ${this.connections.size})`
          )
          this.emitStatus()
        })
        conn.on('error', () => {
          this.connections.delete(conn)
        })
      })

      const topic = topicBuffer()
      const discovery = this.swarm.join(topic, { client: true, server: true })
      await discovery.flushed()
      console.log(
        `[mesh] joined SuperBrain topic, bootstrap=${BOOTSTRAP[0].host}:${BOOTSTRAP[0].port}`
      )

      this.isStarted = true
      this.emitStatus()
      return true
    } catch (err) {
      console.warn('[mesh] start failed:', (err as Error).message)
      this.isStarted = false
      return false
    }
  }

  async stop(): Promise<void> {
    if (!this.isStarted) return
    try {
      for (const conn of this.connections) {
        try {
          conn.destroy()
        } catch {
          /* noop */
        }
      }
      this.connections.clear()
      if (this.swarm) await this.swarm.destroy()
      if (this.bee) await this.bee.close()
      if (this.store) await this.store.close()
    } catch (err) {
      console.warn('[mesh] stop failed:', (err as Error).message)
    }
    this.isStarted = false
    this.swarm = null
    this.bee = null
    this.store = null
  }

  /**
   * Share a chunk to the mesh. Runs all 4 flag rules in order. If any fire,
   * returns the flag and does NOT broadcast or store. Otherwise hashes,
   * persists in hyperbee (so future calls see it as a duplicate), and
   * broadcasts to all connected peers.
   *
   * Returns { success: false, peersReached: 0 } silently if the mesh is
   * not started — the caller can ignore that branch and treat the
   * Frankfurt POST as authoritative.
   */
  async shareChunk(
    content: string,
    topic: string,
    hotkey: string
  ): Promise<MeshShareResult> {
    if (!this.isStarted) {
      return { success: false, peersReached: 0 }
    }

    // ── Flag rules (order matters: cheap checks first) ──

    // RULE: no_hotkey
    if (!hotkey || hotkey.trim().length === 0) {
      return {
        success: false,
        peersReached: 0,
        flag: {
          reason: 'no_hotkey',
          explanation:
            'Connect a Bittensor hotkey before sharing — chunks must be attributable.',
        },
      }
    }

    // RULE: too_short
    if (!content || content.length < FLAG_RULES.MIN_LENGTH) {
      return {
        success: false,
        peersReached: 0,
        flag: {
          reason: 'too_short',
          explanation: `Content is ${content?.length || 0} chars — minimum is ${FLAG_RULES.MIN_LENGTH}.`,
        },
      }
    }

    const hash = sha256Hex(content)

    // RULE: duplicate (exact hash hit)
    try {
      const existing = await this.bee.get(hash)
      if (existing) {
        return {
          success: false,
          peersReached: 0,
          flag: {
            reason: 'duplicate',
            explanation: 'This exact chunk already exists in the mesh.',
          },
        }
      }
    } catch {
      /* bee may be empty on first run — keep going */
    }

    // RULE: too_similar (Jaccard > 0.85 against recent chunks in same topic)
    const similarity = await this.findMaxSimilarity(content, topic)
    if (similarity > FLAG_RULES.SIMILARITY_THRESHOLD) {
      return {
        success: false,
        peersReached: 0,
        flag: {
          reason: 'too_similar',
          explanation: `${Math.round(similarity * 100)}% similar to an existing chunk in this topic — refine before re-sharing.`,
        },
      }
    }

    // ── Store + broadcast ──
    const stored: StoredChunk = {
      content,
      topic,
      hotkey,
      hash,
      timestamp: Date.now(),
    }
    try {
      await this.bee.put(hash, stored)
    } catch (err) {
      console.warn('[mesh] bee.put failed:', (err as Error).message)
    }

    const message: PeerMessage = {
      type: 'chunk',
      hash,
      content,
      topic,
      hotkey,
      timestamp: stored.timestamp,
    }
    const payload = Buffer.from(JSON.stringify(message))
    let reached = 0
    for (const conn of this.connections) {
      try {
        conn.write(payload)
        reached++
      } catch {
        /* peer dropped — skip */
      }
    }

    this.chunksShared++
    this.emit('chunk-shared', { hash, peersReached: reached })
    this.emitStatus()
    return { success: true, peersReached: reached }
  }

  /**
   * Find the highest Jaccard similarity between `content` and any stored
   * chunk in the same topic. Walks the most recent N chunks for performance
   * and exits early once a similarity above the threshold is found.
   */
  private async findMaxSimilarity(
    content: string,
    topic: string
  ): Promise<number> {
    if (!this.bee) return 0
    let maxSim = 0
    try {
      const stream = this.bee.createReadStream({
        reverse: true,
        limit: FLAG_RULES.RECENT_CHUNK_LIMIT,
      })
      for await (const node of stream) {
        const chunk = node.value as StoredChunk
        if (!chunk || chunk.topic !== topic) continue
        const sim = jaccardSimilarity(content, chunk.content)
        if (sim > maxSim) maxSim = sim
        if (maxSim > FLAG_RULES.SIMILARITY_THRESHOLD) break
      }
    } catch (err) {
      console.warn('[mesh] similarity check failed:', (err as Error).message)
    }
    return maxSim
  }

  /**
   * Handle a chunk message from a peer. Validates, dedupes via the same
   * hyperbee key, persists, and emits a `chunk-received` event for the
   * renderer. Does NOT re-broadcast (gossip storms are out of scope).
   */
  private async handleIncoming(data: Buffer, peerId: string): Promise<void> {
    let msg: PeerMessage
    try {
      msg = JSON.parse(data.toString('utf-8'))
    } catch {
      return
    }
    if (msg.type !== 'chunk' || !msg.hash || !msg.content) return

    try {
      const existing = await this.bee.get(msg.hash)
      if (existing) return // already have it
      const stored: StoredChunk = {
        content: msg.content,
        topic: msg.topic || 'unknown',
        hotkey: msg.hotkey || '',
        hash: msg.hash,
        timestamp: msg.timestamp || Date.now(),
        peerId,
      }
      await this.bee.put(msg.hash, stored)
      this.chunksReceived++
      this.emit('chunk-received', stored)
      this.emitStatus()
    } catch (err) {
      console.warn('[mesh] handleIncoming failed:', (err as Error).message)
    }
  }

  getStats(): MeshStats {
    return {
      peers: this.connections.size,
      chunksShared: this.chunksShared,
      chunksReceived: this.chunksReceived,
      topic: TOPIC_STRING,
      started: this.isStarted,
    }
  }

  private emitStatus(): void {
    this.emit('status-update', this.getStats())
  }
}

// Singleton instance — import { mesh } from '../p2p/meshNetwork'
export const mesh = new MeshNetwork()
