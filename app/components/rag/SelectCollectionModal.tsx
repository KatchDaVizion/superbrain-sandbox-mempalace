import React, { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { useTheme } from 'next-themes'
import { FolderOpen, Plus, Sparkles } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSelect: (collectionName: string) => void // Return selected collection
}

const SelectCollectionModal: React.FC<Props> = ({ isOpen, onClose, onSelect }) => {
  const [collections, setCollections] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [newCollection, setNewCollection] = useState('')
  const [selectedCollection, setSelectedCollection] = useState('')
  const { theme, resolvedTheme } = useTheme()

  const fetchCollections = async () => {
    try {
      setLoading(true)
      const list = await window.RAGApi.listCollections()
      setCollections(list)
      // Auto-select the first collection if available
      if (list.length > 0) {
        setSelectedCollection(list[0])
      }
    } catch (err) {
      console.error('Failed to fetch collections:', err)
      setCollections([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchCollections()
      setSelectedCollection('')
      setNewCollection('')
    }
  }, [isOpen])

  const handleUseSelected = () => {
    if (selectedCollection) {
      onSelect(selectedCollection)
    }
  }

  const handleCreateNew = () => {
    if (newCollection.trim()) {
      onSelect(newCollection.trim())
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={`max-w-2xl rounded-2xl border p-0 overflow-hidden ${
          resolvedTheme === 'dark'
            ? 'bg-card/50 border-blue-500/30 backdrop-blur'
            : 'bg-white/80 border-blue-200 shadow-sm backdrop-blur'
        }`}
      >
        <DialogHeader className={`p-4 border-b ${resolvedTheme === 'dark' ? 'border-blue-500/20' : 'border-blue-100'}`}>
          <DialogTitle
            className={`text-lg font-semibold flex items-center ${
              resolvedTheme === 'dark' ? 'text-blue-300' : 'text-blue-700'
            }`}
          >
            <FolderOpen className="w-5 h-5 mr-2" />
            Select Collection
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 space-y-6">
          {loading ? (
            <div className="text-center py-8">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${
                  resolvedTheme === 'dark' ? 'bg-muted' : 'bg-gray-100'
                }`}
              >
                <FolderOpen className={`w-6 h-6 ${resolvedTheme === 'dark' ? 'text-muted-foreground' : 'text-gray-500'}`} />
              </div>
              <p className={resolvedTheme === 'dark' ? 'text-muted-foreground mb-1' : 'text-gray-600 mb-1'}>
                Loading collections...
              </p>
            </div>
          ) : (
            <>
              {/* Existing Collections Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-medium ${resolvedTheme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
                    Choose existing collection
                  </p>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      resolvedTheme === 'dark' ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {collections.length} available
                  </span>
                </div>

                <Select value={selectedCollection} onValueChange={setSelectedCollection}>
                  <SelectTrigger
                    className={`w-full rounded-lg border transition-colors ${
                      resolvedTheme === 'dark'
                        ? 'bg-gray-800/50 border-gray-600 text-gray-200 placeholder-gray-400 focus:border-blue-500 focus:bg-gray-800'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:bg-white'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                  >
                    <SelectValue placeholder="Select a collection" />
                  </SelectTrigger>
                  <SelectContent
                    className={`rounded-lg border ${
                      resolvedTheme === 'dark'
                        ? 'bg-gray-800 border-gray-600 text-gray-200'
                        : 'bg-white border-gray-300 text-gray-900'
                    }`}
                  >
                    {collections.length === 0 ? (
                      <div className="text-muted-foreground px-3 py-2 text-sm opacity-70">No collections available</div>
                    ) : (
                      collections.map((collection) => (
                        <SelectItem
                          key={collection}
                          value={collection}
                          className={`focus:bg-blue-500/10 focus:text-blue-700 ${
                            resolvedTheme === 'dark' ? 'focus:text-blue-300' : 'focus:text-blue-700'
                          }`}
                        >
                          {collection}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>

                <Button
                  className={`w-full rounded-lg font-medium transition-all shadow-sm ${
                    resolvedTheme === 'dark'
                      ? 'bg-blue-600 text-white hover:bg-blue-500 active:scale-95'
                      : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
                  }`}
                  disabled={!selectedCollection}
                  onClick={handleUseSelected}
                >
                  Use Selected Collection
                </Button>
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className={`w-full border-t ${resolvedTheme === 'dark' ? 'border-blue-500/20' : 'border-blue-200'}`} />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className={`bg-background px-3 ${resolvedTheme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`}>
                    Or
                  </span>
                </div>
              </div>

              {/* New Collection Section */}
              <div className="space-y-4">
                <p
                  className={`text-sm font-medium flex items-center ${
                    resolvedTheme === 'dark' ? 'text-purple-300' : 'text-purple-700'
                  }`}
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Create new collection
                </p>

                <Input
                  placeholder="Enter new collection name"
                  value={newCollection}
                  onChange={(e) => setNewCollection(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newCollection.trim()) {
                      handleCreateNew()
                    }
                  }}
                  className={`rounded-lg border transition-colors ${
                    resolvedTheme === 'dark'
                      ? 'bg-gray-800/50 border-gray-600 text-gray-200 placeholder-gray-400 focus:border-purple-500 focus:bg-gray-800'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:border-purple-500 focus:bg-white'
                  } focus:outline-none focus:ring-2 focus:ring-purple-500/20`}
                />

                <Button
                  className={`w-full rounded-lg font-medium transition-all shadow-sm ${
                    resolvedTheme === 'dark'
                      ? 'bg-purple-600 text-white hover:bg-purple-500 active:scale-95'
                      : 'bg-purple-600 text-white hover:bg-purple-700 active:scale-95'
                  }`}
                  disabled={!newCollection.trim()}
                  onClick={handleCreateNew}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create & Continue
                </Button>
              </div>

              {/* No Collections State */}
              {collections.length === 0 && !loading && (
                <div className="text-center py-4">
                  <p className={`text-sm ${resolvedTheme === 'dark' ? 'text-muted-foreground' : 'text-gray-600'}`}>
                    No collections found. Create your first one above.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default SelectCollectionModal
