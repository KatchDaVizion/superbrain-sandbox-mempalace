import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Rss, RefreshCcw, ArrowUp, AlertCircle } from 'lucide-react'
import { useTheme } from 'next-themes'
import DashboardLayout from '../components/shared/DashboardLayout'
import { SB_SEED_NODE } from '../config/api'

const POLL_MS = 10_000
const LIMIT = 50

interface FeedChunk {
  id: string
  title: string
  category: string
  preview: string
  hotkey: string
  timestamp: number
  source: string
  node: string
}

interface FeedResponse {
  chunks: FeedChunk[]
  total: number
  chunks_today: number
  last_updated: number
}

const groupKey = (raw: string): string => {
  if (!raw) return 'general'
  return raw.split('_')[0] || 'general'
}

const prettyLabel = (raw: string): string => {
  if (!raw || raw.toLowerCase() === 'all') return raw
  const specials: Record<string, string> = {
    ARXIV: 'arXiv',
    YOUTUBE: 'YouTube',
    HACKERNEWS: 'Hacker News',
    STACKOVERFLOW: 'Stack Overflow',
    PYPI: 'PyPI',
    CVE: 'CVE',
    RSS: 'RSS',
    GITHUB: 'GitHub',
    REDDIT: 'Reddit',
    CODING: 'Coding',
    WIKIPEDIA: 'Wikipedia',
    PUBMED: 'PubMed',
    BITCOIN: 'Bitcoin',
    HUGGINGFACE: 'Hugging Face',
    GOVERNMENT: 'Government',
    CANADA: 'Canada',
    DOCS: 'Docs',
    GENERAL: 'General',
    TEST: 'Test',
  }
  const parts = raw.split('_')
  return parts.map(p => specials[p.toUpperCase()] ?? (p[0] + p.slice(1).toLowerCase())).join(' · ')
}

const truncateHotkey = (hk: string): string => {
  if (!hk) return '—'
  if (hk.includes('...') || hk.includes('…')) return hk
  if (hk.length <= 16) return hk
  return `${hk.slice(0, 8)}…${hk.slice(-6)}`
}

