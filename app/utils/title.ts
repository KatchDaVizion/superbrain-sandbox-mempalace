import { Thread } from "../types/chat"

// Helper function to get display title for a thread
export const getDisplayTitle = (thread: Thread) => {
  // If title is "New Chat" or empty, use first user message
  if (!thread.title || thread.title === 'New Chat') {
    const firstUserMessage = thread.messages?.find((msg) => msg.role === 'user')
    if (firstUserMessage?.content) {
      // Truncate long messages and clean up formatting
      const content = firstUserMessage.content.trim()
      return content.length > 50 ? content.substring(0, 50) + '...' : content
    }
  }
  return thread.title || 'New Chat'
}
