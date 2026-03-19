import { useEffect, useRef, useState } from "react"
import DashboardLayout from "../components/shared/DashboardLayout"
import { useTheme } from "next-themes"
import { Shield, Wifi, Activity, Globe, Eye, EyeOff } from "lucide-react"

interface NetworkNode {
  id: string
  lat: number
  lng: number
  chunkCount: number
  syncLayer: "lan" | "i2p" | "testnet"
  isCurrentNode: boolean
  region: string
}

interface Connection {
  from: string
  to: string
  active: boolean
  layer: "lan" | "i2p" | "testnet"
}

const LAYER_COLORS = {
  lan: "#6366f1",
  i2p: "#10b981",
  testnet: "#f59e0b"
}

const REGION_CENTERS: Record<string, [number, number]> = {
  "Canada": [56.1304, -106.3468],
  "USA": [37.0902, -95.7129],
  "Europe": [54.5260, 15.2551],
  "Asia": [34.0479, 100.6197],
  "Africa": [8.7832, 34.5085],
  "South America": [-8.7832, -55.4915],
  "Oceania": [-25.2744, 133.7751],
  "Unknown": [20.0, 0.0]
}

function randomOffset(range: number): number {
  return (Math.random() - 0.5) * range * 2
}

function getApproxPosition(region: string): [number, number] {
  const base = REGION_CENTERS[region] || REGION_CENTERS["Unknown"]
  return [base[0] + randomOffset(8), base[1] + randomOffset(12)]
}

function getMockNodes(): NetworkNode[] {
  return [
    { id: "1", lat: 0, lng: 0, chunkCount: 14, syncLayer: "lan", isCurrentNode: true, region: "Canada" },
    { id: "2", lat: 0, lng: 0, chunkCount: 23, syncLayer: "lan", isCurrentNode: false, region: "Canada" },
    { id: "3", lat: 0, lng: 0, chunkCount: 8, syncLayer: "i2p", isCurrentNode: false, region: "Europe" },
    { id: "4", lat: 0, lng: 0, chunkCount: 2, syncLayer: "i2p", isCurrentNode: false, region: "Asia" },
    { id: "5", lat: 0, lng: 0, chunkCount: 5, syncLayer: "testnet", isCurrentNode: false, region: "USA" },
  ].map(n => {
    const pos = getApproxPosition(n.region)
    return { ...n, lat: pos[0], lng: pos[1] }
  })
}

function getMockConnections(): Connection[] {
  return [
    { from: "1", to: "2", active: true, layer: "lan" },
    { from: "1", to: "3", active: true, layer: "i2p" },
    { from: "3", to: "4", active: true, layer: "i2p" },
    { from: "1", to: "5", active: false, layer: "testnet" },
  ]
}

