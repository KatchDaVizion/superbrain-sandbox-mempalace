import React, { useState } from 'react'
import { useTheme } from 'next-themes'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { Progress } from '../ui/progress'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs'
import { Alert, AlertDescription } from '../ui/alert'
import { Upload, Link, FileText, X, CheckCircle, AlertCircle, File, Hash, Globe } from 'lucide-react'
import { IngestResult } from '@/lib/preload/preload'
import SelectCollectionModal from './SelectCollectionModal'

interface IngestModalProps {
  isOpen: boolean
  onClose: () => void
}

const IngestModal: React.FC<IngestModalProps> = ({ isOpen, onClose }) => {
  const { theme, resolvedTheme } = useTheme()
  const [inputType, setInputType] = useState<'file' | 'url' | 'paste'>('file')
  const [files, setFiles] = useState<File[]>([])
  const [url, setUrl] = useState('')
  const [pastedText, setPastedText] = useState('')
  const [tags, setTags] = useState<string>('')
  const [previewText, setPreviewText] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [ingestResult, setIngestResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  // New state for collection selection
  const [showCollectionModal, setShowCollectionModal] = useState(false)
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null)
  const [fileEntries, setFileEntries] = useState<{ file: File; path: string }[]>([])
  const [shareToNetwork, setShareToNetwork] = useState(false)
  const [networkShareResult, setNetworkShareResult] = useState<string | null>(null)

  // Helpers
  const readFileAsText = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = (e) => reject(e)
      reader.readAsText(file)
    })

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setPreviewText(null)

    const selected = Array.from(e.target.files || [])

    // Resolve real paths for each selected file
    const filesWithPaths = selected.map((file) => ({
      file,
      path: window.fileSystem.getPathForFile(file),
    }))

    setFiles(filesWithPaths.map((f) => f.file)) // keep File objects for UI
    ;(filesWithPaths as any).forEach((f) => {
      console.log('Resolved file path:', f.path)
    })

    // Make these paths accessible later for ingestion
    setFileEntries(filesWithPaths)

    // OPTIONAL: preview .txt files
    const txtFile = selected.find((f) => f.name.toLowerCase().endsWith('.txt'))
    if (txtFile) {
      try {
        const txt = await readFileAsText(txtFile)
        setPreviewText(txt.slice(0, 4000))
      } catch {
        setPreviewText(null)
      }
    }
  }

  const handleStartIngest = async () => {
    setError(null)
    setIngestResult(null)

    // 1. Client-Side Validation
    if (inputType === 'file' && files.length === 0) {
      setError('Please select at least one file to ingest.')
      return
    }
    if (inputType === 'url' && !url) {
      setError('Please enter a URL to ingest.')
      return
    }
    if (inputType === 'paste' && !pastedText.trim()) {
      setError('Please paste some text to ingest.')
      return
    }

    // Open collection selection modal instead of starting ingest immediately
    setShowCollectionModal(true)
  }

  // This function will be called after collection is selected
  const performIngest = async (collectionName: string) => {
    console.log('Selected collection:', collectionName)

    setIsProcessing(true)
    setProgress(5)

    try {
      let result: IngestResult | null = null
      const tagArray = tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t)

      // Perform the actual ingest with the selected collection
      if (inputType === 'file') {
        const ingestionPromises: Promise<IngestResult>[] = []

        for (const entry of fileEntries) {
          const filePath = entry.path
          console.log('Using file path:', filePath)

          if (!filePath) {
            throw new Error(`File path missing for ${entry.file.name}`)
          }

          ingestionPromises.push(
            window.RAGApi.ingestFilePath(filePath, undefined, {
              collectionName,
              userId: 'user-456',
              teamId: 'team-789',
              tags: tagArray,
            })
          )
        }

        const results = await Promise.all(ingestionPromises)

        if (results.length > 0) {
          result = {
            ...results[0],
            title: `${results.length} Documents Ingested`,
            chunkCount: results.reduce((sum, r) => sum + r.chunkCount, 0),
          }
        } else {
          throw new Error('Ingestion process failed to return any results.')
        }
      } else if (inputType === 'url') {
        const content = url
        const path = url
        result = await window.RAGApi.ingestURLContent(content, path, {
          collectionName: collectionName,
          userId: 'user-456',
          teamId: 'team-789',
          tags: tagArray,
        })
      } else {
        const content = pastedText
        result = await window.RAGApi.ingestTextContent(content, 'Test', {
          collectionName: collectionName,
          userId: 'user-456',
          teamId: 'team-789',
          tags: tagArray,
        })
      }

      // Share to network if toggled on
      if (shareToNetwork && result) {
        setProgress(85)
        try {
          let networkResult
          if (inputType === 'file' && fileEntries.length > 0) {
            for (const entry of fileEntries) {
              networkResult = await window.NetworkRAGApi.shareFile(entry.path, result.title)
            }
          } else if (inputType === 'url') {
            networkResult = await window.NetworkRAGApi.shareText(url, result.title)
          } else if (inputType === 'paste') {
            networkResult = await window.NetworkRAGApi.shareText(pastedText, result.title)
          }
          if (networkResult?.success) {
            setNetworkShareResult(`Shared ${networkResult.new_chunks} chunk(s) to the network`)
          } else {
            setNetworkShareResult(`Network share failed: ${networkResult?.error || 'Unknown error'}`)
          }
        } catch (err: any) {
          setNetworkShareResult(`Network share failed: ${err.message}`)
        }
      }

      setProgress(100)

      const successMessage = {
        message: shareToNetwork
          ? 'Document vectorized and shared to network.'
          : 'Document successfully vectorized and indexed.',
        document: {
          id: result.docId,
          title: result.title,
          chunkCount: result.chunkCount,
        },
      }

      setIngestResult(successMessage)

      // Dispatch event to update the sidebar document list
      window.dispatchEvent(new CustomEvent('rag:document-added', { detail: successMessage.document }))

      setTimeout(() => {
        setIsProcessing(false)
        setProgress(0)
        setSelectedCollection(null) // Reset selected collection
        resetForm()
        onClose()
      }, 600)
    } catch (err: any) {
      console.error('Ingestion failed via IPC:', err)
      setError(`Ingest failed: ${err.message || 'An unknown error occurred. Check Main Process logs.'}`)
      setIsProcessing(false)
      setProgress(0)
      setSelectedCollection(null) // Reset selected collection on error
    }
  }

  const resetForm = () => {
    setFiles([])
    setUrl('')
    setPastedText('')
    setTags('')
    setPreviewText(null)
    setError(null)
    setIngestResult(null)
    setSelectedCollection(null)
    setShareToNetwork(false)
    setNetworkShareResult(null)
  }

  const handleClose = () => {
    if (!isProcessing) {
      resetForm()
      onClose()
    }
  }


  // Handle click on upload area
  const handleUploadAreaClick = () => {
    const fileInput = document.getElementById('file-upload') as HTMLInputElement
    if (fileInput) {
      fileInput.click()
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4 backdrop-blur-sm">
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={handleClose} />

        <Card className="relative max-w-2xl w-full mx-auto shadow-2xl border-0 max-h-[90vh] overflow-hidden">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${resolvedTheme === 'dark' ? 'bg-blue-500/20' : 'bg-blue-100'}`}>
                  <Upload className="h-5 w-5 text-blue-600" />
                </div>
                <CardTitle className="text-xl">Add Documents</CardTitle>
              </div>
              <Button variant="ghost" size="icon" onClick={handleClose} disabled={isProcessing}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 overflow-y-auto max-h-[calc(90vh-140px)]">
            <Tabs value={inputType} onValueChange={(v) => setInputType(v as any)} className="space-y-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="file" className="flex items-center gap-2 cursor-pointer">
                  <File className="h-4 w-4" />
                  File Upload
                </TabsTrigger>
                <TabsTrigger value="url" className="flex items-center gap-2 cursor-pointer">
                  <Link className="h-4 w-4" />
                  URL
                </TabsTrigger>
                <TabsTrigger value="paste" className="flex items-center gap-2 cursor-pointer">
                  <FileText className="h-4 w-4" />
                  Paste Text
                </TabsTrigger>
              </TabsList>

              <TabsContent value="file" className="space-y-3">
                <div
                  className="border-2 border-dashed rounded-lg text-center hover:border-blue-300 transition-colors cursor-pointer"
                  onClick={handleUploadAreaClick}
                >
                  <div className={`${files.length > 0 ? 'py-3' : 'py-6'} px-4`}>
                    <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                    <div className="font-medium cursor-pointer">
                      {files.length > 0 ? 'Add more files' : 'Choose files (PDF, DOCX, TXT)'}
                    </div>
                    <Input
                      id="file-upload"
                      type="file"
                      multiple
                      onChange={handleFileChange}
                      accept=".pdf,.docx,.txt"
                      className="hidden"
                    />
                    <p className="text-sm text-muted-foreground mt-1">
                      {files.length > 0
                        ? 'Click to add more files or drag and drop'
                        : 'Drag and drop files here or click to browse'}
                    </p>
                  </div>
                </div>

                {files.length > 0 && (
                  <div className="space-y-2">
                    <div className="mb-1">Selected Files ({files.length})</div>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {files.map((f, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <File className="h-3 w-3 text-blue-500 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium truncate">{f.name}</div>
                              <div className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</div>
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-xs flex-shrink-0">
                            Ready
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="url" className="space-y-3">
                <div className="space-y-2">
                  <div className="mb-1">URL to ingest</div>
                  <Input
                    placeholder="https://example.com/article"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </TabsContent>

              <TabsContent value="paste" className="space-y-3">
                <div className="space-y-2">
                  <div className="mb-1">Paste your text content</div>
                  <Textarea
                    rows={6}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste your document content here..."
                    className="resize-none focus:ring-2 focus:ring-blue-500 min-h-[120px]"
                  />
                </div>
              </TabsContent>
            </Tabs>

            {/* Preview */}
            {previewText && (
              <div className="bg-muted/50 p-3 rounded-lg border">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-blue-500" />
                  <div className="text-sm font-medium mb-0">Content Preview</div>
                </div>
                <div className="max-h-32 overflow-auto">
                  <pre className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {previewText}
                    {previewText.length >= 4000 && '...'}
                  </pre>
                </div>
              </div>
            )}

            {/* Tags */}
            <div className="space-y-2">
              <div className="mb-1">Tags</div>
              <Input
                placeholder="finance, hr-policy, quarterly-report"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-muted-foreground">Add comma-separated tags for better organization</p>
            </div>

            {/* Share to Network Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-3">
                <Globe className={`h-5 w-5 ${shareToNetwork ? 'text-blue-500' : 'text-muted-foreground'}`} />
                <div>
                  <div className="text-sm font-medium">Share to Network</div>
                  <p className="text-xs text-muted-foreground">
                    Also share this document to the SuperBrain knowledge network to earn TAO
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={shareToNetwork}
                onClick={() => setShareToNetwork(!shareToNetwork)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                  shareToNetwork ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    shareToNetwork ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Network Share Result */}
            {networkShareResult && (
              <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
                <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertDescription className="text-blue-800 dark:text-blue-200">
                  {networkShareResult}
                </AlertDescription>
              </Alert>
            )}

            {/* Error Alert */}
            {error && (
              <Alert variant="destructive" className="border-red-200">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Progress */}
            {isProcessing && (
              <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                <div className="flex justify-between items-center">
                  <div className="mb-0">Processing & Vectorizing</div>
                  <span className="text-sm font-medium">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-1.5" />
                <p className="text-xs text-muted-foreground">
                  Document is being processed in the Electron main process...
                </p>
              </div>
            )}

            {/* Ingest Result */}
            {ingestResult && (
              <Alert className={`border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800`}>
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="space-y-2 text-green-800 dark:text-green-200">
                  <div className="font-medium">Ingest Complete</div>
                  <div>{ingestResult.message}</div>
                  <div className="flex items-center gap-2 text-xs">
                    <Hash className="h-3 w-3" />
                    <code className="break-all bg-green-100 dark:bg-green-900 px-1 rounded text-green-800 dark:text-green-200">
                      {ingestResult.sha256}
                    </code>
                  </div>
                  {ingestResult.duplicate !== undefined && (
                    <Badge variant={ingestResult.duplicate ? 'secondary' : 'default'} className="mt-1">
                      {ingestResult.duplicate ? `Duplicate - ${ingestResult.matchPercent}% match` : 'Unique Document'}
                    </Badge>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t">
              <div className="text-xs text-muted-foreground">
                Documents will be processed and added to your knowledge base
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isProcessing}
                  onClick={resetForm}
                  className="cursor-pointer"
                >
                  Reset
                </Button>

                <Button size="sm" disabled={isProcessing} onClick={handleStartIngest} className="gap-2 cursor-pointer">
                  {isProcessing ? (
                    <>
                      <div className="h-2 w-2 bg-current rounded-full animate-pulse" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Start Ingest
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Collection Selection Modal */}
      <SelectCollectionModal
        isOpen={showCollectionModal}
        onClose={() => setShowCollectionModal(false)}
        onSelect={(collectionName) => {
          setSelectedCollection(collectionName)
          setShowCollectionModal(false)
          performIngest(collectionName)
        }}
      />
    </>
  )
}

export default IngestModal
