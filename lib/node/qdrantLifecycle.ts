// lib/node/qdrantLifecycle.ts
// Manages the embedded Qdrant binary as a child process.
// Start/stop is tied to Node Mode — no Docker required.

import { app } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { platform, arch } from 'os'

function resolvePlatformKey(): string {
  const plat = platform()
  const archStr = arch()
  if (plat === 'darwin') return archStr === 'arm64' ? 'mac-arm64' : 'mac-x64'
  if (plat === 'win32') return 'win-x64'
  return 'linux-x64'
}

export class QdrantLifecycle {
  private _proc: ChildProcess | null = null
  private _ready = false
  private _readyPromise: Promise<void> | null = null
  private _binaryPath: string
  private _storagePath: string
  private _configPath: string

  constructor() {
    const platformKey = resolvePlatformKey()
    const binName = platform() === 'win32' ? 'qdrant.exe' : 'qdrant'
    const resourcesRoot = app.isPackaged
      ? process.resourcesPath
      : join(app.getAppPath(), 'resources', 'binaries', '..', '..')

    // Dev: resources/binaries/<platform>/qdrant  Packaged: <app>/resources/binaries/<platform>/qdrant
    const binBase = app.isPackaged
      ? join(process.resourcesPath, 'binaries')
      : join(app.getAppPath(), 'resources', 'binaries')

    this._binaryPath = join(binBase, `qdrant-${platformKey}`, binName)

    const userData = app.getPath('userData')
    this._storagePath = join(userData, 'qdrant-storage')
    this._configPath = join(userData, 'qdrant-config.yaml')

    if (!existsSync(this._storagePath)) {
      mkdirSync(this._storagePath, { recursive: true })
    }
  }

  private _writeConfig(): void {
    // Quote the path to handle spaces on Windows/macOS
    const safePath = this._storagePath.replace(/\\/g, '/')
    const config = [
      'service:',
      '  http_port: 6333',
      '  grpc_port: 6334',
      '  host: 127.0.0.1',
      'storage:',
      `  storage_path: "${safePath}"`,
      '  on_disk_payload: true',
      'log_level: WARN',
    ].join('\n')
    writeFileSync(this._configPath, config)
  }

  async start(): Promise<void> {
    if (this._readyPromise) return this._readyPromise

    if (!existsSync(this._binaryPath)) {
      throw new Error(
        `Qdrant binary not found at ${this._binaryPath}. ` +
          `Run "npm run postinstall:qdrant" to download it first.`
      )
    }

    this._writeConfig()

    this._readyPromise = new Promise<void>((resolve, reject) => {
      console.log(`[Qdrant] Starting binary at ${this._binaryPath}`)
      this._proc = spawn(this._binaryPath, ['--config-path', this._configPath], {
        cwd: app.getPath('userData'),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      // Primary: watch stdout for Qdrant ready message
      this._proc.stdout?.on('data', (data: Buffer) => {
        const line = data.toString()
        if (
          (line.includes('Qdrant HTTP listening') || line.includes('listening on')) &&
          !this._ready
        ) {
          this._markReady(resolve)
        }
      })

      this._proc.stderr?.on('data', (data: Buffer) => {
        const line = data.toString()
        // Qdrant may log "Qdrant HTTP listening" to stderr in some builds
        if (
          (line.includes('Qdrant HTTP listening') || line.includes('listening on')) &&
          !this._ready
        ) {
          this._markReady(resolve)
        }
        if (line.trim()) console.error(`[Qdrant stderr] ${line.trim()}`)
      })

      this._proc.on('exit', (code) => {
        console.log(`[Qdrant] Process exited with code ${code}`)
        const wasReady = this._ready
        this._ready = false
        this._proc = null
        this._readyPromise = null
        if (!wasReady) reject(new Error(`Qdrant exited early with code ${code}`))
      })

      this._proc.on('error', (err) => {
        console.error('[Qdrant] Spawn error:', err)
        this._ready = false
        this._proc = null
        this._readyPromise = null
        reject(err)
      })

      // Fallback: poll /healthz — Qdrant may use different log formats across versions
      let elapsed = 0
      const POLL_MS = 500
      const TIMEOUT_MS = 30_000
      const poll = setInterval(async () => {
        if (this._ready) { clearInterval(poll); return }
        elapsed += POLL_MS
        if (elapsed >= TIMEOUT_MS) {
          clearInterval(poll)
          if (!this._ready) reject(new Error('Qdrant failed to start within 30s'))
          return
        }
        try {
          const res = await fetch('http://127.0.0.1:6333/healthz', {
            signal: AbortSignal.timeout(500),
          })
          if (res.ok && !this._ready) this._markReady(resolve)
        } catch { /* not ready yet */ }
      }, POLL_MS)
    })

    return this._readyPromise
  }

  private _markReady(resolve: () => void): void {
    this._ready = true
    console.log('[Qdrant] Ready on http://127.0.0.1:6333')
    resolve()
  }

  stop(): void {
    if (!this._proc) return
    console.log('[Qdrant] Stopping...')
    try {
      this._proc.kill('SIGTERM')
    } catch { /* already dead */ }
    // Force-kill after 5 s if still running
    const proc = this._proc
    setTimeout(() => {
      try { proc.kill('SIGKILL') } catch { /* already gone */ }
    }, 5_000)
    this._proc = null
    this._ready = false
    this._readyPromise = null
  }

  isReady(): boolean {
    return this._ready
  }

  getBinaryPath(): string {
    return this._binaryPath
  }
}

let _instance: QdrantLifecycle | null = null

export function getQdrantLifecycle(): QdrantLifecycle {
  if (!_instance) _instance = new QdrantLifecycle()
  return _instance
}
