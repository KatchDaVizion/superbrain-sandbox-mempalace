import DashboardLayout from '../components/shared/DashboardLayout'
import { useTheme } from 'next-themes'
import { useState, useEffect, useCallback } from 'react'
import {
  Coins,
  CheckCircle,
  Pencil,
  RefreshCw,
  Send,
  X,
  Activity,
  Database,
  TrendingUp,
  Target,
} from 'lucide-react'

const SN442_API = 'http://46.225.114.202:8400'

interface EarningsChunk {
  id: string
  content_preview: string
  title: string
  privacy: string
  retrieval_count: number
  shared_at: number | string
  estimated_tao: number
}

interface EarningsData {
  hotkey: string
  chunks: EarningsChunk[]
  total_chunks: number
  total_retrievals: number
  estimated_tao: number
  error?: string
}

interface ValidatorRound {
  step: number
  S: number
  R: number
  N: number
  L: number
  final: number
}

interface ValidatorLog {
  ema_score: number
  rounds: ValidatorRound[]
}

const Earnings = () => {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark'

  const [hotkey, setHotkey] = useState('')
  const [hotkeyInput, setHotkeyInput] = useState('')
  const [editing, setEditing] = useState(false)
  const [earnings, setEarnings] = useState<EarningsData | null>(null)
  const [validatorLog, setValidatorLog] = useState<ValidatorLog | null>(null)
  const [loading, setLoading] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareContent, setShareContent] = useState('')
  const [shareTitle, setShareTitle] = useState('')
  const [sharing, setSharing] = useState(false)
  const [shareResult, setShareResult] = useState<string | null>(null)
  const [shareIsFlag, setShareIsFlag] = useState(false)
  const [meshPeers, setMeshPeers] = useState<number>(0)

  // Load hotkey from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sb_contributor_hotkey')
    if (saved) {
      setHotkey(saved)
      setHotkeyInput(saved)
    }
  }, [])

  // Live mesh peer count — initial fetch + push updates from main process
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const stats = await (window as any).electron.invoke('mesh:status')
        if (stats && typeof stats.peers === 'number') setMeshPeers(stats.peers)
      } catch { /* mesh unavailable — keep 0 */ }
    }
    fetchStats()
    const interval = setInterval(fetchStats, 30000)

    const onUpdate = (_: unknown, stats: { peers: number }) => {
      if (stats && typeof stats.peers === 'number') setMeshPeers(stats.peers)
    }
    const electron = (window as any).electron
    if (electron?.on) electron.on('mesh:status-update', onUpdate)

    return () => {
      clearInterval(interval)
      if (electron?.removeListener) electron.removeListener('mesh:status-update', onUpdate)
    }
  }, [])

  // Fetch earnings when hotkey changes — use IPC bridge for Electron security
  const fetchEarnings = useCallback(async () => {
    if (!hotkey) return
    setLoading(true)
    try {
      const data = await window.electron.invoke('earnings:get', hotkey)
      setEarnings(data)
    } catch {
      setEarnings({ hotkey, chunks: [], total_chunks: 0, total_retrievals: 0, estimated_tao: 0, error: 'Frankfurt unreachable' })
    } finally {
      setLoading(false)
    }
  }, [hotkey])

  useEffect(() => {
    fetchEarnings()
  }, [fetchEarnings])

  // Fetch validator log on mount + every 15s
  const fetchValidatorLog = useCallback(async () => {
    try {
      const resp = await fetch(`${SN442_API}/validator-log`, { signal: AbortSignal.timeout(10000) })
      const data = await resp.json()
      setValidatorLog(data)
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    fetchValidatorLog()
    const interval = setInterval(fetchValidatorLog, 15000)
    return () => clearInterval(interval)
  }, [fetchValidatorLog])

  const saveHotkey = () => {
    const trimmed = hotkeyInput.trim()
    if (trimmed) {
      localStorage.setItem('sb_contributor_hotkey', trimmed)
      setHotkey(trimmed)
      setEditing(false)
    }
  }

  const handleShare = async () => {
    if (!shareContent.trim()) return
    setSharing(true)
    setShareResult(null)
    setShareIsFlag(false)
    try {
      const data = await window.electron.invoke(
        'earnings:share-with-hotkey',
        shareContent.trim(),
        shareTitle.trim() || shareContent.trim().substring(0, 50),
        hotkey,
      )
      if (data.success) {
        // Frankfurt accepted. Now check the mesh layer.
        if (data.mesh_flag) {
          // Mesh flagged the chunk — Frankfurt still has it, but tell the user
          // why the direct-peer broadcast didn't go out.
          setShareIsFlag(true)
          setShareResult(`✅ Frankfurt: ${data.chunk_id} · ⚠️ Mesh flag (${data.mesh_flag.reason}): ${data.mesh_flag.explanation}`)
        } else if (data.mesh_success) {
          setShareResult(`✅ Shared to Frankfurt + ${data.mesh_peers_reached} direct peer${data.mesh_peers_reached === 1 ? '' : 's'} · chunk_id: ${data.chunk_id}`)
        } else {
          // Mesh is offline / no peers — Frankfurt POST is still authoritative
          setShareResult(`✅ Shared to Frankfurt · chunk_id: ${data.chunk_id}`)
        }
        setShareContent('')
        setShareTitle('')
        setTimeout(() => {
          setShowShareModal(false)
          setShareResult(null)
          setShareIsFlag(false)
          fetchEarnings()
        }, 4000)
      } else {
        setShareResult(`Error: ${data.message}`)
      }
    } catch {
      setShareResult('Failed to reach Frankfurt')
    } finally {
      setSharing(false)
    }
  }

  const truncate = (s: string, n: number) => (s.length > n ? s.substring(0, n) + '...' : s)

  const formatDate = (ts: number | string) => {
    if (!ts) return '-'
    const d = new Date(typeof ts === 'number' ? ts * 1000 : ts)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const avgScore =
    validatorLog && validatorLog.rounds.length > 0
      ? validatorLog.rounds.slice(0, 10).reduce((s, r) => s + r.final, 0) / Math.min(validatorLog.rounds.length, 10)
      : 0

  const scoreColor = avgScore > 0.5 ? 'text-green-400' : avgScore >= 0.3 ? 'text-yellow-400' : 'text-red-400'

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full w-full max-w-5xl mx-auto">
        <div className="mb-8 mt-4">
          <h1 className={`text-3xl font-bold mb-2 ${dark ? 'text-white' : 'text-gray-900'}`}>
            <Coins className="inline-block w-7 h-7 mr-2 -mt-1" />
            My Earnings
          </h1>
          <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-600'}`}>
            Track your knowledge contributions and TAO earnings on SN442
          </p>
        </div>

        {/* ── SECTION 1: WALLET SETUP ── */}
        <div className={`rounded-lg border p-5 mb-6 ${dark ? 'bg-card border-border' : 'bg-white border-gray-200'}`}>
          <h2 className={`text-sm font-semibold mb-3 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
            Wallet Connection
          </h2>

          {hotkey && !editing ? (
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
              <span className={`text-sm font-mono ${dark ? 'text-green-300' : 'text-green-700'}`}>
                {truncate(hotkey, 16)}...{hotkey.slice(-8)}
              </span>
              <button
                onClick={() => setEditing(true)}
                className={`p-1.5 rounded-md transition-colors ${dark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={hotkeyInput}
                onChange={(e) => setHotkeyInput(e.target.value)}
                placeholder="5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"
                className={`flex-1 px-3 py-2 rounded-md text-sm font-mono border ${
                  dark
                    ? 'bg-background border-border text-white placeholder:text-gray-600'
                    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400'
                }`}
                onKeyDown={(e) => e.key === 'Enter' && saveHotkey()}
              />
              <button
                onClick={saveHotkey}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
              >
                Save
              </button>
              {editing && (
                <button
                  onClick={() => { setEditing(false); setHotkeyInput(hotkey) }}
                  className={`px-3 py-2 text-sm rounded-md border ${dark ? 'border-border text-gray-400 hover:bg-gray-800' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
                >
                  Cancel
                </button>
              )}
            </div>
          )}
          <p className={`text-xs mt-2 ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
            Your public Bittensor hotkey (ss58 address). Never enter your seed phrase here.
          </p>
        </div>

        {/* ── SECTION 3: EARNINGS CARDS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            {
              label: 'Chunks Shared',
              value: earnings?.total_chunks ?? '-',
              icon: Database,
              color: 'text-blue-400',
            },
            {
              label: 'Total Retrievals',
              value: earnings?.total_retrievals ?? '-',
              icon: TrendingUp,
              color: 'text-purple-400',
            },
            {
              label: 'Estimated TAO',
              value: earnings ? `~${earnings.estimated_tao} τ` : '-',
              icon: Coins,
              color: 'text-yellow-400',
              sub: 'testnet — mainnet earnings will be real',
            },
            {
              label: 'Network Score',
              value: avgScore > 0 ? avgScore.toFixed(3) : '-',
              icon: Target,
              color: scoreColor,
            },
          ].map((card) => (
            <div
              key={card.label}
              className={`rounded-lg border p-4 ${dark ? 'bg-card border-border' : 'bg-white border-gray-200'}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <card.icon className={`w-4 h-4 ${card.color}`} />
                <span className={`text-xs font-medium ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                  {card.label}
                </span>
              </div>
              <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
              {card.sub && (
                <p className={`text-xs mt-1 ${dark ? 'text-gray-600' : 'text-gray-400'}`}>{card.sub}</p>
              )}
            </div>
          ))}
        </div>

        {/* ── SECTION 2: KNOWLEDGE CHUNKS TABLE ── */}
        <div className={`rounded-lg border mb-6 ${dark ? 'bg-card border-border' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className={`text-sm font-semibold ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
              Your Knowledge Chunks
            </h2>
            <div className="flex gap-2">
              <button
                onClick={fetchEarnings}
                disabled={loading || !hotkey}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  dark ? 'border-border text-gray-400 hover:bg-gray-800' : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                } disabled:opacity-40`}
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={() => setShowShareModal(true)}
                disabled={!hotkey}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-40"
              >
                <Send className="w-3 h-3" />
                Share Knowledge
              </button>
            </div>
          </div>
          <div className={`mt-2 text-[11px] ${dark ? 'text-cyan-400/70' : 'text-cyan-700/70'}`}>
            🌐 {meshPeers} direct {meshPeers === 1 ? 'peer' : 'peers'} online via Hyperswarm mesh
          </div>

          <div className="overflow-x-auto">
            {!hotkey ? (
              <div className={`p-8 text-center text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                Connect your wallet above to track earnings
              </div>
            ) : loading ? (
              <div className={`p-8 text-center text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                Loading...
              </div>
            ) : !earnings || earnings.chunks.length === 0 ? (
              <div className={`p-8 text-center text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                {earnings?.error
                  ? `Error: ${earnings.error}`
                  : 'You have not shared any knowledge yet. Use sb share or the Share button above.'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${dark ? 'border-border' : 'border-gray-200'}`}>
                    {['Chunk ID', 'Content', 'Date', 'Retrievals', 'Est. TAO'].map((h) => (
                      <th
                        key={h}
                        className={`text-left px-4 py-2 text-xs font-semibold ${dark ? 'text-gray-500' : 'text-gray-400'}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {earnings.chunks.map((chunk) => (
                    <tr
                      key={chunk.id}
                      className={`border-b last:border-0 ${dark ? 'border-border hover:bg-gray-800/30' : 'border-gray-100 hover:bg-gray-50'}`}
                    >
                      <td className={`px-4 py-2.5 font-mono text-xs ${dark ? 'text-blue-400' : 'text-blue-600'}`}>
                        {chunk.id.substring(0, 8)}
                      </td>
                      <td className={`px-4 py-2.5 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                        {truncate(chunk.content_preview, 60)}
                      </td>
                      <td className={`px-4 py-2.5 text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                        {formatDate(chunk.shared_at)}
                      </td>
                      <td className={`px-4 py-2.5 text-center ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                        {chunk.retrieval_count}
                      </td>
                      <td className={`px-4 py-2.5 font-mono text-xs ${dark ? 'text-yellow-400' : 'text-yellow-600'}`}>
                        {chunk.estimated_tao} τ
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── SECTION 4: LIVE VALIDATOR FEED ── */}
        <div className={`rounded-lg border mb-8 ${dark ? 'bg-card border-border' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-green-400 animate-pulse" />
              <h2 className={`text-sm font-semibold ${dark ? 'text-gray-300' : 'text-gray-700'}`}>
                SN442 Validator — scoring knowledge every ~12 seconds
              </h2>
            </div>
            {validatorLog && (
              <span
                className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  validatorLog.ema_score >= 0.5
                    ? 'bg-green-900/40 text-green-400 border border-green-700/40'
                    : validatorLog.ema_score >= 0.3
                      ? 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/40'
                      : 'bg-red-900/40 text-red-400 border border-red-700/40'
                }`}
              >
                EMA: {validatorLog.ema_score}
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            {!validatorLog ? (
              <div className={`p-6 text-center text-sm ${dark ? 'text-gray-500' : 'text-gray-400'}`}>
                Connecting to validator...
              </div>
            ) : (
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className={`border-b ${dark ? 'border-border' : 'border-gray-200'}`}>
                    {['Step', 'S (40%)', 'R (25%)', 'N (20%)', 'L (15%)', 'Final'].map((h) => (
                      <th
                        key={h}
                        className={`text-left px-4 py-2 text-xs font-semibold ${dark ? 'text-gray-500' : 'text-gray-400'}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {validatorLog.rounds.slice(0, 5).map((round, i) => (
                    <tr
                      key={round.step}
                      className={`border-b last:border-0 ${i === 0 ? (dark ? 'bg-blue-950/20' : 'bg-blue-50/50') : ''} ${dark ? 'border-border' : 'border-gray-100'}`}
                    >
                      <td className={`px-4 py-2 ${dark ? 'text-blue-400' : 'text-blue-600'}`}>{round.step}</td>
                      <td className={`px-4 py-2 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{round.S}</td>
                      <td className={`px-4 py-2 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{round.R}</td>
                      <td className={`px-4 py-2 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{round.N}</td>
                      <td className={`px-4 py-2 ${dark ? 'text-gray-300' : 'text-gray-700'}`}>{round.L}</td>
                      <td
                        className={`px-4 py-2 font-bold ${
                          round.final >= 0.5
                            ? 'text-green-400'
                            : round.final >= 0.3
                              ? 'text-yellow-400'
                              : 'text-red-400'
                        }`}
                      >
                        {round.final}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── SHARE MODAL ── */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div
            className={`w-full max-w-lg rounded-xl border p-6 shadow-2xl ${
              dark ? 'bg-card border-border' : 'bg-white border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-semibold ${dark ? 'text-white' : 'text-gray-900'}`}>
                Share Knowledge to SN442
              </h3>
              <button
                onClick={() => { setShowShareModal(false); setShareResult(null) }}
                className={`p-1 rounded-md ${dark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <input
              type="text"
              value={shareTitle}
              onChange={(e) => setShareTitle(e.target.value)}
              placeholder="Title (optional)"
              className={`w-full px-3 py-2 mb-3 rounded-md text-sm border ${
                dark
                  ? 'bg-background border-border text-white placeholder:text-gray-600'
                  : 'bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400'
              }`}
            />

            <textarea
              value={shareContent}
              onChange={(e) => setShareContent(e.target.value)}
              placeholder="Enter the knowledge you want to share to the SN442 network..."
              rows={5}
              className={`w-full px-3 py-2 mb-3 rounded-md text-sm border resize-none ${
                dark
                  ? 'bg-background border-border text-white placeholder:text-gray-600'
                  : 'bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400'
              }`}
            />

            <div className={`text-xs mb-4 p-3 rounded-md border ${dark ? 'bg-yellow-950/30 border-yellow-700/30 text-yellow-400' : 'bg-yellow-50 border-yellow-200 text-yellow-700'}`}>
              Sharing to the network is <strong>permanent</strong>. Content will be visible to all peers and scored by the validator.
            </div>
            <div className={`text-[11px] mb-3 ${dark ? 'text-cyan-400/70' : 'text-cyan-700/70'}`}>
              🌐 Will broadcast to Frankfurt + {meshPeers} direct mesh {meshPeers === 1 ? 'peer' : 'peers'}
            </div>

            {shareResult && (
              <div
                className={`text-sm mb-3 p-2 rounded-md ${
                  shareIsFlag
                    ? dark ? 'bg-amber-950/30 text-amber-300' : 'bg-amber-50 text-amber-700'
                    : shareResult.startsWith('✅')
                      ? dark ? 'bg-green-950/30 text-green-400' : 'bg-green-50 text-green-700'
                      : dark ? 'bg-red-950/30 text-red-400' : 'bg-red-50 text-red-700'
                }`}
              >
                {shareResult}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowShareModal(false); setShareResult(null) }}
                className={`px-4 py-2 text-sm rounded-md border ${dark ? 'border-border text-gray-400 hover:bg-gray-800' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}
              >
                Cancel
              </button>
              <button
                onClick={handleShare}
                disabled={sharing || !shareContent.trim()}
                className="px-4 py-2 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-40"
              >
                {sharing ? 'Sharing...' : 'Share to SN442'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

export default Earnings
