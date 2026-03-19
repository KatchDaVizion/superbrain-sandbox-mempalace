import { Cpu } from 'lucide-react'
import { useTheme } from 'next-themes'

const Header = () => {
  const { theme, resolvedTheme } = useTheme()
  return (
    <div className="text-center mb-6">
      <div className="flex items-center justify-center space-x-4 mb-4">
        <Cpu className={`w-12 h-12 ${resolvedTheme === 'dark' ? 'text-blue-400' : 'text-blue-600'}`} />
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-header">
          Ollama - Your Private AI Universe
        </h1>
      </div>
      <p className={`text-xl max-w-2xl mx-auto ${resolvedTheme === 'dark' ? 'text-muted-foreground' : 'text-gray-600'}`}>
        Experience the future of AI - completely offline, absolutely private, infinitely powerful
      </p>
    </div>
  )
}

export default Header
