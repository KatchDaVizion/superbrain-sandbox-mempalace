import { Loader2 } from 'lucide-react'
import React from 'react'

const ThreadSelectionLoader: React.FC<{ theme?: string }> = ({ theme }) => {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="flex flex-col items-center space-y-4">
        <div className={`p-3 rounded-full ${resolvedTheme === 'dark' ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
          <Loader2 className={`h-8 w-8 animate-spin ${resolvedTheme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
        </div>
        <div className="text-center">
          <p className={`text-sm font-medium mb-1 ${resolvedTheme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
            Loading messages...
          </p>
          <p className={`text-xs ${resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Please wait while we fetch your conversation...
          </p>
        </div>
      </div>
    </div>
  )
}

export default ThreadSelectionLoader
