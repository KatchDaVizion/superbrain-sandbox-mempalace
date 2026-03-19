import { useOllama } from '@/app/hooks/useOllama'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@radix-ui/react-hover-card'
import { Brain, Filter, Search, Sparkles } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { Slider } from '../ui/slider'

const TopControls = () => {
  const { theme, resolvedTheme } = useTheme()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSpecialty, setSelectedSpecialty] = useState<string | undefined>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const { availableModels, selectedModel, setSelectedModel, creativity, setCreativity, getCurrentCreativityLevel } =
    useOllama()
  // Filter models based on search and specialty
  const filteredModels = availableModels.filter((model) => {
    const matchesSearch =
      model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.specialty?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesSpecialty = selectedSpecialty === 'all' || model.specialty === selectedSpecialty
    return matchesSearch && matchesSpecialty
  })

  // Get unique specialties for filter
  const specialties = ['all', ...new Set(availableModels.map((model) => model.specialty).filter(Boolean))]
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Enhanced Model Selection */}
      <div
        className={`backdrop-blur rounded-2xl border p-5 ${
          resolvedTheme === 'dark' ? 'bg-card/50 border-blue-500/30' : 'bg-white/80 border-blue-200 shadow-sm'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <h3
            className={`text-lg font-semibold flex items-center ${
              resolvedTheme === 'dark' ? 'text-blue-300' : 'text-blue-700'
            }`}
          >
            <Brain className="w-5 h-5 mr-2" />
            AI Model ({filteredModels.length})
          </h3>

          {availableModels.length > 6 && (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                className={`p-2 rounded-lg border transition-colors ${
                  resolvedTheme === 'dark'
                    ? 'border-gray-600 hover:border-gray-500 hover:bg-gray-800/50'
                    : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                <Filter className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {availableModels.length === 0 ? (
          <div className="text-center py-8">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${
                resolvedTheme === 'dark' ? 'bg-muted' : 'bg-gray-100'
              }`}
            >
              <Brain className={`w-6 h-6 ${resolvedTheme === 'dark' ? 'text-muted-foreground' : 'text-gray-500'}`} />
            </div>
            <p className={resolvedTheme === 'dark' ? 'text-muted-foreground mb-1' : 'text-gray-600 mb-1'}>
              No models available
            </p>
            <p className={`text-sm ${resolvedTheme === 'dark' ? 'text-muted-foreground' : 'text-gray-500'}`}>
              Install Ollama models to start
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Search and Filter Controls */}
            {availableModels.length > 4 && (
              <div className="space-y-3">
                {/* Search Bar */}
                <div className="relative">
                  <Search
                    className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${
                      resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                    }`}
                  />
                  <input
                    type="text"
                    placeholder="Search models..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full pl-10 pr-4 py-2 rounded-lg border transition-colors ${
                      resolvedTheme === 'dark'
                        ? 'bg-gray-800/50 border-gray-600 text-gray-200 placeholder-gray-400 focus:border-blue-500 focus:bg-gray-800'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:bg-white'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                  />
                </div>

                {/* Specialty Filter */}
                {specialties.length > 2 && (
                  <div className="flex flex-wrap gap-2">
                    {specialties.map((specialty) => (
                      <button
                        key={specialty}
                        onClick={() => setSelectedSpecialty(specialty)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          selectedSpecialty === specialty
                            ? resolvedTheme === 'dark'
                              ? 'bg-blue-600 text-white'
                              : 'bg-blue-600 text-white'
                            : resolvedTheme === 'dark'
                              ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {specialty === 'all' ? 'All' : specialty}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Models Display */}
            <div
              className={`${
                viewMode === 'grid'
                  ? availableModels.length > 6
                    ? 'grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-400'
                    : 'space-y-2 max-h-64 overflow-y-auto'
                  : 'space-y-2 max-h-80 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-400'
              }`}
            >
              {filteredModels.map((model) => (
                <HoverCard key={model.model}>
                  <HoverCardTrigger asChild>
                    <div
                      onClick={() => setSelectedModel(model.model)}
                      className={`relative p-3 rounded-lg border transition-all duration-200 cursor-pointer group ${
                        selectedModel === model.model
                          ? resolvedTheme === 'dark'
                            ? 'border-blue-500 bg-blue-500/10 shadow-sm'
                            : 'border-blue-500 bg-blue-50 shadow-md'
                          : resolvedTheme === 'dark'
                            ? 'border-border bg-card/30 hover:border-blue-400 hover:bg-blue-500/5'
                            : 'border-gray-200 bg-white/50 hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <h4
                            className={`font-medium text-sm truncate ${
                              resolvedTheme === 'dark' ? 'text-foreground' : 'text-gray-900'
                            }`}
                          >
                            {model.name}
                          </h4>
                          <div className="flex items-center space-x-3 mt-1">
                            <span className={`text-xs ${resolvedTheme === 'dark' ? 'text-muted-foreground' : 'text-gray-500'}`}>
                              {(model.size / 1e9).toFixed(1)} GB
                            </span>
                            <span
                              className={`text-xs font-medium ${resolvedTheme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}
                            >
                              {model.specialty}
                            </span>
                          </div>
                        </div>
                        {selectedModel === model.model && (
                          <div
                            className={`w-2 h-2 rounded-full animate-pulse ml-3 ${
                              resolvedTheme === 'dark' ? 'bg-blue-400' : 'bg-blue-600'
                            }`}
                          ></div>
                        )}
                      </div>
                    </div>
                  </HoverCardTrigger>
                  <HoverCardContent
                    className={`w-80 border ${
                      resolvedTheme === 'dark' ? 'bg-card border-border' : 'bg-white border-gray-200 shadow-lg'
                    }`}
                  >
                    <div className="space-y-3">
                      <h4 className={`font-semibold ${resolvedTheme === 'dark' ? 'text-foreground' : 'text-gray-900'}`}>
                        {model.name}
                      </h4>
                      <p
                        className={`text-sm leading-relaxed ${
                          resolvedTheme === 'dark' ? 'text-muted-foreground' : 'text-gray-600'
                        }`}
                      >
                        {model.description}
                      </p>
                      <div
                        className={`flex justify-between text-xs pt-2 border-t ${
                          resolvedTheme === 'dark' ? 'text-muted-foreground border-border' : 'text-gray-500 border-gray-200'
                        }`}
                      >
                        <span>Size: {(model.size / 1e9).toFixed(1)} GB</span>
                      </div>
                      <div className={`text-xs font-medium ${resolvedTheme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
                        Specialty: {model.specialty}
                      </div>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              ))}
            </div>

            {/* No Results Message */}
            {filteredModels.length === 0 && availableModels.length > 0 && (
              <div className="text-center py-6">
                <p className={`text-sm ${resolvedTheme === 'dark' ? 'text-muted-foreground' : 'text-gray-600'}`}>
                  No models found matching your criteria
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setSelectedSpecialty('all')
                  }}
                  className={`mt-2 text-xs px-3 py-1 rounded-md transition-colors ${
                    resolvedTheme === 'dark'
                      ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10'
                      : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                  }`}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Enhanced Creativity Control */}
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
    </div>
  )
}

export default TopControls
