import { Routes, Route, HashRouter } from 'react-router-dom'
import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Models from './pages/models'
import { TooltipProvider } from '@radix-ui/react-tooltip'
import Ollama from './pages/ollama'
import MiningPool from './pages/MiningPool'
import Ocean from './pages/Ocean'
import Mining from './pages/Mining'
import Rag from './pages/Rag'
import NetworkKnowledge from './pages/NetworkKnowledge'
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
                <Route path="/" element={<Models />} />
                <Route path="/ollama" element={<Ollama />} />
                <Route path="/mining" element={<Mining />} />
                <Route path="/mining-pool" element={<MiningPool />} />
                <Route path="/ocean" element={<Ocean />} />
                <Route path="/rag" element={<Rag />} />
                <Route path="/network" element={<NetworkKnowledge />} />
              </Routes>
            </HashRouter>
          </TooltipProvider>
        </ThemeProvider>
      </CollectionsProvider>
    </QueryClientProvider>
  )
}

export default App
