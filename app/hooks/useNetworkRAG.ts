import { useState, useEffect, useCallback } from 'react'

interface NetworkSource {
  content: string
  content_hash: string
  score: number
  relevance: number
  freshness: number
  source: string
  timestamp: number
  node_id: string
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

export function useNetworkRAG() {
  const [stats, setStats] = useState<NetworkStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [answer, setAnswer] = useState<NetworkAnswer | null>(null)
  const [searchResults, setSearchResults] = useState<NetworkSource[]>([])

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
    askNetwork,
    searchNetwork,
    shareToNetwork,
    shareFileToNetwork,
    refreshStats,
  }
}
