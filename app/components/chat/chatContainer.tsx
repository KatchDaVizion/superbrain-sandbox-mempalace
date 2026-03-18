// app/components/chat/chatContainer.tsx
import React, { useState } from 'react'
import { Shield, Plus, Circle, History, Globe, Database, Volume2, VolumeX, Headphones, Square } from 'lucide-react'
import { useTheme } from 'next-themes'
import ChatHistory from './chatHistory'
import MessageArea from './MessageArea'
import ChatInputArea from './ChatInputArea'
import EmptyState from './EmptyState'
import { getButtonTheme } from '@/app/utils/theme'
import ThreadSelectionLoader from './ThreadSelectionLoader'
import ChatHistoryLoader from './ChatHistoryLoader'

type SourceItem = {
  content: string
  source: string
  score: number
  metadata: Record<string, any>
}

type Message = {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: Date
  sources?: SourceItem[]
}

interface ChatContainerProps {
  selectedModel: string | null
  selectedCollection?: string | null
  chatMessages: Message[]
  inputMessage: string
  setInputMessage: (msg: string) => void
  handleSendMessage: () => void
  handleKeyPress: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  clearConversation: () => void
  isLoading: boolean
  createNewChat?: () => void
  isLoadingHistory?: boolean
  isLoadingThread?: boolean
  canStop?: boolean
  onStopResponse?: () => void
  chatType?: 'ollama' | 'rag' | 'network'
  networkSourceCount?: number
  docCount?: number
  qdrantConnected?: boolean
  useRAG?: boolean
  onToggleRAG?: (value: boolean) => void
  // Voice props
  voiceEnabled?: boolean
  onToggleVoice?: () => void
  handsFreeMode?: boolean
  onToggleHandsFree?: () => void
  isReading?: boolean
  onStopSpeaking?: () => void
  // Voice props for ChatInputArea
  onMicClick?: () => void
  isListening?: boolean
  browserSupportsVoice?: boolean
}

