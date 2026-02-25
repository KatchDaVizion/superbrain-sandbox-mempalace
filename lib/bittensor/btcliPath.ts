import { existsSync } from 'fs'
import { getOsConfig } from './config'
import { BtcliConfig } from './types'
import * as path from 'path'
import { app } from 'electron'

const { execSync } = require('child_process')

// Helper function to safely handle unknown errors
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

const locateWSLExecutable = () => {
  const wslPaths = [
    'C:\\Windows\\System32\\wsl.exe',
    'C:\\Windows\\Sysnative\\wsl.exe',
    'wsl.exe', // fallback
  ]

  for (const path of wslPaths) {
    if (existsSync(path)) {
      return path
    }
  }

  throw new Error('WSL executable not found')
}

// Helper function to find btcli path
const getBtcliPath = (osConfig: BtcliConfig): any => {
  if (osConfig.os === 'windows') {
    // First, check if WSL is available
    // const wslCommand = locateWSLExecutable();
    // Check if distribution exists
    try {
      return {
        btcliPath: osConfig.btcliPath,
        wslPath: osConfig.wslPath,
        walletsDir: osConfig.walletsDir,
      }
    } catch (error) {
      throw new Error('Unable to check WSL distributions: ' + getErrorMessage(error))
    }
  } else {
    // Unix-like systems (Linux, macOS) - direct check with clear error
    try {
      return { btcliPath: osConfig.btcliPath, walletsDir: path.join(app.getPath('userData'), 'wallets') }
    } catch (error) {
      throw new Error('btcli not found in system PATH: ' + getErrorMessage(error))
    }
  }
}

// Define types for the return object
export interface BtcliPathResult {
  success: boolean
  btcliPath: string | null
  wslPath: string | null
  walletsDir: string
  error: string | null
  isWsl: boolean
}

// Export the path with error handling wrapper
export const getBtcliPathSafe = (): BtcliPathResult => {
  try {
    const osConfig = getOsConfig(null)
    if (!osConfig) {
      throw new Error('os config is not available')
    }
    const path = getBtcliPath(osConfig)
    return {
      success: true,
      btcliPath: path.btcliPath,
      walletsDir: path.walletsDir,
      error: null,
      isWsl: process.platform === 'win32',
      wslPath: path.wslPath,
    }
  } catch (error) {
    return {
      success: false,
      btcliPath: null,
      walletsDir: '',
      error: getErrorMessage(error),
      isWsl: false,
      wslPath: null,
    }
  }
}

// Also export the direct path for backward compatibility
// export const btcliPath = ((): BtcliPathResult => {
//     return getBtcliPathSafe();
// })();
