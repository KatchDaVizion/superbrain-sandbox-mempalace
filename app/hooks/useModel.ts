import { useState, useCallback } from 'react'
import axios from 'axios'
import modelsData from '../model.json'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LocalModel, BrowseModel } from '../types/model'

// --------------------
// useModels Hook
// --------------------
export const useModels = () => {
  const [installedModels, setInstalledModels] = useState<string[]>(() => {
    const saved = localStorage.getItem('installedOllamaModels')
    return saved ? JSON.parse(saved) : []
  })
  const [downloadingModels, setDownloadingModels] = useState<Set<string>>(new Set())
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'running' | 'not-running'>('checking')

  const API_URL = 'http://localhost:11434'
  const queryClient = useQueryClient()

  // --------------------
  // API Call Helper
  // --------------------
  const apiCall = useCallback(async (endpoint: string, method = 'GET', body?: any) => {
    const res = await axios({
      url: `${API_URL}${endpoint}`,
      method,
      data: body || undefined,
      headers: { 'Content-Type': 'application/json' },
    })
    return res.data
  }, [])

  // --------------------
  // Check Ollama Status
  // --------------------

  const checkOllamaStatus = useCallback(async (): Promise<{ status: 'running' | 'not-running'; message: string }> => {
    try {
      await apiCall('/api/tags')
      setOllamaStatus('running')
      return { status: 'running', message: 'Ollama is running and ready' }
    } catch (error) {
      setOllamaStatus('not-running')
      return { status: 'not-running', message: 'Ollama is not running or not installed' }
    }
  }, [apiCall])

  // --------------------
  // Fetch Local Models with Status Check
  // --------------------
  const fetchLocalModels = useCallback(async (): Promise<LocalModel[]> => {
    // First check if Ollama is running
    const status = await checkOllamaStatus()
    if (status.status !== 'running') {
      return [] // Return empty array if Ollama isn't running
    }

    const tagsRes: any = await apiCall('/api/tags')
    const modelsData = tagsRes.models || []

    const modelsWithDetails: LocalModel[] = await Promise.all(
      modelsData.map(async (m: any) => {
        const detailsRes: any = await apiCall('/api/show', 'POST', { model: m.model })
        
        // Detect if it's an embedding model based on name or family
        const isEmbedding = m.name.toLowerCase().includes('embed') || 
                           m.model.toLowerCase().includes('embed') ||
                           detailsRes.details?.family?.toLowerCase().includes('embed')
        
        return {
          model: m.model,
          name: m.name,
          size: (m.size / 1e9).toFixed(2) + ' GB',
          parameters: detailsRes.details?.parameter_size || 'N/A',
          ram: 'N/A',
          description: `The ${detailsRes.details?.family || 'General'} AI model with ${
            detailsRes.details?.parameter_size || 'N/A'
          } parameters. Optimized with ${detailsRes.details?.quantization_level || 'Q4_0'} quantization and ${
            detailsRes.details?.format || 'gguf'
          } format. Ideal for offline, private AI tasks.`,
          speed: 'N/A',
          specialty: detailsRes.details?.family || 'General',
          status: 'installed',
          active: false,
          type: isEmbedding ? 'embedding' : 'text',
          isEmbedding: isEmbedding,
          details: detailsRes.details,
        }
      })
    )

    return modelsWithDetails
  }, [apiCall, checkOllamaStatus])

  const {
    data: localModels = [],
    isLoading: localLoading,
    refetch: refetchLocalModels,
  } = useQuery<LocalModel[], Error>({
    queryKey: ['localModels'],
    queryFn: fetchLocalModels,
    refetchInterval: 5000, // Check every 5 seconds
  })

  // --------------------
  // Enhanced Download Model with Better Error Handling
  // --------------------
  const downloadModel = async (modelId: string): Promise<void> => {
    console.log(`Starting download for model: ${modelId}`)

    setDownloadingModels((prev) => new Set(prev).add(modelId))

    try {
      // Start the download process
      const response = await fetch(`${API_URL}/api/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: modelId, stream: false }), // Set stream to false for simpler handling
      })

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      console.log('Download result:', result)

      // If download was successful, update installed models
      if (response.status === 200) {
        const newInstalled = [...new Set([...installedModels, modelId])] // Avoid duplicates
        setInstalledModels(newInstalled)
        localStorage.setItem('installedOllamaModels', JSON.stringify(newInstalled))

        console.log(`✅ Model ${modelId} downloaded successfully`)

        // Invalidate and refetch local models to get the updated list
        queryClient.invalidateQueries({ queryKey: ['localModels'] })

        return Promise.resolve()
      } else {
        throw new Error('Download completed but status indicates failure')
      }
    } catch (error) {
      console.error(`❌ Download failed for model ${modelId}:`, error)
      throw error // Re-throw to be caught by the component
    } finally {
      // Always remove from downloading set
      setDownloadingModels((prev) => {
        const newSet = new Set(prev)
        newSet.delete(modelId)
        return newSet
      })
    }
  }

  // --------------------
  // Enhanced Delete Model
  // --------------------
  const deleteModel = async (modelId: string): Promise<void> => {
    console.log(`Starting deletion for model: ${modelId}`)

    try {
      const response = await apiCall('/api/delete', 'DELETE', { model: modelId })
      console.log('Delete response:', response)

      // Update installed models list
      const updatedInstalled = installedModels.filter((id) => id !== modelId)
      setInstalledModels(updatedInstalled)
      localStorage.setItem('installedOllamaModels', JSON.stringify(updatedInstalled))

      console.log(`✅ Model ${modelId} deleted successfully`)

      // Invalidate and refetch local models
      queryClient.invalidateQueries({ queryKey: ['localModels'] })

      return Promise.resolve()
    } catch (error) {
      console.error(`❌ Delete failed for model ${modelId}:`, error)
      throw error
    }
  }

  // --------------------
  // Fetch Browse Models (INCLUDING EMBEDDING MODELS) ✅
  // --------------------
  const fetchBrowseModels = useCallback(async (): Promise<BrowseModel[]> => {
    // 🖥️ Machine info from Electron
    const machineInfo = await (window as any).electron.invoke('get-machine-info')
    console.log('Machine info:', machineInfo)

    const RUNTIME_OVERHEAD = 0.1 // RAM overhead
    const DISK_MARGIN = 0.1 // Disk margin

    // Helper function to process model versions
    const processVersions = (versions: any[], availableRAM: number, availableDisk: number) => {
      return versions
        .map((v) => {
          // 📢 Convert size to GB (handle MB, GB & TB)
          let sizeGB = 0
          if (v.size.endsWith('TB')) {
            sizeGB = parseFloat(v.size.replace('TB', '')) * 1024
          } else if (v.size.endsWith('GB')) {
            sizeGB = parseFloat(v.size.replace('GB', ''))
          } else if (v.size.endsWith('MB')) {
            sizeGB = parseFloat(v.size.replace('MB', '')) / 1024 // ✅ MB → GB
          }

          // 📢 Convert context tokens to GB
          const contextStr = v.context.replace('K', '')
          const contextK = parseInt(contextStr, 10) * 1024
          const contextGB = contextK / 1024 / 1024

          const estimatedRAMGB = sizeGB + contextGB + RUNTIME_OVERHEAD

          const passesFilter = sizeGB <= availableDisk && estimatedRAMGB <= availableRAM

          console.log(
            `Version: ${v.model_name} | Size: ${sizeGB.toFixed(3)}GB | ` +
              `RAM: ${estimatedRAMGB.toFixed(3)}GB | Passes: ${passesFilter}`
          )

          return { ...v, sizeGB, contextGB, estimatedRAMGB, passesFilter }
        })
        .filter((v) => v.passesFilter) // ✅ Only versions that fit RAM & Disk
    }

    const availableRAM = Math.max(machineInfo.freeRAMGB - RUNTIME_OVERHEAD, 0)
    const availableDisk = Math.max(machineInfo.freeDiskGB - DISK_MARGIN, 0)

    // ✅ Process regular text/language models
    const filteredModels = modelsData.models
      .map((model) => {
        const versions = processVersions(model.versions, availableRAM, availableDisk)
        return { 
          name: model.name, 
          description: model.description, 
          versions, 
          type: 'text' as const 
        }
      })
      .filter((m) => m.versions.length > 0) // Only models with available versions

    // ✅ Process embedding models
    const filteredEmbeddingModels = modelsData.embedding_models
      .map((model) => {
        const versions = processVersions(model.versions, availableRAM, availableDisk)
        return { 
          name: model.name, 
          description: model.description, 
          versions, 
          type: 'embedding' as const,
          parameters: model.parameters
        }
      })
      .filter((m) => m.versions.length > 0)

    // ✅ Combine both types
    const allModels = [...filteredModels, ...filteredEmbeddingModels]
    console.log(`✅ Total models: ${allModels.length} (${filteredModels.length} text + ${filteredEmbeddingModels.length} embedding)`)
    return allModels
  }, [])

  const {
    data: browseModels = [],
    isLoading: browseLoading,
    refetch: refetchBrowseModels,
    error: browseError,
  } = useQuery<BrowseModel[], Error>({
    queryKey: ['browseModels'],
    queryFn: fetchBrowseModels,
  })

  // --------------------
  // Return everything
  // --------------------
  return {
    localModels,
    localLoading,
    downloadingModels,
    downloadModel,
    deleteModel,
    browseModels,
    browseLoading,
    browseError,
    refetchLocalModels,
    refetchBrowseModels,
    ollamaStatus,
    checkOllamaStatus,
  }
}