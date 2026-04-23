import { useEffect, useRef, useState } from "react"
import DashboardLayout from "../components/shared/DashboardLayout"
import { useTheme } from "next-themes"
import { Shield, Wifi, Activity, Globe, Eye, EyeOff, Map as MapIcon } from "lucide-react"
import GlobeView from "../components/map/Globe"

type NodeRole = "seed" | "validator" | "miner" | "peer" | "local"

interface NetworkNode {
  id: string
  uid?: number
  hotkey?: string
  label: string
  country?: string
  city: string
  lat: number
  lng: number
  chunkCount: number
  stake?: number
  role: NodeRole
  syncLayer: "lan" | "i2p" | "testnet"
  isCurrentNode: boolean
}

interface MapMarker {
  key: string
  lat: number
  lng: number
  nodes: NetworkNode[]
  dominantRole: NodeRole
  totalChunks: number
  totalStake: number
  label: string
}

interface Connection {
  fromKey: string
  toKey: string
  active: boolean
  layer: "lan" | "i2p" | "testnet"
}

const ROLE_COLORS: Record<NodeRole, string> = {
  seed: "#3b82f6",       // blue — Frankfurt bootstrap seed
  validator: "#a855f7",  // purple — SN442 validator
  miner: "#10b981",      // emerald — SN442 miner
  peer: "#10b981",       // emerald — local P2P mesh peer
  local: "#ffffff",      // white — this node
}

const LAYER_COLOR_MAP: Record<"lan" | "i2p" | "testnet", string> = {
  lan: "#6366f1",
  i2p: "#10b981",
  testnet: "#f59e0b",
}

const ROLE_PRIORITY: Record<NodeRole, number> = {
  seed: 5,
  validator: 4,
  miner: 3,
  peer: 2,
  local: 1,
}

const REGION_CENTERS: Record<string, [number, number]> = {
  Canada: [56.1304, -106.3468],
  USA: [37.0902, -95.7129],
  Europe: [54.526, 15.2551],
  Asia: [34.0479, 100.6197],
  Unknown: [20.0, 0.0],
}

// Canonical SN442 nodes — fallback when /metagraph is slow or unreachable.
// Matches the three serving neurons the user confirmed on-chain on 2026-04-18.
const CURATED_SERVING: Array<{
  uid: number
  label: string
  country: string
  city: string
  lat: number
  lng: number
  role: NodeRole
  hotkey?: string
}> = [
  { uid: 1, label: "Frankfurt", country: "DE", city: "Frankfurt", lat: 50.1109, lng: 8.6821, role: "validator" },
  { uid: 2, label: "Frankfurt", country: "DE", city: "Frankfurt", lat: 50.1109, lng: 8.6821, role: "miner" },
  { uid: 7, label: "Helsinki",  country: "FI", city: "Helsinki",  lat: 60.1699, lng: 24.9384, role: "miner",
    hotkey: "5EWVvNAA1UrPMKoYcKNDn6kGcboHLvy7cknx35KFBNjZexUA" },
]

interface MetagraphNeuron {
  uid: number
  hotkey?: string
  coldkey?: string
  is_serving?: boolean
  validator_permit?: boolean
  stake?: number
  trust?: number
  incentive?: number
  axon_ip?: string
  city?: string
  country?: string
}

interface MetagraphResponse {
  neurons?: MetagraphNeuron[]
  nodes?: MetagraphNeuron[]
  netuid?: number
}

interface PeerInfo {
  url: string
  city?: string
  lat?: number
  lon?: number
  chunks?: number
  node_id?: string
  hotkey?: string
  online?: boolean
  is_seed?: boolean
}

interface PeersResponse {
  peers?: PeerInfo[]
  total_chunks?: number
}

interface FeedStatsResponse {
  total_chunks?: number
  chunks_today?: number
}

const FRANKFURT_API = "http://46.225.114.202:8400"

async function fetchWithTimeout<T>(url: string, ms: number): Promise<T | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(ms) })
    if (!resp.ok) return null
    return (await resp.json()) as T
  } catch {
    return null
  }
}

function inferCityFromIp(ip?: string): { city: string; country: string; lat: number; lng: number } | null {
  if (!ip) return null
  if (ip.startsWith("46.225.114.")) return { city: "Frankfurt", country: "DE", lat: 50.1109, lng: 8.6821 }
  if (ip.startsWith("89.167.61."))  return { city: "Helsinki",  country: "FI", lat: 60.1699, lng: 24.9384 }
  return null
}

