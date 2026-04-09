/**
 * KnowledgePacks — Settings panel for offline knowledge pack management.
 *
 * Shows available ZIM packs (Wikipedia, Stack Overflow, etc.) with
 * download/remove/progress UI. Communicates with main process via IPC.
 */

import { useState, useEffect, useCallback } from 'react'
import { useTheme } from 'next-themes'

// ── Types (mirror main-process types) ────────────────────────────────────

interface KnowledgePack {
  id: string
  name: string
  description: string
  size: string
  sizeBytes: number
  url: string
  filename: string
  recommended: boolean
  installed: boolean
  installedSizeBytes: number
}

interface DownloadProgress {
  packId: string
  progress: number
  downloadedBytes: number
  totalBytes: number
  status: string
}

interface ZimStatus {
  running: boolean
  zimCount: number
  zims: string[]
  port: number
}

// ── Utility ──────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

// ── Icons ────────────────────────────────────────────────────────────────

const PACK_ICONS: Record<string, string> = {
  'wikipedia-simple': '\u{1F4DA}', // books
  'wikipedia-en': '\u{1F30D}',     // globe
  stackoverflow: '\u{1F4BB}',       // laptop
  medical: '\u{1F3E5}',             // hospital
  gutenberg: '\u{1F4D6}',           // open book
}

// ── Component ────────────────────────────────────────────────────────────

