// lib/node/nodeModeService.ts
// Manages the run_sync_node.py subprocess for desktop Node Mode.
// Spawns/kills it based on user config, parses stdout for live stats.

import { app } from 'electron'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import os from 'os'

export type NetworkMode = 'lan' | 'i2p' | 'hybrid'

export interface NodeModeConfig {
  enabled: boolean
  networkMode: NetworkMode
  storageCapMb: number
  port: number
}

export interface NodeModeStatus {
  running: boolean
  pid: number | null
  chunksLocal: number
  peersLan: number
  lastSync: number | null
  uptime: number | null
  error: string | null
}

const DEFAULT_CONFIG: NodeModeConfig = {
  enabled: false,
  networkMode: 'hybrid',
  storageCapMb: 512,
  port: 8389,
}

export class NodeModeService {
  private _config: NodeModeConfig = { ...DEFAULT_CONFIG }
  private _proc: ChildProcess | null = null
  private _startTime: number | null = null
  private _chunksLocal = 0
  private _peersLan = 0
  private _lastSync: number | null = null
  private _lastError: string | null = null
  private _configPath: string
  private _dbPath: string
  private _onChunksReceived: (() => void) | null = null

  constructor() {
    const userData = app.getPath('userData')
    this._configPath = join(userData, 'node-mode-config.json')
    this._dbPath = join(userData, 'node-chunks.db')
    this._loadConfig()
  }

  private _loadConfig(): void {
    try {
      if (existsSync(this._configPath)) {
        const raw = readFileSync(this._configPath, 'utf8')
        this._config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
      }
    } catch {
      this._config = { ...DEFAULT_CONFIG }
    }
  }

  private _saveConfig(): void {
    try {
      const userData = app.getPath('userData')
      if (!existsSync(userData)) mkdirSync(userData, { recursive: true })
      writeFileSync(this._configPath, JSON.stringify(this._config, null, 2))
    } catch (e) {
      console.error('[NodeMode] Failed to save config:', e)
    }
  }

  setOnChunksReceived(cb: () => void): void {
    this._onChunksReceived = cb
  }

  getConfig(): NodeModeConfig {
    return { ...this._config }
  }

  setConfig(config: Partial<NodeModeConfig>): void {
    this._config = { ...this._config, ...config }
    this._saveConfig()
  }

  getStatus(): NodeModeStatus {
    return {
      running: this._proc !== null && this._proc.exitCode === null,
      pid: this._proc?.pid ?? null,
      chunksLocal: this._chunksLocal,
      peersLan: this._peersLan,
      lastSync: this._lastSync,
      uptime: this._startTime ? Math.floor((Date.now() - this._startTime) / 1000) : null,
      error: this._lastError,
    }
  }

  async start(): Promise<void> {
    if (this._proc && this._proc.exitCode === null) return

    const script = app.isPackaged
      ? join(process.resourcesPath, 'scripts', 'run_sync_node.py')
      : join(os.homedir(), 'superbrain-subnet', 'run_sync_node.py')
    const cwd = app.isPackaged ? join(process.resourcesPath, 'scripts') : join(os.homedir(), 'superbrain-subnet')

    if (!existsSync(script)) {
      this._lastError = `run_sync_node.py not found at ${script}`
      throw new Error(this._lastError)
    }

    const args = ['python3', script, '--db', this._dbPath, '--static', '46.225.114.202:8385']
    if (this._config.networkMode === 'lan') args.push('--no-i2p')
    // hybrid and i2p both leave I2P enabled (default in run_sync_node.py)

    this._lastError = null
    this._chunksLocal = 0
    this._peersLan = 0

    this._proc = spawn(args[0], args.slice(1), {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    })

    this._startTime = Date.now()

    this._proc.stdout?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n')
      for (const line of lines) {
        this._parseLine(line.trim())
      }
    })

    this._proc.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim()
      if (text) console.error('[NodeMode stderr]', text)
    })

    this._proc.on('exit', (code) => {
      console.log(`[NodeMode] sync node exited (code=${code})`)
      if (code !== 0 && code !== null) {
        this._lastError = `Sync node exited with code ${code}`
      }
      this._proc = null
      this._startTime = null
    })

    this._proc.on('error', (err) => {
      this._lastError = err.message
      console.error('[NodeMode] process error:', err)
    })

    console.log(`[NodeMode] started pid=${this._proc.pid} mode=${this._config.networkMode}`)
  }

  stop(): void {
    if (!this._proc) return
    try {
      this._proc.kill('SIGTERM')
    } catch {
      // already dead
    }
    this._proc = null
    this._startTime = null
    console.log('[NodeMode] stopped')
  }

  // Parse a stdout line from run_sync_node.py to extract stats.
  private _parseLine(line: string): void {
    if (!line) return

    // "[sb-node] Sync round: N peers" or similar discovery logs
    const peersMatch = line.match(/(\d+)\s+peers?/i)
    if (peersMatch) {
      this._peersLan = parseInt(peersMatch[1], 10)
    }

    // "LAN sync started" / "Sync connection from"
    if (line.includes('Sync connection') || line.includes('sync started')) {
      this._lastSync = Date.now()
    }

    // "sent=X, received=Y" — extract chunk counts
    const syncMatch = line.match(/sent=(\d+),?\s*received=(\d+)/)
    if (syncMatch) {
      const received = parseInt(syncMatch[2], 10)
      this._chunksLocal += received
      this._lastSync = Date.now()
      if (received > 0 && this._onChunksReceived) this._onChunksReceived()
    }

    // "Seeded N chunks" from --seed flag
    const seedMatch = line.match(/Seeded\s+(\d+)\s+chunks?/i)
    if (seedMatch) {
      this._chunksLocal = parseInt(seedMatch[1], 10)
    }
  }
}

let _instance: NodeModeService | null = null

export function getNodeModeService(): NodeModeService {
  if (!_instance) _instance = new NodeModeService()
  return _instance
}
