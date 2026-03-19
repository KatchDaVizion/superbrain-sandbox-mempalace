import { getRightSidebarTheme } from '@/app/utils/theme'
import { Zap, Shield, TrendingUp, Activity, Sparkles } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Slider } from '../ui/slider'
import { useRagOllama } from '@/app/hooks/useRagOllama'

// Use the Model type from useOllama
interface Model {
  model: string
  name: string
  size: number
  specialty?: string
  description?: string
  speed?: string
  modified_at: string
}

interface RightSidebarProps {
  selectedModelData: Model | null
  getCurrentCreativityLevel: () => { label: string; desc?: string }
}

const RightSidebar = ({ selectedModelData, getCurrentCreativityLevel }: RightSidebarProps) => {
  const { theme, resolvedTheme } = useTheme()
  const styles = getRightSidebarTheme(theme || 'light')
  const { creativity, setCreativity } = useRagOllama() as any
  return (
    <div className="w-full space-y-4">
      {/* Creativity Control */}
      <div
        className={`backdrop-blur rounded-2xl border p-5 ${
          resolvedTheme === 'dark' ? 'bg-card/50 border-purple-500/30' : 'bg-white/80 border-purple-200 shadow-sm'
        }`}
      >
        <h3
          className={`text-lg font-semibold mb-4 flex items-center ${
            resolvedTheme === 'dark' ? 'text-purple-300' : 'text-purple-700'
          }`}
        >
          <Sparkles className="w-5 h-5 mr-2" />
          Creativity
        </h3>
        <div className="space-y-4">
          <div
            className={`flex items-center justify-between text-xs ${
              resolvedTheme === 'dark' ? 'text-muted-foreground' : 'text-gray-600'
            }`}
          >
            <span>Logical</span>
            <span>Creative</span>
          </div>
          <div className="px-1">
            <Slider value={creativity} onValueChange={setCreativity} max={1} min={0} step={0.1} className="w-full" />
          </div>
          <div className={`text-center p-3 rounded-lg ${resolvedTheme === 'dark' ? 'bg-muted/30' : 'bg-gray-50'}`}>
            <div className={`text-sm font-semibold mb-1 ${resolvedTheme === 'dark' ? 'text-purple-300' : 'text-purple-700'}`}>
              {getCurrentCreativityLevel().label} Mode
            </div>
            <div className={`text-xs ${resolvedTheme === 'dark' ? 'text-muted-foreground' : 'text-gray-600'}`}>
              {getCurrentCreativityLevel().desc}
            </div>
          </div>
        </div>
      </div>
      
      {/* System Status */}
      <div className={`backdrop-blur rounded-xl border p-4 ${styles.systemCard}`}>
        <h3 className={`text-sm font-semibold mb-3 flex items-center ${styles.systemTitle}`}>
          <Activity className="w-4 h-4 mr-2" />
          System Status
        </h3>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className={styles.systemText}>Model:</span>
            <span className="text-foreground font-medium truncate ml-2 max-w-32">
              {selectedModelData?.name || 'None'}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className={styles.systemText}>Mode:</span>
            <span className="text-purple-600 dark:text-purple-400 font-medium">
              {getCurrentCreativityLevel().label}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className={styles.systemText}>Privacy:</span>
            <div className="flex items-center space-x-1">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-green-600 dark:text-green-400 font-medium text-xs">Local</span>
            </div>
          </div>
        </div>
      </div>

      {/* Privacy Card */}
      <div className={`rounded-xl border p-4 ${styles.privacyCard}`}>
        <h3 className={`text-sm font-semibold mb-3 flex items-center ${styles.privacyTitle}`}>
          <Shield className="w-4 h-4 mr-2" />
          Privacy First
        </h3>
        <div className="space-y-2">
          {['Zero data collection', 'No internet required', 'Complete privacy', 'Your hardware control'].map(
            (benefit, index) => (
              <div key={index} className="flex items-center text-xs">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full mr-2 flex-shrink-0"></div>
                <span className={styles.privacyText}>{benefit}</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* Performance Card */}
      <div className={`rounded-xl border p-4 ${styles.performanceCard}`}>
        <h3 className={`text-sm font-semibold mb-3 flex items-center ${styles.performanceTitle}`}>
          <TrendingUp className="w-4 h-4 mr-2" />
          Performance
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className={styles.performanceText}>Response:</span>
            <div className="flex items-center space-x-1">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full"></div>
              <span className="text-green-600 dark:text-green-400 font-medium">Fast</span>
            </div>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className={styles.performanceText}>Status:</span>
            <div className="flex items-center space-x-1">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-green-600 dark:text-green-400 font-medium">Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Model Info Card */}
      {selectedModelData && (
        <div className={`backdrop-blur rounded-xl border p-4 ${styles.modelCard}`}>
          <h3 className={`text-sm font-semibold mb-3 flex items-center ${styles.modelTitle}`}>
            <Zap className="w-4 h-4 mr-2" />
            Model Details
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className={styles.systemText}>Name:</span>
              <span className="text-foreground font-medium truncate ml-2 max-w-32" title={selectedModelData.name}>
                {selectedModelData.name}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className={styles.systemText}>Size:</span>
              <span className="text-blue-600 dark:text-blue-400 font-medium">
                {(selectedModelData.size / 1e9).toFixed(1)} GB
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className={styles.systemText}>Type:</span>
              <span
                className="text-purple-600 dark:text-purple-400 font-medium truncate ml-2 max-w-32"
                title={selectedModelData.specialty}
              >
                {selectedModelData.specialty}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default RightSidebar
