/**
 * Benchmark — Hardware scoring + TAO earnings estimator.
 *
 * States: IDLE → RUNNING (animated) → COMPLETE (results card) → ERROR
 */

import { useState, useCallback, useEffect } from 'react'
import { useTheme } from 'next-themes'
import DashboardLayout from './shared/DashboardLayout'

// ── Types (mirror main-process types) ────────────────────────────────────

interface SubScore {
  name: string
  score: number
  details: string
  durationMs: number
}

interface TaoEstimate {
  minTaoPerDay: number
  maxTaoPerDay: number
  taoPrice: number
  minUsdPerDay: number
  maxUsdPerDay: number
  source: string
  disclaimer: string
}

interface ModelRecommendation {
  model: string
  reason: string
  expectedTokPerSec: number
}

interface BenchmarkResult {
  cpu: SubScore
  ram: SubScore
  storage: SubScore
  ollama: SubScore
  totalScore: number
  tier: string
  tierIcon: string
  taoEstimate: TaoEstimate
  modelRecommendation: ModelRecommendation
  tokensPerSec: number
  totalDurationMs: number
  benchmarkedAt: string
}

interface BenchmarkProgress {
  stage: string
  progress: number
  message: string
}

interface UserRank {
  rank: number
  totalMiners: number
  percentile: number
  betterThan: number
}

type BenchState = 'idle' | 'running' | 'complete' | 'error'

// ── Tier Colors ──────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  DIAMOND: 'from-cyan-400 to-blue-500',
  PLATINUM: 'from-gray-300 to-gray-500',
  GOLD: 'from-yellow-400 to-amber-500',
  SILVER: 'from-gray-300 to-gray-400',
  BRONZE: 'from-orange-400 to-orange-600',
  OBSERVER: 'from-zinc-500 to-zinc-600',
}

// ── Score Bar ────────────────────────────────────────────────────────────

