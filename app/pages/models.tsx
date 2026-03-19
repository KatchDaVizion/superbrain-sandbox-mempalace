import { Plus, ExternalLink } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useModels } from '../hooks/useModel'
import { useModelsState } from '../hooks/useModelsState'
import { LocalModel } from '../types/model'
import DashboardLayout from '../components/shared/DashboardLayout'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog'
import { Toast } from '../components/model/Toast'
import { SmartBanners } from '../components/model/SmartBanners'
import { BrowseModelsSection } from '../components/model/BrowseModelsSection'
import { LocalModelsGrid } from '../components/model/LocalModelsGrid'
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import LocalModelsLoader from '../components/model/LocalModelsLoader'

const Models: React.FC = () => {
  const navigate = useNavigate()
  const { theme, resolvedTheme } = useTheme()

  const {
    localModels,
    localLoading,
    downloadingModels,
    downloadModel,
    deleteModel,
    browseModels,
    browseLoading,
    browseError,
    refetchBrowseModels,
    refetchLocalModels,
    ollamaStatus,
    checkOllamaStatus,
  } = useModels()

  const {
    showBrowser,
    searchQuery,
    selectedVersion,
    deleteDialogOpen,
    toastMessage,
    selectedModelForDelete,
    showRefreshHint,
    setShowBrowser,
    setSearchQuery,
    setSelectedVersion,
    setDeleteDialogOpen,
    setSelectedModelForDelete,
    setShowRefreshHint,
    setLastDownloadTime,
    showToast,
    hideRefreshHint,
    setToastMessage,
  } = useModelsState()

  // Enhanced download function with comprehensive Ollama status handling
  const handleDownload = useCallback(
    async (modelName: string) => {
      try {
        // First, check if Ollama is running before attempting download
        let ollamaStatus
        try {
          const status = await checkOllamaStatus()
          ollamaStatus = status.status
        } catch (statusError) {
          console.error('Failed to check Ollama status:', statusError)
          ollamaStatus = 'not-running'
        }

        // Handle different Ollama status scenarios
        switch (ollamaStatus) {
          case 'not-running':
            showToast('Ollama is not running or not installed. Please install and start Ollama first.', 'error')
            // Show additional guidance since we can't add action button
            setTimeout(() => {
              const shouldDownload = confirm(
                'Ollama is required to download models. Would you like to download Ollama now?'
              )
              if (shouldDownload) {
                window.open('https://ollama.ai/download', '_blank')
              }
            }, 500)
            return // Stop execution

          case 'checking':
            showToast('Checking Ollama status...', 'error')
            return

          case 'running':
            // Proceed with download since Ollama is running
            break

          default:
            showToast('Unable to determine Ollama status. Please check if Ollama is running.', 'error')
            return
        }

        // Show download started notification
        showToast(`Starting download for ${modelName}...`, 'success')

        // Start the download process
        await downloadModel(modelName)

        // Success notification
        showToast('Model downloaded successfully! 🎉', 'success')

        setLastDownloadTime(Date.now())
        setShowRefreshHint(false)

        // Auto refresh local models after successful download
        setTimeout(() => {
          refetchLocalModels()
        }, 1000)

        // If model doesn't appear after some time, show refresh hint
        setTimeout(() => {
          const modelExists = localModels.some((m) => m.model.includes(modelName.split(':')[0]))
          if (!modelExists) {
            setShowRefreshHint(true)
            showToast('Model downloaded but not showing? Try refreshing the models list.', 'error')
            setTimeout(() => setShowRefreshHint(false), 10000)
          }
        }, 5000)
      } catch (error: any) {
        console.error('Download failed:', error)

        // Enhanced error handling with specific messages
        let errorMessage = 'Download failed due to space or network issue, please try again later.'
        let errorType: 'error' | 'success' = 'error'

        // Check for specific error types
        if (error.message?.includes('Network Error') || error.message?.includes('ECONNREFUSED')) {
          errorMessage = 'Cannot connect to Ollama. Please make sure Ollama is running on localhost:11434.'
          // Show retry option via confirm dialog
          setTimeout(() => {
            const shouldRetry = confirm(`${errorMessage}\n\nWould you like to retry the download?`)
            if (shouldRetry) {
              handleDownload(modelName)
            }
          }, 500)
        } else if (error.message?.includes('timeout')) {
          errorMessage = 'Download timeout. The server is taking too long to respond.'
          setTimeout(() => {
            const shouldRetry = confirm(`${errorMessage}\n\nWould you like to retry?`)
            if (shouldRetry) {
              handleDownload(modelName)
            }
          }, 500)
        } else if (error.message?.includes('model not found')) {
          errorMessage = `Model "${modelName}" not found in Ollama library.`
        } else if (error.message?.includes('disk space')) {
          errorMessage = 'Insufficient disk space to download this model.'
        } else if (error.response?.status === 404) {
          errorMessage = `Model "${modelName}" not found. Please check the model name.`
        } else if (error.response?.status >= 500) {
          errorMessage = 'Ollama server error. Please check if Ollama is running properly.'
          setTimeout(() => {
            const shouldCheck = confirm(`${errorMessage}\n\nWould you like to check Ollama status?`)
            if (shouldCheck) {
              checkOllamaStatus()
            }
          }, 500)
        }

        // Show the main error toast
        showToast(errorMessage, errorType)
      }
    },
    [
      downloadModel,
      showToast,
      setLastDownloadTime,
      setShowRefreshHint,
      refetchLocalModels,
      localModels,
      checkOllamaStatus,
    ]
  )

  // Load browse models when first opening
  const handleBrowseClick = useCallback(() => {
    setShowBrowser((prev) => !prev)
    if (!browseModels.length) refetchBrowseModels()
  }, [setShowBrowser, browseModels.length, refetchBrowseModels])

  // Handle refresh function for button
  const handleRefresh = useCallback(() => {
    refetchLocalModels()
  }, [refetchLocalModels])

  // Enhanced delete function
  const handleDeleteClick = useCallback(
    (model: LocalModel) => {
      setSelectedModelForDelete(model)
      setDeleteDialogOpen(true)
    },
    [setSelectedModelForDelete, setDeleteDialogOpen]
  )

  const handleDeleteConfirm = useCallback(async () => {
    if (!selectedModelForDelete) return

    try {
      await deleteModel(selectedModelForDelete.model)
      showToast('Model uninstalled successfully!')
      setDeleteDialogOpen(false)
      setSelectedModelForDelete(null)
    } catch (error) {
      showToast('Failed to uninstall model. Please try again.', 'error')
    }
  }, [selectedModelForDelete, deleteModel, showToast, setDeleteDialogOpen, setSelectedModelForDelete])

  const handleStartModel = useCallback(
    (model: LocalModel) => {
      navigate('/ollama', {
        state: { model },
      })
    },
    [navigate]
  )

  const handleVersionSelect = useCallback(
    (modelName: string, version: string) => {
      setSelectedVersion((prev) => ({
        ...prev,
        [modelName]: version,
      }))
    },
    [setSelectedVersion]
  )

  const handleSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query)
    },
    [setSearchQuery]
  )

  const handleRetryConnection = () => {
    refetchLocalModels()
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full w-full">
        {/* Toast Notification */}
        {toastMessage && (
          <Toast message={toastMessage.message} type={toastMessage.type} onClose={() => setToastMessage(null)} />
        )}

        {/* Page Title */}
        <h1 className={`text-3xl font-bold mb-4 ${resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          Local AI Models (Ollama)
        </h1>

        {/* Download New Models Card */}
        <div
          className={`flex flex-col md:flex-row items-start md:items-center justify-between border rounded-lg p-4 mb-6 shadow-sm transition-colors w-full ${
            resolvedTheme === 'dark' ? 'bg-gray-800 border-blue-500/20' : 'bg-white border-blue-200'
          }`}
        >
          <div className="flex-1 mb-3 md:mb-0">
            <h3 className={`text-lg font-semibold mb-1 ${resolvedTheme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>
              Download New Models
            </h3>
            <p className={`text-sm ${resolvedTheme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
              Add more AI models to your local collection
            </p>
          </div>
          <div className="flex flex-wrap md:flex-nowrap space-x-0 md:space-x-3 gap-2">
            <button
              onClick={handleBrowseClick}
              className={`flex items-center space-x-2 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm ${
                resolvedTheme === 'dark' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              <Plus size={16} />
              <span>{showBrowser ? 'Hide Models' : 'Browse Models'}</span>
            </button>
            <a
              href="https://ollama.com/library"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center space-x-2 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm ${
                resolvedTheme === 'dark' ? 'bg-gray-600 hover:bg-gray-700' : 'bg-gray-600 hover:bg-gray-700'
              }`}
            >
              <ExternalLink size={16} />
              <span>Ollama Library</span>
            </a>
          </div>
        </div>

        {/* Smart Banners */}
        <SmartBanners
          theme={theme}
          showRefreshHint={showRefreshHint}
          localModels={localModels}
          localLoading={localLoading}
          onRefresh={handleRefresh}
          onHideRefreshHint={hideRefreshHint}
        />

        {/* Browse Models Section */}
        <BrowseModelsSection
          showBrowser={showBrowser}
          browseModels={browseModels}
          browseLoading={browseLoading}
          browseError={browseError}
          searchQuery={searchQuery}
          selectedVersion={selectedVersion}
          downloadingModels={downloadingModels}
          theme={theme}
          onSearchChange={handleSearchChange}
          onVersionSelect={handleVersionSelect}
          onDownload={handleDownload}
        />
        {/* Downloaded Models Header */}
        <div className="mb-4">
          <h2 className={`text-2xl font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Installed Models
          </h2>
          <p className={`text-sm mt-1 ${resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            {localModels.length === 0
              ? 'No models installed yet. Browse and download models to get started.'
              : `${localModels.length} model${localModels.length === 1 ? '' : 's'} installed`}
          </p>
        </div>
        {/* Local Models - Full Height Grid with Conditional Loader */}
        <div className="flex-1">
          {localLoading ? (
            <LocalModelsLoader theme={theme} />
          ) : (
            <LocalModelsGrid
              ollamaStatus={ollamaStatus}
              localModels={localModels}
              localLoading={localLoading}
              theme={theme}
              onStartModel={handleStartModel}
              onDeleteClick={handleDeleteClick}
              onRetryConnection={handleRetryConnection}
            />
          )}
        </div>

        {/* Enhanced Alert Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Uninstall Model?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to uninstall "<strong>{selectedModelForDelete?.name}</strong>"? This action will
                permanently remove the model from your system. You'll need to download it again if you want to use it in
                the future.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel
                onClick={() => {
                  setDeleteDialogOpen(false)
                  setSelectedModelForDelete(null)
                }}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDeleteConfirm}>
                Yes, Uninstall
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  )
}

export default Models
