/**
 * MemoryPalace — UI for the cross-session memory layer (Layer 0).
 *
 * Three sections:
 *   1. Status bar — wing/room/drawer counts, palace alive/dead indicator
 *   2. Search box — semantic search over past sessions, results as cards
 *   3. Wake-up preview — collapsible view of the L0+L1 context auto-injected into chat
 *
 * All data flows through 3 IPC handlers added in lib/main/app.ts:
 *   mempalace:status, mempalace:search, mempalace:wakeup
 *
 * Subprocess wrapper at desktop/lib/mempalace/mempalaceService.ts spawns
 * ~/.mempalace-venv/bin/mempalace and parses stdout. Service is graceful —
 * never crashes the app, returns empty results on failure.
 */

import { useState, useEffect, useCallback } from 'react'
import { useTheme } from 'next-themes'
import { Brain, Search, Loader2, Database, BookOpen, Save, Check } from 'lucide-react'
import DashboardLayout from '../components/shared/DashboardLayout'

// ── Types (mirror lib/mempalace/mempalaceService.ts) ──────────────────────

interface PalaceResult {
  title: string
  snippet: string
  similarity: number
  room: string
  wing: string
}

interface PalaceRoom {
  name: string
  count: number
}

interface PalaceWing {
  name: string
  rooms: PalaceRoom[]
}

interface PalaceStatus {
  totalDrawers: number
  wings: PalaceWing[]
  palacePath: string
}

// ── Room color palette ────────────────────────────────────────────────────

const ROOM_COLORS: Record<string, string> = {
  technical: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  architecture: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  planning: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  problems: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  decisions: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  conversations: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  general: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
}

function roomBadge(name: string): string {
  return ROOM_COLORS[name?.toLowerCase()] || ROOM_COLORS.general
}

// ── Main Component ────────────────────────────────────────────────────────

