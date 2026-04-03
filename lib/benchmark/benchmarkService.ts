/**
 * SuperBrain Hardware Benchmark Service
 *
 * Scores the user's hardware in ~30 seconds across 4 dimensions:
 * CPU (20%), RAM (25%), Storage (15%), Ollama (40%).
 * Returns a composite score 0-1000, miner tier, TAO estimate, and model recommendation.
 */

import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import axios from 'axios'

// ── Types ────────────────────────────────────────────────────────────────

export type MinerTier = 'OBSERVER' | 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND'

export interface SubScore {
  name: string
  score: number     // 0-1000
  details: string
  durationMs: number
}

export interface TaoEstimate {
  minTaoPerDay: number
  maxTaoPerDay: number
  taoPrice: number
  minUsdPerDay: number
  maxUsdPerDay: number
  source: 'coingecko' | 'fallback'
  disclaimer: string
}

export interface ModelRecommendation {
  model: string
  reason: string
  expectedTokPerSec: number
}

export interface BenchmarkResult {
  cpu: SubScore
  ram: SubScore
  storage: SubScore
  ollama: SubScore
  totalScore: number
  tier: MinerTier
  tierIcon: string
  taoEstimate: TaoEstimate
  modelRecommendation: ModelRecommendation
  anonymousId: string
  platform: string
  cpuCores: number
  cpuModel: string
  ramGB: number
  ollamaModels: string[]
  tokensPerSec: number
  appVersion: string
  benchmarkedAt: string
  totalDurationMs: number
}

// ── Constants ────────────────────────────────────────────────────────────

const FALLBACK_TAO_PRICE = 307
const BENCHMARK_CACHE_PATH = path.join(os.homedir(), '.superbrain', 'benchmark.json')

const TIER_THRESHOLDS: Array<{ min: number; tier: MinerTier; icon: string }> = [
  { min: 950, tier: 'DIAMOND', icon: '\u{1F48E}' },
  { min: 850, tier: 'PLATINUM', icon: '\u{1F947}' },
  { min: 700, tier: 'GOLD', icon: '\u{1F3C6}' },
  { min: 500, tier: 'SILVER', icon: '\u{1F948}' },
  { min: 300, tier: 'BRONZE', icon: '\u{1F949}' },
  { min: 0, tier: 'OBSERVER', icon: '\u{1F441}\u{FE0F}' },
]

const TAO_RANGES: Record<MinerTier, [number, number]> = {
  OBSERVER: [0, 0],
  BRONZE: [0.008, 0.015],
  SILVER: [0.025, 0.045],
  GOLD: [0.050, 0.090],
  PLATINUM: [0.095, 0.150],
  DIAMOND: [0.155, 0.250],
}

// ── CPU Benchmark ────────────────────────────────────────────────────────

function benchmarkCPU(): SubScore {
  const start = performance.now()

  // 10,000 matrix multiplications (3x3 matrices, pure JS compute)
  const size = 3
  for (let iter = 0; iter < 10000; iter++) {
    const a: number[][] = []
    const b: number[][] = []
    const c: number[][] = []
    for (let i = 0; i < size; i++) {
      a[i] = []
      b[i] = []
      c[i] = []
      for (let j = 0; j < size; j++) {
        a[i][j] = Math.random()
        b[i][j] = Math.random()
        c[i][j] = 0
      }
    }
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        for (let k = 0; k < size; k++) {
          c[i][j] += a[i][k] * b[k][j]
        }
      }
    }
  }

  const timeMs = performance.now() - start
  let score = Math.min(1000, Math.round(10_000_000 / timeMs))

  // Core count bonus
  const cores = os.cpus().length
  if (cores >= 8) score = Math.min(1000, score + 50)
  else if (cores >= 4) score = Math.min(1000, score + 25)

  const cpuModel = os.cpus()[0]?.model || 'Unknown'

  return {
    name: 'CPU',
    score,
    details: `${cpuModel} (${cores} cores), ${Math.round(timeMs)}ms compute`,
    durationMs: Math.round(timeMs),
  }
}

