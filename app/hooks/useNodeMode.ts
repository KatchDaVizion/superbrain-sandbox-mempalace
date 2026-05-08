// app/hooks/useNodeMode.ts
import { useState, useEffect, useCallback } from 'react'
import type { NodeModeConfig, NodeModeStatus } from '../../lib/preload/preload'

const POLL_MS = 5000

export function useNodeMode() {
  const [config, setConfigState] = useState<NodeModeConfig | null>(null)
  const [status, setStatus] = useState<NodeModeStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [startError, setStartError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [cfg, st] = await Promise.all([
        window.NodeModeApi.getConfig(),
        window.NodeModeApi.status(),
      ])
      setConfigState(cfg)
      setStatus(st)
    } catch (e) {
      console.error('[useNodeMode] refresh failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, POLL_MS)
    return () => clearInterval(id)
  }, [refresh])

  const setConfig = useCallback(
    async (patch: Partial<NodeModeConfig>) => {
      const result = await window.NodeModeApi.setConfig(patch)
      if (result && !result.success && result.error) {
        setStartError(result.error)
      } else if (patch.enabled === true) {
        setStartError(null)
      }
      await refresh()
    },
    [refresh]
  )

  const toggle = useCallback(async () => {
    if (!config) return
    if (config.enabled) setStartError(null)
    await setConfig({ enabled: !config.enabled })
  }, [config, setConfig])

  return { config, status, loading, setConfig, toggle, refresh, startError }
}
