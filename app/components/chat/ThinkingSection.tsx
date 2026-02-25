import { getThinkingSectionTheme } from '@/app/utils/theme'
import { MathJaxContext } from 'better-react-mathjax'
import { Brain, ChevronUp, ChevronDown, Sparkles } from 'lucide-react'
import { useTheme } from 'next-themes'
import MarkdownAssistance from './MarkDown'
const mathJaxConfig = {
  loader: { load: ['input/asciimath', 'output/chtml'] },
}
const ThinkingSection = ({
  thinking,
  isExpanded,
  onToggle,
}: {
  thinking: string
  isExpanded: boolean
  onToggle: () => void
}) => {
  const { theme } = useTheme()
  const styles = getThinkingSectionTheme(theme || 'light') // apply helper

  return (
    <div className={`mt-3 border-t border-slate-600/30 ${styles.container} rounded-b-lg`}>
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between p-3 text-left transition-colors ${styles.button}`}
      >
        <div className="flex items-center space-x-2">
          <Brain className="w-4 h-4 text-purple-400" />
          <span className={`text-sm font-medium ${styles.text}`}>View thinking process</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {isExpanded && (
        <div className={`px-4 pb-4 border-t border-slate-600/20 ${styles.content}`}>
          <div className="flex items-center space-x-2 mb-3 pt-3">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-semibold text-purple-400 uppercase tracking-wide">Thinking Process</span>
          </div>
          <div className={`p-3 rounded-md text-sm leading-relaxed ${styles.thinkingBg} border border-slate-600/20`}>
            <MathJaxContext config={mathJaxConfig}>
              <MarkdownAssistance content={thinking} />
            </MathJaxContext>
          </div>
        </div>
      )}
    </div>
  )
}

export default ThinkingSection
