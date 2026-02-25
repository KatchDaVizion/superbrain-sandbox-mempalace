import { useQuery } from '@tanstack/react-query'
import { getPoolStats, getPoolInfo, PoolStats, PoolInfo } from '../services/poolAPI'

type ConnectionStatus = 'live' | 'connecting' | 'offline' | 'not-configured'

interface UsePoolStatsReturn {
  stats: PoolStats | null
  poolInfo: PoolInfo | null
  connectionStatus: ConnectionStatus
  configured: boolean
  loading: boolean
  error: Error | null
  refetch: () => void
}

export function usePoolStats(): UsePoolStatsReturn {
  const poolApiUrl = import.meta.env.VITE_POOL_API_URL
  const configured = !!poolApiUrl

  const { data: stats, isLoading: statsLoading, error: statsError, refetch } = useQuery({
    queryKey: ['poolStats'],
    queryFn: getPoolStats,
    refetchInterval: 30_000,
    enabled: configured,
    retry: 2,
  })

  const { data: poolInfo } = useQuery({
    queryKey: ['poolInfo'],
    queryFn: getPoolInfo,
    enabled: configured,
    staleTime: 5 * 60_000,
  })

  let connectionStatus: ConnectionStatus = 'not-configured'
  if (configured) {
    if (statsLoading) connectionStatus = 'connecting'
    else if (statsError) connectionStatus = 'offline'
    else if (stats) connectionStatus = 'live'
  }

  return {
    stats: stats ?? null,
    poolInfo: poolInfo ?? null,
    connectionStatus,
    configured,
    loading: statsLoading,
    error: statsError as Error | null,
    refetch,
  }
}
