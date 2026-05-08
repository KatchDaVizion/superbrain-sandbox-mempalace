// app/components/node/NodeModePanel.tsx
import { useState, useCallback } from 'react'
import { useTheme } from 'next-themes'
import { Network, Wifi, Globe, HardDrive, Users, RefreshCw, Terminal } from 'lucide-react'
import { useNodeMode } from '../../hooks/useNodeMode'
import type { NetworkMode } from '../../../lib/preload/preload'

const NETWORK_MODES: { value: NetworkMode; label: string; description: string }[] = [
  { value: 'lan', label: 'LAN Only', description: 'Sync with peers on your local network' },
  { value: 'i2p', label: 'I2P Only', description: 'Sync anonymously over I2P (requires i2pd)' },
  { value: 'hybrid', label: 'Hybrid', description: 'LAN + I2P — max reach, max privacy' },
]

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-blue-600' : 'bg-gray-600'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  )
}

export function NodeModePanel() {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  const { config, status, loading, toggle, setConfig, startError, refresh } = useNodeMode()
  const [fixing, setFixing] = useState(false)
  const [fixResult, setFixResult] = useState<string | null>(null)

  const runSetup = useCallback(async (cmd: string) => {
    setFixing(true)
    setFixResult(null)
    try {
      const result = await window.NodeModeApi.runSetupCommand(cmd)
      setFixResult(result.success ? 'Done' : result.output || 'Failed')
    } catch {
      setFixResult('Error running command')
    } finally {
      setFixing(false)
      await refresh()
    }
  }, [refresh])

  const textPrimary = dark ? 'text-white' : 'text-gray-900'
  const textSub = dark ? 'text-gray-400' : 'text-gray-500'
  const textMed = dark ? 'text-gray-200' : 'text-gray-700'
  const border = dark ? 'border-gray-600' : 'border-gray-300'
  const chipBase = `px-3 py-1.5 rounded-lg border text-xs transition-all`

  if (loading || !config) {
    return (
      <div className={`flex items-center gap-2 text-sm ${textSub}`}>
        <RefreshCw size={14} className="animate-spin" />
        Loading…
      </div>
    )
  }

  const running = status?.running ?? false
  const peers = status?.peersLan ?? 0
  const chunks = status?.chunksLocal ?? 0
  const uptime = status?.uptime

  const uptimeStr = uptime != null
    ? uptime < 60 ? `${uptime}s` : uptime < 3600 ? `${Math.floor(uptime / 60)}m` : `${Math.floor(uptime / 3600)}h`
    : null

  return (
    <div className="space-y-5">
      {/* Toggle row */}
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-sm font-medium flex items-center gap-2 ${textMed}`}>
            <Network size={15} />
            Node Mode
          </p>
          <p className={`text-xs mt-0.5 ${textSub}`}>
            Sync chunks with the network, serve peers, earn attribution
          </p>
        </div>
        <Toggle on={config.enabled} onClick={toggle} />
      </div>

      {/* Preflight error + action buttons */}
      {startError && (
        <div className="flex flex-col gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs">
          <div className="flex items-start gap-2">
            <span className="text-red-400 font-medium shrink-0">Fix this:</span>
            <span className="text-red-300">{startError}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {startError.includes('Ollama is not running') && (
              <button
                disabled={fixing}
                onClick={() => runSetup('curl -fsSL https://ollama.com/install.sh | sh && ollama pull nomic-embed-text')}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-50 transition-colors"
              >
                {fixing ? <RefreshCw size={11} className="animate-spin" /> : <Terminal size={11} />}
                Install Ollama
              </button>
            )}
            {startError.includes('nomic-embed-text') && (
              <button
                disabled={fixing}
                onClick={() => runSetup('ollama pull nomic-embed-text')}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-50 transition-colors"
              >
                {fixing ? <RefreshCw size={11} className="animate-spin" /> : <Terminal size={11} />}
                Pull Model
              </button>
            )}
            {startError.includes('Qdrant') && (
              <button
                disabled={fixing}
                onClick={() => runSetup('docker run -d -p 6333:6333 --name qdrant --restart unless-stopped qdrant/qdrant 2>/dev/null || docker start qdrant')}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
              >
                {fixing ? <RefreshCw size={11} className="animate-spin" /> : <Terminal size={11} />}
                Start Qdrant
              </button>
            )}
            {fixResult && (
              <span className={fixResult === 'Done' ? 'text-green-400' : 'text-red-400'}>{fixResult}</span>
            )}
          </div>
        </div>
      )}

      {/* Status strip — only when enabled */}
      {config.enabled && (
        <div className={`flex items-center gap-4 px-3 py-2 rounded-lg text-xs ${dark ? 'bg-gray-700/50' : 'bg-gray-100'}`}>
          <span className={`flex items-center gap-1 ${running ? 'text-green-400' : textSub}`}>
            <span className={`w-2 h-2 rounded-full ${running ? 'bg-green-400' : 'bg-gray-500'}`} />
            {running ? 'Running' : 'Starting…'}
          </span>
          <span className={`flex items-center gap-1 ${textSub}`}>
            <Users size={12} />
            {peers} peer{peers !== 1 ? 's' : ''}
          </span>
          <span className={`flex items-center gap-1 ${textSub}`}>
            <HardDrive size={12} />
            {chunks.toLocaleString()} chunks
          </span>
          {uptimeStr && (
            <span className={textSub}>up {uptimeStr}</span>
          )}
          {status?.error && (
            <span className="text-red-400 truncate max-w-xs">{status.error}</span>
          )}
        </div>
      )}

      {/* Network mode selector */}
      <div>
        <p className={`text-sm font-medium mb-2 ${textMed}`}>Network</p>
        <div className="flex gap-2 flex-wrap">
          {NETWORK_MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setConfig({ networkMode: m.value })}
              title={m.description}
              className={`${chipBase} ${
                config.networkMode === m.value
                  ? 'bg-blue-600 text-white border-blue-600'
                  : `${border} ${textSub} hover:border-gray-500`
              }`}
            >
              {m.value === 'lan' && <Wifi size={11} className="inline mr-1" />}
              {m.value === 'i2p' && <Globe size={11} className="inline mr-1" />}
              {m.value === 'hybrid' && <Network size={11} className="inline mr-1" />}
              {m.label}
            </button>
          ))}
        </div>
        <p className={`text-xs mt-1.5 ${textSub}`}>
          {NETWORK_MODES.find((m) => m.value === config.networkMode)?.description}
        </p>
      </div>

      {/* Storage cap */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className={`text-sm font-medium ${textMed}`}>Storage Cap</p>
          <span className={`text-sm ${textSub}`}>{config.storageCapMb} MB</span>
        </div>
        <input
          type="range"
          min={64}
          max={4096}
          step={64}
          value={config.storageCapMb}
          onChange={(e) => setConfig({ storageCapMb: parseInt(e.target.value, 10) })}
          className="w-full accent-blue-600"
        />
        <div className={`flex justify-between text-xs mt-1 ${textSub}`}>
          <span>64 MB</span>
          <span>4 GB</span>
        </div>
      </div>

      <p className={`text-xs ${textSub}`}>
        Chunks use LRU eviction. Window stays open in tray when node is active.
      </p>
    </div>
  )
}
