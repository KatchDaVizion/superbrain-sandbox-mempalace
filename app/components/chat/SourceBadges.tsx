/**
 * SourceBadges — shows which knowledge sources were used in an AI response.
 *
 * Displays small colored badges under each assistant message:
 *   Wikipedia (offline) | Your Knowledge Base | SuperBrain Network | Offline Mode
 */

interface SourceBadge {
  label: string
  icon: string
  color: string // tailwind color class
}

interface SourceBadgesProps {
  sources?: Array<{ source: string; type: string }>
  hasZimResults?: boolean
  hasQdrantResults?: boolean
  hasNetworkResults?: boolean
  isOffline?: boolean
}

function detectBadges(props: SourceBadgesProps): SourceBadge[] {
  const badges: SourceBadge[] = []

  // Check for ZIM/Wikipedia sources
  if (
    props.hasZimResults ||
    props.sources?.some((s) => s.type === 'zim' || s.source.toLowerCase().includes('wikipedia'))
  ) {
    badges.push({
      label: 'Wikipedia (offline)',
      icon: '\u{1F4DA}',
      color: 'bg-blue-500/10 text-blue-500',
    })
  }

  // Check for Qdrant/local knowledge base sources
  if (
    props.hasQdrantResults ||
    props.sources?.some(
      (s) =>
        s.type === 'pdf' ||
        s.type === 'docx' ||
        s.type === 'txt' ||
        s.type === 'url' ||
        s.type === 'text' ||
        s.type === 'unknown'
    )
  ) {
    badges.push({
      label: 'Your Knowledge Base',
      icon: '\u{1F9E0}',
      color: 'bg-purple-500/10 text-purple-500',
    })
  }

  // Check for SN442 network sources
  if (
    props.hasNetworkResults ||
    props.sources?.some((s) => s.source.includes('SN442') || s.source.includes('network'))
  ) {
    badges.push({
      label: 'SuperBrain Network',
      icon: '\u{1F310}',
      color: 'bg-green-500/10 text-green-500',
    })
  }

  // If no network sources and we have local sources, show offline indicator
  if (props.isOffline && badges.length > 0) {
    badges.push({
      label: 'Offline Mode',
      icon: '\u{2708}\u{FE0F}',
      color: 'bg-orange-500/10 text-orange-500',
    })
  }

  return badges
}

export function SourceBadges(props: SourceBadgesProps) {
  const badges = detectBadges(props)

  if (badges.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {badges.map((badge) => (
        <span
          key={badge.label}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}
        >
          <span>{badge.icon}</span>
          {badge.label}
        </span>
      ))}
    </div>
  )
}