function parseCityFromPeer(peer: PeerInfo): { city: string; country: string } {
  const raw = (peer.city || "").trim()
  if (!raw || raw.toLowerCase() === "unknown") return { city: "Unknown", country: "" }
  // "Frankfurt, Germany" / "Helsinki, FI"
  const [cityPart, countryPart] = raw.split(",").map(s => s.trim())
  return { city: cityPart || "Unknown", country: (countryPart || "").slice(0, 2).toUpperCase() }
}

async function loadNetwork(): Promise<{ nodes: NetworkNode[]; connections: Connection[]; totalChunks: number | null }> {
  const [metagraph, peersResp, feedStats] = await Promise.all([
    fetchWithTimeout<MetagraphResponse>(`${FRANKFURT_API}/metagraph`, 20000),
    fetchWithTimeout<PeersResponse>(`${FRANKFURT_API}/peers`, 8000),
    fetchWithTimeout<FeedStatsResponse>(`${FRANKFURT_API}/feed/stats`, 6000),
  ])

  const peers = peersResp?.peers ?? []
  const peerByHotkey = new Map<string, PeerInfo>()
  for (const p of peers) {
    if (p.hotkey && p.hotkey.length > 8) peerByHotkey.set(p.hotkey, p)
  }

  const nodes: NetworkNode[] = []
  const seenKeys = new Set<string>()

  // --- Frankfurt bootstrap seed (always shown) ---
  const seedPeer = peers.find(p => p.is_seed) || peers.find(p => p.url?.includes("46.225.114.202"))
  const seedChunks = seedPeer?.chunks ?? peersResp?.total_chunks ?? 0
  nodes.push({
    id: "seed-frankfurt",
    label: "Frankfurt Seed",
    country: "DE",
    city: "Frankfurt",
    lat: seedPeer?.lat ?? 50.1109,
    lng: seedPeer?.lon ?? 8.6821,
    chunkCount: seedChunks,
    role: "seed",
    syncLayer: "testnet",
    isCurrentNode: false,
    hotkey: seedPeer?.hotkey,
  })
  seenKeys.add("seed-frankfurt")

  // --- SN442 metagraph — serving neurons ---
  const metaList = metagraph?.neurons ?? metagraph?.nodes ?? []
  const servingFromMeta = metaList.filter(n => n.is_serving === true)

  if (servingFromMeta.length > 0) {
    for (const n of servingFromMeta) {
      const peer = n.hotkey ? peerByHotkey.get(n.hotkey) : undefined
      const parsed = peer ? parseCityFromPeer(peer) : { city: "", country: "" }
      const geoFromIp = inferCityFromIp(n.axon_ip || peer?.url)
      const curated = CURATED_SERVING.find(c => c.uid === n.uid || (c.hotkey && c.hotkey === n.hotkey))

      const city = parsed.city || geoFromIp?.city || curated?.city || n.city || "Unknown"
      const country = parsed.country || geoFromIp?.country || curated?.country || n.country || ""
      const lat = peer?.lat ?? geoFromIp?.lat ?? curated?.lat ?? REGION_CENTERS.Unknown[0]
      const lng = peer?.lon ?? geoFromIp?.lng ?? curated?.lng ?? REGION_CENTERS.Unknown[1]

      const role: NodeRole =
        n.validator_permit === true ? "validator" :
        curated?.role === "validator" ? "validator" :
        "miner"

      const id = `sn442-uid-${n.uid}`
      if (seenKeys.has(id)) continue
      seenKeys.add(id)
      nodes.push({
        id,
        uid: n.uid,
        hotkey: n.hotkey,
        label: curated?.label || city,
        country,
        city,
        lat,
        lng,
        chunkCount: peer?.chunks ?? 0,
        stake: typeof n.stake === "number" ? n.stake : undefined,
        role,
        syncLayer: "testnet",
        isCurrentNode: false,
      })
    }
  } else {
    // Fallback: /metagraph unreachable or empty → use curated serving list.
    for (const c of CURATED_SERVING) {
      const peer = c.hotkey ? peerByHotkey.get(c.hotkey) : undefined
      const id = `sn442-uid-${c.uid}`
      if (seenKeys.has(id)) continue
      seenKeys.add(id)
      nodes.push({
        id,
        uid: c.uid,
        hotkey: c.hotkey,
        label: c.label,
        country: c.country,
        city: c.city,
        lat: c.lat,
        lng: c.lng,
        chunkCount: peer?.chunks ?? 0,
        role: c.role,
        syncLayer: "testnet",
        isCurrentNode: false,
      })
    }
  }

  // --- P2P mesh peers (not already represented by a metagraph entry) ---
  const metaHotkeys = new Set(nodes.filter(n => n.hotkey).map(n => n.hotkey!))
  peers.forEach((p, idx) => {
    if (!p.url) return
    if (p.is_seed) return                                // already added as seed
    if (p.hotkey && metaHotkeys.has(p.hotkey)) return    // already represented on-chain
    const parsed = parseCityFromPeer(p)
    const lat = typeof p.lat === "number" && p.lat !== 0 ? p.lat : REGION_CENTERS.Unknown[0]
    const lng = typeof p.lon === "number" && p.lon !== 0 ? p.lon : REGION_CENTERS.Unknown[1]
    const id = `peer-${idx}-${(p.node_id || p.url).slice(0, 10)}`
    if (seenKeys.has(id)) return
    seenKeys.add(id)
    nodes.push({
      id,
      label: parsed.city || "Peer",
      country: parsed.country,
      city: parsed.city,
      lat,
      lng,
      chunkCount: p.chunks ?? 0,
      role: "peer",
      syncLayer: "lan",
      isCurrentNode: false,
      hotkey: p.hotkey,
    })
  })

  // --- This node (Kali local) ---
  nodes.push({
    id: "kali-local",
    label: "You",
    city: "Local",
    country: "",
    lat: REGION_CENTERS.Canada[0],
    lng: REGION_CENTERS.Canada[1],
    chunkCount: 0,
    role: "local",
    syncLayer: "lan",
    isCurrentNode: true,
  })

  // --- Connections: everything on-chain/seed connects via testnet; local + mesh via lan ---
  const connections: Connection[] = []
  for (const n of nodes) {
    if (n.role === "seed") continue
    connections.push({
      fromKey: n.id,
      toKey: "seed-frankfurt",
      active: n.isCurrentNode ? true : n.role !== "peer" || true,
      layer: n.role === "peer" || n.role === "local" ? "lan" : "testnet",
    })
  }

  const totalChunks = typeof feedStats?.total_chunks === "number" ? feedStats.total_chunks : null
  return { nodes, connections, totalChunks }
}

