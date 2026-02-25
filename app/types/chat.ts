
export type Role = 'user' | 'assistant'

export type ChatMessage = {
  createdAt?: string
  id: string
  role: Role
  content: string
  timestamp: string
  thinking?: string;
}

export type Thread = {
  id: string
  modelId: string
  title: string
  messages: ChatMessage[]
  lastMessage: string
  lastTimestamp: string
  createdAt: string
  updatedAt: string
  __version?: number
}

export type ChatManager = {
  threads: Thread[]
  currentThread: Thread | null
  createThread: (title?: string) => Promise<Thread | null>
  appendMessage: (role: Role, content: string) => Promise<void>
  selectThread: (threadId: string) => void
  deleteThread: (threadId: string) => Promise<void>
  clearMessages: () => Promise<void>
  currentMessages: ChatMessage[]
  refreshCurrentThread: () => Promise<void>
}
