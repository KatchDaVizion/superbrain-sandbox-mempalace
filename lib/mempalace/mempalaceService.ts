/**
 * MempalaceService — subprocess wrapper for the MemPalace Python CLI.
 *
 * MemPalace is a Python tool (~/.mempalace-venv/bin/mempalace) that provides
 * cross-session conversation memory backed by ChromaDB. This service spawns
 * the binary as a child process and parses its stdout — it does NOT
 * re-implement MemPalace in TypeScript.
 *
 * Pattern matches the existing ZimService / kiwix-serve subprocess approach.
 *
 * Failure mode: every method catches errors and returns safe defaults
 * (empty string / empty array / zero counts). The desktop app must never
 * crash because mempalace is missing or misconfigured.
 */

import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import os from 'os'
import path from 'path'

const execFileAsync = promisify(execFile)

// Inline Python helper. Writes a drawer directly to the ChromaDB collection
// so the caller can force a specific room name. We can't use `mempalace mine`
// for this because its room is auto-detected from keyword matching with no
// override flag — autosaved chat exchanges would land in `technical` instead
// of `conversations`. Bypassing the miner gives us the room we want.
const ADD_DRAWER_PY = [
  'import chromadb, sys, os, hashlib',
  'from datetime import datetime',
  "palace = os.path.expanduser('~/.mempalace/palace')",
  'client = chromadb.PersistentClient(path=palace)',
  'try:',
  "    col = client.get_collection('mempalace_drawers')",
  'except Exception:',
  "    col = client.create_collection('mempalace_drawers')",
  'content = sys.stdin.read()',
  'wing = sys.argv[1]',
  'room = sys.argv[2]',
  "agent = sys.argv[3] if len(sys.argv) > 3 else 'superbrain-chat'",
  'ts = datetime.now().isoformat()',
  "drawer_id = 'drawer_' + wing + '_' + room + '_' + hashlib.md5((content + ts).encode()).hexdigest()[:16]",
  'col.add(documents=[content], ids=[drawer_id], metadatas=[{',
  "    'wing': wing, 'room': room,",
  "    'source_file': 'superbrain-chat-autosave',",
  "    'chunk_index': 0, 'added_by': agent,",
  "    'filed_at': ts, 'ingest_mode': 'convos',",
  "    'extract_mode': 'manual',",
  '}])',
  "print('OK ' + drawer_id)",
].join('\n')

// ── Types ────────────────────────────────────────────────────────────────────

export interface PalaceResult {
  title: string
  snippet: string
  similarity: number
  room: string
  wing: string
}

export interface PalaceRoom {
  name: string
  count: number
}

export interface PalaceWing {
  name: string
  rooms: PalaceRoom[]
}

export interface PalaceStatus {
  totalDrawers: number
  wings: PalaceWing[]
  palacePath: string
}

// ── Service ──────────────────────────────────────────────────────────────────

export class MempalaceService {
  // Hardcoded venv path. Electron does NOT inherit shell PATH on Linux/macOS,
  // so we cannot rely on `which mempalace` — must use absolute path.
  private readonly binaryPath: string = path.join(
    os.homedir(),
    '.mempalace-venv',
    'bin',
    'mempalace'
  )

  private readonly palacePath: string = path.join(os.homedir(), '.mempalace', 'palace')

  // Wakeup text is expensive to generate (~1200 tokens, ~500ms subprocess).
  // Cache it for the entire app session — it only changes when new drawers
  // are filed or the identity file is edited.
  private wakeupCache: Map<string, string> = new Map()

  /**
   * Public cache invalidation. Called by `mempalace:set-identity` after the
   * user edits ~/.mempalace/identity.txt so the next chat session sees the
   * new identity instead of the stale cached version.
   */
  clearWakeupCache(): void {
    this.wakeupCache.clear()
  }

  /**
   * Layer 0 system-prompt prefix: identity (L0) + essential story (L1).
   * Returned text is ~600-1300 tokens depending on identity file size and
   * number of high-importance drawers in the palace.
   *
   * Cached per wing for the lifetime of the service instance — only the
   * first call per wing pays the subprocess cost.
   */
  async wakeUp(wing: string = 'superbrain'): Promise<string> {
    const cacheKey = wing || '__default__'
    const cached = this.wakeupCache.get(cacheKey)
    if (cached !== undefined) return cached

    try {
      const args = ['wake-up']
      if (wing) args.push('--wing', wing)
      const { stdout } = await execFileAsync(this.binaryPath, args, {
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      })
      // The CLI prints a "Wake-up text (~N tokens):\n====...\n<text>" preamble.
      // Strip the header so callers get clean prompt-ready text.
      const stripped = this.stripWakeupHeader(stdout)
      this.wakeupCache.set(cacheKey, stripped)
      return stripped
    } catch (err) {
      console.warn('[mempalace] wakeUp failed:', (err as Error).message)
      const empty = ''
      this.wakeupCache.set(cacheKey, empty)
      return empty
    }
  }

  /**
   * Semantic search over the palace. Returns up to `limit` results
   * sorted by similarity (highest first). Empty array on any failure.
   */
  async search(query: string, limit: number = 5): Promise<PalaceResult[]> {
    if (!query || query.trim().length < 2) return []

    try {
      const { stdout } = await execFileAsync(
        this.binaryPath,
        ['search', query],
        { timeout: 8_000, maxBuffer: 1024 * 1024 }
      )
      const parsed = this.parseSearchOutput(stdout)
      return parsed.slice(0, limit)
    } catch (err) {
      console.warn('[mempalace] search failed:', (err as Error).message)
      return []
    }
  }

