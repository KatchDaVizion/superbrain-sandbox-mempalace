/**
 * Leaderboard — Top 100 SN442 miners ranked by hardware score.
 */

import { useState, useEffect, useCallback } from 'react'
import { useTheme } from 'next-themes'
import DashboardLayout from './shared/DashboardLayout'

// ── Types ────────────────────────────────────────────────────────────────

interface LeaderboardEntry {
  rank: number
  anonymousId: string
  score: number
  tier: string
  platform: string
  tokensPerSec: number
  cpuCores: number
  ramGB: number
  submittedAt: string
}

interface LeaderboardData {
  entries: LeaderboardEntry[]
  totalMiners: number
  avgScore: number
  tierDistribution: Record<string, number>
  fetchedAt: string
}

type FilterMode = 'all' | 'my-tier' | 'my-platform'

const TIER_ICONS: Record<string, string> = {
  DIAMOND: '\u{1F48E}',
  PLATINUM: '\u{1F947}',
  GOLD: '\u{1F3C6}',
  SILVER: '\u{1F948}',
  BRONZE: '\u{1F949}',
  OBSERVER: '\u{1F441}\u{FE0F}',
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

// ── Main Component ───────────────────────────────────────────────────────

export default function Leaderboard() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const [data, setData] = useState<LeaderboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterMode>('all')
  const [myAnonymousId, setMyAnonymousId] = useState<string | null>(null)
  const [myTier, setMyTier] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [lb, cached] = await Promise.all([
        (window as any).electron.invoke('benchmark:leaderboard'),
        (window as any).electron.invoke('benchmark:cached'),
      ])
      setData(lb)
      if (cached) {
        setMyAnonymousId(cached.anonymousId)
        setMyTier(cached.tier)
      }
    } catch (err) {
      console.error('Failed to load leaderboard:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(refresh, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [refresh])

  const entries = data?.entries || []
  const platform = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac') ? 'mac' : 'linux'

  const filtered = entries.filter((e) => {
    if (filter === 'my-tier' && myTier) return e.tier === myTier
    if (filter === 'my-platform') return e.platform === platform
    return true
  })

  return (
    <DashboardLayout>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              SN442 Leaderboard
            </h1>
            <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {data ? `${data.totalMiners} registered miners` : 'Loading...'}
              {data?.avgScore ? ` \u{2022} Avg score: ${Math.round(data.avgScore)}` : ''}
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              isDark ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            } ${loading ? 'opacity-50' : ''}`}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          {(['all', 'my-tier', 'my-platform'] as FilterMode[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : isDark
                    ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
              }`}
            >
              {f === 'all' ? 'All Miners' : f === 'my-tier' ? `My Tier${myTier ? ` (${myTier})` : ''}` : 'My Platform'}
            </button>
          ))}
        </div>

        {/* Table */}
        {filtered.length === 0 && !loading ? (
          <div className={`rounded-xl p-8 text-center ${isDark ? 'bg-zinc-800/50' : 'bg-zinc-50'}`}>
            <p className={isDark ? 'text-zinc-400' : 'text-zinc-500'}>
              {entries.length === 0
                ? 'No scores submitted yet. Run a benchmark to be the first!'
                : 'No miners match this filter.'}
            </p>
          </div>
        ) : (
          <div className={`rounded-xl overflow-hidden border ${isDark ? 'border-zinc-700' : 'border-zinc-200'}`}>
            <table className="w-full">
              <thead>
                <tr className={isDark ? 'bg-zinc-800' : 'bg-zinc-50'}>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Rank</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Tier</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Score</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Platform</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Tok/s</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, i) => {
                  const isMe = myAnonymousId && entry.anonymousId === myAnonymousId
                  return (
                    <tr
                      key={entry.anonymousId + i}
                      className={`border-t ${
                        isMe
                          ? isDark ? 'bg-yellow-900/20 border-yellow-800/30' : 'bg-yellow-50 border-yellow-200'
                          : isDark ? 'border-zinc-700/50 hover:bg-zinc-800/50' : 'border-zinc-100 hover:bg-zinc-50'
                      }`}
                    >
                      <td className={`px-4 py-3 text-sm font-mono ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>
                        #{entry.rank}{isMe ? ' \u{2B50}' : ''}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {TIER_ICONS[entry.tier] || ''} {entry.tier}
                      </td>
                      <td className={`px-4 py-3 text-sm font-bold ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                        {entry.score}
                      </td>
                      <td className={`px-4 py-3 text-sm capitalize ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        {entry.platform}
                      </td>
                      <td className={`px-4 py-3 text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                        {entry.tokensPerSec}
                      </td>
                      <td className={`px-4 py-3 text-sm ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                        {entry.submittedAt ? timeAgo(entry.submittedAt) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {data?.fetchedAt && (
          <p className={`text-xs mt-3 text-center ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
            Last updated: {new Date(data.fetchedAt).toLocaleTimeString()}
          </p>
        )}
      </div>
    </DashboardLayout>
  )
}
