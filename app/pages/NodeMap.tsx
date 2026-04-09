/**
 * NodeMap — 3D rotating neural-brain visualization of the SN442 peer network.
 *
 * Pure HTML5 Canvas 2D + manual perspective projection. No Three.js, no
 * Leaflet, no map tiles, no external geo data. Lighter, prettier, no CSP
 * issues, runs at 60fps even on low-RAM hardware.
 *
 * Architecture:
 *   - Background "neurons" — Fibonacci-distributed unit-sphere points,
 *     connected by short synapses to form a glowing brain volume.
 *   - Peer nodes — fetched from Frankfurt /peers, mapped to deterministic
 *     positions on the sphere surface (hash node_id → spherical coords),
 *     drawn as glowing pulsing dots with edges back to the seed.
 *   - Auto-rotates on Y axis. Click+drag rotates manually. Idle 2s →
 *     auto-rotate resumes.
 *   - Mouse hover finds the closest projected peer and shows a DOM tooltip.
 *
 * Replaces the old Leaflet flat-map version. Position data is deliberately
 * non-geographic — the brain is a topology, not a map.
 */

import { useEffect, useRef, useState } from 'react'
import DashboardLayout from '../components/shared/DashboardLayout'
import { useTheme } from 'next-themes'
import { Brain as BrainIcon, Wifi, Activity, Shield } from 'lucide-react'

// ── Types ───────────────────────────────────────────────────────────────────

interface PeerInfo {
  url?: string
  city?: string
  chunks?: number
  node_id?: string
  role?: string
}

interface PeerNode {
  id: string
  pos: [number, number, number] // unit-sphere coords
  color: string
  radius: number
  isSeed: boolean
  isSelf: boolean
  city: string
  chunks: number
  online: boolean
  pulsePhase: number
}

interface ProjectedPeer {
  peer: PeerNode
  x: number
  y: number
  z: number
}

// ── Math helpers ────────────────────────────────────────────────────────────

/** Fibonacci-sphere distribution: gives ~uniform points on a unit sphere. */
function fibonacciSphere(n: number): [number, number, number][] {
  const points: [number, number, number][] = []
  const phi = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / Math.max(1, n - 1)) * 2
    const radius = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = phi * i
    points.push([Math.cos(theta) * radius, y, Math.sin(theta) * radius])
  }
  return points
}

/** Deterministic hash → unit-sphere position. Same input always gives same point. */
function hashToSphere(seed: string): [number, number, number] {
  let h1 = 2166136261
  let h2 = 5381
  for (let i = 0; i < seed.length; i++) {
    h1 = ((h1 ^ seed.charCodeAt(i)) * 16777619) >>> 0
    h2 = ((h2 << 5) + h2 + seed.charCodeAt(i)) >>> 0
  }
  const u = (h1 % 10000) / 10000
  const v = (h2 % 10000) / 10000
  const theta = u * Math.PI * 2
  const phi = Math.acos(2 * v - 1)
  return [
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ]
}

/** Rotate a 3D point around Y axis then X axis. Right-handed coords. */
function rotate3d(
  p: [number, number, number],
  rx: number,
  ry: number
): [number, number, number] {
  const cy = Math.cos(ry)
  const sy = Math.sin(ry)
  const x1 = p[0] * cy - p[2] * sy
  const z1 = p[0] * sy + p[2] * cy
  const cx = Math.cos(rx)
  const sx = Math.sin(rx)
  const y1 = p[1] * cx - z1 * sx
  const z2 = p[1] * sx + z1 * cx
  return [x1, y1, z2]
}

// ── Peer fetch ──────────────────────────────────────────────────────────────

const SN442_NODE = 'http://46.225.114.202:8400'

