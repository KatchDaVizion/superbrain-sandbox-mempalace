import { useState, useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { Brain } from 'lucide-react'
import { MathJaxContext } from 'better-react-mathjax'
import MarkdownAssistance from './MarkDown'
import ThinkingSection from './ThinkingSection'
import LoadingIndicator from './LoadingIndicator'
import SourcesPanel, { type SourceItem } from './SourcesPanel'
import { SourceBadges } from './SourceBadges'
import { getMessageTheme } from '@/app/utils/theme'

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: Date
  thinking?: string
  sources?: SourceItem[]
  __lastUpdate?: number
  __streamingVersion?: number
}

interface MessageAreaProps {
  chatMessages: Message[]
  isLoading: boolean
}

const mathJaxConfig = {
  loader: { load: ['input/asciimath', 'output/chtml'] },
}

const MessageArea = ({ chatMessages, isLoading }: MessageAreaProps) => {
  const { theme, resolvedTheme } = useTheme()
  const [expandedThinking, setExpandedThinking] = useState<{ [key: string]: boolean }>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const toggleThinking = (messageId: string) => {
    setExpandedThinking((prev) => ({
      ...prev,
      [messageId]: !prev[messageId],
    }))
  }

  // Auto-scroll to bottom when messages change or loading state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, isLoading])

  return (
    <div className="h-full flex flex-col">
      <div
        className={`flex-1 ${
          resolvedTheme === 'dark' ? 'bg-slate-900/30' : 'bg-slate-100'
        } max-h-[600px] rounded-lg border border-slate-700/30 overflow-y-auto scrollbar-thin scrollbar-track-slate-800 scrollbar-thumb-slate-600 hover:scrollbar-thumb-slate-500`}
        style={{ overflowY: 'auto' }}
      >
        <div className="p-4 space-y-4">
          {/* Messages */}
          {chatMessages.map((msg, idx) => {
            // Don't render empty user messages
            if (!msg.content && msg.role === 'user') return null

            // Force unique key for each streaming update
            const streamingKey = msg.id || `${msg.id}-${msg.content.length}-${msg.__lastUpdate || idx}`

            const bubbleTheme = getMessageTheme(theme || 'light', msg.role)

            return (
              <div key={streamingKey} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${msg.role === 'assistant' ? 'w-full max-w-[85%]' : ''}`}>
                  <div className={`rounded-2xl overflow-hidden shadow-sm ${bubbleTheme}`}>
                    {/* Main message content */}
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between mb-2 text-xs opacity-70">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">{msg.role === 'user' ? 'You' : 'Assistant'}</span>
                          {msg.role === 'assistant' && msg.thinking && (
                            <div className="flex items-center space-x-1 px-2 py-0.5 bg-purple-500/20 rounded-full">
                              <Brain className="w-3 h-3 text-purple-400" />
                              <span className="text-purple-400 text-xs font-medium">with reasoning</span>
                            </div>
                          )}
                          {/* RAG sources indicator */}
                          {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                            <div className="flex items-center space-x-1 px-2 py-0.5 bg-blue-500/20 rounded-full">
                              <span className={`text-xs font-medium ${
                                resolvedTheme === 'dark' ? 'text-blue-400' : 'text-blue-600'
                              }`}>
                                KB-enhanced
                              </span>
                            </div>
                          )}
                          {/* Streaming indicator */}
                          {msg.role === 'assistant' && msg.__lastUpdate && Date.now() - msg.__lastUpdate < 1000 && (
                            <div className="flex items-center space-x-1">
                              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                              <span className="text-green-400 text-xs">streaming...</span>
                            </div>
                          )}
                        </div>
                        {msg.timestamp && (
                          <span className="opacity-50 text-xs">
                            {new Date(msg.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>

                      <MathJaxContext config={mathJaxConfig}>
                        <MarkdownAssistance content={msg.content} />
                      </MathJaxContext>
                    </div>

                    {/* Thinking section */}
                    {msg.role === 'assistant' && msg.thinking && (
                      <ThinkingSection
                        thinking={msg.thinking}
                        isExpanded={expandedThinking[msg.id] || false}
                        onToggle={() => toggleThinking(msg.id)}
                      />
                    )}
                  </div>

                  {/* Sources panel below the message bubble */}
                  {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                    <>
                      <SourcesPanel sources={msg.sources} />
                      <SourceBadges sources={msg.sources} />
                    </>
                  )}
                </div>
              </div>
            )
          })}

          {/* Loading Indicator */}
          {isLoading && <LoadingIndicator />}

          {/* Invisible element for auto-scrolling */}
          <div ref={messagesEndRef} />
        </div>
      </div>
    </div>
  )
}

export default MessageArea