const relativeTime = (ts: number): string => {
  if (!ts) return ''
  const sec = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  if (sec < 5) return 'just now'
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

const Feed: React.FC = () => {
  const { resolvedTheme } = useTheme()

  const [visibleItems, setVisibleItems] = useState<FeedChunk[]>([])
  const [pendingItems, setPendingItems] = useState<FeedChunk[]>([])
  const [category, setCategory] = useState<string>('all')
  const [availableCategories, setAvailableCategories] = useState<string[]>(['all'])
  const [stats, setStats] = useState<{ total: number; chunks_today: number } | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [, forceTick] = useState(0)

  const seenIdsRef = useRef<Set<string>>(new Set())
  const firstLoadRef = useRef<boolean>(true)

  const fetchFeed = useCallback(async () => {
    try {
      const q = new URLSearchParams({ limit: String(LIMIT) })
      if (category !== 'all') q.set('category', category)
      const resp = await fetch(`${SB_SEED_NODE}/feed?${q.toString()}`, {
        signal: AbortSignal.timeout(8000),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const data = (await resp.json()) as FeedResponse
      const chunks = Array.isArray(data.chunks) ? data.chunks : []

      setStats({
        total: typeof data.total === 'number' ? data.total : 0,
        chunks_today: typeof data.chunks_today === 'number' ? data.chunks_today : 0,
      })

      setAvailableCategories(prev => {
        const next = new Set<string>(prev)
        next.add('all')
        for (const c of chunks) next.add(groupKey(c.category || 'general'))
        return Array.from(next)
      })

      if (firstLoadRef.current) {
        for (const c of chunks) seenIdsRef.current.add(c.id)
        setVisibleItems(chunks)
        firstLoadRef.current = false
        setLoading(false)
        setError(null)
        return
      }

      const fresh = chunks.filter(c => !seenIdsRef.current.has(c.id))
      if (fresh.length > 0) {
        for (const c of fresh) seenIdsRef.current.add(c.id)
        setPendingItems(prev => [...fresh, ...prev].slice(0, LIMIT))
      }
      setError(null)
    } catch (e: any) {
      setError(e?.message || 'Failed to load feed')
    } finally {
      setLoading(false)
    }
  }, [category])

  useEffect(() => {
    firstLoadRef.current = true
    seenIdsRef.current = new Set()
    setVisibleItems([])
    setPendingItems([])
    setLoading(true)
    fetchFeed()
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      fetchFeed()
    }, POLL_MS)
    return () => clearInterval(id)
  }, [category, fetchFeed])

  useEffect(() => {
    const tick = setInterval(() => forceTick(n => n + 1), 30_000)
    return () => clearInterval(tick)
  }, [])

  const mergePending = () => {
    if (pendingItems.length === 0) return
    setVisibleItems(prev => [...pendingItems, ...prev].slice(0, LIMIT))
    setPendingItems([])
  }

  const categoryPills = useMemo<string[]>(() => {
    const seen = new Set<string>(['all'])
    for (const c of availableCategories) seen.add(c)
    return Array.from(seen)
  }, [availableCategories])

  const newCount = pendingItems.length

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${resolvedTheme === 'dark' ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
            <Rss className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Live Feed</h1>
            <p className="text-sm text-muted-foreground">
              Real-time knowledge chunks validated on Bittensor Subnet 442
            </p>
          </div>
        </div>
        <button
          onClick={fetchFeed}
          className={`p-2 rounded-lg border transition-colors ${
            resolvedTheme === 'dark'
              ? 'border-gray-600 hover:border-blue-400 hover:bg-blue-500/10'
              : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
          }`}
          aria-label="Refresh feed"
        >
          <RefreshCcw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {categoryPills.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              category === c
                ? 'bg-blue-600 text-white border-blue-600'
                : resolvedTheme === 'dark'
                  ? 'bg-card/50 border-border text-muted-foreground hover:border-blue-400'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-blue-400'
            }`}
          >
            {c === 'all' ? 'All' : prettyLabel(c)}
          </button>
        ))}
        {stats && (
          <span className="text-xs text-muted-foreground ml-auto">
            {stats.chunks_today.toLocaleString()} today / {stats.total.toLocaleString()} total
          </span>
        )}
      </div>

      {newCount > 0 && (
        <button
          type="button"
          onClick={mergePending}
          className="w-full mb-3 px-4 py-2.5 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
        >
          <ArrowUp className="w-4 h-4" />
          {newCount} new chunk{newCount === 1 ? '' : 's'} — click to show
        </button>
      )}

      {loading && visibleItems.length === 0 && (
        <div className="text-center py-8">
          <div className="inline-flex items-center gap-2 text-muted-foreground">
            <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Loading the live feed…
          </div>
        </div>
      )}

      {error && (
        <div
          className={`p-4 rounded-xl border mb-4 flex items-center gap-2 ${
            resolvedTheme === 'dark' ? 'bg-red-950/20 border-red-800 text-red-300' : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {!loading && visibleItems.length === 0 && !error && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No chunks in this category yet. Try "All" or wait for the next wave.
        </div>
      )}

      <div className="space-y-3">
        {visibleItems.map(c => (
          <div
            key={c.id}
            className={`p-4 rounded-xl border transition-colors ${
              resolvedTheme === 'dark'
                ? 'bg-card/50 border-border hover:border-blue-400/40'
                : 'bg-white border-gray-200 shadow-sm hover:border-blue-300'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/10 text-blue-500 font-medium whitespace-nowrap">
                {prettyLabel(groupKey(c.category || 'general'))}
              </span>
              <span
                className="text-xs text-muted-foreground whitespace-nowrap"
                title={new Date(c.timestamp * 1000).toISOString()}
              >
                {relativeTime(c.timestamp)}
              </span>
            </div>

            <div className="font-medium mb-1.5 leading-tight line-clamp-2">{c.title || '(untitled)'}</div>

            {c.preview && (
              <div className="text-sm text-muted-foreground mb-3 line-clamp-3">{c.preview}</div>
            )}

            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground pt-2 border-t border-border/40">
              <span className="font-mono truncate" title={c.hotkey}>
                {truncateHotkey(c.hotkey)}
              </span>
              <span className="whitespace-nowrap">{c.node || 'sn442'}</span>
            </div>
          </div>
        ))}
      </div>
    </DashboardLayout>
  )
}

export default Feed
