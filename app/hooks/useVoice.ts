import { useState, useEffect, useRef, useCallback } from "react"

// Declare webkitSpeechRecognition for TypeScript
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition
    webkitSpeechRecognition: typeof SpeechRecognition
  }
}

interface VoiceSettings {
  voiceEnabled: boolean
  speechRate: number
  selectedVoice: string
  handsFreeMode: boolean
}

const STORAGE_KEY = "superbrain-voice-settings"
const HANDS_FREE_TIMEOUT = 10000

function loadSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      return JSON.parse(raw)
    }
  } catch {
    // ignore
  }
  return {
    voiceEnabled: false,
    speechRate: 1,
    selectedVoice: "",
    handsFreeMode: false,
  }
}

function saveSettings(settings: VoiceSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore
  }
}

function stripMarkdown(text: string): string {
  let result = text
  // Remove code blocks
  result = result.replace(/```[\s\S]*?```/g, " code block ")
  // Remove inline code
  result = result.replace(/`([^`]+)`/g, "$1")
  // Remove headers
  result = result.replace(/^#{1,6}\s+/gm, "")
  // Remove bold/italic markers
  result = result.replace(/\*\*\*(.*?)\*\*\*/g, "$1")
  result = result.replace(/\*\*(.*?)\*\*/g, "$1")
  result = result.replace(/\*(.*?)\*/g, "$1")
  result = result.replace(/_{3}(.*?)_{3}/g, "$1")
  result = result.replace(/__(.*?)__/g, "$1")
  result = result.replace(/_(.*?)_/g, "$1")
  // Remove links, keep text
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
  // Remove images
  result = result.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
  // Remove blockquotes
  result = result.replace(/^>\s+/gm, "")
  // Remove horizontal rules
  result = result.replace(/^[-*_]{3,}\s*$/gm, "")
  // Remove bullet points
  result = result.replace(/^[\s]*[-*+]\s+/gm, "")
  // Remove numbered list markers
  result = result.replace(/^[\s]*\d+\.\s+/gm, "")
  // Clean up extra whitespace
  result = result.replace(/\n{3,}/g, "\n\n")
  result = result.trim()
  return result
}

interface UseVoiceOptions {
  onTranscript?: (transcript: string) => void
  onSpeakingEnd?: () => void
}

export function useVoice(options: UseVoiceOptions = {}) {
  const { onTranscript, onSpeakingEnd } = options

  const [isListening, setIsListening] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([])
  const [browserSupported, setBrowserSupported] = useState(false)

  const [settings, setSettings] = useState<VoiceSettings>(loadSettings)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const handsFreeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onTranscriptRef = useRef(onTranscript)
  const onSpeakingEndRef = useRef(onSpeakingEnd)

  // Keep refs in sync
  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  useEffect(() => {
    onSpeakingEndRef.current = onSpeakingEnd
  }, [onSpeakingEnd])

  // Persist settings
  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  // Check browser support
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    setBrowserSupported(!!SR && !!window.speechSynthesis)
  }, [])

  // Load voices
  useEffect(() => {
    if (!window.speechSynthesis) return

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices()
      setAvailableVoices(voices)
    }

    loadVoices()
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices)
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices)
    }
  }, [])

  // Escape key exits hands-free mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && settings.handsFreeMode) {
        setSettings((prev) => ({ ...prev, handsFreeMode: false }))
        stopListening()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [settings.handsFreeMode])

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    // Stop any existing recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort()
      } catch {
        // ignore
      }
    }

    const recognition = new SR()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = "en-US"

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = ""
      let finalTranscript = ""

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscript += result[0].transcript
        } else {
          interimTranscript += result[0].transcript
        }
      }

      if (finalTranscript) {
        setTranscript(finalTranscript)
        if (onTranscriptRef.current) {
          onTranscriptRef.current(finalTranscript)
        }
      } else if (interimTranscript) {
        setTranscript(interimTranscript)
      }

      // Clear hands-free timeout on speech activity
      if (handsFreeTimeoutRef.current) {
        clearTimeout(handsFreeTimeoutRef.current)
        handsFreeTimeoutRef.current = null
      }
    }

    recognition.onend = () => {
      setIsListening(false)
      // In hands-free mode, don't auto-restart — let the chat flow handle it
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.warn("Speech recognition error:", event.error)
      setIsListening(false)
    }

    recognition.onstart = () => {
      setIsListening(true)
      // Hands-free auto-timeout: if no speech detected for 10 seconds
      if (settings.handsFreeMode) {
        handsFreeTimeoutRef.current = setTimeout(() => {
          setSettings((prev) => ({ ...prev, handsFreeMode: false }))
          try {
            recognition.abort()
          } catch {
            // ignore
          }
          setIsListening(false)
        }, HANDS_FREE_TIMEOUT)
      }
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch (err) {
      console.warn("Could not start speech recognition:", err)
    }
  }, [settings.handsFreeMode])

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort()
      } catch {
        // ignore
      }
      recognitionRef.current = null
    }
    setIsListening(false)
    if (handsFreeTimeoutRef.current) {
      clearTimeout(handsFreeTimeoutRef.current)
      handsFreeTimeoutRef.current = null
    }
  }, [])

  const speak = useCallback(
    (text: string) => {
      if (!window.speechSynthesis || !settings.voiceEnabled) return

      // Cancel any ongoing speech
      window.speechSynthesis.cancel()

      const cleaned = stripMarkdown(text)
      if (!cleaned) return

      const utterance = new SpeechSynthesisUtterance(cleaned)
      utterance.rate = settings.speechRate

      // Select voice
      const voices = window.speechSynthesis.getVoices()
      let voice: SpeechSynthesisVoice | undefined

      if (settings.selectedVoice) {
        voice = voices.find((v) => v.name === settings.selectedVoice)
      }

      if (!voice) {
        // Prefer en-US female voice
        voice = voices.find(
          (v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("female")
        )
      }
      if (!voice) {
        voice = voices.find((v) => v.lang.startsWith("en-US"))
      }
      if (!voice) {
        voice = voices.find((v) => v.lang.startsWith("en"))
      }

      if (voice) {
        utterance.voice = voice
      }

      utterance.onstart = () => setIsReading(true)
      utterance.onend = () => {
        setIsReading(false)
        if (onSpeakingEndRef.current) {
          onSpeakingEndRef.current()
        }
      }
      utterance.onerror = () => {
        setIsReading(false)
      }

      window.speechSynthesis.speak(utterance)
    },
    [settings.voiceEnabled, settings.speechRate, settings.selectedVoice]
  )

  const stopSpeaking = useCallback(() => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setIsReading(false)
  }, [])

  const toggleVoice = useCallback(() => {
    setSettings((prev) => ({ ...prev, voiceEnabled: !prev.voiceEnabled }))
  }, [])

  const toggleHandsFree = useCallback(() => {
    setSettings((prev) => {
      const next = !prev.handsFreeMode
      if (!next) {
        // Turning off hands-free — stop listening
        stopListening()
      }
      return { ...prev, handsFreeMode: next }
    })
  }, [stopListening])

  const setVoiceEnabled = useCallback((value: boolean) => {
    setSettings((prev) => ({ ...prev, voiceEnabled: value }))
  }, [])

  const setSpeechRate = useCallback((rate: number) => {
    setSettings((prev) => ({ ...prev, speechRate: rate }))
  }, [])

  const setSelectedVoice = useCallback((name: string) => {
    setSettings((prev) => ({ ...prev, selectedVoice: name }))
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopListening()
      stopSpeaking()
    }
  }, [stopListening, stopSpeaking])

  return {
    // State
    isListening,
    isReading,
    transcript,
    voiceEnabled: settings.voiceEnabled,
    handsFreeMode: settings.handsFreeMode,
    speechRate: settings.speechRate,
    selectedVoice: settings.selectedVoice,
    availableVoices,
    browserSupported,

    // Actions
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    toggleVoice,
    toggleHandsFree,
    setVoiceEnabled,
    setSpeechRate,
    setSelectedVoice,
  }
}
