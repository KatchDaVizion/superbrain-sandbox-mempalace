// SuperBrain Network Configuration
// Override with SB_API_URL (main process) or VITE_SB_API_URL (renderer) env vars.

export const SB_SEED_NODE =
  (typeof process !== 'undefined' && process.env?.SB_API_URL) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SB_API_URL) ||
  'http://46.225.114.202:8400'

export const OLLAMA_URL =
  (typeof process !== 'undefined' && process.env?.OLLAMA_URL) ||
  'http://localhost:11434'

export const SN442_NETUID = 442
export const NETWORK_NAME = 'SuperBrain SN442'