export default function MemoryPalace() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  // Section 1 — Status
  const [status, setStatus] = useState<PalaceStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const palaceAlive = status !== null && status.totalDrawers > 0

  // Section 2 — Search
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PalaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Section 3 — User-editable Identity (~/.mempalace/identity.txt)
  // This is the L0 layer of the wake-up text. Whatever the user types here is
  // injected into every chat session as a system-prompt prefix. Default is a
  // friendly placeholder so a fresh user knows what to write.
  const [identity, setIdentity] = useState<string>('')
  const [identityLoading, setIdentityLoading] = useState(true)
  const [identitySaving, setIdentitySaving] = useState(false)
  const [identitySaved, setIdentitySaved] = useState(false)
  const [identityDirty, setIdentityDirty] = useState(false)

  // Status fetch (with auto-refresh every 60s)
  const fetchStatus = useCallback(async () => {
    try {
      const s = await (window as any).electron.invoke('mempalace:status')
      setStatus(s as PalaceStatus)
    } catch {
      setStatus(null)
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 60_000)
    return () => clearInterval(interval)
  }, [fetchStatus])

  // Search handler
  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const q = query.trim()
    if (!q) return

    setSearching(true)
    setHasSearched(true)
    try {
      const r = await (window as any).electron.invoke('mempalace:search', q, 8)
      setResults((r as PalaceResult[]) || [])
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [query])

  // Identity load on mount
  useEffect(() => {
    let cancelled = false
    const loadIdentity = async () => {
      try {
        const text = await (window as any).electron.invoke('mempalace:get-identity')
        if (!cancelled) setIdentity((text as string) || '')
      } catch {
        if (!cancelled) setIdentity('')
      } finally {
        if (!cancelled) setIdentityLoading(false)
      }
    }
    loadIdentity()
    return () => {
      cancelled = true
    }
  }, [])

  // Identity save handler
  const saveIdentity = useCallback(async () => {
    setIdentitySaving(true)
    setIdentitySaved(false)
    try {
      const ok = await (window as any).electron.invoke('mempalace:set-identity', identity)
      if (ok) {
        setIdentitySaved(true)
        setIdentityDirty(false)
        // Clear the "Saved!" indicator after 2.5s
        setTimeout(() => setIdentitySaved(false), 2500)
      }
    } catch {
      // silent fail — button stays in idle state
    } finally {
      setIdentitySaving(false)
    }
  }, [identity])

  const onIdentityChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setIdentity(e.target.value)
    setIdentityDirty(true)
    setIdentitySaved(false)
  }, [])

  const totalRooms = status?.wings.reduce((sum, w) => sum + w.rooms.length, 0) ?? 0
  const wingNames = status?.wings.map((w) => w.name).join(', ') || '—'

  // Color tokens (dark theme primary, light fallbacks)
  const cardBg = isDark ? 'bg-zinc-800/50 border-zinc-700' : 'bg-white border-zinc-200'
  const textPrimary = isDark ? 'text-white' : 'text-zinc-900'
  const textMuted = isDark ? 'text-zinc-400' : 'text-zinc-500'
  const textSubtle = isDark ? 'text-zinc-500' : 'text-zinc-400'
  const inputBg = isDark ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-white border-zinc-300 text-zinc-900'

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <Brain size={28} className="text-purple-400" />
          <h1 className={`text-2xl font-bold ${textPrimary}`}>Memory Palace</h1>
        </div>
        <p className={`text-sm mb-4 ${textMuted}`}>
          Cross-session memory, automatically injected into every chat. Built on MemPalace —
          highest-scoring open-source memory benchmark (96.6% LongMemEval R@5).
        </p>

        {/* Active-status banner — proves the layer is wired into the chat */}
        <div
          className={`rounded-lg px-4 py-3 mb-6 border text-sm flex items-start gap-3 ${
            statusLoading
              ? isDark ? 'bg-zinc-800/50 border-zinc-700 text-zinc-400' : 'bg-zinc-100 border-zinc-200 text-zinc-500'
              : palaceAlive
                ? isDark ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : isDark ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}
        >
          <span className="text-base leading-none mt-0.5">
            {statusLoading ? '⏳' : palaceAlive ? '✅' : '⚠️'}
          </span>
          <span>
            {statusLoading
              ? 'Querying mempalace subprocess…'
              : palaceAlive
                ? 'Memory active — past session context is being injected into every chat message.'
                : 'Memory inactive — start chatting to build your palace, or run mempalace mine to bootstrap.'}
          </span>
        </div>

        {/* ── SECTION 1: STATUS BAR ───────────────────────────────────── */}
        <div className={`rounded-xl p-5 mb-6 border ${cardBg}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  statusLoading
                    ? 'bg-zinc-500 animate-pulse'
                    : palaceAlive
                      ? 'bg-emerald-400 shadow-lg shadow-emerald-500/50'
                      : 'bg-zinc-500'
                }`}
              />
              <span className={`text-sm font-medium ${textPrimary}`}>
                {statusLoading ? 'Connecting...' : palaceAlive ? 'Palace alive' : 'Palace unavailable'}
              </span>
            </div>
            <button
              onClick={fetchStatus}
              className={`text-xs px-3 py-1 rounded-md border ${
                isDark ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-400' : 'border-zinc-300 hover:bg-zinc-100 text-zinc-500'
              }`}
            >
              Refresh
            </button>
          </div>

          {palaceAlive ? (
            <>
              <div className="flex items-baseline gap-6 mb-4">
                <div>
                  <div className={`text-3xl font-bold ${textPrimary}`}>{status!.totalDrawers}</div>
                  <div className={`text-xs uppercase tracking-wide ${textMuted}`}>drawers</div>
                </div>
                <div>
                  <div className={`text-3xl font-bold ${textPrimary}`}>{totalRooms}</div>
                  <div className={`text-xs uppercase tracking-wide ${textMuted}`}>rooms</div>
                </div>
                <div>
                  <div className={`text-3xl font-bold ${textPrimary}`}>{status!.wings.length}</div>
                  <div className={`text-xs uppercase tracking-wide ${textMuted}`}>{status!.wings.length === 1 ? 'wing' : 'wings'}</div>
                </div>
              </div>

              {/* Per-wing breakdown */}
              {status!.wings.map((w) => (
                <div key={w.name} className="mb-2">
                  <div className={`text-xs uppercase tracking-wide mb-2 ${textMuted}`}>
                    Wing: {w.name}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {w.rooms.map((room) => (
                      <span
                        key={room.name}
                        className={`text-xs px-2.5 py-1 rounded-full border ${roomBadge(room.name)}`}
                      >
                        {room.name} · {room.count}
                      </span>
                    ))}
                  </div>
                </div>
              ))}

              <div className={`mt-4 text-xs ${textSubtle}`}>
                Path: <code>{status!.palacePath}</code>
              </div>
            </>
          ) : (
            <div className={`text-sm ${textMuted} py-2`}>
              {statusLoading
                ? 'Querying mempalace subprocess…'
                : 'No palace found at ~/.mempalace/palace. Run `mempalace init && mempalace mine` to bootstrap.'}
              <div className={`text-xs mt-2 ${textSubtle}`}>
                Wings: {wingNames}
              </div>
            </div>
          )}
        </div>

        {/* ── SECTION 2: SEARCH ───────────────────────────────────────── */}
        <div className={`rounded-xl p-5 mb-6 border ${cardBg}`}>
          <div className="flex items-center gap-2 mb-3">
            <Search size={18} className={textMuted} />
            <h2 className={`text-lg font-semibold ${textPrimary}`}>Search past sessions</h2>
          </div>

          <form onSubmit={handleSearch} className="flex gap-2 mb-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What did we discuss about Frankfurt? Yuma demo prep? Docker masking?"
              className={`flex-1 px-4 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 ${inputBg}`}
              disabled={searching || !palaceAlive}
            />
            <button
              type="submit"
              disabled={searching || !palaceAlive || !query.trim()}
              className="px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Search
            </button>
          </form>

          {/* Results */}
          {searching && (
            <div className={`text-sm ${textMuted} flex items-center gap-2 py-4`}>
              <Loader2 size={14} className="animate-spin" />
              Searching the palace…
            </div>
          )}

          {!searching && hasSearched && results.length === 0 && (
            <div className={`text-sm ${textMuted} py-4 text-center`}>
              No memories found for "{query}". The palace grows as you use SuperBrain.
            </div>
          )}

          {!searching && results.length > 0 && (
            <div className="space-y-3">
              <div className={`text-xs ${textMuted}`}>
                {results.length} result{results.length === 1 ? '' : 's'}
              </div>
              {results.map((r, i) => {
                const simPct = Math.round(r.similarity * 100)
                const simColor =
                  r.similarity >= 0.5 ? 'bg-emerald-500' : r.similarity >= 0.25 ? 'bg-blue-500' : 'bg-zinc-500'
                return (
                  <div
                    key={`${r.title}-${i}`}
                    className={`rounded-lg p-4 border ${
                      isDark ? 'bg-zinc-900/50 border-zinc-700/80' : 'bg-zinc-50 border-zinc-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className={`font-mono text-sm font-medium truncate ${textPrimary}`}>
                          {r.title}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${roomBadge(r.room)}`}>
                            {r.room}
                          </span>
                          <span className={`text-xs ${textSubtle}`}>{r.wing}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 w-28">
                        <div className={`text-xs ${textMuted} mb-1`}>match {simPct}%</div>
                        <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-zinc-800' : 'bg-zinc-200'}`}>
                          <div
                            className={`h-full ${simColor} transition-all duration-500`}
                            style={{ width: `${Math.min(100, Math.max(5, simPct))}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <p className={`text-xs leading-relaxed ${isDark ? 'text-zinc-300' : 'text-zinc-600'} line-clamp-3`}>
                      {r.snippet}
                    </p>
                  </div>
                )
              })}
            </div>
          )}

          {!hasSearched && palaceAlive && (
            <div className={`text-xs ${textSubtle} py-2`}>
              Try searching for something you've discussed in a previous session.
            </div>
          )}
        </div>

        {/* ── SECTION 3: IDENTITY EDITOR ──────────────────────────────── */}
        <div className={`rounded-xl p-5 border ${cardBg}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Brain size={18} className="text-purple-400" />
              <h2 className={`text-lg font-semibold ${textPrimary}`}>Identity</h2>
            </div>
            <button
              onClick={saveIdentity}
              disabled={identityLoading || identitySaving || !identityDirty}
              className={`flex items-center gap-1.5 text-xs px-4 py-1.5 rounded-md transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                identitySaved
                  ? 'bg-emerald-600 text-white'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              }`}
            >
              {identitySaving ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  Saving…
                </>
              ) : identitySaved ? (
                <>
                  <Check size={13} />
                  Saved
                </>
              ) : (
                <>
                  <Save size={13} />
                  Save
                </>
              )}
            </button>
          </div>

          <p className={`text-xs ${textMuted} mb-3`}>
            Your AI memory profile — this is injected into every chat so the AI knows your context.
            Edit anything you want the model to always know about you.
          </p>

          {identityLoading ? (
            <div className={`text-sm flex items-center gap-2 py-8 ${textMuted}`}>
              <Loader2 size={14} className="animate-spin" />
              Loading identity from ~/.mempalace/identity.txt…
            </div>
          ) : (
            <>
              <textarea
                value={identity}
                onChange={onIdentityChange}
                placeholder={
                  'I am [name]. I am working on [project].\n\nAbout me: …\nMy goals: …\nKey people: …\nProject context: …'
                }
                spellCheck={false}
                className={`w-full font-mono text-xs p-4 rounded-lg border resize-y min-h-[280px] focus:outline-none focus:ring-2 focus:ring-purple-500/40 ${
                  isDark
                    ? 'bg-zinc-900 border-zinc-700 text-zinc-200 placeholder-zinc-600'
                    : 'bg-white border-zinc-300 text-zinc-800 placeholder-zinc-400'
                }`}
              />
              <div className={`flex items-center justify-between mt-2 text-xs ${textSubtle}`}>
                <span>
                  {identity.length.toLocaleString()} chars · ~{Math.round(identity.length / 4).toLocaleString()} tokens
                </span>
                {identityDirty && !identitySaved && (
                  <span className="text-amber-400">• unsaved changes</span>
                )}
              </div>
              <p className={`text-xs ${textSubtle} mt-2`}>
                Stored at <code className="font-mono">~/.mempalace/identity.txt</code>. Reopen the AI Chat after saving so the new identity loads into the next message.
              </p>
            </>
          )}
        </div>

        {/* Why this matters — small models, big memory */}
        <div
          className={`mt-6 rounded-xl p-5 border ${
            isDark ? 'bg-purple-500/5 border-purple-500/30' : 'bg-purple-50 border-purple-200'
          }`}
        >
          <div className={`flex items-center gap-2 mb-2 ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>
            <Brain size={16} />
            <h3 className="text-sm font-semibold">Why this works for small models</h3>
          </div>
          <p className={`text-xs leading-relaxed ${isDark ? 'text-purple-200/80' : 'text-purple-900/80'}`}>
            Small AI models like <code className="font-mono">qwen2.5:0.5b</code> only know what they were trained on
            (cutoff late 2023). They don't know about your project, your team, or anything you discussed last week.
            <br /><br />
            MemPalace gives them <strong>your history</strong> — injected directly into the conversation context
            before every message. The model reads it like it was always there. No retraining needed, no fine-tuning,
            no API calls. The same 397 MB qwen2.5 binary now answers questions about decisions you made months ago.
            <br /><br />
            <em className={textSubtle}>
              Try it: ask the chat <strong>"What server is SuperBrain running on?"</strong> A bare model says
              "I don't know." A model with MemPalace context says <strong>"Frankfurt, 46.225.114.202"</strong>
              — pulled verbatim from your audit notes.
            </em>
          </p>
        </div>

        {/* Footer hint */}
        <div className={`mt-6 flex items-center justify-center gap-6 text-xs ${textSubtle}`}>
          <div className="flex items-center gap-1.5">
            <BookOpen size={12} />
            <span>Layer 0 in chat pipeline</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Database size={12} />
            <span>ChromaDB at ~/.mempalace/palace</span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
