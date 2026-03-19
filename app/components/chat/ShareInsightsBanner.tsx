import React, { useState, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { Lightbulb, X, Loader2, Share2, ShieldCheck } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface ShareInsightsBannerProps {
  insightCount: number
  onShare: () => Promise<void> | void
  onKeepPrivate: () => void
  isSharing: boolean
  confirmationText?: string | null
}

const ShareInsightsBanner: React.FC<ShareInsightsBannerProps> = ({
  insightCount,
  onShare,
  onKeepPrivate,
  isSharing,
  confirmationText,
}) => {
  const { theme, resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  // Local state for the confirmation phase
  const [showConfirmation, setShowConfirmation] = useState(false)

  useEffect(() => {
    if (confirmationText) {
      setShowConfirmation(true)
      const timer = setTimeout(() => {
        setShowConfirmation(false)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [confirmationText])

  // Don't render if there are no insights and no confirmation to show
  if (insightCount === 0 && !showConfirmation) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, height: 0 }}
        animate={{ opacity: 1, y: 0, height: 'auto' }}
        exit={{ opacity: 0, y: -20, height: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full overflow-hidden"
      >
        <div
          className={`relative mx-3 mt-2 mb-1 rounded-xl border p-4 transition-colors ${
            isDark
              ? 'bg-gradient-to-r from-blue-950/60 via-indigo-950/50 to-purple-950/60 border-blue-800/40'
              : 'bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-blue-200/60'
          }`}
        >
          {/* Dismiss button */}
          <button
            onClick={onKeepPrivate}
            className={`absolute top-2.5 right-2.5 p-1 rounded-md transition-colors ${
              isDark
                ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/50'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/60'
            }`}
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>

          {/* Confirmation state */}
          {showConfirmation && confirmationText ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center space-x-3"
            >
              <div className={`p-2 rounded-lg ${
                isDark ? 'bg-emerald-900/40' : 'bg-emerald-100/80'
              }`}>
                <span className="text-lg" role="img" aria-label="coin">&#9889;</span>
              </div>
              <p className={`text-sm font-medium ${
                isDark ? 'text-emerald-300' : 'text-emerald-700'
              }`}>
                {confirmationText}
              </p>
            </motion.div>
          ) : (
            /* Default prompt state */
            <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-4">
              {/* Icon + text */}
              <div className="flex items-start space-x-3 flex-1 min-w-0 pr-6">
                <div className={`p-2 rounded-lg flex-shrink-0 ${
                  isDark ? 'bg-blue-900/50' : 'bg-blue-100/80'
                }`}>
                  <Lightbulb className={`w-4 h-4 ${
                    isDark ? 'text-blue-400' : 'text-blue-600'
                  }`} />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${
                    isDark ? 'text-slate-200' : 'text-slate-700'
                  }`}>
                    Your conversation generated{' '}
                    <span className={isDark ? 'text-blue-400' : 'text-blue-600'}>
                      {insightCount} insight{insightCount !== 1 ? 's' : ''}
                    </span>
                    .
                  </p>
                  <p className={`text-xs mt-0.5 ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}>
                    Share to the network to help others and earn TAO?
                  </p>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center space-x-2 flex-shrink-0 pl-9 sm:pl-0">
                <button
                  onClick={onShare}
                  disabled={isSharing}
                  className={`inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    isSharing
                      ? isDark
                        ? 'bg-blue-800/40 text-blue-400 cursor-wait'
                        : 'bg-blue-100 text-blue-400 cursor-wait'
                      : isDark
                        ? 'bg-blue-600 hover:bg-blue-500 text-white hover:shadow-lg hover:shadow-blue-500/20'
                        : 'bg-blue-600 hover:bg-blue-700 text-white hover:shadow-lg hover:shadow-blue-600/20'
                  }`}
                >
                  {isSharing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Sharing...</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Share to Network</span>
                    </>
                  )}
                </button>

                <button
                  onClick={onKeepPrivate}
                  disabled={isSharing}
                  className={`inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isDark
                      ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Keep Private</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export default ShareInsightsBanner
