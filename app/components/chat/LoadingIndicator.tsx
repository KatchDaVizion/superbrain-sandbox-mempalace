import { Brain } from 'lucide-react'
import { useTheme } from 'next-themes'

const LoadingIndicator = () => {
  const { theme } = useTheme()

  return (
    <div className="flex justify-start">
      <div
        className={`rounded-2xl px-4 py-3 shadow-sm max-w-[85%] border ${
          theme === 'dark' ? 'bg-slate-800/60 border-slate-700/50' : 'bg-slate-100/80 border-slate-300/50'
        }`}
      >
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Brain className="w-5 h-5 text-purple-400 animate-pulse" />
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-purple-400 rounded-full animate-ping"></div>
          </div>
          <div className="flex flex-col">
            <span className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-300' : 'text-slate-700'}`}>
              Thinking...
            </span>
            <span className="text-xs text-purple-400">Processing your request</span>
          </div>
        </div>

        {/* Animated thinking dots */}
        <div className="mt-3 flex items-center space-x-1">
          <div className="flex space-x-1">
            <div className="w-1.5 h-1.5 bg-purple-400/60 rounded-full animate-bounce"></div>
            <div className="w-1.5 h-1.5 bg-purple-400/60 rounded-full animate-bounce delay-100"></div>
            <div className="w-1.5 h-1.5 bg-purple-400/60 rounded-full animate-bounce delay-200"></div>
            <div className="w-1.5 h-1.5 bg-purple-400/60 rounded-full animate-bounce delay-300"></div>
            <div className="w-1.5 h-1.5 bg-purple-400/60 rounded-full animate-bounce delay-400"></div>
          </div>
          <span className="text-xs text-slate-500 ml-2">Analyzing and generating response</span>
        </div>
      </div>
    </div>
  )
}

export default LoadingIndicator
