/**
 * SourcesSection — Perplexity-style collapsible source attribution for SuperBrain SN442.
 *
 * Consumes the existing RAGSource type (from useOllama.ts). Pulls hotkey, category,
 * node_id, content_hash, timestamp from RAGSource.metadata where the useOllama hook
 * places them after a /query response via the superbrain:network:query IPC.
 *
 * Design notes:
 *  - Collapsed by default: one-line trigger "N sources from SuperBrain network"
 *  - Expanded: per-source row with [index], title, category pill, hotkey pill
 *    (click-to-copy, colored dot derived from hotkey hash for visual distinction)
 *  - Clicking a row expands its content/preview snippet
 *  - Zero external deps — uses only lucide-react (already in use) and Tailwind
 */
import React, { useState } from 'react'
import { ChevronDown, ChevronRight, Database, Check, Copy } from 'lucide-react'
import { useTheme } from 'next-themes'
import type { SourceItem } from './SourcesPanel'

interface Props {
  sources: SourceItem[] | undefined
}

const CATEGORY_COLOR: Record<string, string> = {
  HACKERNEWS: 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  ARXIV_AI: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  ARXIV_SEC: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  ARXIV_NET: 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  YOUTUBE_BITTENSOR: 'bg-red-500/15 text-red-400 border-red-500/20',
  PYPI_RELEASE: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  HF_MODEL: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  DOCS_PYTHON: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  general: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
  AUDIT: 'bg-rose-500/15 text-rose-400 border-rose-500/20',
}

/** Hotkey pill with click-to-copy + colored dot from hash. */
function HotkeyPill({ hotkey, isDark }: { hotkey: string; isDark: boolean }) {
  const [copied, setCopied] = useState(false)
  if (!hotkey) {
    return (
      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${isDark ? 'border-slate-700 text-slate-500' : 'border-slate-300 text-slate-400'}`}>
        no-hotkey
      </span>
    )
  }
  const short = `${hotkey.slice(0, 6)}…${hotkey.slice(-4)}`
  // Deterministic hue from hotkey hash
  let hash = 0
  for (let i = 0; i < hotkey.length; i++) hash = (hash * 31 + hotkey.charCodeAt(i)) & 0xffffff
  const hue = Math.abs(hash) % 360
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(hotkey).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={handleCopy}
      title={copied ? 'Copied!' : `Click to copy ${hotkey}`}
      className={`flex items-center gap-1.5 text-[10px] font-mono px-2 py-0.5 rounded-full border transition-colors ${
        isDark ? 'border-slate-700 hover:border-slate-500 text-slate-300' : 'border-slate-300 hover:border-slate-400 text-slate-600'
      }`}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: `hsl(${hue}, 70%, 60%)` }} />
      <span>{short}</span>
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-2.5 h-2.5 opacity-40" />}
    </button>
  )
}

function relativeTime(ts: number): string {
  if (!ts) return ''
  const sec = Math.max(0, Math.floor(Date.now() / 1000 - ts))
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

export default function SourcesSection({ sources }: Props) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  if (!sources || sources.length === 0) return null

  // Filter: only show SN442 network sources (skip local doc RAG results)
  const networkSources = sources.filter(s => (s.metadata as any)?.provider === 'sn442' || !s.metadata?.fileName)
  const toShow = networkSources.length > 0 ? networkSources : sources
  const count = toShow.length

  return (
    <div className={`mt-2 rounded-lg border text-xs ${isDark ? 'bg-slate-800/40 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
          isDark ? 'text-blue-300 hover:bg-slate-700/40' : 'text-blue-600 hover:bg-slate-100'
        }`}
      >
        <Database className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="font-medium">
          {count} source{count !== 1 ? 's' : ''} from SuperBrain network
        </span>
        <span className="ml-auto">
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
      </button>

      {open && (
        <div className={`divide-y ${isDark ? 'divide-slate-700/40' : 'divide-slate-200'}`}>
          {toShow.map((s, i) => {
            const meta = (s.metadata ?? {}) as Record<string, any>
            const title = s.source && s.source !== 'Unknown' ? s.source : 'Untitled'
            const category = typeof meta.category === 'string' ? meta.category : 'general'
            const hotkey = typeof meta.hotkey === 'string' ? meta.hotkey : ''
            const nodeId = typeof meta.node_id === 'string' ? meta.node_id : ''
            const timestamp = typeof meta.timestamp === 'number' ? meta.timestamp : 0
            const catClass = CATEGORY_COLOR[category] ?? CATEGORY_COLOR.general
            const isExpanded = expanded === i
            return (
              <div key={i} className="px-3 py-2.5">
                <button
                  onClick={() => setExpanded(isExpanded ? null : i)}
                  className="w-full flex items-start gap-2 text-left"
                >
                  <span className={`text-[11px] font-mono font-bold mt-0.5 flex-shrink-0 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                    [{i + 1}]
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`truncate font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                      {title}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-mono ${catClass}`}>
                        {category}
                      </span>
                      <HotkeyPill hotkey={hotkey} isDark={isDark} />
                      {nodeId && (
                        <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          · {nodeId}
                        </span>
                      )}
                      {timestamp > 0 && (
                        <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          · {relativeTime(timestamp)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`text-[10px] mt-0.5 flex-shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </span>
                </button>
                {isExpanded && s.content && (
                  <div className={`mt-2 p-2 rounded text-[11px] leading-relaxed ${isDark ? 'bg-slate-900/40 text-slate-400' : 'bg-white text-slate-600'}`}>
                    {s.content.length > 400 ? s.content.slice(0, 400) + '…' : s.content}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
