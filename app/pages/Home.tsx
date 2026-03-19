import DashboardLayout from '../components/shared/DashboardLayout'
import { useTheme } from 'next-themes'
import { Globe, Shield, Cpu, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const Home = () => {
  const { theme, resolvedTheme } = useTheme()
  const navigate = useNavigate()

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full w-full max-w-4xl mx-auto">
        {/* Hero */}
        <div className="mb-12 mt-8">
          <h1 className={`text-4xl font-bold mb-6 ${resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            SuperBrain
          </h1>
          <p className={`text-lg leading-relaxed mb-6 ${resolvedTheme === 'dark' ? 'text-gray-300' : 'text-gray-700'}`}>
            SuperBrain is a network of local AI assistants that share knowledge peer-to-peer. Your AI runs privately on
            your device. When you share knowledge to the network, other nodes can find it and you earn TAO on Bittensor
            Subnet 442. No central server. No tracking. Private by default.
          </p>
          <div
            className={`border rounded-lg p-4 ${
              resolvedTheme === 'dark' ? 'bg-blue-950/30 border-blue-500/20' : 'bg-blue-50 border-blue-200'
            }`}
          >
            <p className={`text-sm ${resolvedTheme === 'dark' ? 'text-blue-300' : 'text-blue-700'}`}>
              <strong>Phase 2:</strong> SuperBrain routes queries through Targon (SN4) for inference, Chutes (SN64) for
              compute, and Data Universe (SN13) for storage — one query, five subnets earning TAO.
            </p>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => navigate('/chat')}
            className={`text-left border rounded-lg p-6 transition-all hover:shadow-md ${
              resolvedTheme === 'dark'
                ? 'bg-gray-800/50 border-gray-700 hover:border-blue-500/40'
                : 'bg-white border-gray-200 hover:border-blue-300'
            }`}
          >
            <Cpu className="text-blue-500 mb-3" size={24} />
            <h3 className={`font-semibold mb-2 ${resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>AI Chat</h3>
            <p className={`text-sm ${resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Chat with local AI models running privately on your device via Ollama.
            </p>
          </button>

          <button
            onClick={() => navigate('/rag')}
            className={`text-left border rounded-lg p-6 transition-all hover:shadow-md ${
              resolvedTheme === 'dark'
                ? 'bg-gray-800/50 border-gray-700 hover:border-blue-500/40'
                : 'bg-white border-gray-200 hover:border-blue-300'
            }`}
          >
            <Shield className="text-green-500 mb-3" size={24} />
            <h3 className={`font-semibold mb-2 ${resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              My Knowledge
            </h3>
            <p className={`text-sm ${resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Ingest documents into your private knowledge base. Share selectively to the network.
            </p>
          </button>

          <button
            onClick={() => navigate('/network')}
            className={`text-left border rounded-lg p-6 transition-all hover:shadow-md ${
              resolvedTheme === 'dark'
                ? 'bg-gray-800/50 border-gray-700 hover:border-blue-500/40'
                : 'bg-white border-gray-200 hover:border-blue-300'
            }`}
          >
            <Globe className="text-purple-500 mb-3" size={24} />
            <h3 className={`font-semibold mb-2 ${resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              Network Knowledge
            </h3>
            <p className={`text-sm ${resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Search the collective knowledge pool. Cited results from anonymous peer nodes.
            </p>
          </button>

          <div
            className={`border rounded-lg p-6 ${
              resolvedTheme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200'
            }`}
          >
            <Zap className="text-yellow-500 mb-3" size={24} />
            <h3 className={`font-semibold mb-2 ${resolvedTheme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
              Earn TAO
            </h3>
            <p className={`text-sm ${resolvedTheme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
              Share knowledge to earn TAO on Bittensor Subnet 442. Validators score quality and relevance.
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default Home
