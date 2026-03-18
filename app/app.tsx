import { Routes, Route, HashRouter } from 'react-router-dom'
import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Home from './pages/Home'
import { TooltipProvider } from '@radix-ui/react-tooltip'
import Ollama from './pages/ollama'
import Models from './pages/models'
import Rag from './pages/Rag'
import NetworkKnowledge from './pages/NetworkKnowledge'
import Settings from './pages/Settings'
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
                <Route path="/models" element={<Models />} />
                <Route path="/rag" element={<Rag />} />
                <Route path="/network" element={<NetworkKnowledge />} />
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
