import { NavLink, useLocation } from 'react-router-dom'
import { MessageSquare, Database, Settings as SettingsIcon, Home, Cpu, Clock, Wifi, Gauge, Trophy, Coins, Brain, Globe, Rss } from 'lucide-react'
import logo from '../assets/89573974-0c1c-441f-9d28-51c0c8a16b06.png'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export const Sidebar = ({ collapsed }: SidebarProps) => {
  const location = useLocation()

  const navigationItems = [
    {
      name: 'Home',
      path: '/',
      icon: Home,
    },
    {
      name: 'AI Chat',
      path: '/chat',
      icon: MessageSquare,
    },
    {
      name: 'History',
      path: '/history',
      icon: Clock,
    },
    {
      name: 'AI Models',
      path: '/models',
      icon: Cpu,
    },
    {
      name: 'Documents',
      path: '/rag',
      icon: Database,
    },
    {
      name: 'Network Knowledge',
      path: '/network',
      icon: Globe,
    },
    {
      name: 'Feed',
      path: '/feed',
      icon: Rss,
    },
    {
      name: 'Node Map',
      path: '/nodemap',
      icon: Wifi,
    },
    {
      name: 'My Earnings',
      path: '/earnings',
      icon: Coins,
    },
    {
      name: 'Benchmark',
      path: '/benchmark',
      icon: Gauge,
    },
    {
      name: 'Leaderboard',
      path: '/leaderboard',
      icon: Trophy,
    },
    {
      name: 'Memory Palace',
      path: '/memory-palace',
      icon: Brain,
    },
    {
      name: 'Settings',
      path: '/settings',
      icon: SettingsIcon,
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
                alt="SuperBrain"
                className="w-full h-full object-contain filter drop-shadow-sm opacity-90"
                style={{
                  filter: 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.2))',
                }}
              />
            </div>
            <span className="text-foreground font-bold text-lg">SuperBrain</span>
          </div>
        ) : (
          <div className="w-8 h-8 relative">
            <img
              src={logo}
              alt="SuperBrain"
              className="w-full h-full object-contain filter drop-shadow-sm opacity-90"
              style={{
                filter: 'drop-shadow(0 0 6px rgba(59, 130, 246, 0.2))',
              }}
            />
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="mt-8 px-3 space-y-2">
        {navigationItems.map((item) => (
          <NavLink key={item.name} to={item.path} className={getNavLinkClass(item.path)}>
            <div className="flex items-center">
              <item.icon size={20} />
            </div>
            {!collapsed && <span className="ml-3">{item.name}</span>}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
