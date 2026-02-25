import { useTheme } from "next-themes";
import { WifiOff, Menu, Moon, Sun, RefreshCcw } from "lucide-react";

interface TopNavigationProps {
  sidebarCollapsed: boolean;
  onSidebarToggle: () => void;
}

export const TopNavigation = ({
  sidebarCollapsed,
  onSidebarToggle,
}: TopNavigationProps) => {
  const { theme, setTheme } = useTheme();

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="p-3.5 bg-card border-b border-border flex items-center justify-between px-6">
      {/* Left Section: Sidebar Toggle + Local AI Mode Badge */}
      <div className="flex items-center space-x-4">
        <button
          onClick={onSidebarToggle}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Menu size={20} />
        </button>

        {/* Static Local AI Mode badge (disabled) */}
        <button
          type="button"
          disabled
          className="flex items-center space-x-2 px-3 py-2 rounded-lg font-medium bg-orange-500 text-white cursor-default"
          title="Local AI Mode enabled"
        >
          <WifiOff size={18} />
          <span>Local AI Mode</span>
        </button>
      </div>

      {/* Right Section: Theme Toggle + Refresh */}
      <div className="flex items-center space-x-3">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          title="Toggle theme"
        >
          {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <button
          onClick={handleRefresh}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          title="Refresh page"
        >
          <RefreshCcw size={20} />
        </button>
      </div>
    </div>
  );
};
