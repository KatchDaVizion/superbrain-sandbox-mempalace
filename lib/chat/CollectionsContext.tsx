// contexts/CollectionsContext.tsx
import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react'

interface CollectionsContextType {
  // State
  collections: string[]
  selectedCollection: string | null

  // Actions
  setCollections: (collections: string[]) => void
  setSelectedCollection: (collection: string | null) => void
  addCollection: (collection: string) => void
  removeCollection: (collection: string) => void
  clearCollections: () => void
  refreshCollections: () => Promise<void>

  // Derived state
  hasCollections: boolean
  collectionsCount: number
  isCollectionSelected: (collection: string) => boolean
}

const CollectionsContext = createContext<CollectionsContextType | undefined>(undefined)

interface CollectionsProviderProps {
  children: ReactNode
}

export const CollectionsProvider: React.FC<CollectionsProviderProps> = ({ children }) => {
  const [collections, setCollectionsState] = useState<string[]>(() => {
    // Try to load from localStorage on initial render
    try {
      const stored = localStorage.getItem('rag-collections')
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  const [selectedCollection, setSelectedCollectionState] = useState<string | null>(() => {
    // Try to load from localStorage on initial render
    try {
      return localStorage.getItem('rag-selected-collection')
    } catch {
      return null
    }
  })

  // Effect to handle auto-selection logic when collections change
  useEffect(() => {
    if (collections.length > 0 && !selectedCollection) {
      // Auto-select first collection if none selected
      setSelectedCollectionState(collections[0])
      try {
        localStorage.setItem('rag-selected-collection', collections[0])
      } catch (error) {
        console.error('Failed to persist auto-selected collection:', error)
      }
    } else if (collections.length === 0 && selectedCollection) {
      // Clear selection if no collections available
      setSelectedCollectionState(null)
      try {
        localStorage.removeItem('rag-selected-collection')
      } catch (error) {
        console.error('Failed to clear selected collection:', error)
      }
    } else if (selectedCollection && !collections.includes(selectedCollection)) {
      // Clear selection if selected collection no longer exists
      setSelectedCollectionState(null)
      try {
        localStorage.removeItem('rag-selected-collection')
      } catch (error) {
        console.error('Failed to clear invalid selected collection:', error)
      }
    }
  }, [collections, selectedCollection])

  // Persist collections to localStorage
  const setCollections = useCallback((newCollections: string[]) => {
    setCollectionsState(newCollections)

    // Persist to localStorage
    try {
      localStorage.setItem('rag-collections', JSON.stringify(newCollections))
    } catch (error) {
      console.error('Failed to persist collections to localStorage:', error)
    }
  }, [])

  // Persist selected collection to localStorage
  const setSelectedCollection = useCallback(
    (collection: string | null) => {
      // Validate that the collection exists if we're setting one
      if (collection && collections.length > 0 && !collections.includes(collection)) {
        const firstCollection = collections[0]
        setSelectedCollectionState(firstCollection)
        try {
          localStorage.setItem('rag-selected-collection', firstCollection)
        } catch (error) {
          console.error('Failed to persist fallback collection:', error)
        }
        return
      }

      setSelectedCollectionState(collection)

      // Persist to localStorage
      try {
        if (collection) {
          localStorage.setItem('rag-selected-collection', collection)
        } else {
          localStorage.removeItem('rag-selected-collection')
        }
      } catch (error) {
        console.error('Failed to persist selected collection to localStorage:', error)
      }
    },
    [collections]
  )

  const addCollection = useCallback((collection: string) => {
    setCollectionsState((prev) => {
      if (!prev.includes(collection)) {
        const newCollections = [...prev, collection]

        // Persist to localStorage
        try {
          localStorage.setItem('rag-collections', JSON.stringify(newCollections))
        } catch (error) {
          console.error('Failed to persist collections to localStorage:', error)
        }

        return newCollections
      }
      return prev
    })
  }, [])

  const removeCollection = useCallback((collection: string) => {
    setCollectionsState((prev) => {
      const newCollections = prev.filter((c) => c !== collection)

      // Persist to localStorage
      try {
        localStorage.setItem('rag-collections', JSON.stringify(newCollections))
      } catch (error) {
        console.error('Failed to persist collections to localStorage:', error)
      }

      return newCollections
    })
  }, [])

  const clearCollections = useCallback(() => {
    setCollectionsState([])
    setSelectedCollectionState(null)

    // Clear localStorage
    try {
      localStorage.removeItem('rag-collections')
      localStorage.removeItem('rag-selected-collection')
    } catch (error) {
      console.error('Failed to clear collections from localStorage:', error)
    }
  }, [])

  const refreshCollections = useCallback(async () => {
    try {
      const list = await window.RAGApi.listCollections()
      setCollections(list || [])
    } catch (error) {
      console.error('Failed to refresh collections:', error)
      setCollections([])
    }
  }, [setCollections])

  const hasCollections = collections.length > 0
  const collectionsCount = collections.length
  const isCollectionSelected = useCallback(
    (collection: string) => {
      return selectedCollection === collection
    },
    [selectedCollection]
  )

  const value: CollectionsContextType = {
    // State
    collections,
    selectedCollection,

    // Actions
    setCollections,
    setSelectedCollection,
    addCollection,
    removeCollection,
    clearCollections,
    refreshCollections,

    // Derived state
    hasCollections,
    collectionsCount,
    isCollectionSelected,
  }

  return <CollectionsContext.Provider value={value}>{children}</CollectionsContext.Provider>
}

export const useCollections = (): CollectionsContextType => {
  const context = useContext(CollectionsContext)
  if (context === undefined) {
    throw new Error('useCollections must be used within a CollectionsProvider')
  }
  return context
}

// Optional: Individual hooks for optimized re-renders
export const useCollectionsList = (): string[] => {
  const { collections } = useCollections()
  return collections
}

export const useSelectedCollectionValue = (): string | null => {
  const { selectedCollection } = useCollections()
  return selectedCollection
}

export const useCollectionsActions = () => {
  const {
    setCollections,
    setSelectedCollection,
    addCollection,
    removeCollection,
    clearCollections,
    refreshCollections,
  } = useCollections()

  return {
    setCollections,
    setSelectedCollection,
    addCollection,
    removeCollection,
    clearCollections,
    refreshCollections,
  }
}

export const useSelectedCollection = () => {
  const { selectedCollection, setSelectedCollection, isCollectionSelected } = useCollections()
  return { selectedCollection, setSelectedCollection, isCollectionSelected }
}