// ── RAM Benchmark ────────────────────────────────────────────────────────

function benchmarkRAM(): SubScore {
  const start = performance.now()
  const totalGB = Math.round(os.totalmem() / (1024 ** 3) * 10) / 10
  const freeGB = Math.round(os.freemem() / (1024 ** 3) * 10) / 10

  let score: number
  if (totalGB >= 32) score = 1000
  else if (totalGB >= 16) score = 850
  else if (totalGB >= 8) score = 650
  else if (totalGB >= 4) score = 400
  else score = 200

  // Penalty if < 2GB free
  if (freeGB < 2) score = Math.max(0, score - 100)

  const durationMs = performance.now() - start

  return {
    name: 'RAM',
    score,
    details: `${totalGB}GB total, ${freeGB}GB free`,
    durationMs: Math.round(durationMs),
  }
}

// ── Storage Benchmark ────────────────────────────────────────────────────

function benchmarkStorage(): SubScore {
  const start = performance.now()
  const testDir = path.join(os.homedir(), '.superbrain')
  fs.mkdirSync(testDir, { recursive: true })
  const testFile = path.join(testDir, '.bench_write_test')

  let score: number
  let writeSpeedMBps = 0

  try {
    // Write 50MB test file
    const data = Buffer.alloc(50 * 1024 * 1024, 0x42) // 50MB of 'B'
    const writeStart = performance.now()
    fs.writeFileSync(testFile, data)
    const writeMs = performance.now() - writeStart
    writeSpeedMBps = Math.round((50 / (writeMs / 1000)) * 10) / 10

    score = Math.min(1000, Math.round(writeSpeedMBps * 20))

    // SSD bonus (write speed > 200MB/s is almost certainly SSD)
    if (writeSpeedMBps > 200) score = Math.min(1000, score + 100)
  } catch {
    score = 300 // Can't benchmark — assume mediocre
    writeSpeedMBps = 0
  } finally {
    try { fs.unlinkSync(testFile) } catch {}
  }

  // Free space check
  let freeSpaceGB = 0
  try {
    const stats = fs.statfsSync(testDir)
    freeSpaceGB = Math.round((stats.bfree * stats.bsize) / (1024 ** 3) * 10) / 10
    if (freeSpaceGB < 10) score = Math.max(0, score - 200)
  } catch {}

  const durationMs = performance.now() - start

  return {
    name: 'Storage',
    score,
    details: `${writeSpeedMBps}MB/s write, ${freeSpaceGB}GB free`,
    durationMs: Math.round(durationMs),
  }
}

// ── Ollama Benchmark ─────────────────────────────────────────────────────

async function benchmarkOllama(): Promise<SubScore> {
  const start = performance.now()

  // Check if Ollama is running
  let models: string[] = []
  try {
    const resp = await axios.get('http://localhost:11434/api/tags', { timeout: 5000 })
    models = (resp.data?.models || []).map((m: any) => m.name || m.model)
  } catch {
    return {
      name: 'Ollama',
      score: 0,
      details: 'Ollama not running — install at ollama.com',
      durationMs: Math.round(performance.now() - start),
    }
  }

  if (models.length === 0) {
    return {
      name: 'Ollama',
      score: 50,
      details: 'Ollama running but no models installed',
      durationMs: Math.round(performance.now() - start),
    }
  }

  // Find smallest available model for benchmark
  const benchModel = models.find((m) => m.includes('0.5b')) ||
    models.find((m) => m.includes('tinyllama')) ||
    models.find((m) => m.includes('1b')) ||
    models.find((m) => !m.includes('embed')) || models[0]

  // Run inference benchmark
  let tokensPerSec = 0
  let score = 0
  try {
    const inferStart = performance.now()
    const resp = await axios.post(
      'http://localhost:11434/api/generate',
      {
        model: benchModel,
        prompt: 'Reply with exactly 20 words about the Sun. Be concise.',
        stream: false,
        options: { num_predict: 40 },
      },
      { timeout: 30000 }
    )
    const inferMs = performance.now() - inferStart
    const responseText = resp.data?.response || ''
    const tokenCount = responseText.split(/\s+/).length // approximate
    tokensPerSec = Math.round((tokenCount / (inferMs / 1000)) * 10) / 10

    score = Math.min(1000, Math.round(tokensPerSec * 100))
  } catch (err) {
    score = 100
  }

  // Model availability bonus
  const hasLargeModel = models.some((m) => /7b|8b|13b|14b|32b|70b/i.test(m))
  const hasMedModel = models.some((m) => /3b|4b/i.test(m))
  const hasSmallPlus = models.some((m) => /1\.5b|1b/i.test(m) && !m.includes('embed'))

  if (hasLargeModel) score = Math.min(1000, score + 200)
  else if (hasMedModel) score = Math.min(1000, score + 100)
  else if (hasSmallPlus) score = Math.min(1000, score + 50)

  const durationMs = performance.now() - start

  return {
    name: 'Ollama',
    score,
    details: `${tokensPerSec} tok/s (${benchModel}), ${models.length} model(s)`,
    durationMs: Math.round(durationMs),
  }
}