function groupNodes(nodes: NetworkNode[]): MapMarker[] {
  const buckets = new Map<string, NetworkNode[]>()
  for (const n of nodes) {
    // Local node stays ungrouped so it reads as "You"
    const key = n.isCurrentNode
      ? `local:${n.id}`
      : `${n.role === "seed" ? "seed:" : "geo:"}${n.city}|${Math.round(n.lat * 10)}|${Math.round(n.lng * 10)}`
    const list = buckets.get(key) || []
    list.push(n)
    buckets.set(key, list)
  }

  const markers: MapMarker[] = []
  for (const [key, group] of buckets) {
    const sorted = [...group].sort((a, b) => ROLE_PRIORITY[b.role] - ROLE_PRIORITY[a.role])
    const dominant = sorted[0]
    const totalChunks = group.reduce((s, n) => s + (n.chunkCount || 0), 0)
    const totalStake = group.reduce((s, n) => s + (n.stake || 0), 0)
    const label = dominant.isCurrentNode ? "You" : dominant.label || dominant.city
    markers.push({
      key,
      lat: dominant.lat,
      lng: dominant.lng,
      nodes: sorted,
      dominantRole: dominant.role,
      totalChunks,
      totalStake,
      label,
    })
  }
  return markers
}

function renderTooltip(m: MapMarker, privacy: boolean, publicUrl: string | null): string {
  const color = ROLE_COLORS[m.dominantRole]
  const count = m.nodes.length
  const header = count > 1
    ? `${m.label} — ${count} nodes connected`
    : `${m.label}`

  const roleLabel: Record<NodeRole, string> = {
    seed: "Bootstrap Seed",
    validator: "SN442 Validator",
    miner: "SN442 Miner",
    peer: "Peer Node",
    local: "Your Node (Local)",
  }

  const rows = m.nodes.slice(0, 6).map(n => {
    const idDisplay = privacy
      ? (n.uid !== undefined ? `UID ${n.uid}` : n.id.substring(0, 10) + "…")
      : (n.uid !== undefined ? `UID ${n.uid} · ${n.hotkey ? n.hotkey.slice(0, 8) + "…" : n.id}` : n.id)
    const stakeLine = typeof n.stake === "number" && n.stake > 0
      ? ` · τ${n.stake.toFixed(2)}`
      : ""
    const chunkLine = n.chunkCount > 0 ? ` · ${n.chunkCount} chunks` : ""
    return `<div style="font-size:11px;color:#94a3b8;">${roleLabel[n.role]} · ${idDisplay}${chunkLine}${stakeLine}</div>`
  }).join("")

  const extraLine = m.nodes.length > 6
    ? `<div style="font-size:11px;color:#64748b;">+${m.nodes.length - 6} more…</div>`
    : ""

  const totals = count > 1
    ? `<div style="font-size:11px;color:#94a3b8;margin-top:4px;border-top:1px solid #2d3748;padding-top:4px;">
         Total: ${m.totalChunks} chunks${m.totalStake > 0 ? ` · τ${m.totalStake.toFixed(2)}` : ""}
       </div>`
    : ""

  const tunnelLine = m.nodes.some(n => n.isCurrentNode) && publicUrl
    ? `<div style="font-size:11px;color:#6366f1;margin-top:4px;">Public: ${publicUrl}</div>`
    : ""

  return `<div style="background:#1a1a2e;color:#e2e8f0;padding:10px;border-radius:8px;font-family:monospace;min-width:220px;border:1px solid #2d3748;">
    <div style="color:${color};font-weight:bold;margin-bottom:6px;">${header}</div>
    ${m.nodes[0].country ? `<div style="font-size:11px;color:#94a3b8;">Location: ${m.nodes[0].city}${m.nodes[0].country ? `, ${m.nodes[0].country}` : ""}</div>` : ""}
    ${rows}
    ${extraLine}
    ${totals}
    ${tunnelLine}
  </div>`
}

