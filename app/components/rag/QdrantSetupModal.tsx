import React, { useState, useMemo } from 'react'
import { Database, Download, Play, Terminal, Copy, Check, ArrowRight, ArrowLeft } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useModels } from '@/app/hooks/useModel'

interface QdrantSetupModalProps {
  isOpen: boolean
  onClose: () => void
  onProceed: () => void
  isQdrantRunning: boolean | null
  isCheckingQdrant: boolean
  onRefreshStatus: () => void
}

const QDRANT_EMBED_MODEL = 'nomic-embed-text:latest'

const QdrantSetupModal: React.FC<QdrantSetupModalProps> = ({
  isOpen,
  onClose,
  onProceed,
  isQdrantRunning,
  isCheckingQdrant,
  onRefreshStatus,
}) => {
  const { theme, resolvedTheme } = useTheme()
  const {
    localModels = [],
    downloadModel,
    refetchLocalModels,
    checkOllamaStatus,
    downloadingModels,
  } = useModels() as any

  const [currentStep, setCurrentStep] = useState(1)
  const [isInstallingEmbed, setIsInstallingEmbed] = useState(false)
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)

  const isEmbedInstalled = useMemo(
    () =>
      (localModels || []).some(
        (m: any) => (m.model && m.model === QDRANT_EMBED_MODEL) || (m.model && m.model.includes('nomic-embed-text'))
      ),
    [localModels]
  )

  const isEmbedDownloading = downloadingModels && downloadingModels.has && downloadingModels.has(QDRANT_EMBED_MODEL)

  const handleInstallEmbed = async () => {
    try {
      setIsInstallingEmbed(true)

      // make sure Ollama is running
      const status = await checkOllamaStatus()
      if (status.status !== 'running') {
        alert('Ollama is not running. Please start Ollama before installing the embedding model.')
        setIsInstallingEmbed(false)
        return
      }

      // trigger download via existing hook
      await downloadModel(QDRANT_EMBED_MODEL)

      // refresh local models to pick up new model
      await refetchLocalModels()

      // quick confirmation
      alert('Embedding model installed successfully.')
    } catch (err) {
      console.error('Failed to install embedding model', err)
      alert('Failed to install embedding model. See console for details.')
    } finally {
      setIsInstallingEmbed(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedCommand(text)
    setTimeout(() => setCopiedCommand(null), 2000)
  }

  const steps = [
    { id: 1, title: 'Database Setup', description: 'Set up Qdrant vector database' },
    { id: 2, title: 'Model Installation', description: 'Install embedding model' },
  ]

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className={`rounded-l-2xl border p-6 m-4 max-w-2xl w-full max-h-[90vh] overflow-y-auto ${
          resolvedTheme === 'dark' ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Database className="w-6 h-6 text-blue-500" />
              Set up Qdrant Vector Database
            </h2>
            <p className="text-sm mt-1 opacity-70">
              Follow these steps to set up your local vector database and embedding model
            </p>
          </div>
        </div>

        {/* Modern Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between relative">
            {/* Progress Line */}
            <div
              className={`absolute h-1 top-1/2 left-0 right-0 transform -translate-y-1/2 transition-all duration-300 ${
                resolvedTheme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
              }`}
            >
              <div
                className="h-full bg-blue-500 transition-all duration-500 ease-out"
                style={{
                  width: currentStep === 1 ? '0%' : '100%',
                }}
              />
            </div>

            {steps.map((step, index) => (
              <div key={step.id} className="flex flex-col items-center relative z-10 flex-1">
                {/* Step Indicator */}
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all duration-300 ${
                    currentStep === step.id
                      ? 'bg-blue-500 border-blue-500 text-white shadow-lg scale-110'
                      : currentStep > step.id
                        ? 'bg-green-500 border-green-500 text-white shadow-md'
                        : resolvedTheme === 'dark'
                          ? 'bg-gray-800 border-gray-600 text-gray-400'
                          : 'bg-white border-gray-300 text-gray-500'
                  }`}
                >
                  {currentStep > step.id ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <span className="font-semibold text-sm">{step.id}</span>
                  )}
                </div>

                {/* Step Labels */}
                <div className="mt-2 text-center">
                  <div
                    className={`text-xs font-medium transition-colors duration-300 ${
                      currentStep === step.id
                        ? 'text-blue-500'
                        : currentStep > step.id
                          ? 'text-green-500'
                          : resolvedTheme === 'dark'
                            ? 'text-gray-400'
                            : 'text-gray-500'
                    }`}
                  >
                    {step.title}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="space-y-6">
          {/* Step 1: Database Setup */}
          {currentStep === 1 && (
            <div className="space-y-6">
              {/* Status Card */}
              <div
                className={`p-4 rounded-lg border ${resolvedTheme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Play className="w-5 h-5 text-blue-500" />
                    Database Status
                  </h3>
                  <div className="flex items-center gap-2">
                    {isCheckingQdrant ? (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                        <span className="text-sm">Checking...</span>
                      </div>
                    ) : isQdrantRunning ? (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-sm text-green-600 font-medium">Running</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                        <span className="text-sm text-red-600 font-medium">Not Running</span>
                      </div>
                    )}
                    <button
                      onClick={onRefreshStatus}
                      className={`px-3 py-1 rounded text-sm font-medium cursor-pointer transition-colors ${
                        resolvedTheme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                      }`}
                    >
                      Refresh
                    </button>
                  </div>
                </div>
              </div>

              {/* Installation Methods */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Installation Methods</h3>

                {/* Docker Method */}
                <div
                  className={`p-4 rounded-lg border ${resolvedTheme === 'dark' ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-200'}`}
                >
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm">
                      1
                    </div>
                    Docker (Recommended)
                  </h4>
                  <p className="text-sm mb-3">
                    Run Qdrant in a Docker container. Make sure Docker is installed on your system.
                  </p>
                  <div className="flex items-center gap-2">
                    <div
                      className={`flex-1 font-mono text-sm p-3 rounded ${
                        resolvedTheme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'
                      }`}
                    >
                      docker run -p 6333:6333 qdrant/qdrant
                    </div>
                    <button
                      onClick={() => copyToClipboard('docker run -p 6333:6333 qdrant/qdrant')}
                      className={`p-3 rounded cursor-pointer transition-colors ${
                        resolvedTheme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                      }`}
                    >
                      {copiedCommand === 'docker run -p 6333:6333 qdrant/qdrant' ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Manual Method */}
                <div
                  className={`p-4 rounded-lg border ${resolvedTheme === 'dark' ? 'bg-green-900/20 border-green-800' : 'bg-green-50 border-green-200'}`}
                >
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-sm">
                      2
                    </div>
                    Manual Installation
                  </h4>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li>
                      Visit{' '}
                      <a
                        href="https://qdrant.tech/documentation/quick-start/"
                        className="text-blue-500 hover:underline cursor-pointer"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Qdrant Quick Start
                      </a>
                    </li>
                    <li>Download the appropriate version for your operating system</li>
                    <li>Extract the files and run the qdrant executable</li>
                  </ol>
                </div>
              </div>

              {/* Verification */}
              <div
                className={`p-4 rounded-lg border ${resolvedTheme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}
              >
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Terminal className="w-5 h-5 text-blue-500" />
                  Verify Installation
                </h4>
                <p className="text-sm mb-2">Once Qdrant is running, open this URL in your browser:</p>
                <div className="flex items-center gap-2">
                  <div
                    className={`flex-1 font-mono text-sm p-3 rounded ${
                      resolvedTheme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'
                    }`}
                  >
                    http://localhost:6333
                  </div>
                  <button
                    onClick={() => copyToClipboard('http://localhost:6333')}
                    className={`p-3 rounded cursor-pointer transition-colors ${
                      resolvedTheme === 'dark' ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                    }`}
                  >
                    {copiedCommand === 'http://localhost:6333' ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs mt-2 opacity-70">You should see the Qdrant dashboard.</p>
              </div>
            </div>
          )}

          {/* Step 2: Model Installation */}
          {currentStep === 2 && (
            <div className="space-y-6">
              {/* Model Status Card */}
              <div
                className={`p-4 rounded-lg border ${resolvedTheme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      <Download className="w-5 h-5 text-blue-500" />
                      Embedding Model Status
                    </h3>
                    <p className="text-sm mt-1 opacity-70">Required for converting documents into vectors</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isEmbedInstalled ? (
                      <div className="flex items-center gap-2 text-green-600 font-medium">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        Installed
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-red-600 font-medium">
                        <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                        Not Installed
                      </div>
                    )}
                  </div>
                </div>

                <div className={`p-3 rounded mb-4 ${resolvedTheme === 'dark' ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <div className="font-mono text-sm">{QDRANT_EMBED_MODEL}</div>
                </div>

                {/* Download Progress/Button */}
                {!isEmbedInstalled ? (
                  <div className="space-y-4">
                    <button
                      onClick={handleInstallEmbed}
                      disabled={isInstallingEmbed || isEmbedDownloading}
                      className={`w-full py-3 rounded-lg font-semibold transition-all cursor-pointer ${
                        isInstallingEmbed || isEmbedDownloading
                          ? 'bg-blue-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-500'
                      } text-white flex items-center justify-center gap-2`}
                    >
                      {isInstallingEmbed || isEmbedDownloading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Downloading Model...
                        </>
                      ) : (
                        <>
                          <Download className="w-5 h-5" />
                          Install Embedding Model
                        </>
                      )}
                    </button>

                    {/* Progress Indicator */}
                    {(isInstallingEmbed || isEmbedDownloading) && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Downloading {QDRANT_EMBED_MODEL}</span>
                          <span className="opacity-70">This may take a few minutes</span>
                        </div>
                        <div
                          className={`h-2 rounded-full overflow-hidden ${
                            resolvedTheme === 'dark' ? 'bg-gray-700' : 'bg-gray-200'
                          }`}
                        >
                          <div
                            className="h-full bg-blue-500 rounded-full animate-pulse"
                            style={{
                              width: '100%',
                              background: 'linear-gradient(90deg, #3b82f6, #60a5fa, #3b82f6)',
                              backgroundSize: '200% 100%',
                              animation: 'shimmer 2s infinite',
                            }}
                          />
                        </div>
                        <style>{`
                          @keyframes shimmer {
                            0% {
                              background-position: -200% 0;
                            }
                            100% {
                              background-position: 200% 0;
                            }
                          }
                        `}</style>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className={`p-3 rounded text-center ${
                      resolvedTheme === 'dark' ? 'bg-green-900/20 text-green-400' : 'bg-green-50 text-green-700'
                    }`}
                  >
                    <Check className="w-5 h-5 inline mr-2" />
                    Model successfully installed and ready to use
                  </div>
                )}
              </div>

              {/* Model Information */}
              <div
                className={`p-4 rounded-lg border ${resolvedTheme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}
              >
                <h4 className="font-semibold mb-3">About the Embedding Model</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Converts text documents into numerical vectors for semantic search</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Enables intelligent document search and retrieval</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Required for ingesting and searching your documents</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-8 pt-6 border-t border-gray-700">
          <div className="flex gap-3">
            {currentStep > 1 ? (
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 cursor-pointer ${
                  resolvedTheme === 'dark'
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            ) : (
              <button
                onClick={onClose}
                className={`px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer ${
                  resolvedTheme === 'dark'
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                }`}
              >
                Close
              </button>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => window.open('https://qdrant.tech/documentation/quick-start/', '_blank')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer ${
                resolvedTheme === 'dark'
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
              }`}
            >
              Documentation
            </button>

            {/* Conditional Next / Proceed Button */}
            {currentStep < steps.length ? (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                disabled={(currentStep === 1 && !isQdrantRunning) || (currentStep === 2 && !isEmbedInstalled)}
                className={`px-6 py-2 rounded-lg font-medium transition-all flex items-center gap-2 cursor-pointer ${
                  (currentStep === 1 && !isQdrantRunning) || (currentStep === 2 && !isEmbedInstalled)
                    ? 'bg-gray-500 text-gray-300 cursor-not-allowed'
                    : resolvedTheme === 'dark'
                      ? 'bg-blue-600 hover:bg-blue-500 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                Next
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={onProceed}
                disabled={!isQdrantRunning || !isEmbedInstalled}
                className={`px-6 py-2 rounded-lg font-medium transition-all cursor-pointer ${
                  !isQdrantRunning || !isEmbedInstalled
                    ? 'bg-gray-500 text-gray-300 cursor-not-allowed'
                    : resolvedTheme === 'dark'
                      ? 'bg-green-600 hover:bg-green-500 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                Proceed to Documents
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default QdrantSetupModal
