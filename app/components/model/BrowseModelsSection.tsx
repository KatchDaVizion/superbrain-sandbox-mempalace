import React, { useMemo } from 'react';
import { Search, Download, Database } from 'lucide-react';
import { ModelVersionSelector } from './ModelVersionSelector';
import { BrowseModel } from '@/app/types/model';
import { formatSize } from '@/app/utils/model';

interface BrowseModelsSectionProps {
  showBrowser: boolean;
  browseModels: BrowseModel[];
  browseLoading: boolean;
  browseError: Error | null;
  searchQuery: string;
  selectedVersion: { [key: string]: string };
  downloadingModels: Set<string>;
  theme: string | undefined;
  onSearchChange: (query: string) => void;
  onVersionSelect: (modelName: string, version: string) => void;
  onDownload: (modelName: string) => Promise<void>;
}

export const BrowseModelsSection: React.FC<BrowseModelsSectionProps> = ({
  showBrowser,
  browseModels,
  browseLoading,
  browseError,
  searchQuery,
  selectedVersion,
  downloadingModels,
  theme,
  onSearchChange,
  onVersionSelect,
  onDownload
}) => {
  // Separate and filter models
  const { textModels, embeddingModels } = useMemo(() => {
    const filtered = browseModels.filter((model) =>
      model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    return {
      textModels: filtered.filter(m => m.type !== 'embedding'),
      embeddingModels: filtered.filter(m => m.type === 'embedding')
    };
  }, [browseModels, searchQuery]);

  if (!showBrowser) return null;

  return (
    <div>
      {/* Search */}
      <div className={`relative shadow-sm border rounded-2xl p-6 mb-6 ${
        theme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      }`}>
        <Search className={`absolute left-10 top-1/2 -translate-y-1/2 ${
          theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
        }`} size={20} />
        <input
          type="text"
          placeholder="Search available models..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className={`w-full pl-12 pr-4 py-3 border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm ${
            theme === 'dark'
              ? 'border-gray-600 bg-gray-700 text-gray-100 placeholder-gray-400'
              : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
          }`}
        />
      </div>

      {browseLoading && (
        <p className={`text-center ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          Loading models...
        </p>
      )}
      
      {browseError && (
        <p className={`text-center ${theme === 'dark' ? 'text-red-400' : 'text-red-600'}`}>
          {browseError instanceof Error ? browseError.message : String(browseError)}
        </p>
      )}

      {/* Text/Language Models Section */}
      {textModels.length > 0 && (
        <div className="mb-8">
          <h3 className={`text-lg font-semibold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Language Models ({textModels.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {textModels.map((model) => {
              const selected = selectedVersion[model.name] || model.versions[0]?.model_name;
              const selectedVersionData = model.versions.find((v) => v.model_name === selected);

              return (
                <div
                  key={model.name}
                  className={`border rounded-xl p-5 flex flex-col shadow-sm hover:shadow-md transition-all duration-200 ${
                    theme === 'dark' 
                      ? 'bg-gray-900 border-gray-700 hover:border-blue-500/50' 
                      : 'bg-gray-50 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex flex-col gap-3">
                    <h4 className={`font-semibold text-lg truncate ${
                      theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                    }`}>
                      {model.name}
                    </h4>
                    <p className={`text-sm min-h-[80px] ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      {model.description || 'No description available'}
                    </p>

                    <ModelVersionSelector
                      model={model}
                      selectedVersion={selectedVersion}
                      onVersionSelect={onVersionSelect}
                      theme={theme}
                    />
                  </div>

                  {/* Download Button */}
                  <div className="mt-4">
                    <button
                      onClick={() => onDownload(selected)}
                      disabled={downloadingModels.has(selected)}
                      className="w-full px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center justify-center space-x-2 transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      {downloadingModels.has(selected) ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <Download size={16} />
                          <span>
                            Download {selectedVersionData ? `(${formatSize(selectedVersionData.size)})` : ''}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Embedding Models Section */}
      {embeddingModels.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Database size={20} className={theme === 'dark' ? 'text-purple-400' : 'text-purple-600'} />
            <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              Embedding Models ({embeddingModels.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {embeddingModels.map((model) => {
              const selected = selectedVersion[model.name] || model.versions[0]?.model_name;
              const selectedVersionData = model.versions.find((v) => v.model_name === selected);

              return (
                <div
                  key={model.name}
                  className={`border rounded-xl p-5 flex flex-col shadow-sm hover:shadow-md transition-all duration-200 ${
                    theme === 'dark'
                      ? 'bg-gradient-to-br from-purple-900/20 to-indigo-900/20 border-purple-500/30 hover:border-purple-400/50'
                      : 'bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200 hover:border-purple-300'
                  }`}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Database 
                        size={18} 
                        className={theme === 'dark' ? 'text-purple-400' : 'text-purple-600'}
                      />
                      <h4 className={`font-semibold text-lg truncate ${
                        theme === 'dark' ? 'text-purple-300' : 'text-purple-900'
                      }`}>
                        {model.name}
                      </h4>
                    </div>
                    
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          theme === 'dark'
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                            : 'bg-purple-100 text-purple-700 border border-purple-300'
                        }`}
                      >
                        Embedding Model
                      </span>
                      {model.parameters && (
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium ${
                            theme === 'dark'
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              : 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                          }`}
                        >
                          {model.parameters}
                        </span>
                      )}
                    </div>

                    <p className={`text-sm min-h-[80px] ${
                      theme === 'dark' ? 'text-gray-300' : 'text-gray-700'
                    }`}>
                      {model.description || 'No description available'}
                    </p>

                    <ModelVersionSelector
                      model={model}
                      selectedVersion={selectedVersion}
                      onVersionSelect={onVersionSelect}
                      theme={theme}
                    />
                  </div>

                  {/* Download Button */}
                  <div className="mt-4">
                    <button
                      onClick={() => onDownload(selected)}
                      disabled={downloadingModels.has(selected)}
                      className={`w-full px-4 py-3 rounded-lg font-medium flex items-center justify-center space-x-2 transition-all duration-200 shadow-sm hover:shadow-md ${
                        downloadingModels.has(selected)
                          ? theme === 'dark'
                            ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                            : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                          : theme === 'dark'
                          ? 'bg-purple-600 hover:bg-purple-700 text-white'
                          : 'bg-purple-600 hover:bg-purple-700 text-white'
                      }`}
                    >
                      {downloadingModels.has(selected) ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div>
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <Download size={16} />
                          <span>
                            Download {selectedVersionData ? `(${formatSize(selectedVersionData.size)})` : ''}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No Results */}
      {textModels.length === 0 && embeddingModels.length === 0 && (
        <div className={`text-center py-8 ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
          {searchQuery ? `No models found matching "${searchQuery}"` : 'No compatible models available for your system.'}
        </div>
      )}
    </div>
  );
};