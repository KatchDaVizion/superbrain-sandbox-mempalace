import { TopNavigation } from '../TopNavigation'
import { Sidebar } from '../sidebar'
import { ReactNode, useState } from 'react'

interface DashboardLayoutProps {
  children: ReactNode
}
const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const toggleSidebar = () => setSidebarCollapsed((prev) => !prev)
  return (
    <div className="h-full bg-background text-foreground transition-colors duration-300 flex overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />

      <div
        className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-14' : 'ml-54'} h-full flex-1 flex flex-col overflow-y-auto pb-6`}
      >
        <TopNavigation sidebarCollapsed={sidebarCollapsed} onSidebarToggle={toggleSidebar} />

        <main className="flex overflow-x-hidden overflow-y-auto h-full">
          <div className="flex-1 px-8 py-6 md:px-12 w-full">{children}</div>
        </main>
      </div>
    </div>
  )
}

export default DashboardLayout
