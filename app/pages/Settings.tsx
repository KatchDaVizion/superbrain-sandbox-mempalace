import { useState, useEffect } from 'react'
import DashboardLayout from '../components/shared/DashboardLayout'
import ShareHistory from '../components/chat/ShareHistory'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor, Volume2, VolumeX } from 'lucide-react'

const VOICE_STORAGE_KEY = 'superbrain-voice-settings'

interface VoiceSettings {
  voiceEnabled: boolean
  speechRate: number
  selectedVoice: string
  handsFreeMode: boolean
}

function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(VOICE_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return { voiceEnabled: false, speechRate: 1, selectedVoice: '', handsFreeMode: false }
}

function saveVoiceSettings(settings: VoiceSettings) {
  try {
    localStorage.setItem(VOICE_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}

const Settings = () => {
  const { theme, setTheme } = useTheme()
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(loadVoiceSettings)
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    if (!window.speechSynthesis) return
    const loadVoices = () => {
      setAvailableVoices(window.speechSynthesis.getVoices())
    }
    loadVoices()
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
  }, [])

  const updateVoiceSetting = <K extends keyof VoiceSettings>(key: K, value: VoiceSettings[K]) => {
    setVoiceSettings((prev) => {
      const next = { ...prev, [key]: value }
      saveVoiceSettings(next)
      return next
    })
  }

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

        {/* Voice */}
        <div
          className={`border rounded-lg p-6 mb-4 ${
            theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200'
          }`}
        >
          <h2 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
            {voiceSettings.voiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            Voice
          </h2>
          <div className="space-y-5">
            {/* Voice Responses toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
                  Voice Responses
                </p>
                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  Read assistant responses aloud using text-to-speech
                </p>
              </div>
              <button
                onClick={() => updateVoiceSetting('voiceEnabled', !voiceSettings.voiceEnabled)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  voiceSettings.voiceEnabled ? 'bg-blue-600' : theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    voiceSettings.voiceEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Speech Rate */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
                  Speech Rate
                </p>
                <span className={`text-sm ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  {voiceSettings.speechRate.toFixed(1)}x
                </span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                value={voiceSettings.speechRate}
                onChange={(e) => updateVoiceSetting('speechRate', parseFloat(e.target.value))}
                className="w-full accent-blue-600"
              />
              <div className={`flex justify-between text-xs mt-1 ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                <span>0.5x</span>
                <span>1.0x</span>
                <span>2.0x</span>
              </div>
            </div>

            {/* Voice Selector */}
            <div>
              <p className={`text-sm font-medium mb-2 ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
                Voice
              </p>
              <select
                value={voiceSettings.selectedVoice}
                onChange={(e) => updateVoiceSetting('selectedVoice', e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border text-sm transition-colors ${
                  theme === 'dark'
                    ? 'bg-gray-700 border-gray-600 text-gray-200'
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                <option value="">System Default</option>
                {availableVoices.map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
              </select>
            </div>

            {/* Auto-listen after response */}
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${theme === 'dark' ? 'text-gray-200' : 'text-gray-700'}`}>
                  Hands-Free Mode
                </p>
                <p className={`text-xs ${theme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                  Auto-listen for follow-up after voice response finishes
                </p>
              </div>
              <button
                onClick={() => updateVoiceSetting('handsFreeMode', !voiceSettings.handsFreeMode)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  voiceSettings.handsFreeMode ? 'bg-blue-600' : theme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    voiceSettings.handsFreeMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>


        {/* Network Sharing History */}
        <div
          className={`border rounded-lg p-6 mb-4 ${
            theme === "dark" ? "bg-gray-800/50 border-gray-700" : "bg-white border-gray-200"
          }`}
        >
          <h2 className={`text-lg font-semibold mb-4 ${theme === "dark" ? "text-white" : "text-gray-900"}`}>
            Network Sharing
          </h2>
          <ShareHistory />
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
