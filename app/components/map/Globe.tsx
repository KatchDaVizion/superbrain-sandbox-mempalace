import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { OrbitControls } from "three-stdlib"

// Node model mirrors NodeMap.tsx. Kept minimal on purpose — Globe only needs
// geo + identity + role to paint a marker and draw arcs.
export type GlobeNodeRole = "seed" | "validator" | "miner" | "peer" | "local"

export interface GlobeNode {
  id: string
  label: string
  lat: number
  lng: number
  role: GlobeNodeRole
  chunkCount: number
  isCurrentNode: boolean
  hotkey?: string
  city?: string
}

export interface GlobeConnection {
  fromKey: string
  toKey: string
  active: boolean
}

const ROLE_COLORS: Record<GlobeNodeRole, number> = {
  seed: 0x3b82f6,
  validator: 0xa855f7,
  miner: 0x10b981,
  peer: 0x10b981,
  local: 0xffffff,
}

// Local, bundled texture. Vite serves files under app/public/ at the web root.
// If the file is absent or fails to load, the globe falls back to a procedural
// dark-sphere + graticule look — never reaches to a CDN.
const EARTH_TEXTURE_PATH = "/textures/earth-blue-marble.jpg"

function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  const x = -radius * Math.sin(phi) * Math.cos(theta)
  const z = radius * Math.sin(phi) * Math.sin(theta)
  const y = radius * Math.cos(phi)
  return new THREE.Vector3(x, y, z)
}

// Build a great-circle arc between two surface points that lifts above the sphere
function buildArcGeometry(
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  segments = 48,
): THREE.BufferGeometry {
  const angle = from.angleTo(to)
  const points: THREE.Vector3[] = []
  // Arc max lift proportional to distance so short hops stay flatter
  const lift = radius * 0.18 * Math.min(1, angle / Math.PI)
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    // Spherical interpolation
    const sinA = Math.sin(angle)
    const a = Math.sin((1 - t) * angle) / (sinA || 1e-6)
    const b = Math.sin(t * angle) / (sinA || 1e-6)
    const interp = new THREE.Vector3(
      from.x * a + to.x * b,
      from.y * a + to.y * b,
      from.z * a + to.z * b,
    )
    // Push outward so the arc rises over the surface
    const bow = Math.sin(t * Math.PI) * lift
    interp.setLength(radius + bow)
    points.push(interp)
  }
  return new THREE.BufferGeometry().setFromPoints(points)
}

interface Props {
  nodes: GlobeNode[]
  connections: GlobeConnection[]
  isDark: boolean
  privacyMode: boolean
}