export function KnowledgePacks() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const [packs, setPacks] = useState<KnowledgePack[]>([])
  const [zimStatus, setZimStatus] = useState<ZimStatus | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<Record<string, DownloadProgress>>({})
  const [loading, setLoading] = useState(true)

  // Fetch packs and status on mount
  const refreshData = useCallback(async () => {
    try {
      const [packsData, statusData] = await Promise.all([
        (window as any).electron.invoke('zim:packs'),
        (window as any).electron.invoke('zim:status'),
      ])
      setPacks(packsData)
      setZimStatus(statusData)
    } catch (err) {
      console.error('Failed to load ZIM data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshData()
  }, [refreshData])

  // Listen for download progress events from main process
  useEffect(() => {
    const handler = (_event: any, data: DownloadProgress) => {
      setDownloadProgress((prev) => ({ ...prev, [data.packId]: data }))

      if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
        // Refresh pack list after download completes
        setTimeout(refreshData, 1000)
      }
    }

    // Register IPC listener
    if ((window as any).electron?.ipcRenderer) {
      (window as any).electron.ipcRenderer.on('zim:download:progress', handler)
      return () => {
        (window as any).electron.ipcRenderer.removeListener('zim:download:progress', handler)
      }
    }
  }, [refreshData])

  const handleDownload = async (packId: string) => {
    setDownloadProgress((prev) => ({
      ...prev,
      [packId]: { packId, progress: 0, downloadedBytes: 0, totalBytes: 0, status: 'starting' },
    }))
    try {
      await (window as any).electron.invoke('zim:download', packId)
    } catch (err) {
      console.error('Download failed:', err)
    }
  }

  const handleCancel = async (packId: string) => {
    try {
      await (window as any).electron.invoke('zim:download:cancel', packId)
    } catch (err) {
      console.error('Cancel failed:', err)
    }
  }

  const handleRemove = async (filename: string) => {
    if (!confirm('Remove this knowledge pack? You can re-download it later.')) return
    try {
      await (window as any).electron.invoke('zim:remove', filename)
      await refreshData()
    } catch (err) {
      console.error('Remove failed:', err)
    }
  }

  const totalInstalled = packs.reduce((sum, p) => sum + (p.installed ? p.installedSizeBytes : 0), 0)

  if (loading) {
    return (
      <div className="p-6">
        <p className={isDark ? 'text-zinc-400' : 'text-zinc-500'}>Loading knowledge packs...</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h2 className={`text-xl font-semibold ${isDark ? 'text-white' : 'text-zinc-900'}`}>
          Offline Knowledge Packs
        </h2>
        <p className={`mt-1 text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
          Download knowledge packs that work with zero internet. Wikipedia, Stack Overflow, and more
          — all served locally via kiwix-serve.
        </p>
      </div>

      {/* Status bar */}
      <div
        className={`mb-6 rounded-lg p-4 ${
          isDark ? 'bg-zinc-800 border border-zinc-700' : 'bg-zinc-50 border border-zinc-200'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-2 h-2 rounded-full ${
                zimStatus?.running ? 'bg-green-500' : 'bg-zinc-400'
              }`}
            />
            <span className={`text-sm font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-700'}`}>
              {zimStatus?.running
                ? `kiwix-serve active (port ${zimStatus.port})`
                : 'kiwix-serve not running'}
            </span>
          </div>
          <span className={`text-sm ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            {formatBytes(totalInstalled)} used
          </span>
        </div>
      </div>

      {/* Pack list */}
      <div className="space-y-3">
        {packs.map((pack) => {
          const progress = downloadProgress[pack.id]
          const isDownloading = progress && progress.status === 'downloading'

          return (
            <div
              key={pack.id}
              className={`rounded-lg p-4 ${
                isDark ? 'bg-zinc-800/50 border border-zinc-700' : 'bg-white border border-zinc-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 flex-1">
                  <span className="text-2xl">{PACK_ICONS[pack.id] || '\u{1F4E6}'}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3
                        className={`font-medium ${isDark ? 'text-white' : 'text-zinc-900'}`}
                      >
                        {pack.name}
                      </h3>
                      {pack.recommended && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-medium">
                          Recommended
                        </span>
                      )}
                      {pack.installed && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 font-medium">
                          Installed
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-sm mt-0.5 ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}
                    >
                      {pack.description}
                    </p>
                    <p className={`text-xs mt-1 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      {pack.installed ? formatBytes(pack.installedSizeBytes) : pack.size}
                    </p>
                  </div>
                </div>

                <div className="ml-4 flex-shrink-0">
                  {pack.installed ? (
                    <button
                      onClick={() => handleRemove(pack.filename)}
                      className={`px-3 py-1.5 text-sm rounded-md ${
                        isDark
                          ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                          : 'bg-red-50 text-red-600 hover:bg-red-100'
                      }`}
                    >
                      Remove
                    </button>
                  ) : isDownloading ? (
                    <button
                      onClick={() => handleCancel(pack.id)}
                      className={`px-3 py-1.5 text-sm rounded-md ${
                        isDark
                          ? 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                          : 'bg-yellow-50 text-yellow-600 hover:bg-yellow-100'
                      }`}
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={() => handleDownload(pack.id)}
                      className={`px-3 py-1.5 text-sm rounded-md ${
                        isDark
                          ? 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                          : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                      }`}
                    >
                      Download
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {isDownloading && (
                <div className="mt-3">
                  <div className={`w-full h-2 rounded-full ${isDark ? 'bg-zinc-700' : 'bg-zinc-200'}`}>
                    <div
                      className="h-2 rounded-full bg-blue-500 transition-all duration-300"
                      style={{ width: `${progress.progress}%` }}
                    />
                  </div>
                  <p className={`text-xs mt-1 ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    {progress.progress}% — {formatBytes(progress.downloadedBytes)} /{' '}
                    {formatBytes(progress.totalBytes)}
                  </p>
                </div>
              )}

              {/* Completed/failed status */}
              {progress && progress.status === 'completed' && !pack.installed && (
                <p className="text-xs mt-2 text-green-500">Download complete. Restarting kiwix-serve...</p>
              )}
              {progress && progress.status === 'failed' && (
                <p className="text-xs mt-2 text-red-500">Download failed. Check your internet connection.</p>
              )}
            </div>
          )
        })}
      </div>

      {/* Info footer */}
      <div
        className={`mt-6 rounded-lg p-4 text-sm ${
          isDark ? 'bg-zinc-800/30 text-zinc-500' : 'bg-zinc-50 text-zinc-400'
        }`}
      >
        <p>
          Knowledge packs are stored in <code className="text-xs">~/.superbrain/zim/</code>.
          They work completely offline — no internet needed after download.
          When you ask a question, SuperBrain checks these packs first, then your personal
          knowledge base, then the SN442 network.
        </p>
      </div>
    </div>
  )
}