function ScoreBar({ label, score, icon }: { label: string; score: number; icon: string }) {
  const pct = Math.round((score / 1000) * 100)
  const color = score >= 800 ? 'bg-green-500' : score >= 500 ? 'bg-blue-500' : score >= 300 ? 'bg-yellow-500' : 'bg-red-500'

  return (
    <div className="flex items-center gap-3">
      <span className="text-lg w-6">{icon}</span>
      <span className="w-20 text-sm font-medium">{label}</span>
      <div className="flex-1 h-3 rounded-full bg-zinc-700 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-1000 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-20 text-right text-sm font-mono">{score}/1000</span>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────

export default function Benchmark() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const [state, setState] = useState<BenchState>('idle')
  const [progress, setProgress] = useState<BenchmarkProgress | null>(null)
  const [result, setResult] = useState<BenchmarkResult | null>(null)
  const [userRank, setUserRank] = useState<UserRank | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const runBenchmark = useCallback(async () => {
    setState('running')
    setProgress({ stage: 'cpu', progress: 0, message: 'Initializing...' })
    setError(null)
    setSubmitted(false)

    try {
      // Listen for progress events
      const progressHandler = (_e: any, data: BenchmarkProgress) => {
        setProgress(data)
      }

      if ((window as any).electron?.ipcRenderer) {
        (window as any).electron.ipcRenderer.on('benchmark:progress', progressHandler)
      }

      const benchResult = await (window as any).electron.invoke('benchmark:run')
      setResult(benchResult)
      setState('complete')

      // Try to submit and get rank
      try {
        const submitResult = await (window as any).electron.invoke('benchmark:submit', benchResult)
        setSubmitted(submitResult)

        const rank = await (window as any).electron.invoke('benchmark:rank', benchResult.totalScore)
        setUserRank(rank)
      } catch {
        // Offline — no rank available
      }

      if ((window as any).electron?.ipcRenderer) {
        (window as any).electron.ipcRenderer.removeListener('benchmark:progress', progressHandler)
      }
    } catch (err) {
      setError((err as Error).message)
      setState('error')
    }
  }, [])

  const loadCached = useCallback(async () => {
    try {
      const cached = await (window as any).electron.invoke('benchmark:cached')
      if (cached && cached.cpu && cached.ram && cached.storage && cached.ollama) {
        setResult(cached)
        setState('complete')
      }
    } catch {}
  }, [])

  // Load cached result on mount
  useEffect(() => { loadCached() }, [loadCached])

  const gradient = result ? TIER_COLORS[result.tier] || TIER_COLORS.OBSERVER : ''

  return (
    <DashboardLayout>
      <div className="p-6 max-w-2xl mx-auto">
        <h1 className={`text-2xl font-bold mb-2 ${isDark ? 'text-white' : 'text-zinc-900'}`}>
          Hardware Benchmark
        </h1>
        <p className={`text-sm mb-6 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
          Score your hardware in 30 seconds. See how much TAO you can earn on Subnet 442.
        </p>

        {/* ── IDLE STATE ── */}
        {state === 'idle' && (
          <div className={`rounded-xl p-8 text-center ${isDark ? 'bg-zinc-800/50 border border-zinc-700' : 'bg-white border border-zinc-200'}`}>
            <div className="text-5xl mb-4">{'\u{26A1}'}</div>
            <h2 className={`text-xl font-semibold mb-2 ${isDark ? 'text-white' : 'text-zinc-900'}`}>
              Ready to benchmark?
            </h2>
            <p className={`text-sm mb-6 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Tests CPU, RAM, storage speed, and Ollama inference. Takes about 30 seconds.
            </p>
            <button
              onClick={runBenchmark}
              className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
            >
              Run Benchmark
            </button>
          </div>
        )}

        {/* ── RUNNING STATE ── */}
        {state === 'running' && progress && (
          <div className={`rounded-xl p-8 ${isDark ? 'bg-zinc-800/50 border border-zinc-700' : 'bg-white border border-zinc-200'}`}>
            <div className="mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span className={isDark ? 'text-zinc-300' : 'text-zinc-600'}>{progress.message}</span>
                <span className={isDark ? 'text-zinc-400' : 'text-zinc-500'}>{progress.progress}%</span>
              </div>
              <div className={`w-full h-3 rounded-full ${isDark ? 'bg-zinc-700' : 'bg-zinc-200'}`}>
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
            </div>

            <div className="space-y-2">
              {['cpu', 'ram', 'storage', 'ollama'].map((stage) => {
                const isActive = progress.stage === stage
                const isDone = ['cpu', 'ram', 'storage', 'ollama'].indexOf(stage) <
                  ['cpu', 'ram', 'storage', 'ollama'].indexOf(progress.stage)
                return (
                  <div
                    key={stage}
                    className={`flex items-center gap-2 text-sm ${
                      isActive
                        ? isDark ? 'text-blue-400' : 'text-blue-600'
                        : isDone
                          ? isDark ? 'text-green-400' : 'text-green-600'
                          : isDark ? 'text-zinc-500' : 'text-zinc-400'
                    }`}
                  >
                    <span>{isDone ? '\u{2705}' : isActive ? '\u{23F3}' : '\u{25CB}'}</span>
                    <span className="capitalize">{stage === 'ollama' ? 'Ollama Inference' : stage}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── COMPLETE STATE ── */}
        {state === 'complete' && result && (
          <div className="space-y-4">
            {/* Main Score Card */}
            <div className={`rounded-xl p-6 border-2 ${isDark ? 'bg-zinc-800/80' : 'bg-white'}`}
              style={{
                borderImage: `linear-gradient(135deg, ${gradient.includes('cyan') ? '#22d3ee, #3b82f6' : gradient.includes('yellow') ? '#facc15, #f59e0b' : gradient.includes('gray-3') ? '#d1d5db, #6b7280' : gradient.includes('orange') ? '#fb923c, #ea580c' : '#71717a, #52525b'}) 1`,
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm text-zinc-400 uppercase tracking-wide">SuperBrain Hardware Score</div>
                  <div className={`text-4xl font-bold mt-1 ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                    {result.totalScore} <span className="text-lg text-zinc-400">/ 1000</span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-4xl">{result.tierIcon}</div>
                  <div className={`text-sm font-bold mt-1 ${isDark ? 'text-zinc-200' : 'text-zinc-700'}`}>
                    {result.tier} MINER
                  </div>
                </div>
              </div>

              {/* Sub-scores */}
              <div className="space-y-3 mb-6">
                <ScoreBar label="CPU" score={result.cpu.score} icon={'\u{1F4BB}'} />
                <ScoreBar label="RAM" score={result.ram.score} icon={'\u{1F9E0}'} />
                <ScoreBar label="Storage" score={result.storage.score} icon={'\u{1F4BE}'} />
                <ScoreBar label="Ollama" score={result.ollama.score} icon={'\u{26A1}'} />
              </div>

              {/* Details */}
              <div className={`space-y-1 text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                <div>{result.cpu.details}</div>
                <div>{result.ram.details}</div>
                <div>{result.storage.details}</div>
                <div>{result.ollama.details}</div>
              </div>
            </div>

            {/* TAO Earnings Card */}
            <div className={`rounded-xl p-6 ${isDark ? 'bg-zinc-800/50 border border-zinc-700' : 'bg-white border border-zinc-200'}`}>
              <h3 className={`text-lg font-semibold mb-3 ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                Estimated TAO Earnings
              </h3>

              {result.tier === 'OBSERVER' ? (
                <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  Your hardware score is below the mining threshold. You can still query the network and use local AI.
                  Upgrade your Ollama setup to start mining.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className={`text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>TAO per day</div>
                      <div className={`text-xl font-bold ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                        {result.taoEstimate.minTaoPerDay} – {result.taoEstimate.maxTaoPerDay}
                      </div>
                    </div>
                    <div>
                      <div className={`text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>USD per day</div>
                      <div className={`text-xl font-bold ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                        ~${result.taoEstimate.minUsdPerDay} – ${result.taoEstimate.maxUsdPerDay}
                      </div>
                    </div>
                  </div>

                  <div className={`text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    TAO price: ${result.taoEstimate.taoPrice} ({result.taoEstimate.source})
                  </div>
                </>
              )}

              <div className={`mt-3 p-3 rounded-lg text-xs ${isDark ? 'bg-zinc-900 text-zinc-500' : 'bg-zinc-50 text-zinc-400'}`}>
                {result.taoEstimate.disclaimer}
              </div>
            </div>

            {/* Recommendation + Rank Card */}
            <div className={`rounded-xl p-6 ${isDark ? 'bg-zinc-800/50 border border-zinc-700' : 'bg-white border border-zinc-200'}`}>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h4 className={`text-sm font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    Best Model For You
                  </h4>
                  <div className={`text-lg font-bold text-green-500`}>
                    {result.modelRecommendation.model}
                  </div>
                  <div className={`text-xs mt-1 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    {result.modelRecommendation.reason}
                  </div>
                  <div className={`text-xs mt-1 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    ~{result.modelRecommendation.expectedTokPerSec} tok/sec expected
                  </div>
                </div>

                <div>
                  <h4 className={`text-sm font-medium mb-1 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    Your Rank
                  </h4>
                  {userRank ? (
                    <>
                      <div className={`text-lg font-bold ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                        Top {userRank.percentile}%
                      </div>
                      <div className={`text-xs ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                        #{userRank.rank} of {userRank.totalMiners} miners
                      </div>
                    </>
                  ) : (
                    <div className={`text-sm ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      {submitted ? 'Score submitted anonymously' : 'Leaderboard unavailable (offline)'}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={runBenchmark}
                className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium ${
                  isDark
                    ? 'bg-zinc-700 text-zinc-200 hover:bg-zinc-600'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                }`}
              >
                Re-run Benchmark
              </button>
            </div>

            <div className={`text-xs text-center ${isDark ? 'text-zinc-600' : 'text-zinc-400'}`}>
              Completed in {((result.totalDurationMs || 0) / 1000).toFixed(1)}s on {result.benchmarkedAt?.split('T')[0] || 'N/A'}
            </div>
          </div>
        )}

        {/* ── ERROR STATE ── */}
        {state === 'error' && (
          <div className={`rounded-xl p-8 text-center ${isDark ? 'bg-red-900/20 border border-red-800' : 'bg-red-50 border border-red-200'}`}>
            <div className="text-4xl mb-4">{'\u{26A0}\u{FE0F}'}</div>
            <h2 className={`text-lg font-semibold mb-2 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
              Benchmark Failed
            </h2>
            <p className={`text-sm mb-4 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
              {error || 'An unexpected error occurred'}
            </p>
            <button
              onClick={runBenchmark}
              className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
