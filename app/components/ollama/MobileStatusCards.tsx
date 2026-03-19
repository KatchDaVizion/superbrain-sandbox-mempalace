import { useTheme } from 'next-themes'

interface MobileStatusCardsProps {
  selectedModelData: any // Replace 'any' with your actual type for selectedModelData
  isLoading: boolean
}

const MobileStatusCards = ({ selectedModelData, isLoading }: MobileStatusCardsProps) => {
  const { theme, resolvedTheme } = useTheme()
  return (
    <div className="xl:hidden mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <div
        className={`backdrop-blur rounded-xl border p-4 ${
          resolvedTheme === 'dark' ? 'bg-card/50 border-cyan-500/30' : 'bg-white/80 border-cyan-200 shadow-sm'
        }`}
      >
        <h4 className={`text-sm font-semibold mb-2 ${resolvedTheme === 'dark' ? 'text-cyan-300' : 'text-cyan-800'}`}>Status</h4>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className={resolvedTheme === 'dark' ? 'text-muted-foreground' : 'text-gray-600'}>Model:</span>
            <span className={`font-medium truncate ml-2 ${resolvedTheme === 'dark' ? 'text-foreground' : 'text-gray-900'}`}>
              {selectedModelData?.name || 'None'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className={resolvedTheme === 'dark' ? 'text-muted-foreground' : 'text-gray-600'}>Privacy:</span>
            <span className={`font-medium ${resolvedTheme === 'dark' ? 'text-green-400' : 'text-green-600'}`}>Local</span>
          </div>
          {/* NEW: Show response status */}
          <div className="flex justify-between">
            <span className={resolvedTheme === 'dark' ? 'text-muted-foreground' : 'text-gray-600'}>Response:</span>
            <span
              className={`font-medium ${
                isLoading
                  ? resolvedTheme === 'dark'
                    ? 'text-yellow-400'
                    : 'text-yellow-600'
                  : resolvedTheme === 'dark'
                    ? 'text-green-400'
                    : 'text-green-600'
              }`}
            >
              {isLoading ? 'Generating...' : 'Ready'}
            </span>
          </div>
        </div>
      </div>
      {selectedModelData && (
        <div
          className={`backdrop-blur rounded-xl border p-4 ${
            resolvedTheme === 'dark' ? 'bg-card/50 border-blue-500/30' : 'bg-white/80 border-blue-200 shadow-sm'
          }`}
        >
          <h4 className={`text-sm font-semibold mb-2 ${resolvedTheme === 'dark' ? 'text-blue-300' : 'text-blue-800'}`}>
            Model Info
          </h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className={resolvedTheme === 'dark' ? 'text-muted-foreground' : 'text-gray-600'}>Size:</span>
              <span className={`font-medium ${resolvedTheme === 'dark' ? 'text-blue-400' : 'text-blue-700'}`}>
                {(selectedModelData.size / 1e9).toFixed(1)} GB
              </span>
            </div>
            <div className="flex justify-between">
              <span className={resolvedTheme === 'dark' ? 'text-muted-foreground' : 'text-gray-600'}>Type:</span>
              <span className={`font-medium truncate ml-2 ${resolvedTheme === 'dark' ? 'text-purple-400' : 'text-purple-700'}`}>
                {selectedModelData.specialty}
              </span>
            </div>
          </div>
        </div>
      )}
      <div
        className={`backdrop-blur rounded-xl border p-4 ${
          resolvedTheme === 'dark'
            ? 'bg-gradient-to-br from-green-900/20 to-emerald-900/20 border-green-500/30'
            : 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 shadow-sm'
        }`}
      >
        <h4 className={`text-sm font-semibold mb-2 ${resolvedTheme === 'dark' ? 'text-green-300' : 'text-green-800'}`}>
          Privacy
        </h4>
        <div className="space-y-1 text-xs">
          <div className="flex items-center">
            <div
              className={`w-1.5 h-1.5 rounded-full mr-2 ${resolvedTheme === 'dark' ? 'bg-green-400' : 'bg-green-500'}`}
            ></div>
            <span className={resolvedTheme === 'dark' ? 'text-muted-foreground' : 'text-gray-700'}>Zero tracking</span>
          </div>
          <div className="flex items-center">
            <div
              className={`w-1.5 h-1.5 rounded-full mr-2 ${resolvedTheme === 'dark' ? 'bg-green-400' : 'bg-green-500'}`}
            ></div>
            <span className={resolvedTheme === 'dark' ? 'text-muted-foreground' : 'text-gray-700'}>Complete privacy</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MobileStatusCards
