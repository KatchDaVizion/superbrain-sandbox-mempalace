import DashboardLayout from '../components/shared/DashboardLayout'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'

const Settings = () => {
  const { theme, setTheme } = useTheme()

  const themeOptions = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ]

  return (
    <DashboardLayout>
      <div className="flex flex-col h-full w-full max-w-2xl">
        <h1 className={`text-3xl font-bold mb-8 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>Settings</h1>

        {/* Theme */}
        <div
          className={`border rounded-lg p-6 mb-4 ${
            theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200'
          }`}
        >
          <h2 className={`text-lg font-semibold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            Appearance
          </h2>
          <div className="flex gap-3">
            {themeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                  theme === opt.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : theme === 'dark'
                      ? 'border-gray-600 text-gray-300 hover:border-gray-500'
                      : 'border-gray-300 text-gray-700 hover:border-gray-400'
                }`}
              >
                <opt.icon size={16} />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* About */}
        <div
          className={`border rounded-lg p-6 ${
            theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200'
          }`}
        >
          <h2 className={`text-lg font-semibold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>About</h2>
          <div className={`space-y-2 text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}`}>
            <p>SuperBrain Desktop v1.0.0</p>
            <p>Bittensor Subnet 442 (Testnet)</p>
            <p>17779011 CANADA INC.</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

export default Settings
