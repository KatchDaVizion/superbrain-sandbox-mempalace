import { NavLink, useLocation } from 'react-router-dom'
import { Cpu, Bot, Pickaxe, Waves, Box, Globe } from 'lucide-react'
import logo from '../assets/89573974-0c1c-441f-9d28-51c0c8a16b06.png'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export const Sidebar = ({ collapsed }: SidebarProps) => {
  const location = useLocation()

  const navigationItems = [
    {
      category: '',
      items: [
        {
          name: 'AI Models',
          path: '/',
          icon: Cpu,
          description: 'Private local AI models running offline with Ollama',
        },
      ],
    },
    {
      category: 'AI Assistants',
      items: [
        {
          name: 'Ollama (Local AI)',
          path: '/ollama',
          icon: Bot,
          description: 'Ollama powered AI assistant',
        },
      ],
    },
    {
      category: 'Mining & Data',
      items: [
        {
          name: 'TAO Mining',
          path: '/mining',
          icon: Pickaxe,
          description: 'Mine TAO tokens using Bittensor network with your computing power',
        },
        {
          name: 'Mining Pool',
          path: '/mining-pool',
          icon: Pickaxe,
          description: 'Join collaborative mining pools for better rewards and stable income',
        },
        {
          name: 'Ocean Protocol',
          path: '/ocean',
          icon: Waves,
          description: 'Data marketplace and decentralized AI ecosystem monetization',
        },
        {
          name: 'RAG',
          path: '/rag',
          icon: Box,
          description: 'Retrieval-Augmented Generation for enhanced AI responses',
        },
        {
          name: 'Network Knowledge',
          path: '/network',
          icon: Globe,
          description: 'Search and share knowledge on the SuperBrain Bittensor subnet',
        },
      ],
    },
  ]

  const getNavLinkClass = (path: string) => {
    const isActive = location.pathname === path
    return `flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200 ${
      isActive
        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    }`
  }

  const renderNavItem = (item: any) => (
    <NavLink key={item.name} to={item.path} className={getNavLinkClass(item.path)}>
      <div className="flex items-center">
        <item.icon size={20} />
      </div>
      {!collapsed && <span className="ml-3">{item.name}</span>}
    </NavLink>
  )

  return (
    <div
      className={`fixed left-0 h-full bg-card border-r border-border transition-all duration-300 ${
        collapsed ? 'w-19' : 'w-54'
      } z-50 overflow-y-auto ease-in-out`}
    >
      {/* Logo */}
      <div
        className={`flex items-center p-4 border-b border-border ${collapsed ? 'justify-center' : 'justify-between'}`}
      >
        {!collapsed ? (
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 relative">
              <img
                src={logo}
                alt="SuperBrain AI"
                className="w-full h-full object-contain filter drop-shadow-sm opacity-90"
                style={{
                  filter: 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.2))',
                }}
              />
            </div>
            <span className="text-foreground font-bold text-lg">SuperBrain AI</span>
          </div>
        ) : (
          <div className="w-8 h-8 relative">
            <img
              src={logo}
              alt="SuperBrain AI"
              className="w-full h-full object-contain filter drop-shadow-sm opacity-90"
              style={{
                filter: 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.2))',
              }}
            />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="mt-8 px-3 space-y-8">
        {navigationItems.map((section, index) => (
          <div key={section.category}>
            {!collapsed && (
              <h4 className="px-2 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {section.category}
              </h4>
            )}
            <div className="space-y-2">{section.items.map(renderNavItem)}</div>
          </div>
        ))}
      </nav>
    </div>
  )
}
