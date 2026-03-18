import React, { useEffect, useState, useCallback } from 'react'
import { useTheme } from 'next-themes'
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Database,
  RefreshCcw,
  Globe,
  Layers,
} from 'lucide-react'

interface DocumentInfo {
  source: string
  chunkCount: number
  dateAdded: string
}

interface DocumentInventoryProps {
  collectionName: string | null
  qdrantConnected: boolean | null
}

const STORAGE_KEY = 'superbrain-shared-docs'

function getSharedDocs(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      return new Set(JSON.parse(raw) as string[])
    }
  } catch {
    // ignore
  }
  return new Set()
}

function persistSharedDocs(docs: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(docs)))
}

const DocumentInventory: React.FC<DocumentInventoryProps> = ({
  collectionName,
  qdrantConnected,
}) => {
  const { theme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const [documents, setDocuments] = useState<DocumentInfo[]>([])
  const [totalChunks, setTotalChunks] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sharedDocs, setSharedDocsState] = useState<Set<string>>(getSharedDocs)

  const fetchDocuments = useCallback(async () => {
    if (!collectionName || !qdrantConnected) {
      setDocuments([])
      setTotalChunks(0)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const allPoints: any[] = []
      let nextOffset: string | number | null = null

      // Scroll through all points in the collection
      for (let i = 0; i < 50; i++) {
        const body: Record<string, unknown> = { limit: 100, with_payload: true }
        if (nextOffset !== null) {
          body.offset = nextOffset
        }

        const resp = await fetch(
          `http://localhost:6333/collections/${encodeURIComponent(collectionName)}/points/scroll`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        )

        if (!resp.ok) {
          throw new Error(`Qdrant returned ${resp.status}`)
        }

        const data = await resp.json()
        const points = data.result?.points || []
        allPoints.push(...points)

        nextOffset = data.result?.next_page_offset ?? null
        if (nextOffset === null || points.length === 0) break
      }

      setTotalChunks(allPoints.length)

      // Group by source
      const grouped = new Map<string, { count: number; date: string }>()

      for (const point of allPoints) {
        const payload = point.payload || {}
        const source =
          payload.source ||
          payload.fileName ||
          payload.file_name ||
          payload.title ||
          'Unknown'

        const existing = grouped.get(source)
        const pointDate =
          payload.date ||
          payload.created_at ||
          payload.createdAt ||
          payload.ingested_at ||
          ''

        if (existing) {
          existing.count += 1
          // keep the earliest date
          if (pointDate && (!existing.date || pointDate < existing.date)) {
            existing.date = pointDate
          }
        } else {
          grouped.set(source, { count: 1, date: pointDate })
        }
      }

      const docs: DocumentInfo[] = []
      grouped.forEach((val, key) => {
        docs.push({
          source: key,
          chunkCount: val.count,
          dateAdded: val.date,
        })
      })

      // Sort by name
      docs.sort((a, b) => a.source.localeCompare(b.source))
      setDocuments(docs)
    } catch (err: any) {
      console.error('Failed to fetch document inventory:', err)
      setError(err.message || 'Failed to load documents')
      setDocuments([])
      setTotalChunks(0)
    } finally {
      setLoading(false)
    }
  }, [collectionName, qdrantConnected])

  // Re-fetch when collection changes or when panel opens
  useEffect(() => {
    if (isOpen) {
      fetchDocuments()
    }
  }, [collectionName, qdrantConnected, isOpen, fetchDocuments])

  // Listen for ingest events to refresh
  useEffect(() => {
    const handler = () => {
      if (isOpen) {
        fetchDocuments()
      }
    }
    window.addEventListener('rag:document-added', handler)
    return () => window.removeEventListener('rag:document-added', handler)
  }, [isOpen, fetchDocuments])

  const toggleShare = (source: string) => {
    setSharedDocsState((prev) => {
      const next = new Set(prev)
      if (next.has(source)) {
        next.delete(source)
      } else {
        next.add(source)
      }
      persistSharedDocs(next)
      return next
    })
  }

  const formatSource = (source: string): string => {
    // If it looks like a file path, extract just the filename
    const parts = source.split(/[/\\]/)
    return parts[parts.length - 1] || source
  }

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '--'
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return dateStr
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  if (!qdrantConnected || !collectionName) {
    return null
  }

  return (
    <div
      className={`backdrop-blur rounded-2xl border transition-all ${
        theme === 'dark'
          ? 'bg-card/50 border-emerald-500/30'
          : 'bg-white/80 border-emerald-200 shadow-sm'
      }`}
    >
      {/* Header / Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 text-left cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <h3
            className={`text-lg font-semibold flex items-center ${
              theme === 'dark' ? 'text-emerald-300' : 'text-emerald-700'
            }`}
          >
            {isOpen ? (
              <ChevronDown className="w-5 h-5 mr-2" />
            ) : (
              <ChevronRight className="w-5 h-5 mr-2" />
            )}
            <Database className="w-5 h-5 mr-2" />
            Your Documents
          </h3>
        </div>

        {/* Summary stats (visible even when collapsed) */}
        <div className="flex items-center gap-4">
          {documents.length > 0 && (
            <span
              className={`text-sm font-medium ${
                theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
              }`}
            >
              {documents.length} document{documents.length !== 1 ? 's' : ''},{' '}
              {totalChunks} chunk{totalChunks !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </button>

      {/* Collapsible Content */}
      {isOpen && (
        <div className="px-5 pb-5">
          {/* Summary Bar */}
          <div
            className={`flex items-center justify-between mb-4 px-4 py-2.5 rounded-lg ${
              theme === 'dark' ? 'bg-emerald-500/10' : 'bg-emerald-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <Layers
                className={`w-4 h-4 ${
                  theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
                }`}
              />
              <span
                className={`text-sm font-medium ${
                  theme === 'dark' ? 'text-emerald-300' : 'text-emerald-700'
                }`}
              >
                {documents.length} document{documents.length !== 1 ? 's' : ''},{' '}
                {totalChunks} chunk{totalChunks !== 1 ? 's' : ''} in your
                knowledge base
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                fetchDocuments()
              }}
              disabled={loading}
              className={`p-1.5 rounded-lg border transition-colors ${
                theme === 'dark'
                  ? 'border-gray-600 hover:border-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50'
                  : 'border-gray-300 hover:border-emerald-400 hover:bg-emerald-50 disabled:opacity-50'
              }`}
            >
              <RefreshCcw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>

          {/* Loading */}
          {loading && documents.length === 0 && (
            <div className="text-center py-6">
              <RefreshCcw
                className={`w-6 h-6 animate-spin mx-auto mb-2 ${
                  theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
                }`}
              />
              <p
                className={`text-sm ${
                  theme === 'dark'
                    ? 'text-muted-foreground'
                    : 'text-gray-500'
                }`}
              >
                Loading documents...
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className={`text-center py-4 px-4 rounded-lg mb-3 ${
                theme === 'dark'
                  ? 'bg-red-500/10 text-red-300'
                  : 'bg-red-50 text-red-600'
              }`}
            >
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && documents.length === 0 && (
            <div className="text-center py-6">
              <FileText
                className={`w-8 h-8 mx-auto mb-2 ${
                  theme === 'dark'
                    ? 'text-muted-foreground'
                    : 'text-gray-400'
                }`}
              />
              <p
                className={`text-sm ${
                  theme === 'dark'
                    ? 'text-muted-foreground'
                    : 'text-gray-500'
                }`}
              >
                No documents in this collection yet
              </p>
              <p
                className={`text-xs mt-1 ${
                  theme === 'dark'
                    ? 'text-muted-foreground'
                    : 'text-gray-400'
                }`}
              >
                Use &quot;Add Document&quot; to ingest your first document
              </p>
            </div>
          )}

          {/* Document List */}
          {documents.length > 0 && (
            <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
              {/* Table header */}
              <div
                className={`grid grid-cols-12 gap-2 px-3 py-1.5 text-xs font-medium uppercase tracking-wider ${
                  theme === 'dark'
                    ? 'text-muted-foreground'
                    : 'text-gray-500'
                }`}
              >
                <div className="col-span-5">Document</div>
                <div className="col-span-2 text-center">Chunks</div>
                <div className="col-span-3 text-center">Date Added</div>
                <div className="col-span-2 text-center">Share</div>
              </div>

              {documents.map((doc) => (
                <div
                  key={doc.source}
                  className={`grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-lg border transition-colors ${
                    theme === 'dark'
                      ? 'border-border bg-card/30 hover:bg-card/50'
                      : 'border-gray-200 bg-white/50 hover:bg-gray-50'
                  }`}
                >
                  {/* Document name */}
                  <div className="col-span-5 flex items-center gap-2 min-w-0">
                    <FileText
                      className={`w-4 h-4 flex-shrink-0 ${
                        theme === 'dark'
                          ? 'text-emerald-400'
                          : 'text-emerald-600'
                      }`}
                    />
                    <span
                      className={`text-sm truncate ${
                        theme === 'dark'
                          ? 'text-foreground'
                          : 'text-gray-900'
                      }`}
                      title={doc.source}
                    >
                      {formatSource(doc.source)}
                    </span>
                  </div>

                  {/* Chunk count */}
                  <div className="col-span-2 text-center">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        theme === 'dark'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {doc.chunkCount}
                    </span>
                  </div>

                  {/* Date */}
                  <div
                    className={`col-span-3 text-center text-xs ${
                      theme === 'dark'
                        ? 'text-muted-foreground'
                        : 'text-gray-500'
                    }`}
                  >
                    {formatDate(doc.dateAdded)}
                  </div>

                  {/* Share toggle */}
                  <div className="col-span-2 flex justify-center items-center">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={sharedDocs.has(doc.source)}
                      onClick={() => toggleShare(doc.source)}
                      title={
                        sharedDocs.has(doc.source)
                          ? 'Shared to network'
                          : 'Share to network'
                      }
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer ${
                        sharedDocs.has(doc.source)
                          ? 'bg-blue-600'
                          : theme === 'dark'
                          ? 'bg-gray-600'
                          : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          sharedDocs.has(doc.source)
                            ? 'translate-x-[18px]'
                            : 'translate-x-[3px]'
                        }`}
                      />
                    </button>
                    {sharedDocs.has(doc.source) && (
                      <Globe
                        className={`w-3 h-3 ml-1 ${
                          theme === 'dark'
                            ? 'text-blue-400'
                            : 'text-blue-600'
                        }`}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DocumentInventory