// ── Composite Scoring ────────────────────────────────────────────────────

function getTier(score: number): { tier: MinerTier; icon: string } {
  for (const t of TIER_THRESHOLDS) {
    if (score >= t.min) return { tier: t.tier, icon: t.icon }
  }
  return { tier: 'OBSERVER', icon: '\u{1F441}\u{FE0F}' }
}

function getModelRecommendation(score: number, ramGB: number): ModelRecommendation {
  if (score >= 900 && ramGB >= 16)
    return { model: 'qwen2.5:14b', reason: 'Your hardware handles large models easily', expectedTokPerSec: 8 }
  if (score >= 800 && ramGB >= 8)
    return { model: 'qwen2.5:7b', reason: 'Strong hardware — high quality inference', expectedTokPerSec: 5 }
  if (score >= 600 && ramGB >= 6)
    return { model: 'qwen2.5:3b', reason: 'Good balance of speed and quality', expectedTokPerSec: 8 }
  if (score >= 400 && ramGB >= 4)
    return { model: 'qwen2.5:1.5b', reason: 'Best model for your RAM budget', expectedTokPerSec: 12 }
  return { model: 'qwen2.5:0.5b', reason: 'Minimum viable model for your hardware', expectedTokPerSec: 18 }
}

async function fetchTaoPrice(): Promise<{ price: number; source: 'coingecko' | 'fallback' }> {
  try {
    const resp = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=bittensor&vs_currencies=usd',
      { timeout: 5000 }
    )
    const price = resp.data?.bittensor?.usd
    if (price && price > 0) return { price, source: 'coingecko' }
  } catch {}
  return { price: FALLBACK_TAO_PRICE, source: 'fallback' }
}

// ── Public API ───────────────────────────────────────────────────────────

export type BenchmarkProgress = {
  stage: 'cpu' | 'ram' | 'storage' | 'ollama' | 'scoring'
  progress: number // 0-100
  message: string
}

/**
 * Run the full hardware benchmark.
 * onProgress callback fires as each stage completes.
 */
