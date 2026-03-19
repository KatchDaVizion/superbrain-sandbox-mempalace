import React from 'react'
import { Download, ChevronDown, Database, Cpu, HardDrive } from 'lucide-react'
import { BrowseModel } from '../../types/model'

interface EmbeddingModelCardProps {
  model: BrowseModel
  selectedVersion: string
  downloadingModels: Set<string>
  theme: string | undefined
  onVersionSelect: (modelName: string, version: string) => void
  onDownload: (modelName: string) => void
}

export const EmbeddingModelCard: React.FC<EmbeddingModelCardProps> = ({
  model,
  selectedVersion,
  downloadingModels,
  theme,
  onVersionSelect,
  onDownload,
}) => {
  const currentVersion = model.versions.find((v) => v.model_name === selectedVersion) || model.versions[0]
  const isDownloading = downloadingModels.has(selectedVersion)

  return (
    <div
      className={`border rounded-lg p-5 shadow-sm transition-all duration-200 hover:shadow-md ${
        resolvedTheme === 'dark'
          ? 'bg-gradient-to-br from-purple-900/20 to-indigo-900/20 border-purple-500/30 hover:border-purple-400/50'
          : 'bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200 hover:border-purple-300'
      }`}
    >
      {/* Header with Embedding Badge */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Database 
              size={20} 
              className={resolvedTheme === 'dark' ? 'text-purple-400' : 'text-purple-600'}
            />
            <h3 className={`text-lg font-semibold ${resolvedTheme === 'dark' ? 'text-purple-300' : 'text-purple-900'}`}>
              {model.name}
            </h3>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`text-xs px-2 py-1 rounded-full font-medium ${
                resolvedTheme === 'dark'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'bg-purple-100 text-purple-700 border border-purple-300'
              }`}
            >
              Embedding Model
            </span>
            {model.parameters && (
              <span
                className={`text-xs px-2 py-1 rounded-full font-medium ${
                  resolvedTheme === 'dark'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                }`}
              >
                {model.parameters}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <p className={`text-sm mb-4 line-clamp-2 ${resolvedTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
        {model.description}
      </p>

      {/* Version Info Grid */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div
          className={`flex flex-col items-center p-2 rounded-lg ${
            resolvedTheme === 'dark' ? 'bg-purple-800/20' : 'bg-purple-100/50'
          }`}
        >
          <HardDrive size={16} className={resolvedTheme === 'dark' ? 'text-purple-400 mb-1' : 'text-purple-600 mb-1'} />
          <span className={`text-xs font-medium ${resolvedTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
            {currentVersion.size}
          </span>
          <span className={`text-xs ${resolvedTheme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>Size</span>
        </div>

        <div
          className={`flex flex-col items-center p-2 rounded-lg ${
            resolvedTheme === 'dark' ? 'bg-purple-800/20' : 'bg-purple-100/50'
          }`}
        >
          <Cpu size={16} className={resolvedTheme === 'dark' ? 'text-purple-400 mb-1' : 'text-purple-600 mb-1'} />
          <span className={`text-xs font-medium ${resolvedTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
            {currentVersion.context}
          </span>
          <span className={`text-xs ${resolvedTheme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>Context</span>
        </div>

        <div
          className={`flex flex-col items-center p-2 rounded-lg ${
            resolvedTheme === 'dark' ? 'bg-purple-800/20' : 'bg-purple-100/50'
          }`}
        >
          <Database size={16} className={resolvedTheme === 'dark' ? 'text-purple-400 mb-1' : 'text-purple-600 mb-1'} />
          <span className={`text-xs font-medium ${resolvedTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
            {currentVersion.parameters || 'N/A'}
          </span>
          <span className={`text-xs ${resolvedTheme === 'dark' ? 'text-gray-500' : 'text-gray-500'}`}>Params</span>
        </div>
      </div>

      {/* Additional Info */}
      {(currentVersion.arch || currentVersion.quantization) && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {currentVersion.arch && (
            <span
              className={`text-xs px-2 py-1 rounded ${
                resolvedTheme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
              }`}
            >
              {currentVersion.arch}
            </span>
          )}
          {currentVersion.quantization && (
            <span
              className={`text-xs px-2 py-1 rounded ${
                resolvedTheme === 'dark' ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
              }`}
            >
              {currentVersion.quantization}
            </span>
          )}
        </div>
      )}

      {/* Version Selector */}
      {model.versions.length > 1 && (
        <div className="mb-4">
          <label className={`text-xs font-medium mb-1 block ${resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Version
          </label>
          <div className="relative">
            <select
              value={selectedVersion}
              onChange={(e) => onVersionSelect(model.name, e.target.value)}
              className={`w-full px-3 py-2 pr-8 rounded-lg text-sm appearance-none cursor-pointer transition-colors ${
                resolvedTheme === 'dark'
                  ? 'bg-gray-700 text-white border border-purple-500/30 hover:border-purple-400/50'
                  : 'bg-white text-gray-900 border border-purple-200 hover:border-purple-300'
              }`}
            >
              {model.versions.map((v) => (
                <option key={v.model_name} value={v.model_name}>
                  {v.model_name} - {v.size}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'
              }`}
            />
          </div>
        </div>
      )}

      {/* Download Button */}
      <button
        onClick={() => onDownload(selectedVersion)}
        disabled={isDownloading}
        className={`w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-lg font-medium transition-all duration-200 ${
          isDownloading
            ? resolvedTheme === 'dark'
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            : resolvedTheme === 'dark'
            ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-purple-500/20'
            : 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-purple-200'
        }`}
      >
        {isDownloading ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent" />
            <span>Downloading...</span>
          </>
        ) : (
          <>
            <Download size={16} />
            <span>Download</span>
          </>
        )}
      </button>
    </div>
  )
}