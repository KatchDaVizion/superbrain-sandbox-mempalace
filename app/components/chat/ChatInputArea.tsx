import React from 'react'
import { Send, Square } from 'lucide-react'
import { useTheme } from 'next-themes'

interface ChatInputAreaProps {
  inputMessage: string
  setInputMessage: (msg: string) => void
  handleSendMessage: () => void
  handleKeyPress: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  disabled: boolean
  // NEW: Add stop functionality props
  canStop?: boolean
  onStop?: () => void
  isLoading?: boolean
}

const ChatInputArea = ({
  inputMessage,
  setInputMessage,
  handleSendMessage,
  handleKeyPress,
  disabled,
  canStop = false,
  onStop,
  isLoading = false,
}: ChatInputAreaProps) => {
  const { theme } = useTheme()

  const handleStopClick = () => {
    if (onStop) {
      onStop()
    }
  }

  return (
    <div className="space-y-3">
      <div
        className={`relative rounded-xl border transition-colors ${
          theme === 'dark'
            ? 'border-slate-600 bg-slate-800/50'
            : 'border-slate-300 bg-white/50'
        }`}
      >
        <textarea
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder={
            disabled
              ? 'Select a model to start chatting...'
              : 'Type your message... (Shift+Enter for new line)'
          }
          disabled={disabled}
          className={`w-full min-h-[60px] max-h-32 p-4 pr-16 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors placeholder:text-slate-500 ${
            theme === 'dark'
              ? 'bg-transparent text-slate-200'
              : 'bg-transparent text-slate-900'
          } ${
            disabled ? 'cursor-not-allowed opacity-50' : ''
          }`}
        />

        {/* Send/Stop Button */}
        <div className="absolute bottom-3 right-3">
          {canStop && isLoading ? (
            // Stop Button
            <button
              onClick={handleStopClick}
              className={`p-2 rounded-lg transition-all duration-200 hover:scale-105 ${
                theme === 'dark'
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-red-500 hover:bg-red-600 text-white'
              } shadow-md hover:shadow-lg`}
              title="Stop response"
            >
              <Square className="w-4 h-4" fill="currentColor" />
            </button>
          ) : (
            // Send Button
            <button
              onClick={handleSendMessage}
              disabled={disabled || !inputMessage.trim() || isLoading}
              className={`p-2 rounded-lg transition-all duration-200 hover:scale-105 disabled:hover:scale-100 ${
                disabled || !inputMessage.trim() || isLoading
                  ? theme === 'dark'
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : theme === 'dark'
                    ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md hover:shadow-lg'
                    : 'bg-blue-500 hover:bg-blue-600 text-white shadow-md hover:shadow-lg'
              }`}
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Status indicators */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center space-x-4">
          {isLoading && (
            <span
              className={`flex items-center space-x-2 ${
                theme === 'dark' ? 'text-blue-400' : 'text-blue-600'
              }`}
            >
              <div className="w-2 h-2 bg-current rounded-full animate-pulse"></div>
              <span>Generating response...</span>
            </span>
          )}
          
          {canStop && (
            <span
              className={`flex items-center space-x-2 ${
                theme === 'dark' ? 'text-yellow-400' : 'text-yellow-600'
              }`}
            >
              <Square className="w-3 h-3" />
              <span>Press stop to interrupt</span>
            </span>
          )}
        </div>

        <span
          className={`${
            theme === 'dark' ? 'text-slate-500' : 'text-slate-400'
          }`}
        >
          {inputMessage.length}/2000
        </span>
      </div>
    </div>
  )
}

export default ChatInputArea