  /**
   * Palace overview — total drawers and per-wing/room counts.
   * Used by the MemoryPalace.tsx page and the demo "show the palace" step.
   */
  async status(): Promise<PalaceStatus> {
    const empty: PalaceStatus = {
      totalDrawers: 0,
      wings: [],
      palacePath: this.palacePath,
    }

    try {
      const { stdout } = await execFileAsync(
        this.binaryPath,
        ['status'],
        { timeout: 5_000, maxBuffer: 256 * 1024 }
      )
      return this.parseStatusOutput(stdout)
    } catch (err) {
      console.warn('[mempalace] status failed:', (err as Error).message)
      return empty
    }
  }

  /**
   * File a new drawer (verbatim memory chunk). Used to auto-save chat
   * exchanges after each completed conversation turn.
   *
   * Implementation: spawn the venv Python with an inline ChromaDB script
   * (ADD_DRAWER_PY), pipe the content via stdin, pass wing/room as argv.
   * This bypasses `mempalace mine` because the miner auto-detects rooms
   * from keyword matching and won't honor an explicit room name.
   *
   * Silent failure: if Python or chromadb are missing, the chat continues
   * normally and a console warning is logged.
   *
   * Also clears the wakeup cache so the next wake-up call reflects new drawers.
   */
  private readonly pythonPath: string = path.join(
    os.homedir(),
    '.mempalace-venv',
    'bin',
    'python'
  )

  async addDrawer(content: string, wing: string, room: string): Promise<void> {
    if (!content || content.trim().length < 10) return

    const safeWing = wing || 'superbrain'
    const safeRoom = room || 'conversations'

    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(
          this.pythonPath,
          ['-c', ADD_DRAWER_PY, safeWing, safeRoom, 'superbrain-chat'],
          { timeout: 15_000 }
        )
        let stderr = ''
        proc.stderr.on('data', (d) => (stderr += d.toString()))
        proc.on('error', reject)
        proc.on('close', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`exit ${code}: ${stderr.substring(0, 200)}`))
        })
        proc.stdin.write(content)
        proc.stdin.end()
      })
      this.wakeupCache.clear()
    } catch (err) {
      console.warn('[mempalace] addDrawer failed:', (err as Error).message)
    }
  }

  // ── Parsers ────────────────────────────────────────────────────────────────

  /**
   * Strip the "Wake-up text (~N tokens):" preamble + separator line so
   * the returned string is ready to inject as a system-prompt prefix.
   */
  private stripWakeupHeader(raw: string): string {
    const lines = raw.split('\n')
    const headerIdx = lines.findIndex((l) => /^=+$/.test(l.trim()))
    if (headerIdx >= 0 && headerIdx < lines.length - 1) {
      return lines.slice(headerIdx + 1).join('\n').trim()
    }
    return raw.trim()
  }

  /**
   * Parse `mempalace search` stdout into structured results.
   *
   * Expected format per result block (after the header):
   *     [N] wing / room
   *         Source: <filename>
   *         Match:  0.655
   *
   *         <verbatim text indented 6 spaces>
   *         <may span multiple lines>
   *
   *       ────────────────────────────────...
   */
  private parseSearchOutput(stdout: string): PalaceResult[] {
    const results: PalaceResult[] = []

    // Split on "  [N] " marker. After split: [preamble, "1", block, "2", block, ...]
    const parts = stdout.split(/\n\s+\[(\d+)\]\s+/)
    for (let i = 1; i < parts.length; i += 2) {
      const block = parts[i + 1]
      if (!block) continue

      // First line: "wing / room"
      const headerMatch = block.match(/^([^\n]+)/)
      if (!headerMatch) continue
      const headerParts = headerMatch[1].split('/').map((s) => s.trim())
      const wing = headerParts[0] || 'unknown'
      const room = headerParts[1] || 'unknown'

      const sourceMatch = block.match(/Source:\s+(.+)/)
      const matchMatch = block.match(/Match:\s+([\d.]+)/)
      if (!sourceMatch || !matchMatch) continue

      // Snippet = everything after Match line, before the next "──" divider
      const afterMatch = block.split(/Match:\s+[\d.]+/)[1] || ''
      const beforeDivider = afterMatch.split(/─{3,}/)[0] || ''
      const snippet = beforeDivider
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join(' ')
        .substring(0, 500)

      results.push({
        title: sourceMatch[1].trim(),
        snippet,
        similarity: parseFloat(matchMatch[1]) || 0,
        room,
        wing,
      })
    }

    return results
  }

  /**
   * Parse `mempalace status` stdout into a PalaceStatus object.
   *
   * Expected format:
   *     ===...===
   *       MemPalace Status — 457 drawers
   *     ===...===
   *
   *       WING: superbrain
   *         ROOM: technical              299 drawers
   *         ROOM: architecture           147 drawers
   *         ...
   */
  private parseStatusOutput(stdout: string): PalaceStatus {
    const totalMatch = stdout.match(/MemPalace Status\s+[—-]\s+(\d+)\s+drawers/)
    const totalDrawers = totalMatch ? parseInt(totalMatch[1], 10) : 0

    const wings: PalaceWing[] = []
    const wingBlocks = stdout.split(/\n\s+WING:\s+/).slice(1)
    for (const block of wingBlocks) {
      const lines = block.split('\n')
      const wingName = (lines[0] || '').trim()
      if (!wingName) continue

      const rooms: PalaceRoom[] = []
      for (const line of lines.slice(1)) {
        const m = line.match(/ROOM:\s+(\S+)\s+(\d+)\s+drawers/)
        if (m) {
          rooms.push({ name: m[1], count: parseInt(m[2], 10) })
        }
      }
      wings.push({ name: wingName, rooms })
    }

    return {
      totalDrawers,
      wings,
      palacePath: this.palacePath,
    }
  }
}

// Singleton instance — import { mempalace } from '../../../lib/mempalace'
export const mempalace = new MempalaceService()
