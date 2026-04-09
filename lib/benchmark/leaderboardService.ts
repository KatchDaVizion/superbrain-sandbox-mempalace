/**
 * Leaderboard Service — submit scores and fetch rankings from Frankfurt.
 *
 * Privacy rules:
 * - Never sends: username, IP, wallet address, file paths
 * - anonymousId is a one-way sha256 hash — cannot be reversed
 * - Users can opt out via settings
 */

import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { BenchmarkResult } from './benchmarkService'

// ── Config ───────────────────────────────────────────────────────────────

const LEADERBOARD_URL = 'http://46.225.114.202:8401'
const SUBMIT_TIMEOUT = 10_000
const FETCH_TIMEOUT = 10_000
const CACHE_PATH = path.join(os.homedir(), '.superbrain', 'leaderboard-cache.json')

// ── Types ────────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
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

export interface LeaderboardData {
  entries: LeaderboardEntry[]
  totalMiners: number
  avgScore: number
  tierDistribution: Record<string, number>
  fetchedAt: string
}

export interface SubmitPayload {
  anonymousId: string
  score: number
  tier: string
  cpuCores: number
  ramGB: number
  ollamaModel: string
  tokensPerSec: number
  platform: string
  appVersion: string
  submittedAt: string
}

export interface UserRank {
  rank: number
  totalMiners: number
  percentile: number // "Top X%"
  betterThan: number // percentage of miners you beat
}

// ── Submit ───────────────────────────────────────────────────────────────

/**
 * Submit benchmark score to Frankfurt leaderboard.
 * Returns true if submitted successfully, false on network failure (graceful).
 */
export async function submitScore(result: BenchmarkResult): Promise<boolean> {
  const payload: SubmitPayload = {
    anonymousId: result.anonymousId,
    score: result.totalScore,
    tier: result.tier,
    cpuCores: result.cpuCores,
    ramGB: result.ramGB,
    ollamaModel: result.modelRecommendation.model,
    tokensPerSec: result.tokensPerSec,
    platform: result.platform,
    appVersion: result.appVersion,
    submittedAt: result.benchmarkedAt,
  }

  try {
    await axios.post(`${LEADERBOARD_URL}/benchmark/submit`, payload, {
      timeout: SUBMIT_TIMEOUT,
    })
    console.log('[Leaderboard] Score submitted successfully')
    return true
  } catch (error) {
    console.warn('[Leaderboard] Submit failed (offline?):', (error as Error).message)
    return false
  }
}

// ── Fetch ────────────────────────────────────────────────────────────────

/**
 * Fetch leaderboard from Frankfurt.
 * Falls back to cached data if network unavailable.
 */
export async function fetchLeaderboard(limit = 100): Promise<LeaderboardData> {
  try {
    const resp = await axios.get(`${LEADERBOARD_URL}/benchmark/leaderboard`, {
      params: { limit },
      timeout: FETCH_TIMEOUT,
    })

    // ── BUGFIX (2026-04-08) ────────────────────────────────────────────────
    // The API returns a bare JSON array `[{...}, {...}]`. Previous code did
    // `resp.data?.entries || resp.data || []`. Arrays in JS have a built-in
    // `.entries` METHOD (a function reference, truthy), so the OR-chain
    // resolved to that function — and `.length` on a function returns the
    // declared param count (0). Result: leaderboard always showed 0 entries
    // even though the server was returning data.
    //
    // Fix: explicitly check `Array.isArray` first. Then fall back to a
    // wrapped { entries: [...] } shape if the API ever changes.
    const raw = resp.data
    const entries: LeaderboardEntry[] = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.entries)
        ? raw.entries
        : []
    const totalMiners = Array.isArray(raw)
      ? raw.length
      : (typeof raw?.totalMiners === 'number' ? raw.totalMiners : entries.length)

    // Compute avgScore + tierDistribution client-side since the bare-array
    // API doesn't include them.
    const validScores = entries.filter((e) => typeof e?.score === 'number').map((e) => e.score)
    const avgScore = typeof raw?.avgScore === 'number'
      ? raw.avgScore
      : validScores.length > 0
        ? validScores.reduce((a, b) => a + b, 0) / validScores.length
        : 0
    const tierDistribution: Record<string, number> = raw?.tierDistribution && typeof raw.tierDistribution === 'object'
      ? raw.tierDistribution
      : entries.reduce((acc, e) => {
          if (e?.tier) acc[e.tier] = (acc[e.tier] || 0) + 1
          return acc
        }, {} as Record<string, number>)

    const data: LeaderboardData = {
      entries,
      totalMiners,
      avgScore,
      tierDistribution,
      fetchedAt: new Date().toISOString(),
    }

    // Cache it
    try {
      fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true })
      fs.writeFileSync(CACHE_PATH, JSON.stringify(data, null, 2))
    } catch {}

    return data
  } catch {
    // Fall back to cache
    return getCachedLeaderboard()
  }
}

/**
 * Get cached leaderboard data.
 */
export function getCachedLeaderboard(): LeaderboardData {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'))
    }
  } catch {}

  return {
    entries: [],
    totalMiners: 0,
    avgScore: 0,
    tierDistribution: {},
    fetchedAt: '',
  }
}

// ── Rank Calculation ─────────────────────────────────────────────────────

/**
 * Calculate user's rank within the leaderboard.
 */
export function calculateUserRank(userScore: number, leaderboard: LeaderboardData): UserRank {
  const entries = leaderboard.entries
  if (entries.length === 0) {
    return { rank: 1, totalMiners: 1, percentile: 1, betterThan: 100 }
  }

  // Entries are sorted descending by score
  const sorted = [...entries].sort((a, b) => b.score - a.score)
  let rank = sorted.findIndex((e) => e.score <= userScore)
  if (rank === -1) rank = sorted.length // user is last

  rank += 1 // 1-indexed
  const totalMiners = Math.max(sorted.length, leaderboard.totalMiners)
  const percentile = Math.max(1, Math.round((rank / totalMiners) * 100))
  const betterThan = Math.round((1 - rank / totalMiners) * 100)

  return { rank, totalMiners, percentile, betterThan }
}

/**
 * Fetch leaderboard stats (total miners, avg, distribution).
 */
export async function fetchStats(): Promise<{ totalMiners: number; avgScore: number; tierDistribution: Record<string, number> }> {
  try {
    const resp = await axios.get(`${LEADERBOARD_URL}/benchmark/stats`, {
      timeout: FETCH_TIMEOUT,
    })
    return resp.data
  } catch {
    return { totalMiners: 0, avgScore: 0, tierDistribution: {} }
  }
}
