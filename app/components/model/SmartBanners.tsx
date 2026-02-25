import React from 'react';
import { AlertCircle, Download, X } from 'lucide-react';
import { LocalModel } from '@/app/types/model';

interface SmartBannersProps {
  theme: string | undefined;
  showRefreshHint: boolean;
  localModels: LocalModel[];
  localLoading: boolean;
  onRefresh: () => void;
  onHideRefreshHint: () => void;
}

export const SmartBanners: React.FC<SmartBannersProps> = ({
  theme,
  showRefreshHint,
  localModels,
  localLoading,
  onRefresh,
  onHideRefreshHint
}) => {
  return (
    <>
      {/* Smart Refresh Hint - Only show when needed */}
      {showRefreshHint && (
        <div className={`mb-6 flex items-center justify-between px-4 py-3 rounded-lg border animate-in slide-in-from-top-2 duration-300 ${
          theme === 'dark' ? 'bg-amber-900/20 border-amber-600/30 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-800'
        } shadow-sm`}>
          <div className="flex items-center space-x-3">
            <div className={`p-1 rounded-full ${theme === 'dark' ? 'bg-amber-600/20' : 'bg-amber-100'}`}>
              <AlertCircle className={`h-4 w-4 ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`} />
            </div>
            <p className="text-sm">
              Model downloaded but not visible yet? Try refreshing the list.
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={onRefresh}
              className={`px-3 py-1.5 rounded-md font-medium text-sm transition-all duration-200 shadow-sm hover:shadow-md ${
                theme === 'dark' ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white'
              }`}
            >
              Refresh
            </button>
            <button
              onClick={onHideRefreshHint}
              className={`p-1.5 rounded-md transition-colors ${
                theme === 'dark' ? 'hover:bg-amber-800/30' : 'hover:bg-amber-100'
              }`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Smart Info Banner - Only show when needed */}
      {(localModels.length === 0 && !localLoading) && (
        <div className={`mb-6 flex items-center justify-between px-4 py-3 rounded-lg border ${
          theme === 'dark' ? 'bg-gray-800/50 border-gray-600/30 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-700'
        } shadow-sm`}>
          <div className="flex items-center space-x-3">
            <div className={`p-1 rounded-full ${theme === 'dark' ? 'bg-blue-600/20' : 'bg-blue-100'}`}>
              <Download className={`h-4 w-4 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
            </div>
            <p className="text-sm">
              No models found. Download some models to get started, or click refresh if you've recently installed models.
            </p>
          </div>
          <button
            onClick={onRefresh}
            className={`px-3 py-1.5 rounded-md font-medium text-sm transition-all duration-200 shadow-sm hover:shadow-md ${
              theme === 'dark' ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            Refresh
          </button>
        </div>
      )}
    </>
  );
};