export default function NodeMap() {
  const { resolvedTheme } = useTheme()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const [nodes, setNodes] = useState<NetworkNode[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [filter, setFilter] = useState<"all" | "lan" | "i2p" | "testnet">("all")
  const [privacyMode, setPrivacyMode] = useState(true)
  const [stats, setStats] = useState({ nodes: 0, chunks: 0, connections: 0 })
  const [publicUrl, setPublicUrl] = useState<string | null>(null)
  const [view, setView] = useState<"map" | "globe">("map")
  const [i2p, setI2p] = useState<{
    routing_ok: boolean
    sam_handshake_ok: boolean
    netdb_routers: number
    reachable: boolean
    dest_b32: string | null
    inbound_reachable: boolean
  } | null>(null)
  const isDark = resolvedTheme === "dark"

  useEffect(() => {
    let cancelled = false
    const load = () => {
      loadNetwork().then(({ nodes: n, connections: c, totalChunks }) => {
        if (cancelled) return
        setNodes(n)
        setConnections(c)
        // Prefer the authoritative /feed/stats total; fall back to sum of per-peer chunkCount
        // only if feed/stats is unreachable (peer counters are stale, so this is a degraded mode).
        const sumFromPeers = n.reduce((a, b) => a + b.chunkCount, 0)
        setStats({
          nodes: n.length,
          chunks: totalChunks ?? sumFromPeers,
          connections: c.filter(x => x.active).length,
        })
      }).catch(() => {})
    }
    load()
    // Poll every 30s so the chunk counter tracks the live feed as agents ship new content.
    // Pauses when the tab is backgrounded to avoid burning quota on an idle window.
    const iv = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return
      load()
    }, 30_000)
    ;(window as any).electron?.invoke?.("p2p:public-url")
      .then((url: string | null) => setPublicUrl(url))
      .catch(() => {})
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  // Real I2P status — polled every 30 s. Green dot requires SAM handshake + >=50 netDb routers.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const s = await (window as any).NetworkRAGApi?.i2pStatus?.()
        if (cancelled || !s) return
        setI2p({
          routing_ok: !!s.routing_ok,
          sam_handshake_ok: !!s.sam_handshake_ok,
          netdb_routers: typeof s.netdb_routers === "number" ? s.netdb_routers : 0,
          reachable: !!s.reachable,
          dest_b32: typeof s.dest_b32 === "string" ? s.dest_b32 : null,
          inbound_reachable: !!s.inbound_reachable,
        })
      } catch {
        if (!cancelled) setI2p({ routing_ok: false, sam_handshake_ok: false, netdb_routers: 0, reachable: false, dest_b32: null, inbound_reachable: false })
      }
    }
    load()
    const iv = setInterval(load, 30000)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  useEffect(() => {
    if (view !== "map") {
      // When toggling away from the Leaflet view, tear down the map so the Globe
      // canvas has a clean container and no orphan listeners linger.
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
      return
    }
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
          center: [30, 10],
          zoom: 2,
          zoomControl: true,
          attributionControl: false,
          minZoom: 2,
          maxZoom: 8,
        })
        mapInstanceRef.current = map

        const tileUrl = isDark
          ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        L.tileLayer(tileUrl, { subdomains: "abcd", maxZoom: 20 }).addTo(map)

        const filteredNodes = nodes.filter(n => filter === "all" || n.syncLayer === filter)
        const markers = groupNodes(filteredNodes)
        const markerByNodeId = new Map<string, MapMarker>()
        for (const m of markers) for (const n of m.nodes) markerByNodeId.set(n.id, m)

        // Connections between group centres
        const drawnPairs = new Set<string>()
        connections
          .filter(c => filter === "all" || c.layer === filter)
          .forEach(conn => {
            const from = markerByNodeId.get(conn.fromKey)
            const to = markerByNodeId.get(conn.toKey)
            if (!from || !to || from.key === to.key) return
            const pair = [from.key, to.key].sort().join("↔")
            if (drawnPairs.has(pair)) return
            drawnPairs.add(pair)
            L.polyline(
              [[from.lat, from.lng], [to.lat, to.lng]],
              {
                color: LAYER_COLOR_MAP[conn.layer],
                weight: conn.active ? 2 : 1,
                opacity: conn.active ? 0.6 : 0.25,
                dashArray: conn.active ? undefined : "6 6",
              },
            ).addTo(map)
          })

        // Markers with count badge when grouped
        markers.forEach(m => {
          const color = ROLE_COLORS[m.dominantRole]
          const count = m.nodes.length
          const isLocal = m.nodes.some(n => n.isCurrentNode)
          const size = isLocal ? 16 : 10 + Math.min(m.totalChunks / 4, 10) + (count > 1 ? 3 : 0)

          const badge = count > 1
            ? `<div style="position:absolute;top:-4px;right:-4px;background:${color};color:#0a0a1a;font-size:10px;font-weight:700;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid #0a0a1a;">${count}</div>`
            : ""

          const icon = L.divIcon({
            className: "",
            html: `<div style="position:relative;width:${size * 3}px;height:${size * 3}px;display:flex;align-items:center;justify-content:center;">
              <div style="position:absolute;width:${size * 2.5}px;height:${size * 2.5}px;border-radius:50%;background:radial-gradient(circle,${color}30 0%,transparent 70%);animation:pulse 2s infinite;"></div>
              <div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:${color};border:${isLocal ? "2px solid " + LAYER_COLOR_MAP.lan : "none"};box-shadow:0 0 ${size}px ${color}80;">
                ${badge}
              </div>
            </div>`,
            iconSize: [size * 3, size * 3],
            iconAnchor: [size * 1.5, size * 1.5],
          })

          const marker = L.marker([m.lat, m.lng], { icon })
          marker.bindTooltip(renderTooltip(m, privacyMode, publicUrl), {
            className: "superbrain-popup",
            permanent: false,
            direction: "top",
            offset: [0, -size],
          })
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
  }, [nodes, connections, filter, isDark, publicUrl, privacyMode, view])

  return (
    <DashboardLayout>
      <div className={`h-full flex flex-col ${isDark ? "bg-gray-950 text-white" : "bg-gray-50 text-gray-900"}`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? "border-gray-800" : "border-gray-200"}`}>
          <div className="flex items-center gap-3">
            <Globe className="w-5 h-5 text-indigo-400" />
            <h1 className="font-semibold text-lg">Network Map</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? "bg-gray-800 text-gray-400" : "bg-gray-200 text-gray-600"}`}>
              SN442 live · cryptographic identity only
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* View toggle — Map (Leaflet, real geo tiles) or Globe (3D sphere, offline-safe) */}
            <div className={`flex items-center rounded-full border overflow-hidden ${isDark ? "border-gray-700" : "border-gray-300"}`}>
              <button
                onClick={() => setView("map")}
                className={`flex items-center gap-1.5 text-xs px-3 py-1 transition-all ${
                  view === "map"
                    ? "bg-indigo-500/20 text-indigo-300"
                    : isDark ? "text-gray-500 hover:text-gray-300" : "text-gray-500 hover:text-gray-700"
                }`}
                title="2D map with real geography"
              >
                <MapIcon className="w-3 h-3" />
                Map
              </button>
              <button
                onClick={() => setView("globe")}
                className={`flex items-center gap-1.5 text-xs px-3 py-1 transition-all ${
                  view === "globe"
                    ? "bg-indigo-500/20 text-indigo-300"
                    : isDark ? "text-gray-500 hover:text-gray-300" : "text-gray-500 hover:text-gray-700"
                }`}
                title="3D rotating globe"
              >
                <Globe className="w-3 h-3" />
                Globe
              </button>
            </div>
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
              <span className="text-sm font-mono font-bold">{typeof value === "number" ? value.toLocaleString() : value}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-5 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: ROLE_COLORS.seed }} />Seed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: ROLE_COLORS.validator }} />Validator
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: ROLE_COLORS.miner }} />Miner
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full inline-block border border-gray-400" style={{ background: ROLE_COLORS.local }} />You
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
          {view === "map" ? (
            <div ref={mapRef} className="w-full h-full" style={{ zIndex: 1 }} />
          ) : (
            <div className="w-full h-full" style={{ zIndex: 1 }}>
              <GlobeView
                nodes={nodes
                  .filter((n) => filter === "all" || n.syncLayer === filter)
                  .map((n) => ({
                    id: n.id,
                    label: n.label,
                    lat: n.lat,
                    lng: n.lng,
                    role: n.role,
                    chunkCount: n.chunkCount,
                    isCurrentNode: n.isCurrentNode,
                    hotkey: n.hotkey,
                    city: n.city,
                  }))}
                connections={connections
                  .filter((c) => filter === "all" || c.layer === filter)
                  .map((c) => ({ fromKey: c.fromKey, toKey: c.toKey, active: c.active }))}
                isDark={isDark}
                privacyMode={privacyMode}
              />
            </div>
          )}

          {/* Bottom-left info */}
          <div className={`absolute bottom-4 left-4 text-xs font-mono ${isDark ? "text-gray-600" : "text-gray-400"} space-y-1`}>
            <div className="flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-emerald-500" />
              <span>Serving nodes read live from SN442 metagraph</span>
            </div>
            <div className="flex items-center gap-1.5">
              <EyeOff className="w-3 h-3 text-indigo-400" />
              <span>No IPs, no identities, no tracking</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Wifi className="w-3 h-3 text-amber-400" />
              <span>Mesh peers grouped by geography</span>
            </div>
          </div>

          {/* Top-right live indicator — real I2P status */}
          <div
            className={`absolute top-4 right-4 flex items-center gap-2 px-2.5 py-1 rounded-full backdrop-blur-sm ${
              isDark ? "bg-gray-900/60 border border-gray-800" : "bg-white/80 border border-gray-200"
            }`}
            title={
              !i2p
                ? "Checking I2P status…"
                : !i2p.reachable
                  ? "Seed unreachable — cannot read I2P status"
                  : i2p.routing_ok && i2p.dest_b32
                    ? `I2P bidirectional · ${i2p.netdb_routers} routers · ${i2p.dest_b32.slice(0, 16)}…`
                    : i2p.routing_ok
                      ? `I2P outbound only — no inbound address (netDb ${i2p.netdb_routers})`
                      : !i2p.sam_handshake_ok
                        ? "SAM bridge not responding on seed"
                        : `SAM up but netDb only has ${i2p.netdb_routers} routers (need 50+)`
            }
          >
            <span
              className={`w-2 h-2 rounded-full ${
                !i2p
                  ? "bg-gray-400"
                  : !i2p.reachable
                    ? "bg-rose-500"
                    : i2p.routing_ok && i2p.dest_b32
                      ? "bg-emerald-400 animate-pulse"
                      : "bg-amber-400 animate-pulse"
              }`}
            />
            <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              I2P {!i2p ? "…" : !i2p.reachable ? "offline" : i2p.routing_ok && i2p.dest_b32 ? "bidirectional" : i2p.routing_ok ? "outbound" : "degraded"}
            </span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
