import { useEffect, useState, useRef } from 'react'
import DashboardLayout from '../components/shared/DashboardLayout'
import { useTheme } from 'next-themes'
import { Globe, Wifi, Shield, Activity } from 'lucide-react'

interface NetworkNode {
  id: string
  nodeId: string
  chunkCount: number
  lastSeen: number
  syncLayer: 'lan' | 'i2p' | 'testnet'
  isCurrentNode: boolean
}

interface Connection {
  from: string
  to: string
  active: boolean
  layer: 'lan' | 'i2p' | 'testnet'
}

export default function NodeMap() {
  const { theme } = useTheme()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [nodes, setNodes] = useState<NetworkNode[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [stats, setStats] = useState({ totalNodes: 0, totalChunks: 0, activeConnections: 0 })
  const [syncLayer, setSyncLayer] = useState<'all' | 'lan' | 'i2p' | 'testnet'>('all')
  const isDark = theme === 'dark'

  useEffect(() => {
    loadNetworkState()
    const interval = setInterval(loadNetworkState, 10000)
    return () => clearInterval(interval)
  }, [])

  const loadNetworkState = async () => {
    try {
      const result = await window.electron?.ipcRenderer?.invoke('get-network-state') || getMockState()
      setNodes(result.nodes || getMockState().nodes)
      setConnections(result.connections || getMockState().connections)
      setStats({
        totalNodes: result.nodes?.length || 0,
        totalChunks: result.nodes?.reduce((a: number, n: NetworkNode) => a + n.chunkCount, 0) || 0,
        activeConnections: result.connections?.filter((c: Connection) => c.active).length || 0
      })
    } catch {
      const mock = getMockState()
      setNodes(mock.nodes)
      setConnections(mock.connections)
      setStats({ totalNodes: mock.nodes.length, totalChunks: 47, activeConnections: 2 })
    }
  }

  const getMockState = () => ({
    nodes: [
      { id: '1', nodeId: 'node-a8f2...3k9', chunkCount: 14, lastSeen: Date.now(), syncLayer: 'lan' as const, isCurrentNode: true },
      { id: '2', nodeId: 'node-x7m1...9p2', chunkCount: 23, lastSeen: Date.now() - 30000, syncLayer: 'lan' as const, isCurrentNode: false },
      { id: '3', nodeId: 'node-q4r8...7n1', chunkCount: 8, lastSeen: Date.now() - 120000, syncLayer: 'i2p' as const, isCurrentNode: false },
      { id: '4', nodeId: 'node-b2k5...4m7', chunkCount: 2, lastSeen: Date.now() - 300000, syncLayer: 'testnet' as const, isCurrentNode: false },
    ],
    connections: [
      { from: '1', to: '2', active: true, layer: 'lan' as const },
      { from: '1', to: '3', active: true, layer: 'i2p' as const },
      { from: '2', to: '4', active: false, layer: 'testnet' as const },
    ]
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || nodes.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight

    ctx.fillStyle = isDark ? '#0a0a0f' : '#f0f4ff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Draw grid
    ctx.strokeStyle = isDark ? 'rgba(99,102,241,0.05)' : 'rgba(99,102,241,0.08)'
    ctx.lineWidth = 1
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke()
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke()
    }

    // Position nodes in a circle
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const radius = Math.min(canvas.width, canvas.height) * 0.32
    const filtered = nodes.filter(n => syncLayer === 'all' || n.syncLayer === syncLayer)
    const positions: Record<string, {x: number, y: number}> = {}

    filtered.forEach((node, i) => {
      const angle = (i / filtered.length) * Math.PI * 2 - Math.PI / 2
      positions[node.id] = {
        x: cx + Math.cos(angle) * (node.isCurrentNode ? 0 : radius),
        y: cy + Math.sin(angle) * (node.isCurrentNode ? 0 : radius)
      }
    })

    // Draw connections
    connections.filter(c => syncLayer === 'all' || c.layer === syncLayer).forEach(conn => {
      const from = positions[conn.from]
      const to = positions[conn.to]
      if (!from || !to) return
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      const colors = { lan: '#6366f1', i2p: '#10b981', testnet: '#f59e0b' }
      ctx.strokeStyle = conn.active
        ? colors[conn.layer] + 'cc'
        : colors[conn.layer] + '33'
      ctx.lineWidth = conn.active ? 2 : 1
      ctx.setLineDash(conn.active ? [] : [5, 5])
      ctx.stroke()
      ctx.setLineDash([])
    })

    // Draw nodes
    filtered.forEach(node => {
      const pos = positions[node.id]
      if (!pos) return
      const colors = { lan: '#6366f1', i2p: '#10b981', testnet: '#f59e0b' }
      const color = colors[node.syncLayer]
      const size = node.isCurrentNode ? 20 : 12 + Math.min(node.chunkCount / 2, 8)

      // Glow
      const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, size * 2.5)
      glow.addColorStop(0, color + '40')
      glow.addColorStop(1, 'transparent')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, size * 2.5, 0, Math.PI * 2)
      ctx.fill()

      // Node dot
      ctx.fillStyle = node.isCurrentNode ? '#ffffff' : color
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2)
      ctx.fill()

      if (node.isCurrentNode) {
        ctx.strokeStyle = color
        ctx.lineWidth = 3
        ctx.stroke()
      }

      // Label
      ctx.fillStyle = isDark ? '#e2e8f0' : '#1e293b'
      ctx.font = '11px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(node.nodeId.slice(0, 16) + '...', pos.x, pos.y + size + 16)
      ctx.fillText(node.chunkCount + ' chunks', pos.x, pos.y + size + 28)
    })

  }, [nodes, connections, isDark, syncLayer])

  const layerColors = { lan: 'text-indigo-400', i2p: 'text-emerald-400', testnet: 'text-amber-400' }
  const layerLabels = { lan: 'LAN', i2p: 'I2P', testnet: 'Testnet' }

  return (
    <DashboardLayout>
      <div className={'h-full flex flex-col ' + (isDark ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900')}>
        
        {/* Header */}
        <div className={'flex items-center justify-between px-6 py-4 border-b ' + (isDark ? 'border-gray-800' : 'border-gray-200')}>
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-indigo-400" />
            <h1 className="font-semibold text-lg">Network Map</h1>
            <span className={'text-xs px-2 py-0.5 rounded-full ' + (isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-200 text-gray-600')}>
              Private — node IDs only
            </span>
          </div>
          <div className="flex items-center gap-2">
            {(['all', 'lan', 'i2p', 'testnet'] as const).map(layer => (
              <button
                key={layer}
                onClick={() => setSyncLayer(layer)}
                className={'text-xs px-3 py-1 rounded-full border transition-all ' + (
                  syncLayer === layer
                    ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300'
                    : isDark ? 'border-gray-700 text-gray-500 hover:border-gray-500' : 'border-gray-300 text-gray-500'
                )}
              >
                {layer === 'all' ? 'All' : layerLabels[layer]}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className={'flex gap-6 px-6 py-3 border-b ' + (isDark ? 'border-gray-800 bg-gray-900/50' : 'border-gray-200 bg-white/50')}>
          {[
            { icon: Wifi, label: 'Nodes', value: stats.totalNodes, color: 'text-indigo-400' },
            { icon: Activity, label: 'Knowledge Chunks', value: stats.totalChunks, color: 'text-emerald-400' },
            { icon: Shield, label: 'Active Connections', value: stats.activeConnections, color: 'text-amber-400' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="flex items-center gap-2">
              <Icon className={'w-4 h-4 ' + color} />
              <span className={'text-xs ' + (isDark ? 'text-gray-400' : 'text-gray-500')}>{label}:</span>
              <span className="text-sm font-mono font-bold">{value}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-indigo-400 inline-block"/>LAN</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-400 inline-block"/>I2P</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-amber-400 inline-block"/>Testnet</span>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative">
          <canvas ref={canvasRef} className="w-full h-full" />
          <div className={'absolute bottom-4 left-4 text-xs font-mono ' + (isDark ? 'text-gray-600' : 'text-gray-400')}>
            <div>● You are the white node</div>
            <div>● All identities are cryptographic only</div>
            <div>● Phase 2: SN65 transport routing</div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
