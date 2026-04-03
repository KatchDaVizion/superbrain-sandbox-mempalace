import 'leaflet/dist/leaflet.css'
import { Routes, Route, HashRouter } from 'react-router-dom'
import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Home from './pages/Home'
import { TooltipProvider } from '@radix-ui/react-tooltip'
import Ollama from './pages/ollama'
import Models from './pages/models'
import Rag from './pages/Rag'
import NetworkKnowledge from './pages/NetworkKnowledge'
import NodeMap from './pages/NodeMap'
import Settings from './pages/Settings'
import History from './pages/History'
import Benchmark from './components/Benchmark'
import Leaderboard from './components/Leaderboard'
import { CollectionsProvider } from '@/lib/chat/CollectionsContext'

const queryClient = new QueryClient()

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <CollectionsProvider>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider>
            <HashRouter>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/chat" element={<Ollama />} />
                <Route path="/history" element={<History />} />
                <Route path="/models" element={<Models />} />
                <Route path="/rag" element={<Rag />} />
                <Route path="/network" element={<NetworkKnowledge />} />
                <Route path="/nodemap" element={<NodeMap />} />
                <Route path="/benchmark" element={<Benchmark />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/settings" element={<Settings />} />
              </Routes>
            </HashRouter>
          </TooltipProvider>
        </ThemeProvider>
      </CollectionsProvider>
    </QueryClientProvider>
  )
}

export default App
