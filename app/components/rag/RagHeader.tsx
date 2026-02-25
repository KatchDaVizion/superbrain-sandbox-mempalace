import { FileText, Cpu } from 'lucide-react'
import { useTheme } from 'next-themes'

const RagHeader = () => {
  const { theme } = useTheme()

  return (
    <div className="text-center mb-6">
      <div className="flex items-center justify-center space-x-4 mb-4">
        <div className="flex items-center space-x-2">
          <Cpu className={`w-10 h-10 ${theme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
        </div>
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-green-600">
          RAG Chat - Smart Document Assistant
        </h1>
      </div>
      <p className={`text-xl max-w-2xl mx-auto ${theme === 'dark' ? 'text-muted-foreground' : 'text-gray-600'}`}>
        Upload your documents and chat with AI that understands your content. Get precise, context-aware answers from
        your own files.
      </p>
      <div className="flex justify-center space-x-6 mt-4 text-sm">
        <div className={`flex items-center space-x-2 ${theme === 'dark' ? 'text-blue-300' : 'text-blue-500'}`}>
          <FileText className="w-4 h-4" />
          <span>Document Processing</span>
        </div>
        <div className={`flex items-center space-x-2 ${theme === 'dark' ? 'text-green-300' : 'text-green-500'}`}>
          <Cpu className="w-4 h-4" />
          <span>Context-Aware AI</span>
        </div>
      </div>
    </div>
  )
}

export default RagHeader
