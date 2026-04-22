import React, { useState, useEffect } from 'react'
import { Globe, Search, Send, RefreshCcw, Database, Users, Clock, Zap, Rss } from 'lucide-react'
import { useTheme } from 'next-themes'
import DashboardLayout from '../components/shared/DashboardLayout'
import { useNetworkRAG } from '../hooks/useNetworkRAG'

const FEED_CATEGORIES = ['all', 'ai', 'crypto', 'cybersecurity', 'academic', 'social'] as const
type FeedCategory = typeof FEED_CATEGORIES[number]

const NetworkKnowledge: React.FC = () => {
  const { theme, resolvedTheme } = useTheme()
  const {
    stats,
    isLoading,
    error,
    answer,
    searchResults,
    feedItems,
    feedMeta,
    askNetwork,
    searchNetwork,
    loadFeed,
    refreshStats,
  } = useNetworkRAG()

  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'answer' | 'search' | 'feed'>('answer')
  const [feedCategory, setFeedCategory] = useState<FeedCategory>('all')

  useEffect(() => {
    if (mode === 'feed') {
      loadFeed({ category: feedCategory, limit: 30 })
    }
  }, [mode, feedCategory, loadFeed])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'feed') {
      await loadFeed({ category: feedCategory, limit: 30 })
      return
    }
    if (!query.trim() || isLoading) return
    if (mode === 'answer') {
      await askNetwork(query)
    } else {
      await searchNetwork(query)
    }
  }

  const formatTimestamp = (ts: number | null) => {
    if (!ts) return 'N/A'
    return new Date(ts * 1000).toLocaleDateString()
  }

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${resolvedTheme === 'dark' ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
            <Globe className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Network Knowledge</h1>
            <p className="text-sm text-muted-foreground">
              Search the collective knowledge pool on Bittensor Subnet 442
            </p>
          </div>
        </div>
        <button
          onClick={refreshStats}
          className={`p-2 rounded-lg border transition-colors ${
            resolvedTheme === 'dark'
              ? 'border-gray-600 hover:border-blue-400 hover:bg-blue-500/10'
              : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
          }`}
        >
          <RefreshCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div
            className={`p-4 rounded-xl border ${
              resolvedTheme === 'dark' ? 'bg-card/50 border-border' : 'bg-white border-gray-200 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Knowledge Chunks</span>
            </div>
            <div className="text-2xl font-bold">{stats.total_chunks}</div>
          </div>
          <div
            className={`p-4 rounded-xl border ${
              resolvedTheme === 'dark' ? 'bg-card/50 border-border' : 'bg-white border-gray-200 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Contributing Nodes</span>
            </div>
            <div className="text-2xl font-bold">{stats.unique_nodes}</div>
          </div>
          <div
            className={`p-4 rounded-xl border ${
              resolvedTheme === 'dark' ? 'bg-card/50 border-border' : 'bg-white border-gray-200 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Newest Chunk</span>
            </div>
            <div className="text-lg font-semibold">{formatTimestamp(stats.newest_chunk)}</div>
          </div>
          <div
            className={`p-4 rounded-xl border ${
              resolvedTheme === 'dark' ? 'bg-card/50 border-border' : 'bg-white border-gray-200 shadow-sm'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">Embedding</span>
            </div>
            <div className="text-lg font-semibold">{stats.embedding_backend}</div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask the network anything..."
              className={`w-full pl-10 pr-4 py-3 rounded-xl border transition-colors ${
                resolvedTheme === 'dark'
                  ? 'bg-card/50 border-border text-foreground placeholder-muted-foreground focus:border-blue-500'
                  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 shadow-sm'
              } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
            />
          </div>

          {/* Mode Toggle */}
          <div
            className={`flex items-center rounded-xl border overflow-hidden ${
              resolvedTheme === 'dark' ? 'border-border' : 'border-gray-300'
            }`}
          >
            <button
              type="button"
              onClick={() => setMode('answer')}
              className={`px-3 py-3 text-sm font-medium transition-colors ${
                mode === 'answer'
                  ? 'bg-blue-600 text-white'
                  : resolvedTheme === 'dark'
                    ? 'bg-card/50 text-muted-foreground hover:bg-muted'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Answer
            </button>
            <button
              type="button"
              onClick={() => setMode('search')}
              className={`px-3 py-3 text-sm font-medium transition-colors ${
                mode === 'search'
                  ? 'bg-blue-600 text-white'
                  : resolvedTheme === 'dark'
                    ? 'bg-card/50 text-muted-foreground hover:bg-muted'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => setMode('feed')}
              className={`px-3 py-3 text-sm font-medium transition-colors flex items-center gap-1 ${
                mode === 'feed'
                  ? 'bg-blue-600 text-white'
                  : resolvedTheme === 'dark'
                    ? 'bg-card/50 text-muted-foreground hover:bg-muted'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Rss className="w-4 h-4" />
              Feed
            </button>
          </div>

          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Feed category filter */}
      {mode === 'feed' && (
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          {FEED_CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setFeedCategory(c)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors capitalize ${
                feedCategory === c
                  ? 'bg-blue-600 text-white border-blue-600'
                  : resolvedTheme === 'dark'
                    ? 'bg-card/50 border-border text-muted-foreground hover:border-blue-400'
                    : 'bg-white border-gray-300 text-gray-600 hover:border-blue-400'
              }`}
            >
              {c}
            </button>
          ))}
          {feedMeta && (
            <span className="text-xs text-muted-foreground ml-auto">
              {feedMeta.chunks_today} today / {feedMeta.total.toLocaleString()} total
            </span>
          )}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-8">
          <div className="inline-flex items-center gap-2 text-muted-foreground">
            <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Querying the knowledge network...
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className={`p-4 rounded-xl border mb-4 ${
            resolvedTheme === 'dark' ? 'bg-red-950/20 border-red-800 text-red-300' : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {error}
        </div>
      )}

      {/* Answer */}
      {answer && (
        <div
          className={`p-6 rounded-xl border mb-4 ${
            resolvedTheme === 'dark' ? 'bg-card/50 border-border' : 'bg-white border-gray-200 shadow-sm'
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium text-muted-foreground">
              {answer.method === 'ollama' ? 'AI-Generated Answer' : 'Extractive Answer'} ({answer.generation_time}s)
            </span>
          </div>
          <div className="prose dark:prose-invert max-w-none text-sm whitespace-pre-wrap">{answer.text}</div>

          {answer.sources.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Sources ({answer.sources.length})
              </div>
              <div className="space-y-2">
                {answer.sources.map((s, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg text-xs ${
                      resolvedTheme === 'dark' ? 'bg-muted/50' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{s.source}</span>
                      <span className="text-muted-foreground">
                        Score: {(s.score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="text-muted-foreground line-clamp-2">{s.content}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search Results */}
      {searchResults.length > 0 && !answer && (
        <div className="space-y-3">
          <div className="text-sm font-medium text-muted-foreground">
            {searchResults.length} result(s) found
          </div>
          {searchResults.map((r, i) => (
            <div
              key={i}
              className={`p-4 rounded-xl border ${
                resolvedTheme === 'dark' ? 'bg-card/50 border-border' : 'bg-white border-gray-200 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{r.source}</span>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>Relevance: {(r.relevance * 100).toFixed(0)}%</span>
                  <span>Freshness: {(r.freshness * 100).toFixed(0)}%</span>
                  <span>Node: {r.node_id}</span>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">{r.content}</div>
            </div>
          ))}
        </div>
      )}

      {/* Feed items */}
      {mode === 'feed' && !isLoading && feedItems.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {feedItems.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded-xl border ${
                resolvedTheme === 'dark' ? 'bg-card/50 border-border' : 'bg-white border-gray-200 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2 text-xs text-muted-foreground">
                <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 capitalize">
                  {item.category || 'general'}
                </span>
                <span title={new Date(item.timestamp * 1000).toISOString()}>
                  {new Date(item.timestamp * 1000).toLocaleString()}
                </span>
              </div>
              <h4 className="text-sm font-medium mb-1 line-clamp-2">{item.title || 'Untitled'}</h4>
              <p className="text-xs text-muted-foreground line-clamp-3 mb-2">{item.preview}</p>
              <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                <span>{item.hotkey || 'anon'}</span>
                <span>{item.node}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {mode === 'feed' && !isLoading && feedItems.length === 0 && !error && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No feed items for category "{feedCategory}".
        </div>
      )}

      {/* Empty State */}
      {mode !== 'feed' && !isLoading && !answer && searchResults.length === 0 && !error && (
        <div className="text-center py-16">
          <Globe
            className={`w-16 h-16 mx-auto mb-4 ${resolvedTheme === 'dark' ? 'text-muted-foreground/30' : 'text-gray-300'}`}
          />
          <h3 className="text-lg font-medium mb-2">Search the Knowledge Network</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Query knowledge shared by nodes across the SuperBrain network on Bittensor Subnet 442.
            {stats && stats.total_chunks > 0
              ? ` Currently ${stats.total_chunks} knowledge chunks from ${stats.unique_nodes} node(s).`
              : ' No knowledge available yet.'}
          </p>
        </div>
      )}
    </DashboardLayout>
  )
}

export default NetworkKnowledge