export default function NodeMap() {
  const { theme, resolvedTheme } = useTheme()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const [nodes, setNodes] = useState<NetworkNode[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [filter, setFilter] = useState<"all" | "lan" | "i2p" | "testnet">("all")
  const [privacyMode, setPrivacyMode] = useState(true)
  const [stats, setStats] = useState({ nodes: 0, chunks: 0, connections: 0 })
  const isDark = resolvedTheme === "dark"

  useEffect(() => {
    const n = getMockNodes()
    const c = getMockConnections()
    setNodes(n)
    setConnections(c)
    setStats({
      nodes: n.length,
      chunks: n.reduce((a, b) => a + b.chunkCount, 0),
      connections: c.filter(x => x.active).length
    })
  }, [])

  useEffect(() => {
    if (!mapRef.current || nodes.length === 0) return

    const initMap = async () => {
      try {
        const L = await import("leaflet")
        delete (L.Icon.Default.prototype as any)._getIconUrl
        L.Icon.Default.mergeOptions({ iconRetinaUrl: "", iconUrl: "", shadowUrl: "" })

        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove()
          mapInstanceRef.current = null
        }

        const map = L.map(mapRef.current!, {
          center: [20, 0],
          zoom: 2,
          zoomControl: true,
          attributionControl: false,
          minZoom: 2,
          maxZoom: 8
        })
        mapInstanceRef.current = map

        const tileUrl = isDark
          ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        L.tileLayer(tileUrl, { subdomains: "abcd", maxZoom: 20 }).addTo(map)

        const filtered = nodes.filter(n => filter === "all" || n.syncLayer === filter)

        // Draw connections
        connections
          .filter(c => filter === "all" || c.layer === filter)
          .forEach(conn => {
            const from = filtered.find(n => n.id === conn.from)
            const to = filtered.find(n => n.id === conn.to)
            if (!from || !to) return
            const color = LAYER_COLORS[conn.layer]
            L.polyline(
              [[from.lat, from.lng], [to.lat, to.lng]],
              {
                color,
                weight: conn.active ? 2 : 1,
                opacity: conn.active ? 0.7 : 0.3,
                dashArray: conn.active ? undefined : "6 6"
              }
            ).addTo(map)
          })

        // Draw nodes
        filtered.forEach(node => {
          const color = node.isCurrentNode ? "#ffffff" : LAYER_COLORS[node.syncLayer]
          const size = node.isCurrentNode ? 16 : 10 + Math.min(node.chunkCount / 3, 8)

          const icon = L.divIcon({
            className: "",
            html: `<div style="position:relative;width:${size * 3}px;height:${size * 3}px;display:flex;align-items:center;justify-content:center;">
              <div style="position:absolute;width:${size * 2.5}px;height:${size * 2.5}px;border-radius:50%;background:radial-gradient(circle,${color}30 0%,transparent 70%);animation:pulse 2s infinite;"></div>
              <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${node.isCurrentNode ? "2px solid " + LAYER_COLORS[node.syncLayer] : "none"};box-shadow:0 0 ${size}px ${color}80;"></div>
            </div>`,
            iconSize: [size * 3, size * 3],
            iconAnchor: [size * 1.5, size * 1.5],
          })

          const marker = L.marker([node.lat, node.lng], { icon })
          marker.bindPopup(
            `<div style="background:#1a1a2e;color:#e2e8f0;padding:10px;border-radius:8px;font-family:monospace;min-width:160px;">
              <div style="color:${color};font-weight:bold;margin-bottom:6px;">${node.isCurrentNode ? "This Node" : "Anonymous Node"}</div>
              <div style="font-size:11px;color:#94a3b8;">Layer: ${node.syncLayer.toUpperCase()}</div>
              <div style="font-size:11px;color:#94a3b8;">Knowledge: ${node.chunkCount} chunks</div>
              <div style="font-size:11px;color:#64748b;margin-top:4px;">No identity. No IP. Private.</div>
            </div>`,
            { className: "superbrain-popup", closeButton: false }
          )
          marker.addTo(map)
        })
      } catch (err) {
        console.error("Map init error:", err)
      }
    }

    initMap()

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [nodes, connections, filter, isDark])

  return (
    <DashboardLayout>
      <div className={`h-full flex flex-col ${isDark ? "bg-gray-950 text-white" : "bg-gray-50 text-gray-900"}`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? "border-gray-800" : "border-gray-200"}`}>
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-indigo-400" />
            <h1 className="font-semibold text-lg">Network Map</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? "bg-gray-800 text-gray-400" : "bg-gray-200 text-gray-600"}`}>
              Zero identity — cryptographic only
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPrivacyMode(!privacyMode)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-all ${
                privacyMode
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                  : "border-gray-600 text-gray-400"
              }`}
            >
              {privacyMode ? <Shield className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {privacyMode ? "Private" : "Visible"}
            </button>
            {(["all", "lan", "i2p", "testnet"] as const).map(layer => (
              <button
                key={layer}
                onClick={() => setFilter(layer)}
                className={`text-xs px-3 py-1 rounded-full border transition-all ${
                  filter === layer
                    ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
                    : isDark
                      ? "border-gray-700 text-gray-500"
                      : "border-gray-300 text-gray-500"
                }`}
              >
                {layer === "all" ? "All Layers" : layer.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className={`flex gap-8 px-6 py-3 border-b ${isDark ? "border-gray-800 bg-gray-900/50" : "border-gray-200 bg-white/50"}`}>
          {[
            { icon: Wifi, label: "Nodes", value: stats.nodes, color: "text-indigo-400" },
            { icon: Activity, label: "Knowledge Chunks", value: stats.chunks, color: "text-emerald-400" },
            { icon: Shield, label: "Active Connections", value: stats.connections, color: "text-amber-400" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="flex items-center gap-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>{label}:</span>
              <span className="text-sm font-mono font-bold">{value}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-5 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-indigo-400 inline-block rounded" />LAN
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-emerald-400 inline-block rounded" />I2P
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-amber-400 inline-block rounded" />Testnet
            </span>
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <style>{`
            .leaflet-container { background: ${isDark ? "#0a0a1a" : "#e8f4f8"} !important; }
            .leaflet-popup-content-wrapper { background: transparent !important; border: none !important; box-shadow: none !important; padding: 0 !important; }
            .leaflet-popup-tip { display: none !important; }
            @keyframes pulse {
              0% { transform: scale(0.8); opacity: 0.8; }
              50% { transform: scale(1.2); opacity: 0.4; }
              100% { transform: scale(0.8); opacity: 0.8; }
            }
          `}</style>
          <div ref={mapRef} className="w-full h-full" style={{ zIndex: 1 }} />

          {/* Bottom-left info */}
          <div className={`absolute bottom-4 left-4 text-xs font-mono ${isDark ? "text-gray-600" : "text-gray-400"} space-y-1`}>
            <div className="flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-emerald-500" />
              <span>Positions are approximate regions only</span>
            </div>
            <div className="flex items-center gap-1.5">
              <EyeOff className="w-3 h-3 text-indigo-400" />
              <span>No IPs, no identities, no tracking</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Wifi className="w-3 h-3 text-amber-400" />
              <span>Phase 2: SN65 transport routing</span>
            </div>
          </div>

          {/* Top-right live indicator */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>Live Network</span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