export async function runBenchmark(
  onProgress?: (p: BenchmarkProgress) => void
): Promise<BenchmarkResult> {
  const totalStart = performance.now()

  onProgress?.({ stage: 'cpu', progress: 5, message: 'Testing CPU compute speed...' })
  const cpu = benchmarkCPU()
  onProgress?.({ stage: 'cpu', progress: 25, message: `CPU: ${cpu.score}/1000` })

  onProgress?.({ stage: 'ram', progress: 30, message: 'Checking RAM...' })
  const ram = benchmarkRAM()
  onProgress?.({ stage: 'ram', progress: 40, message: `RAM: ${ram.score}/1000` })

  onProgress?.({ stage: 'storage', progress: 45, message: 'Testing storage write speed...' })
  const storage = benchmarkStorage()
  onProgress?.({ stage: 'storage', progress: 60, message: `Storage: ${storage.score}/1000` })

  onProgress?.({ stage: 'ollama', progress: 65, message: 'Benchmarking Ollama inference...' })
  const ollama = await benchmarkOllama()
  onProgress?.({ stage: 'ollama', progress: 90, message: `Ollama: ${ollama.score}/1000` })

  onProgress?.({ stage: 'scoring', progress: 95, message: 'Computing final score...' })

  // Composite score (weighted)
  const totalScore = Math.round(
    cpu.score * 0.20 +
    ram.score * 0.25 +
    storage.score * 0.15 +
    ollama.score * 0.40
  )

  const { tier, icon } = getTier(totalScore)
  const ramGB = Math.round(os.totalmem() / (1024 ** 3) * 10) / 10
  const rec = getModelRecommendation(totalScore, ramGB)

  // TAO estimate
  const { price: taoPrice, source: priceSource } = await fetchTaoPrice()
  const [minTao, maxTao] = TAO_RANGES[tier]

  const taoEstimate: TaoEstimate = {
    minTaoPerDay: minTao,
    maxTaoPerDay: maxTao,
    taoPrice,
    minUsdPerDay: Math.round(minTao * taoPrice * 100) / 100,
    maxUsdPerDay: Math.round(maxTao * taoPrice * 100) / 100,
    source: priceSource,
    disclaimer: 'Estimated testnet projection — mainnet emissions will vary based on network competition and TAO price. Not financial advice.',
  }

  // Extract tokens/sec from ollama details
  const tokMatch = ollama.details.match(/([\d.]+)\s*tok\/s/)
  const tokensPerSec = tokMatch ? parseFloat(tokMatch[1]) : 0

  // Anonymous ID (privacy-safe one-way hash)
  const cpuModel = os.cpus()[0]?.model || 'unknown'
  const anonymousId = crypto
    .createHash('sha256')
    .update(os.hostname() + cpuModel)
    .digest('hex')
    .slice(0, 16)

  const ollamaModels = ollama.details.match(/(\d+) model/)
    ? [] // parsed from details
    : []

  // Try to get actual model list
  let modelList: string[] = []
  try {
    const resp = await axios.get('http://localhost:11434/api/tags', { timeout: 3000 })
    modelList = (resp.data?.models || []).map((m: any) => m.name || m.model)
  } catch {}

  const result: BenchmarkResult = {
    cpu,
    ram,
    storage,
    ollama,
    totalScore,
    tier,
    tierIcon: icon,
    taoEstimate,
    modelRecommendation: rec,
    anonymousId,
    platform: os.platform() === 'darwin' ? 'mac' : os.platform() === 'win32' ? 'windows' : 'linux',
    cpuCores: os.cpus().length,
    cpuModel,
    ramGB,
    ollamaModels: modelList,
    tokensPerSec,
    appVersion: '12.0.0',
    benchmarkedAt: new Date().toISOString(),
    totalDurationMs: Math.round(performance.now() - totalStart),
  }

  // Cache result to disk
  try {
    fs.mkdirSync(path.dirname(BENCHMARK_CACHE_PATH), { recursive: true })
    fs.writeFileSync(BENCHMARK_CACHE_PATH, JSON.stringify(result, null, 2))
  } catch {}

  onProgress?.({ stage: 'scoring', progress: 100, message: 'Benchmark complete!' })

  return result
}

/**
 * Get cached benchmark result (from last run).
 */
export function getCachedBenchmark(): BenchmarkResult | null {
  try {
    if (!fs.existsSync(BENCHMARK_CACHE_PATH)) return null
    const data = fs.readFileSync(BENCHMARK_CACHE_PATH, 'utf-8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

/**
 * Get all tier thresholds for display.
 */
export function getTierInfo(): Array<{ min: number; tier: MinerTier; icon: string; taoRange: [number, number] }> {
  return TIER_THRESHOLDS.map((t) => ({
    ...t,
    taoRange: TAO_RANGES[t.tier],
  }))
}
