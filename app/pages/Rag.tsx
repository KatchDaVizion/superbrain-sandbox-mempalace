import React, { useEffect, useState } from 'react'
import { Brain, Search, Filter, Plus, Files, RefreshCcw } from 'lucide-react'
import { HoverCard, HoverCardTrigger } from '../components/ui/hover-card'
import { useTheme } from 'next-themes'
import ChatContainer from '../components/chat/chatContainer'
import RightSidebar from '../components/ollama/RightSidebar'
import DashboardLayout from '../components/shared/DashboardLayout'
import Header from '../components/ollama/Header'
import { useLocation } from 'react-router-dom'
import MobileStatusCards from '../components/ollama/MobileStatusCards'
import IngestModal from '../components/rag/IngestModal'
import { useRagOllama } from '../hooks/useRagOllama'
import QdrantSetupModal from '../components/rag/QdrantSetupModal'
import { useModels } from '../hooks/useModel'
import RagHeader from '../components/rag/RagHeader'
import { useCollections } from '@/lib/chat/CollectionsContext'
import DocumentInventory from '../components/rag/DocumentInventory'

type AvailableModel = {
  model: string
  name: string
  size: number
  specialty?: string
}

const Rag: React.FC = () => {
  const location = useLocation()
  const passedModel = (location.state as any)?.model
  const { theme } = useTheme()
  const [modelSearchQuery, setModelSearchQuery] = useState('')
  const [collectionSearchQuery, setCollectionSearchQuery] = useState('')
  const [selectedSpecialty, setSelectedSpecialty] = useState<string | undefined>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [isQdrantRunning, setIsQdrantRunning] = useState<boolean | null>(null)
  const [isCheckingQdrant, setIsCheckingQdrant] = useState(false)

  const {
    availableModels = [] as AvailableModel[],
    selectedModel,
    setSelectedModel,
    selectedModelData,
    getCurrentCreativityLevel,
    chatMessages,
    inputMessage,
    setInputMessage,
    handleSendMessage,
    handleKeyPress,
    clearConversation,
    createNewChat,
    isLoading,
    isLoadingHistory,
    isLoadingThread,
    canStop,
    stopResponse,
  } = useRagOllama() as any
  const { localModels = [] } = useModels() as any

  // Use collections from context
  const { collections, selectedCollection, setCollections, setSelectedCollection } =
    useCollections()

  const [initializedFromPassed, setInitializedFromPassed] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showQdrantSetupModal, setShowQdrantSetupModal] = useState(false)
  const [showCollectionModal, setShowCollectionModal] = useState(false)
  const [collectionsLoading, setCollectionsLoading] = useState(false)

  // compute whether embed model is installed:
  const isEmbedInstalled = (localModels || []).some(
    (m: any) =>
      // either exact or contains the core name (handles tags like "nomic-embed-text:latest")
      (m.model && m.model === 'nomic-embed-text:latest') || (m.model && m.model.includes('nomic-embed-text'))
  )

  // Check Qdrant status using Electron's net module via IPC
  const checkQdrantStatus = async () => {
    setIsCheckingQdrant(true)

    try {
      const result = await window.RAGApi.checkQdrantStatus()

      if (!result || typeof result.running !== 'boolean') {
        setIsQdrantRunning(false)
      } else {
        setIsQdrantRunning(result.running)
      }
    } catch (error) {
      console.error('Qdrant status check failed:', error)
      setIsQdrantRunning(false)
    } finally {
      setIsCheckingQdrant(false)
    }
  }

  useEffect(() => {
    checkQdrantStatus()

    // Check every 10 seconds if Qdrant is not running
    // const interval = setInterval(() => {
    //   if (!isQdrantRunning) {
    //     checkQdrantStatus()
    //   }
    // }, 10000)

    // return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!initializedFromPassed && passedModel && availableModels.length > 0) {
      setSelectedModel(passedModel.model)
      setInitializedFromPassed(true)
    }
  }, [passedModel, availableModels, initializedFromPassed, setSelectedModel])

  const handleAddDocumentClick = async () => {
    // Always re-check Qdrant before opening anything
    await checkQdrantStatus()

    if (!isQdrantRunning) {
      setShowQdrantSetupModal(true)
      return
    }

    if (!isEmbedInstalled) {
      setShowQdrantSetupModal(true)
      return
    }

    setIsModalOpen(true)
  }

  const fetchCollections = async () => {
    if (!isQdrantRunning) {
      setCollections([])
      return
    }

    try {
      setCollectionsLoading(true)
      const list = await window.RAGApi.listCollections()
      setCollections(list || [])
    } catch (err) {
      console.error('Failed to fetch collections:', err)
      setCollections([])
    } finally {
      setCollectionsLoading(false)
    }
  }

  useEffect(() => {
    if (!isQdrantRunning) return
    fetchCollections() // fetch only once on start
  }, [isQdrantRunning])

  // Auto-select the first collection when collections load
  useEffect(() => {
    if (collections.length > 0 && !selectedCollection) {
      setSelectedCollection(collections[0])
    }
  }, [collections, selectedCollection, setSelectedCollection])

  // Update the filteredModels function:
  const filteredModels = availableModels.filter((model) => {
    const matchesSearch =
      model.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) ||
      model.specialty?.toLowerCase().includes(modelSearchQuery.toLowerCase())
    const matchesSpecialty = selectedSpecialty === 'all' || model.specialty === selectedSpecialty
    return matchesSearch && matchesSpecialty
  })

  const specialties: string[] = [
    'all',
    ...(Array.from(new Set(availableModels.map((model) => model.specialty).filter(Boolean))) as string[]),
  ]

  return (
    <DashboardLayout>
      <RagHeader />

      <div className="flex flex-col xl:flex-row gap-6 w-full">
        {/* Main Content Area */}
        <div className="flex-1 space-y-6">
          {/* Top Controls Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* List of collections - Updated to match Model Selection style */}
            <div
              className={`backdrop-blur rounded-2xl border p-5 ${
                theme === 'dark' ? 'bg-card/50 border-purple-500/30' : 'bg-white/80 border-purple-200 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3
                  className={`text-lg font-semibold flex items-center ${
                    theme === 'dark' ? 'text-purple-300' : 'text-purple-700'
                  }`}
                >
                  <Files className="w-5 h-5 mr-2" />
                  Collections ({collections.length})
                </h3>

                <div className="flex items-center gap-2">
                  {/* 🔄 Refresh Collections Button */}
                  <button
                    onClick={fetchCollections}
                    disabled={!isQdrantRunning || collectionsLoading}
                    className={`p-2 rounded-lg border transition-colors ${
                      theme === 'dark'
                        ? 'border-gray-600 hover:border-purple-400 hover:bg-purple-500/10 disabled:opacity-50'
                        : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50 disabled:opacity-50'
                    }`}
                  >
                    <RefreshCcw className={`w-4 h-4 ${collectionsLoading ? 'animate-spin' : ''}`} />
                  </button>

                  {collections.length > 6 && (
                    <button
                      onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                      className={`p-2 rounded-lg border transition-colors ${
                        theme === 'dark'
                          ? 'border-gray-600 hover:border-gray-500 hover:bg-gray-800/50'
                          : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      <Filter className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {collectionsLoading ? (
                <div className="text-center py-8">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${
                      theme === 'dark' ? 'bg-muted' : 'bg-gray-100'
                    }`}
                  >
                    <Files className={`w-6 h-6 ${theme === 'dark' ? 'text-muted-foreground' : 'text-gray-500'}`} />
                  </div>
                  <p className={theme === 'dark' ? 'text-muted-foreground mb-1' : 'text-gray-600 mb-1'}>
                    Loading collections...
                  </p>
                </div>
              ) : collections.length === 0 ? (
                <div className="text-center py-8">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${
                      theme === 'dark' ? 'bg-muted' : 'bg-gray-100'
                    }`}
                  >
                    <Files className={`w-6 h-6 ${theme === 'dark' ? 'text-muted-foreground' : 'text-gray-500'}`} />
                  </div>
                  <p className={theme === 'dark' ? 'text-muted-foreground mb-1' : 'text-gray-600 mb-1'}>
                    No collections available
                  </p>
                  <p className={`text-sm ${theme === 'dark' ? 'text-muted-foreground' : 'text-gray-500'}`}>
                    Create a collection to get started
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {collections.length > 4 && (
                    <div className="space-y-3">
                      <div className="relative">
                        <Search
                          className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
                            theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        />
                        <input
                          type="text"
                          placeholder="Search collections..."
                          value={collectionSearchQuery}
                          onChange={(e) => setCollectionSearchQuery(e.target.value)}
                          className={`w-full pl-10 pr-4 py-2 rounded-lg border transition-colors ${
                            theme === 'dark'
                              ? 'bg-gray-800/50 border-gray-600 text-gray-200 placeholder-gray-400 focus:border-purple-500 focus:bg-gray-800'
                              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500 focus:bg-white'
                          } focus:outline-none focus:ring-2 focus:ring-purple-500/20`}
                        />
                      </div>
                    </div>
                  )}

                  <div
                    className={`${
                      viewMode === 'grid'
                        ? collections.length > 6
                          ? 'grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto scrollbar-thin'
                          : 'space-y-2 max-h-64 overflow-y-auto'
                        : 'space-y-2 max-h-80 overflow-y-auto scrollbar-thin'
                    }`}
                  >
                    {collections.map((collection) => (
                      <HoverCard key={collection}>
                        <HoverCardTrigger asChild>
                          <div
                            onClick={() => {
                              setSelectedCollection(collection)
                              // setIsModalOpen(true)
                            }}
                            className={`relative p-3 rounded-lg border transition-all duration-200 cursor-pointer group ${
                              selectedCollection === collection
                                ? theme === 'dark'
                                  ? 'border-purple-500 bg-purple-500/10 shadow-sm'
                                  : 'border-purple-500 bg-purple-50 shadow-md'
                                : theme === 'dark'
                                  ? 'border-border bg-card/30 hover:border-purple-400 hover:bg-purple-500/5'
                                  : 'border-gray-200 bg-white/50 hover:border-purple-300 hover:bg-purple-50/50 hover:shadow-sm'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <h4
                                  className={`font-medium text-sm truncate ${
                                    theme === 'dark' ? 'text-foreground' : 'text-gray-900'
                                  }`}
                                >
                                  {collection}
                                </h4>
                                <div className="flex items-center space-x-3 mt-1">
                                  <span
                                    className={`text-xs ${
                                      theme === 'dark' ? 'text-muted-foreground' : 'text-gray-500'
                                    }`}
                                  >
                                    Collection
                                  </span>
                                </div>
                              </div>
                              {selectedCollection === collection && (
                                <div
                                  className={`w-2 h-2 rounded-full animate-pulse ml-3 ${
                                    theme === 'dark' ? 'bg-purple-400' : 'bg-purple-600'
                                  }`}
                                ></div>
                              )}
                            </div>
                          </div>
                        </HoverCardTrigger>
                      </HoverCard>
                    ))}
                  </div>

                  {collections.length === 0 && (
                    <div className="text-center py-6">
                      <p className={`text-sm ${theme === 'dark' ? 'text-muted-foreground' : 'text-gray-600'}`}>
                        No collections found
                      </p>
                      <button
                        onClick={() => setShowCollectionModal(true)}
                        className={`mt-2 text-xs px-3 py-1 rounded-md transition-colors ${
                          theme === 'dark'
                            ? 'text-purple-400 hover:text-purple-300 hover:bg-purple-500/10'
                            : 'text-purple-600 hover:text-purple-700 hover:bg-purple-50'
                        }`}
                      >
                        Create collection
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Model Selection */}
            <div
              className={`backdrop-blur rounded-2xl border p-5 ${
                theme === 'dark' ? 'bg-card/50 border-blue-500/30' : 'bg-white/80 border-blue-200 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3
                  className={`text-lg font-semibold flex items-center ${
                    theme === 'dark' ? 'text-blue-300' : 'text-blue-700'
                  }`}
                >
                  <Brain className="w-5 h-5 mr-2" />
                  AI Model ({filteredModels.length})
                </h3>
                {availableModels.length > 6 && (
                  <button
                    onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                    className={`p-2 rounded-lg border transition-colors ${
                      theme === 'dark'
                        ? 'border-gray-600 hover:border-gray-500 hover:bg-gray-800/50'
                        : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                  >
                    <Filter className="w-4 h-4" />
                  </button>
                )}
              </div>

              {availableModels.length === 0 ? (
                <div className="text-center py-8">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${
                      theme === 'dark' ? 'bg-muted' : 'bg-gray-100'
                    }`}
                  >
                    <Brain className={`w-6 h-6 ${theme === 'dark' ? 'text-muted-foreground' : 'text-gray-500'}`} />
                  </div>
                  <p className={theme === 'dark' ? 'text-muted-foreground mb-1' : 'text-gray-600 mb-1'}>
                    No models available
                  </p>
                  <p className={`text-sm ${theme === 'dark' ? 'text-muted-foreground' : 'text-gray-500'}`}>
                    Install Ollama models to start
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {availableModels.length > 4 && (
                    <div className="space-y-3">
                      <div className="relative">
                        <Search
                          className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
                            theme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        />
                        <input
                          type="text"
                          placeholder="Search models..."
                          value={modelSearchQuery}
                          onChange={(e) => setModelSearchQuery(e.target.value)}
                          className={`w-full pl-10 pr-4 py-2 rounded-lg border transition-colors ${
                            theme === 'dark'
                              ? 'bg-gray-800/50 border-gray-600 text-gray-200 placeholder-gray-400 focus:border-blue-500 focus:bg-gray-800'
                              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:bg-white'
                          } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                        />
                      </div>

                      {specialties.length > 2 && (
                        <div className="flex flex-wrap gap-2">
                          {specialties.map((specialty) => (
                            <button
                              key={specialty}
                              onClick={() => setSelectedSpecialty(specialty as string)}
                              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                                selectedSpecialty === specialty
                                  ? 'bg-blue-600 text-white'
                                  : theme === 'dark'
                                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              {specialty === 'all' ? 'All' : specialty}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div
                    className={`${
                      viewMode === 'grid'
                        ? availableModels.length > 6
                          ? 'grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto scrollbar-thin'
                          : 'space-y-2 max-h-64 overflow-y-auto'
                        : 'space-y-2 max-h-80 overflow-y-auto scrollbar-thin'
                    }`}
                  >
                    {filteredModels.map((model) => (
                      <HoverCard key={model.model}>
                        <HoverCardTrigger asChild>
                          <div
                            onClick={() => setSelectedModel(model.model)}
                            className={`relative p-3 rounded-lg border transition-all duration-200 cursor-pointer group ${
                              selectedModel === model.model
                                ? theme === 'dark'
                                  ? 'border-blue-500 bg-blue-500/10 shadow-sm'
                                  : 'border-blue-500 bg-blue-50 shadow-md'
                                : theme === 'dark'
                                  ? 'border-border bg-card/30 hover:border-blue-400 hover:bg-blue-500/5'
                                  : 'border-gray-200 bg-white/50 hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-sm'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <h4
                                  className={`font-medium text-sm truncate ${
                                    theme === 'dark' ? 'text-foreground' : 'text-gray-900'
                                  }`}
                                >
                                  {model.name}
                                </h4>
                                <div className="flex items-center space-x-3 mt-1">
                                  <span
                                    className={`text-xs ${
                                      theme === 'dark' ? 'text-muted-foreground' : 'text-gray-500'
                                    }`}
                                  >
                                    {(model.size / 1e9).toFixed(1)} GB
                                  </span>
                                  <span
                                    className={`text-xs font-medium ${
                                      theme === 'dark' ? 'text-blue-300' : 'text-blue-700'
                                    }`}
                                  >
                                    {model.specialty ?? 'General'}
                                  </span>
                                </div>
                              </div>
                              {selectedModel === model.model && (
                                <div
                                  className={`w-2 h-2 rounded-full animate-pulse ml-3 ${
                                    theme === 'dark' ? 'bg-blue-400' : 'bg-blue-600'
                                  }`}
                                ></div>
                              )}
                            </div>
                          </div>
                        </HoverCardTrigger>
                      </HoverCard>
                    ))}
                  </div>

                  {filteredModels.length === 0 && availableModels.length > 0 && (
                    <div className="text-center py-6">
                      <p className={`text-sm ${theme === 'dark' ? 'text-muted-foreground' : 'text-gray-600'}`}>
                        No models found matching your criteria
                      </p>
                      <button
                        onClick={() => {
                          setModelSearchQuery('')
                          setSelectedSpecialty('all')
                        }}
                        className={`mt-2 text-xs px-3 py-1 rounded-md transition-colors ${
                          theme === 'dark'
                            ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10'
                            : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                        }`}
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="xl:hidden sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b px-4 py-3 w-full">
            <button
              onClick={handleAddDocumentClick}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all shadow-sm cursor-pointer ${
                theme === 'dark'
                  ? 'bg-blue-600 text-white hover:bg-blue-500 active:scale-95'
                  : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
              }`}
            >
              <Plus className="w-5 h-5" />
              Add Document
            </button>
          </div>

          {/* Document Inventory */}
          <DocumentInventory
            collectionName={selectedCollection}
            qdrantConnected={isQdrantRunning}
          />

          {/* Chat Interface */}
          <div className="min-h-[600px]">
            <ChatContainer
              selectedModel={selectedModel}
              selectedCollection={selectedCollection}
              chatMessages={chatMessages}
              inputMessage={inputMessage}
              setInputMessage={setInputMessage}
              handleSendMessage={handleSendMessage}
              handleKeyPress={handleKeyPress}
              clearConversation={clearConversation}
              createNewChat={createNewChat}
              isLoading={isLoading}
              isLoadingHistory={isLoadingHistory}
              isLoadingThread={isLoadingThread}
              canStop={canStop}
              onStopResponse={stopResponse}
              chatType="rag"
            />
          </div>
        </div>

        {/* Desktop Sidebar */}
        <div className="hidden xl:block w-80 flex-shrink-0">
          <div className="mb-4">
            <button
              onClick={handleAddDocumentClick}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all shadow-sm cursor-pointer ${
                theme === 'dark'
                  ? 'bg-blue-600 text-white hover:bg-blue-500 active:scale-95'
                  : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
              }`}
            >
              <Plus className="w-5 h-5" />
              Add Document
            </button>
          </div>
          <RightSidebar selectedModelData={selectedModelData} getCurrentCreativityLevel={getCurrentCreativityLevel} />
        </div>
      </div>

      {/* Mobile Status Cards */}
      <MobileStatusCards selectedModelData={selectedModelData} isLoading={isLoading} />

      {/* Ingest Modal */}
      <IngestModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      {/* Qdrant Setup Modal */}
      <QdrantSetupModal
        isOpen={showQdrantSetupModal}
        onClose={() => setShowQdrantSetupModal(false)}
        onProceed={() => {
          setShowQdrantSetupModal(false)
          setIsModalOpen(true)
        }}
        isQdrantRunning={isQdrantRunning}
        isCheckingQdrant={isCheckingQdrant}
        onRefreshStatus={checkQdrantStatus}
      />
    </DashboardLayout>
  )
}

export default Rag
