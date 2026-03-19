import React, { useState } from 'react'
import { ChevronDown, ChevronRight, FileText, ExternalLink } from 'lucide-react'
import { useTheme } from 'next-themes'

export interface SourceItem {
  content: string
  source: string
  score: number
  metadata: Record<string, any>
}

interface SourcesPanelProps {
  sources: SourceItem[]
}

const SourcesPanel: React.FC<SourcesPanelProps> = ({ sources }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const { theme, resolvedTheme } = useTheme()

  if (!sources || sources.length === 0) return null

  const getScoreColor = (score: number): string => {
    if (score >= 0.8) return resolvedTheme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
    if (score >= 0.5) return resolvedTheme === 'dark' ? 'text-amber-400' : 'text-amber-600'
    return resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'
  }

  const getScoreLabel = (score: number): string => {
    if (score >= 0.8) return 'High'
    if (score >= 0.5) return 'Medium'
    return 'Low'
  }

  const getSourceName = (source: SourceItem): string => {
    if (source.metadata?.fileName) return source.metadata.fileName
    if (source.source && source.source !== 'Unknown') {
      // Extract filename from path
      const parts = source.source.split('/')
      return parts[parts.length - 1] || source.source
    }
    return 'Knowledge Base'
  }

  return (
    <div className={`mt-2 rounded-lg border transition-colors ${
      resolvedTheme === 'dark'
        ? 'bg-slate-800/40 border-slate-700/50'
        : 'bg-slate-50 border-slate-200'
    }`}>
      {/* Toggle Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition-colors rounded-lg ${
          resolvedTheme === 'dark'
            ? 'text-blue-300 hover:bg-slate-700/50'
            : 'text-blue-600 hover:bg-slate-100'
        }`}
      >
        <div className="flex items-center space-x-2">
          <FileText className="w-3.5 h-3.5" />
          <span>{sources.length} source{sources.length !== 1 ? 's' : ''} used</span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Sources List */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {sources.map((source, idx) => (
            <div
              key={idx}
              className={`p-2.5 rounded-md border text-xs ${
                resolvedTheme === 'dark'
                  ? 'bg-slate-900/50 border-slate-700/30'
                  : 'bg-white border-slate-200/80'
              }`}
            >
              {/* Source header */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center space-x-2 min-w-0 flex-1">
                  <span className={`font-mono font-bold ${
                    resolvedTheme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                  }`}>
                    [{idx + 1}]
                  </span>
                  <span className={`truncate font-medium ${
                    resolvedTheme === 'dark' ? 'text-slate-200' : 'text-slate-700'
                  }`}>
                    {getSourceName(source)}
                  </span>
                </div>
                <div className={`flex items-center space-x-1 flex-shrink-0 ${getScoreColor(source.score)}`}>
                  <span className="font-medium">{getScoreLabel(source.score)}</span>
                  <span className="opacity-60">({(source.score * 100).toFixed(0)}%)</span>
                </div>
              </div>

              {/* Source preview */}
              <p className={`line-clamp-2 leading-relaxed ${
                resolvedTheme === 'dark' ? 'text-slate-400' : 'text-slate-500'
              }`}>
                {source.content}
              </p>

              {/* Source URL if available */}
              {source.metadata?.url && (
                <div className="mt-1.5 flex items-center space-x-1">
                  <ExternalLink className={`w-3 h-3 ${
                    resolvedTheme === 'dark' ? 'text-slate-500' : 'text-slate-400'
                  }`} />
                  <span className={`truncate ${
                    resolvedTheme === 'dark' ? 'text-slate-500' : 'text-slate-400'
                  }`}>
                    {source.metadata.url}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SourcesPanel
