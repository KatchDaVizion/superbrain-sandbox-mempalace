import { Loader2 } from 'lucide-react'
import React from 'react'

const ChatHistoryLoader: React.FC<{ theme?: string }> = ({ theme }) => {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="flex flex-col items-center space-y-4">
        <div className={`p-3 rounded-full ${resolvedTheme === 'dark' ? 'bg-green-500/10' : 'bg-green-50'}`}>
          <Loader2 className={`h-8 w-8 animate-spin ${resolvedTheme === 'dark' ? 'text-green-400' : 'text-green-600'}`} />
        </div>
        <div className="text-center">
          <p className={`text-sm font-medium mb-1 ${resolvedTheme === 'dark' ? 'text-green-300' : 'text-green-700'}`}>
            Loading conversation
          </p>
          <p className={`text-xs ${resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            Retrieving chat history...
          </p>
        </div>
      </div>
    </div>
  )
}

export default ChatHistoryLoader