export default function Globe({ nodes, connections, isDark, privacyMode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<GlobeNode | null>(null)
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    if (typeof window === "undefined" || typeof WebGLRenderingContext === "undefined") {
      setError("WebGL not available")
      return
    }
    // Probe WebGL before spending effort on scene graph
    const probe = document.createElement("canvas")
    const gl = probe.getContext("webgl2") || probe.getContext("webgl")
    if (!gl) {
      setError("WebGL context creation failed")
      return
    }

    const w = Math.max(1, container.clientWidth)
    const h = Math.max(1, container.clientHeight)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 1000)
    camera.position.set(0, 0, 3.2)

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(w, h, false)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    const ambient = new THREE.AmbientLight(0xffffff, isDark ? 0.55 : 0.75)
    const sun = new THREE.DirectionalLight(0xffffff, 1.1)
    sun.position.set(5, 3, 5)
    scene.add(ambient, sun)

    // Base sphere — will be swapped to textured material when the local texture loads.
    const radius = 1
    const sphereGeo = new THREE.SphereGeometry(radius, 64, 64)
    const baseColor = isDark ? 0x0a192f : 0xeaf2ff
    const baseMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      roughness: 0.95,
      metalness: 0,
    })
    const globeMesh = new THREE.Mesh(sphereGeo, baseMat)
    scene.add(globeMesh)

    // Graticule (lat/lng grid) — visible in both fallback and textured mode at low opacity
    const graticule = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.SphereGeometry(radius * 1.0015, 18, 12)),
      new THREE.LineBasicMaterial({
        color: isDark ? 0x3b82f6 : 0x6366f1,
        transparent: true,
        opacity: isDark ? 0.18 : 0.12,
      }),
    )
    scene.add(graticule)

    // Soft atmospheric halo
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.04, 64, 64),
      new THREE.MeshBasicMaterial({
        color: 0x4a9eff,
        transparent: true,
        opacity: isDark ? 0.09 : 0.05,
        side: THREE.BackSide,
      }),
    )
    scene.add(atmosphere)

    // Attempt to load local texture. If missing, procedural look stays.
    const loader = new THREE.TextureLoader()
    let loadedTexture: THREE.Texture | null = null
    loader.load(
      EARTH_TEXTURE_PATH,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
        loadedTexture = tex
        const textured = new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 1,
          metalness: 0,
        })
        globeMesh.material = textured
        baseMat.dispose()
      },
      undefined,
      () => {
        // Absence is fine — procedural look is the intended fallback.
      },
    )

    // Node markers + connection arcs
    const markersGroup = new THREE.Group()
    scene.add(markersGroup)
    const arcsGroup = new THREE.Group()
    scene.add(arcsGroup)

    const nodePositions = new Map<string, THREE.Vector3>()
    const markerHitboxes: Array<{ mesh: THREE.Mesh; node: GlobeNode }> = []

    for (const n of nodes) {
      const pos = latLngToVector3(n.lat, n.lng, radius * 1.012)
      nodePositions.set(n.id, pos)
      const color = ROLE_COLORS[n.role]
      const markerSize = n.isCurrentNode ? 0.028 : 0.016 + Math.min(n.chunkCount / 1000, 0.02)

      const dotGeo = new THREE.SphereGeometry(markerSize, 16, 16)
      const dotMat = new THREE.MeshBasicMaterial({ color })
      const dot = new THREE.Mesh(dotGeo, dotMat)
      dot.position.copy(pos)
      markersGroup.add(dot)
      markerHitboxes.push({ mesh: dot, node: n })

      // Glow ring
      const ring = new THREE.Mesh(
        new THREE.SphereGeometry(markerSize * 2.4, 16, 16),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        }),
      )
      ring.position.copy(pos)
      markersGroup.add(ring)
    }

    for (const c of connections) {
      const from = nodePositions.get(c.fromKey)
      const to = nodePositions.get(c.toKey)
      if (!from || !to) continue
      const arcGeo = buildArcGeometry(from, to, radius)
      const arcMat = new THREE.LineBasicMaterial({
        color: 0x6366f1,
        transparent: true,
        opacity: c.active ? 0.55 : 0.2,
      })
      arcsGroup.add(new THREE.Line(arcGeo, arcMat))
    }

    // Raycaster for hover tooltip
    const raycaster = new THREE.Raycaster()
    raycaster.params.Mesh = { threshold: 0.02 } as unknown as typeof raycaster.params.Mesh
    const ndc = new THREE.Vector2()

    const onPointerMove = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
      setMouse({ x: ev.clientX - rect.left, y: ev.clientY - rect.top })
      raycaster.setFromCamera(ndc, camera)
      const meshes = markerHitboxes.map((h) => h.mesh)
      const hits = raycaster.intersectObjects(meshes, false)
      if (hits.length > 0) {
        const hit = markerHitboxes.find((h) => h.mesh === hits[0].object)
        setHovered(hit?.node ?? null)
      } else {
        setHovered(null)
      }
    }
    const onPointerLeave = () => {
      setHovered(null)
      setMouse(null)
    }
    renderer.domElement.addEventListener("pointermove", onPointerMove)
    renderer.domElement.addEventListener("pointerleave", onPointerLeave)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.enablePan = false
    controls.minDistance = 1.6
    controls.maxDistance = 6
    controls.rotateSpeed = 0.6

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect
        if (width <= 0 || height <= 0) return
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
      }
    })
    ro.observe(container)

    let rafId: number | null = null
    let disposed = false
    const canvas = renderer.domElement

    const onLost = (e: Event) => {
      e.preventDefault()
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = null
    }
    const onRestored = () => animate()
    canvas.addEventListener("webglcontextlost", onLost, false)
    canvas.addEventListener("webglcontextrestored", onRestored, false)

    // Pause animation when tab/window is hidden — saves battery + GPU
    const onVisibility = () => {
      if (document.hidden) {
        if (rafId !== null) cancelAnimationFrame(rafId)
        rafId = null
      } else if (!disposed && rafId === null) {
        animate()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)

    const animate = () => {
      if (disposed) return
      rafId = requestAnimationFrame(animate)
      globeMesh.rotation.y += 0.0012
      graticule.rotation.y += 0.0012
      markersGroup.rotation.y += 0.0012
      arcsGroup.rotation.y += 0.0012
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      disposed = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      ro.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
      canvas.removeEventListener("webglcontextlost", onLost)
      canvas.removeEventListener("webglcontextrestored", onRestored)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerleave", onPointerLeave)
      controls.dispose()
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments || obj instanceof THREE.Line) {
          obj.geometry?.dispose()
          const m = (obj as THREE.Mesh).material
          if (Array.isArray(m)) m.forEach((x) => x.dispose())
          else (m as THREE.Material | undefined)?.dispose()
        }
      })
      loadedTexture?.dispose()
      renderer.dispose()
      try { renderer.forceContextLoss() } catch { /* ignore */ }
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    }
    // isDark affects lighting + grid color; rebuild scene when it flips.
    // nodes/connections also cause rebuild — acceptable, Globe is a view, not a hot loop.
  }, [nodes, connections, isDark])

  return (
    <div className="relative w-full h-full">
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-rose-400">
          Globe unavailable: {error}
        </div>
      ) : (
        <div ref={containerRef} className="absolute inset-0" />
      )}

      {hovered && mouse && (
        <div
          className="pointer-events-none absolute z-10 px-3 py-2 rounded-lg border text-xs font-mono"
          style={{
            left: Math.min(mouse.x + 12, 9999),
            top: Math.min(mouse.y + 12, 9999),
            background: isDark ? "#1a1a2e" : "#ffffff",
            color: isDark ? "#e2e8f0" : "#0a0a1a",
            borderColor: isDark ? "#2d3748" : "#e5e7eb",
            maxWidth: 260,
          }}
        >
          <div
            style={{
              color: "#" + ROLE_COLORS[hovered.role].toString(16).padStart(6, "0"),
              fontWeight: 700,
              marginBottom: 2,
            }}
          >
            {hovered.label}
          </div>
          <div style={{ opacity: 0.7 }}>{hovered.role}</div>
          {hovered.city && <div style={{ opacity: 0.7 }}>{hovered.city}</div>}
          {hovered.chunkCount > 0 && <div style={{ opacity: 0.7 }}>{hovered.chunkCount} chunks</div>}
          {!privacyMode && hovered.hotkey && (
            <div style={{ opacity: 0.55, marginTop: 2 }}>{hovered.hotkey.slice(0, 16)}…</div>
          )}
        </div>
      )}
    </div>
  )
}