const ChatContainer = ({
  selectedModel,
  selectedCollection,
  chatMessages,
  inputMessage,
  setInputMessage,
  handleSendMessage,
  handleKeyPress,
  isLoading,
  createNewChat,
  isLoadingHistory = false,
  isLoadingThread = false,
  canStop = false,
  onStopResponse,
  chatType = 'ollama',
  networkSourceCount = 0,
  docCount = 0,
  qdrantConnected = false,
  useRAG = true,
  onToggleRAG,
  // Voice props
  voiceEnabled = false,
  onToggleVoice,
  handsFreeMode = false,
  onToggleHandsFree,
  isReading = false,
  onStopSpeaking,
  onMicClick,
  isListening = false,
  browserSupportsVoice = false,
}: ChatContainerProps) => {
  const [showHistory, setShowHistory] = useState(false)
  const [chatStarted, setChatStarted] = useState(false)
  const { theme } = useTheme()
  const newChatButtonTheme = getButtonTheme(theme || 'light', 'primary')
  const isInputDisabled = isLoading || !selectedModel || isLoadingThread

  // Check if chat has started (has messages or user has clicked start)
  const hasChatStarted = chatStarted || chatMessages.length > 0

  const handleStartNewChat = () => {
    setChatStarted(true)
    if (createNewChat) {
      createNewChat()
    }
  }

  // Determine what to show in the main content area
  const renderMainContent = () => {
    // NEW: Show thread loader when loading a specific thread
    if (isLoadingThread) {
      return <ThreadSelectionLoader theme={theme} />
    }

    // Show loader when loading history and no messages yet
    if (isLoadingHistory && chatMessages.length === 0) {
      return <ChatHistoryLoader theme={theme} />
    }

    // Show empty state when no chat started and not loading
    if (!hasChatStarted && !isLoadingHistory && !isLoadingThread) {
      return (
        <EmptyState
          selectedModel={selectedModel}
          onStartChat={handleStartNewChat}
          docCount={docCount}
          qdrantConnected={qdrantConnected}
        />
      )
    }

    // Show messages when chat has started and not loading thread
    return <MessageArea chatMessages={chatMessages} isLoading={isLoading} />
  }

  return (
    <div className="flex space-x-4 h-[600px]">
      {/* Chat History Sidebar */}
      {showHistory && (
        <div
          className={`rounded-2xl p-4 overflow-y-auto transition-all duration-300 ${
            theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'
          }`}
        >
          <ChatHistory
            selectedModel={chatType === 'ollama' ? selectedModel : null}
            selectedCollection={chatType === 'rag' ? selectedCollection : null}
            chatType={chatType}
          />
        </div>
      )}

      {/* Main Chat Area - Now gets full height */}
      <div className="flex-1 bg-card backdrop-blur rounded-2xl border border-green-500/30 p-6 flex flex-col min-h-0">
        {/* Header - More compact */}
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-green-500/20">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <Shield className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-green-300' : 'text-green-500'}`}>
                {chatType === 'network' ? 'Network Search' : 'Private Chat'}
              </h3>
              <p className="text-xs text-slate-400 truncate max-w-48">{selectedModel || 'No model selected'}</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Voice Controls */}
            {browserSupportsVoice && (
              <div className="flex items-center space-x-1">
                {/* Voice On/Off toggle */}
                {onToggleVoice && (
                  <button
                    onClick={onToggleVoice}
                    className={`p-1.5 rounded-lg transition-colors text-xs ${
                      voiceEnabled
                        ? theme === 'dark'
                          ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                          : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        : theme === 'dark'
                          ? 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                    title={voiceEnabled ? 'Disable voice responses' : 'Enable voice responses'}
                  >
                    {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </button>
                )}

                {/* Hands Free toggle */}
                {onToggleHandsFree && (
                  <button
                    onClick={onToggleHandsFree}
                    className={`p-1.5 rounded-lg transition-colors text-xs ${
                      handsFreeMode
                        ? theme === 'dark'
                          ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                          : 'bg-green-50 text-green-600 hover:bg-green-100'
                        : theme === 'dark'
                          ? 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                    title={handsFreeMode ? 'Disable hands-free mode' : 'Enable hands-free mode'}
                  >
                    <Headphones className="w-4 h-4" />
                  </button>
                )}

                {/* Stop Speaking button */}
                {isReading && onStopSpeaking && (
                  <button
                    onClick={onStopSpeaking}
                    className={`p-1.5 rounded-lg transition-colors ${
                      theme === 'dark'
                        ? 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
                        : 'bg-red-50 text-red-600 hover:bg-red-100'
                    }`}
                    title="Stop speaking"
                  >
                    <Square className="w-3.5 h-3.5" fill="currentColor" />
                  </button>
                )}
              </div>
            )}

            {/* RAG Status Indicator */}
            {chatType === 'ollama' && qdrantConnected && (
              <button
                onClick={() => onToggleRAG && onToggleRAG(!useRAG)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full border transition-colors text-xs font-medium ${
                  useRAG
                    ? theme === 'dark'
                      ? 'bg-blue-500/10 border-blue-500/30 text-blue-300 hover:bg-blue-500/20'
                      : 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100'
                    : theme === 'dark'
                      ? 'bg-slate-800/50 border-slate-600/30 text-slate-400 hover:bg-slate-700/50'
                      : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'
                }`}
                title={useRAG ? 'Knowledge base active - click to disable' : 'Knowledge base disabled - click to enable'}
              >
                <Database className={`w-3 h-3 ${useRAG ? 'text-blue-400' : 'text-slate-400'}`} />
                <span>KB {useRAG ? 'On' : 'Off'}</span>
                {useRAG && docCount > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    theme === 'dark' ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {docCount}
                  </span>
                )}
              </button>
            )}

            {/* Status - More compact */}
            {chatType === 'network' ? (
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/20 rounded-full">
                <Globe className="w-3 h-3 text-blue-400" />
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-blue-300' : 'text-blue-500'}`}>
                  {networkSourceCount > 0
                    ? `Sourced from ${networkSourceCount} network contributor${networkSourceCount !== 1 ? 's' : ''}`
                    : 'Network Pool'}
                </span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <Circle className="w-2 h-2 fill-emerald-400 text-emerald-400 animate-pulse" />
                <span className={`text-xs font-medium ${theme === 'dark' ? 'text-emerald-300' : 'text-emerald-500'}`}>
                  Offline
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handleStartNewChat}
                disabled={!selectedModel || isLoadingHistory || isLoadingThread}
                className={`flex items-center space-x-2 px-3 py-2 ${newChatButtonTheme} cursor-pointer disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-all duration-200 hover:shadow-lg hover:scale-[1.02] disabled:hover:scale-100 text-sm`}
                title="Start a new conversation"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New</span>
              </button>

              <button
                onClick={() => setShowHistory((prev) => !prev)}
                disabled={isLoadingHistory || isLoadingThread}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg font-medium transition-all duration-200 cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                  showHistory
                    ? 'bg-slate-600 text-slate-200 hover:bg-slate-500'
                    : 'bg-slate-800/90 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                }`}
              >
                <History className="w-4 h-4" />
                <span className="hidden md:inline">{showHistory ? 'Hide' : 'History'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Hands-free banner */}
        {handsFreeMode && (
          <div className="mb-3 px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center space-x-2 animate-pulse">
            <Headphones className="w-4 h-4 text-green-400" />
            <span className={`text-xs font-medium ${theme === 'dark' ? 'text-green-300' : 'text-green-600'}`}>
              Hands-Free Active — {isListening ? 'listening...' : isReading ? 'speaking...' : 'waiting...'}
            </span>
            <span className={`text-xs ${theme === 'dark' ? 'text-green-400/60' : 'text-green-500/60'}`}>
              (press Escape to exit)
            </span>
          </div>
        )}

        {/* Messages, Loading State, or Empty State - Now gets much more vertical space */}
        <div className="flex-1 min-h-0">{renderMainContent()}</div>

        {hasChatStarted && !isLoadingHistory && !isLoadingThread && (
          <div className="mt-4">
            <ChatInputArea
              inputMessage={inputMessage}
              setInputMessage={setInputMessage}
              handleSendMessage={handleSendMessage}
              handleKeyPress={handleKeyPress}
              disabled={isInputDisabled}
              canStop={canStop}
              onStop={onStopResponse}
              isLoading={isLoading}
              onMicClick={onMicClick}
              isListening={isListening}
              browserSupportsVoice={browserSupportsVoice}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default ChatContainer
