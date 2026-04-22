import { useState, useEffect, useCallback } from 'react'

interface NetworkSource {
  content: string
  content_hash: string
  source: string
  timestamp: number
  node_id: string
  category?: string
  score?: number
  relevance?: number
  freshness?: number
}

interface NetworkAnswer {
  text: string
  citations: number[]
  sources: NetworkSource[]
  method: string
  query: string
  generation_time: number
}

interface NetworkStats {
  total_chunks: number
  unique_nodes: number
  oldest_chunk: number | null
  newest_chunk: number | null
  embedding_backend: string
  ollama_available: boolean
}

interface ShareResult {
  success: boolean
  total_chunks: number
  new_chunks: number
  duplicates: number
  error?: string
}

export interface FeedChunk {
  id: string
  title: string
  category: string
  preview: string
  hotkey: string
  timestamp: number
  source: string
  node: string
}

interface FeedResult {
  chunks: FeedChunk[]
  total: number
  chunks_today: number
  last_updated: number | null
  error?: string
}

export function useNetworkRAG() {
  const [stats, setStats] = useState<NetworkStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [answer, setAnswer] = useState<NetworkAnswer | null>(null)
  const [searchResults, setSearchResults] = useState<NetworkSource[]>([])
  const [feedItems, setFeedItems] = useState<FeedChunk[]>([])
  const [feedMeta, setFeedMeta] = useState<{ total: number; chunks_today: number } | null>(null)
  const [availableCategories, setAvailableCategories] = useState<string[]>([])

  const refreshStats = useCallback(async () => {
    try {
      const s = await window.NetworkRAGApi.stats()
      setStats(s)
      return s
    } catch (e) {
      console.error('[NetworkRAG] Stats error:', e)
      return null
    }
  }, [])

  useEffect(() => {
    refreshStats()
  }, [refreshStats])

  // Probe the category set once on mount so the Feed pills can render before
  // the user ever switches to Feed mode. A 200-row sample is enough to surface
  // the top agents; more arrive as new chunks are ingested.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const probe: FeedResult = await window.NetworkRAGApi.feed({ limit: 200 })
        if (cancelled) return
        const seen = new Set<string>()
        for (const c of probe.chunks || []) {
          if (c.category) seen.add(c.category)
        }
        setAvailableCategories(Array.from(seen))
      } catch {
        /* category pills fall back to 'all' only */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const askNetwork = useCallback(async (query: string, topK = 5) => {
    setIsLoading(true)
    setError(null)
    setAnswer(null)
    try {
      const result = await window.NetworkRAGApi.query(query, { topK })
      setAnswer(result as NetworkAnswer)
      return result as NetworkAnswer
    } catch (e: any) {
      setError(e.message || 'Network query failed')
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  const searchNetwork = useCallback(async (query: string, topK = 5) => {
    setIsLoading(true)
    setError(null)
    setSearchResults([])
    try {
      const result = await window.NetworkRAGApi.search(query, { topK })
      const results = (result as any).results || []
      setSearchResults(results)
      return results as NetworkSource[]
    } catch (e: any) {
      setError(e.message || 'Network search failed')
      return []
    } finally {
      setIsLoading(false)
    }
  }, [])

  const loadFeed = useCallback(
    async (options: { limit?: number; category?: string; hours?: number } = {}): Promise<FeedChunk[]> => {
      setIsLoading(true)
      setError(null)
      try {
        const result: FeedResult = await window.NetworkRAGApi.feed({ limit: 30, ...options })
        if (result.error) setError(result.error)
        setFeedItems(result.chunks || [])
        setFeedMeta({ total: result.total, chunks_today: result.chunks_today })
        // When loading the unfiltered feed, refresh the category pill set —
        // new agents may have surfaced categories since the mount probe.
        if (!options.category || options.category === 'all') {
          const merged = new Set<string>()
          for (const c of result.chunks || []) if (c.category) merged.add(c.category)
          setAvailableCategories(prev => Array.from(new Set([...prev, ...merged])))
        }
        return result.chunks || []
      } catch (e: any) {
        setError(e.message || 'Feed load failed')
        return []
      } finally {
        setIsLoading(false)
      }
    },
    []
  )

  const shareToNetwork = useCallback(async (content: string, title?: string): Promise<ShareResult> => {
    try {
      const result = await window.NetworkRAGApi.shareText(content, title)
      if (result.success) {
        await refreshStats()
      }
      return result
    } catch (e: any) {
      return { success: false, total_chunks: 0, new_chunks: 0, duplicates: 0, error: e.message }
    }
  }, [refreshStats])

  const shareFileToNetwork = useCallback(async (filePath: string, title?: string): Promise<ShareResult> => {
    try {
      const result = await window.NetworkRAGApi.shareFile(filePath, title)
      if (result.success) {
        await refreshStats()
      }
      return result
    } catch (e: any) {
      return { success: false, total_chunks: 0, new_chunks: 0, duplicates: 0, error: e.message }
    }
  }, [refreshStats])

  return {
    stats,
    isLoading,
    error,
    answer,
    searchResults,
    feedItems,
    feedMeta,
    availableCategories,
    askNetwork,
    searchNetwork,
    loadFeed,
    shareToNetwork,
    shareFileToNetwork,
    refreshStats,
  }
}