async function fetchPeers(): Promise<PeerNode[]> {
  try {
    const resp = await fetch(`${SN442_NODE}/peers`, { signal: AbortSignal.timeout(8000) })
    const data = await resp.json()
    const peers: PeerInfo[] = data.peers || []
    const totalChunks: number = data.total_chunks || 0

    const nodes: PeerNode[] = []

    // Frankfurt seed — pinned to top-back of the sphere
    nodes.push({
      id: 'seed-frankfurt',
      pos: [0, 0.85, 0.5],
      color: '#3b82f6',
      radius: 8,
      isSeed: true,
      isSelf: false,
      city: 'Frankfurt, DE',
      chunks: totalChunks,
      online: true,
      pulsePhase: 0,
    })

    // Local Kali node — pinned to front-bottom of the sphere
    nodes.push({
      id: 'kali-local',
      pos: [-0.3, -0.6, 0.7],
      color: '#10b981',
      radius: 6,
      isSeed: false,
      isSelf: true,
      city: 'Ottawa, CA (you)',
      chunks: 5,
      online: true,
      pulsePhase: 1.2,
    })

    // Real peers — hash node_id → deterministic sphere position
    const seen = new Set<string>()
    peers.forEach((p, i) => {
      const id = p.node_id || p.url || `peer-${i}`
      if (!p.url || p.url.includes('46.225.114.202') || seen.has(id)) return
      seen.add(id)

      const pos = hashToSphere(id)
      nodes.push({
        id,
        pos,
        color: '#22d3ee',
        radius: 4 + Math.min(3, (p.chunks || 0) / 5),
        isSeed: false,
        isSelf: false,
        city: p.city || 'Unknown',
        chunks: p.chunks || 0,
        online: true,
        pulsePhase: i * 0.7,
      })
    })

    return nodes
  } catch {
    // Frankfurt unreachable — return self only so the brain still renders
    return [
      {
        id: 'kali-local',
        pos: [-0.3, -0.6, 0.7],
        color: '#10b981',
        radius: 6,
        isSeed: false,
        isSelf: true,
        city: 'Ottawa, CA (you, offline)',
        chunks: 5,
        online: true,
        pulsePhase: 0,
      },
    ]
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function NodeMap() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>(0)
  const rotationRef = useRef({ x: 0.15, y: 0 })
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0, lastInteract: 0 })
  const peersRef = useRef<PeerNode[]>([])
  const projectedRef = useRef<ProjectedPeer[]>([])
  const backgroundNeurons = useRef<[number, number, number][]>(fibonacciSphere(220))

  const [hover, setHover] = useState<{ peer: PeerNode; x: number; y: number } | null>(null)
  const [stats, setStats] = useState({ nodes: 0, chunks: 0, connections: 0 })

  // Fetch peers on mount + every 30s
  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const nodes = await fetchPeers()
      if (cancelled) return
      peersRef.current = nodes
      const onlineCount = nodes.filter((n) => n.online).length
      setStats({
        nodes: nodes.length,
        chunks: nodes.reduce((a, b) => a + b.chunks, 0),
        connections: Math.max(0, onlineCount - 1), // peer→seed edges
      })
    }
    refresh()
    const interval = setInterval(refresh, 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const rect = container.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      ctx.scale(dpr, dpr)
    }
    resize()
    window.addEventListener('resize', resize)

    const animate = () => {
      const W = canvas.clientWidth
      const H = canvas.clientHeight
      const cx = W / 2
      const cy = H / 2
      const scale = Math.min(W, H) * 0.32

      // Clear with deep space background
      ctx.fillStyle = isDark ? '#05050f' : '#f1f5f9'
      ctx.fillRect(0, 0, W, H)

      const now = performance.now()
      const idleTime = now - dragRef.current.lastInteract
      // Auto-rotate when not actively dragged and idle > 2 sec
      if (!dragRef.current.active && idleTime > 2000) {
        rotationRef.current.y += 0.0035
        rotationRef.current.x = 0.15 + Math.sin(now / 5000) * 0.08
      }

      const rx = rotationRef.current.x
      const ry = rotationRef.current.y

      // ── Background brain neurons ───────────────────────────────────────
      const neurons = backgroundNeurons.current.map((p) => {
        const r = rotate3d(p, rx, ry)
        return { x: cx + r[0] * scale, y: cy + r[1] * scale, z: r[2] }
      })

      // Synapses between close projected neurons (gives the brain "veins")
      const synapseColor = isDark ? '99, 102, 241' : '79, 70, 229'
      ctx.lineWidth = 0.6
      const maxSynDist = scale * 0.18
      for (let i = 0; i < neurons.length; i++) {
        for (let j = i + 1; j < Math.min(i + 8, neurons.length); j++) {
          const dx = neurons[i].x - neurons[j].x
          const dy = neurons[i].y - neurons[j].y
          const d2 = dx * dx + dy * dy
          if (d2 < maxSynDist * maxSynDist) {
            const d = Math.sqrt(d2)
            const depth = (neurons[i].z + neurons[j].z) * 0.5
            const opacity = (1 - d / maxSynDist) * 0.18 * (0.5 + depth * 0.3)
            if (opacity > 0.01) {
              ctx.strokeStyle = `rgba(${synapseColor}, ${opacity})`
              ctx.beginPath()
              ctx.moveTo(neurons[i].x, neurons[i].y)
              ctx.lineTo(neurons[j].x, neurons[j].y)
              ctx.stroke()
            }
          }
        }
      }

      // Background neuron dots — depth-shaded
      const neuronColor = isDark ? '147, 197, 253' : '59, 130, 246'
      neurons
        .slice()
        .sort((a, b) => a.z - b.z)
        .forEach((n) => {
          const opacity = 0.15 + Math.max(0, n.z + 1) * 0.4
          ctx.fillStyle = `rgba(${neuronColor}, ${opacity})`
          ctx.beginPath()
          ctx.arc(n.x, n.y, 1.4, 0, Math.PI * 2)
          ctx.fill()
        })

      // ── Peer nodes ─────────────────────────────────────────────────────
      const projected: ProjectedPeer[] = peersRef.current.map((peer) => {
        const r = rotate3d(peer.pos, rx, ry)
        return {
          peer,
          x: cx + r[0] * scale * 1.05,
          y: cy + r[1] * scale * 1.05,
          z: r[2],
        }
      })
      projectedRef.current = projected

      // Edges from each peer to seed (depth-faded)
      const seed = projected.find((p) => p.peer.isSeed)
      if (seed) {
        projected.forEach((p) => {
          if (p.peer.isSeed || !p.peer.online) return
          const avgZ = (seed.z + p.z) * 0.5
          const opacity = Math.max(0.1, 0.45 + avgZ * 0.25)
          ctx.strokeStyle = `rgba(34, 211, 238, ${opacity})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(seed.x, seed.y)
          ctx.lineTo(p.x, p.y)
          ctx.stroke()
        })
      }

      // Peer nodes — pulsing glow + solid core, depth-sorted
      projected
        .slice()
        .sort((a, b) => a.z - b.z)
        .forEach((p) => {
          const pulse = 0.6 + 0.4 * Math.sin(now / 600 + p.peer.pulsePhase)
          const depthScale = 0.7 + (p.z + 1) * 0.4
          const r = p.peer.radius * depthScale

          // Outer glow halo
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4)
          grad.addColorStop(0, p.peer.color)
          grad.addColorStop(0.4, p.peer.color + '88')
          grad.addColorStop(1, p.peer.color + '00')
          ctx.fillStyle = grad
          ctx.globalAlpha = pulse * 0.6
          ctx.beginPath()
          ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2)
          ctx.fill()

          // Solid core
          ctx.globalAlpha = 1
          ctx.fillStyle = p.peer.color
          ctx.beginPath()
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
          ctx.fill()

          // White rim for pop
          ctx.strokeStyle = p.peer.isSelf ? '#ffffff' : 'rgba(255,255,255,0.6)'
          ctx.lineWidth = p.peer.isSelf ? 1.5 : 0.8
          ctx.stroke()
        })

      ctx.globalAlpha = 1
      animationRef.current = requestAnimationFrame(animate)
    }

    animate()
    return () => {
      cancelAnimationFrame(animationRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [isDark])

  // Mouse handlers — drag to rotate, hover for tooltip
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onMouseDown = (e: MouseEvent) => {
      dragRef.current.active = true
      dragRef.current.lastX = e.clientX
      dragRef.current.lastY = e.clientY
      dragRef.current.lastInteract = performance.now()
    }
    const onMouseUp = () => {
      dragRef.current.active = false
      dragRef.current.lastInteract = performance.now()
    }
    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      if (dragRef.current.active) {
        const dx = e.clientX - dragRef.current.lastX
        const dy = e.clientY - dragRef.current.lastY
        rotationRef.current.y += dx * 0.005
        rotationRef.current.x += dy * 0.005
        rotationRef.current.x = Math.max(-1.2, Math.min(1.2, rotationRef.current.x))
        dragRef.current.lastX = e.clientX
        dragRef.current.lastY = e.clientY
        dragRef.current.lastInteract = performance.now()
        setHover(null)
        return
      }

      // Hover detection — find closest projected peer within ~14px
      let closest: ProjectedPeer | null = null
      let bestDist = 14
      for (const p of projectedRef.current) {
        const dx = p.x - mx
        const dy = p.y - my
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < bestDist) {
          bestDist = d
          closest = p
        }
      }
      if (closest) {
        setHover({ peer: closest.peer, x: mx, y: my })
      } else if (hover) {
        setHover(null)
      }
    }
    const onMouseLeave = () => {
      dragRef.current.active = false
      setHover(null)
    }

    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseleave', onMouseLeave)
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [hover])

  return (
    <DashboardLayout>
      <div className={`h-full flex flex-col ${isDark ? 'bg-gray-950 text-white' : 'bg-gray-50 text-gray-900'}`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-gray-800' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <BrainIcon className="w-5 h-5 text-purple-400" />
            <h1 className="font-semibold text-lg">Network Brain</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-200 text-gray-600'}`}>
              SN442 peer topology — drag to rotate
            </span>
          </div>
        </div>

        {/* Stats bar */}
        <div className={`flex gap-8 px-6 py-3 border-b ${isDark ? 'border-gray-800 bg-gray-900/50' : 'border-gray-200 bg-white/50'}`}>
          {[
            { icon: Wifi, label: 'Nodes active', value: stats.nodes, color: 'text-cyan-400' },
            { icon: Activity, label: 'Knowledge chunks', value: stats.chunks, color: 'text-emerald-400' },
            { icon: Shield, label: 'Connections', value: stats.connections, color: 'text-blue-400' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="flex items-center gap-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{label}:</span>
              <span className="text-sm font-mono font-bold">{value}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-5 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Seed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> You
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" /> Peer
            </span>
          </div>
        </div>

        {/* 3D canvas */}
        <div ref={containerRef} className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

          {/* Hover tooltip (DOM, not canvas) */}
          {hover && (
            <div
              className="absolute pointer-events-none z-10 px-3 py-2 rounded-lg shadow-xl border text-xs font-mono"
              style={{
                left: hover.x + 14,
                top: hover.y + 14,
                background: isDark ? 'rgba(15, 15, 30, 0.95)' : 'rgba(255, 255, 255, 0.97)',
                borderColor: hover.peer.color,
                color: isDark ? '#e2e8f0' : '#1e293b',
                minWidth: '180px',
              }}
            >
              <div style={{ color: hover.peer.color, fontWeight: 'bold', marginBottom: 4 }}>
                {hover.peer.isSeed ? 'Seed / Validator' : hover.peer.isSelf ? 'Your Node' : 'Peer Node'}
              </div>
              <div>id: <span className="opacity-70">{hover.peer.id.substring(0, 24)}{hover.peer.id.length > 24 ? '…' : ''}</span></div>
              <div>city: {hover.peer.city}</div>
              <div>chunks: {hover.peer.chunks}</div>
              <div>status: {hover.peer.online ? '🟢 online' : '⚪ offline'}</div>
            </div>
          )}

          {/* Footer hint */}
          <div className={`absolute bottom-3 left-4 text-xs font-mono ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
            Click + drag to rotate · auto-rotates after 2s idle · hover a node for details
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
