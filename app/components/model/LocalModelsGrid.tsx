import React from 'react'
import { Play, Trash2, Download, Server, AlertCircle, CheckCircle2, Database } from 'lucide-react'
import { LocalModel } from '@/app/types/model'
import { getStatusColor } from '@/app/utils/model'
import { Link } from 'react-router-dom'

interface LocalModelsGridProps {
  localModels: LocalModel[]
  localLoading: boolean
  theme: string | undefined
  onStartModel: (model: LocalModel) => void
  onDeleteClick: (model: LocalModel) => void
  ollamaStatus: 'checking' | 'running' | 'not-running'
  onRetryConnection: () => void
}

export const LocalModelsGrid: React.FC<LocalModelsGridProps> = ({
  localModels,
  localLoading,
  theme,
  onStartModel,
  onDeleteClick,
  ollamaStatus,
  onRetryConnection,
}) => {
  // Separate text and embedding models
  const textModels = localModels.filter(model => !model.isEmbedding && model.type !== 'embedding')
  const embeddingModels = localModels.filter(model => model.isEmbedding || model.type === 'embedding')

  // Show loading state
  if (localLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div
          className={`animate-spin rounded-full h-12 w-12 border-b-2 ${
            resolvedTheme === 'dark' ? 'border-blue-500' : 'border-blue-600'
          }`}
        ></div>
        <p className={`text-lg font-medium ${resolvedTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
          Checking Ollama status...
        </p>
      </div>
    )
  }

  // Show Ollama not running state
  if (ollamaStatus === 'not-running') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-6 px-6">
        {/* Icon */}
        <div
          className={`p-4 rounded-full ${resolvedTheme === 'dark' ? 'bg-red-900/20 text-red-400' : 'bg-red-100 text-red-600'}`}
        >
          <Server size={48} />
        </div>

        {/* Main Message */}
        <div className="space-y-3">
          <h3 className={`text-2xl font-bold ${resolvedTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
            Ollama Not Detected
          </h3>
          <p
            className={`text-lg max-w-md mx-auto leading-relaxed ${
              resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            }`}
          >
            Ollama is not running or not installed. Please install and start Ollama to manage local models.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 pt-4">
          <Link
            to="https://ollama.ai/download"
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center justify-center px-6 py-3 rounded-lg font-semibold text-white transition-all duration-200 shadow-lg hover:shadow-xl ${
              resolvedTheme === 'dark'
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800'
            }`}
          >
            <Download size={20} className="mr-2" />
            Download Ollama
          </Link>

          <button
            onClick={onRetryConnection}
            className={`inline-flex items-center justify-center px-6 py-3 rounded-lg font-semibold transition-all duration-200 border-2 ${
              resolvedTheme === 'dark'
                ? 'border-gray-600 text-gray-300 hover:border-gray-500 hover:bg-gray-800'
                : 'border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50'
            }`}
          >
            <CheckCircle2 size={20} className="mr-2" />
            Retry Connection
          </button>
        </div>

        {/* Help Text */}
        <div
          className={`text-sm max-w-lg mx-auto space-y-2 pt-4 ${resolvedTheme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}
        >
          <div className="flex items-center justify-center space-x-2">
            <AlertCircle size={16} />
            <span>After installing Ollama, make sure it's running in the background</span>
          </div>
          <p>On Windows: Look for Ollama in system tray • macOS: Check Applications • Linux: Run `ollama serve`</p>
        </div>
      </div>
    )
  }

  // Show empty state when Ollama is running but no models
  if (localModels.length === 0 && ollamaStatus === 'running') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-6 px-6">
        {/* Icon */}
        <div
          className={`p-4 rounded-full ${
            resolvedTheme === 'dark' ? 'bg-blue-900/20 text-blue-400' : 'bg-blue-100 text-blue-600'
          }`}
        >
          <Download size={48} />
        </div>

        {/* Main Message */}
        <div className="space-y-3">
          <h3 className={`text-2xl font-bold ${resolvedTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
            No Local Models
          </h3>
          <p
            className={`text-lg max-w-md mx-auto leading-relaxed ${
              resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'
            }`}
          >
            Ollama is running and ready! Download your first model from the Browse Models section to get started.
          </p>
        </div>

        {/* Status Indicator */}
        <div
          className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
            resolvedTheme === 'dark' ? 'bg-green-900/20 text-green-400' : 'bg-green-100 text-green-700'
          }`}
        >
          <CheckCircle2 size={16} className="mr-2" />
          Ollama Connected
        </div>
      </div>
    )
  }

  // Show models grid
  return (
    <div className="space-y-6">
      {/* Status Header */}
      <div
        className={`flex items-center justify-between p-4 rounded-xl ${
          resolvedTheme === 'dark' ? 'bg-gray-800/50' : 'bg-blue-50'
        }`}
      >
        <div className="flex items-center space-x-3">
          <div
            className={`p-2 rounded-full ${
              resolvedTheme === 'dark' ? 'bg-green-900/20 text-green-400' : 'bg-green-100 text-green-600'
            }`}
          >
            <CheckCircle2 size={20} />
          </div>
          <div>
            <h3 className={`font-semibold ${resolvedTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
              Ollama Connected
            </h3>
            <p className={`text-sm ${resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              {textModels.length} text model{textModels.length !== 1 ? 's' : ''} • {embeddingModels.length} embedding model{embeddingModels.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button
          onClick={onRetryConnection}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            resolvedTheme === 'dark'
              ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-300'
          }`}
        >
          Refresh
        </button>
      </div>

      {/* Text/Language Models Section */}
      {textModels.length > 0 && (
        <div className="space-y-4">
          <h3 className={`text-xl font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Language Models ({textModels.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {textModels.map((model) => {
              const modelId = model.model
              return (
                <div
                  key={modelId}
                  className={`rounded-xl border p-6 flex flex-col shadow-sm hover:shadow-lg transition-all duration-200 group ${
                    resolvedTheme === 'dark'
                      ? 'bg-gray-800 border-gray-700 hover:border-gray-600'
                      : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {/* Header Section */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      <h4
                        className={`font-semibold text-lg truncate mb-2 ${
                          resolvedTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                        }`}
                      >
                        {model.name}
                      </h4>
                      <div className="flex items-center gap-2 mb-3">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                            model.status,
                            theme
                          )}`}
                        >
                          ✅ {model.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Model Info */}
                  <div className="mb-4">
                    <p className={`text-sm mb-3 leading-relaxed ${resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
                      Size:{' '}
                      <span className={`font-medium ${resolvedTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                        {model.size}
                      </span>{' '}
                      • Params:{' '}
                      <span className={`font-medium ${resolvedTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                        {model.parameters}
                      </span>
                    </p>
                  </div>

                  {/* Description */}
                  <div className="flex-1 mb-6">
                    <p
                      className={`text-sm leading-relaxed min-h-[90px] ${
                        resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                      }`}
                    >
                      {model.description || 'No description available for this model.'}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  {model.status === 'installed' && (
                    <div className="flex gap-3 mt-auto">
                      <button
                        onClick={() => onStartModel(model)}
                        className="flex-1 h-10 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white py-2 px-4 rounded-lg flex items-center justify-center space-x-2 font-medium transition-all duration-200 shadow-sm hover:shadow-md group-hover:scale-[1.02]"
                      >
                        <Play size={18} />
                        <span>Start</span>
                      </button>

                      <button
                        onClick={() => onDeleteClick(model)}
                        className="flex-1 h-10 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white py-2 px-4 rounded-lg flex items-center justify-center space-x-2 font-medium transition-all duration-200 shadow-sm hover:shadow-md group-hover:scale-[1.02]"
                      >
                        <Trash2 size={18} />
                        <span>Uninstall</span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Embedding Models Section */}
      {embeddingModels.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Database size={20} className={resolvedTheme === 'dark' ? 'text-purple-400' : 'text-purple-600'} />
            <h3 className={`text-xl font-semibold ${resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              Embedding Models ({embeddingModels.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {embeddingModels.map((model) => {
              const modelId = model.model
              return (
                <div
                  key={modelId}
                  className={`rounded-xl border p-6 flex flex-col shadow-sm hover:shadow-lg transition-all duration-200 group ${
                    resolvedTheme === 'dark'
                      ? 'bg-gradient-to-br from-purple-900/20 to-indigo-900/20 border-purple-500/30 hover:border-purple-400/50'
                      : 'bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200 hover:border-purple-300'
                  }`}
                >
                  {/* Header Section */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Database 
                          size={18} 
                          className={resolvedTheme === 'dark' ? 'text-purple-400' : 'text-purple-600'}
                        />
                        <h4
                          className={`font-semibold text-lg truncate ${
                            resolvedTheme === 'dark' ? 'text-purple-300' : 'text-purple-900'
                          }`}
                        >
                          {model.name}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            resolvedTheme === 'dark'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : 'bg-purple-100 text-purple-700 border border-purple-300'
                          }`}
                        >
                          Embedding Model
                        </span>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                            model.status,
                            theme
                          )}`}
                        >
                          ✅ {model.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Model Info */}
                  <div className="mb-4">
                    <p className={`text-sm mb-3 leading-relaxed ${resolvedTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
                      Size:{' '}
                      <span className={`font-medium ${resolvedTheme === 'dark' ? 'text-purple-200' : 'text-purple-900'}`}>
                        {model.size}
                      </span>{' '}
                      • Params:{' '}
                      <span className={`font-medium ${resolvedTheme === 'dark' ? 'text-purple-200' : 'text-purple-900'}`}>
                        {model.parameters}
                      </span>
                    </p>
                  </div>

                  {/* Description */}
                  <div className="flex-1 mb-6">
                    <p
                      className={`text-sm leading-relaxed min-h-[90px] ${
                        resolvedTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                      }`}
                    >
                      {model.description || 'Vector embedding model for semantic search and similarity tasks.'}
                    </p>
                  </div>

                  {/* Action Buttons - Only Delete for Embedding Models */}
                  {model.status === 'installed' && (
                    <div className="flex gap-3 mt-auto">
                      <button
                        onClick={() => onDeleteClick(model)}
                        className={`flex-1 h-10 rounded-lg flex items-center justify-center space-x-2 font-medium transition-all duration-200 shadow-sm hover:shadow-md group-hover:scale-[1.02] ${
                          resolvedTheme === 'dark'
                            ? 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white'
                            : 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white'
                        }`}
                      >
                        <Trash2 size={18} />
                        <span>Uninstall</span>
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}