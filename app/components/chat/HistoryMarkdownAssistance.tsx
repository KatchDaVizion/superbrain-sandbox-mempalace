import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
import tsx from 'react-syntax-highlighter/dist/cjs/languages/prism/tsx'
import typescript from 'react-syntax-highlighter/dist/cjs/languages/prism/typescript'
import scss from 'react-syntax-highlighter/dist/cjs/languages/prism/scss'
import bash from 'react-syntax-highlighter/dist/cjs/languages/prism/bash'
import markdown from 'react-syntax-highlighter/dist/cjs/languages/prism/markdown'
import python from 'react-syntax-highlighter/dist/cjs/languages/prism/python'
import cpp from 'react-syntax-highlighter/dist/cjs/languages/prism/cpp'
import json from 'react-syntax-highlighter/dist/cjs/languages/prism/json'

import 'katex/dist/katex.min.css'

SyntaxHighlighter.registerLanguage('tsx', tsx)
SyntaxHighlighter.registerLanguage('typescript', typescript)
SyntaxHighlighter.registerLanguage('scss', scss)
SyntaxHighlighter.registerLanguage('bash', bash)
SyntaxHighlighter.registerLanguage('markdown', markdown)
SyntaxHighlighter.registerLanguage('python', python)
SyntaxHighlighter.registerLanguage('cpp', cpp)
SyntaxHighlighter.registerLanguage('json', json)

type Props = {
  content: string
}

// Function to extract first line and clean markdown formatting
function extractFirstLine(content: string): string {
  if (!content) return 'No messages yet'

  // Remove think tags first
  const withoutThinkTags = content.replace(/<think>[\s\S]*?<\/think>/g, '')

  // Split by newlines and get first non-empty line
  const lines = withoutThinkTags.split('\n')
  const firstLine = lines.find((line) => line.trim().length > 0) || ''

  // Clean up markdown formatting for preview
  let cleaned = firstLine.trim()

  // Remove markdown headers
  cleaned = cleaned.replace(/^#+\s/, '')

  // Remove markdown bold/italic
  cleaned = cleaned.replace(/\*\*(.*?)\*\*/g, '$1')
  cleaned = cleaned.replace(/\*(.*?)\*/g, '$1')
  cleaned = cleaned.replace(/_(.*?)_/g, '$1')

  // Remove markdown links but keep text
  cleaned = cleaned.replace(/\[(.*?)\]\(.*?\)/g, '$1')

  // Remove code blocks but keep content
  cleaned = cleaned.replace(/`(.*?)`/g, '$1')

  // Remove blockquote markers
  cleaned = cleaned.replace(/^>\s/, '')

  // Truncate if too long
  if (cleaned.length > 100) {
    cleaned = cleaned.substring(0, 97) + '...'
  }

  return cleaned || 'No messages yet'
}

export default function HistoryMarkdownAssistance({ content }: Props) {
  const firstLine = extractFirstLine(content)

  return (
    <span className="text-xs truncate" title={firstLine}>
      {firstLine}
    </span>
  )
}
