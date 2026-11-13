import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Mesh, MeshBasicMaterial, Vector3 } from 'three'

// A ribbon that follows a point (the flying player): the last N positions form a
// camera-facing-ish strip (width across world X/Y), tinted along its length by
// the equipped trail's colours, fading toward the tail. Additive so it glows.
const N = 48

export function createTrail(scene) {
  const pos = new Float32Array(N * 2 * 3)
  const col = new Float32Array(N * 2 * 4)
  const idx = []
  for (let i = 0; i < N - 1; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  geo.setAttribute('color', new BufferAttribute(col, 4))
  geo.setIndex(idx)
  const mat = new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })
  const mesh = new Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.visible = false
  scene.add(mesh)

  const pts = []
  for (let i = 0; i < N; i++) pts.push(new Vector3())
  let colors = [new Color('#ffffff')]
  let active = false
  const c = new Color()
  let acc = 0

  function colorAt(t) {
    if (colors.length === 1) return c.copy(colors[0])
    const f = t * (colors.length - 1)
    const i = Math.min(colors.length - 2, Math.floor(f))
    return c.copy(colors[i]).lerp(colors[i + 1], f - i)
  }

  return {
    setColors(list) {
      colors = list.map((x) => new Color(x))
    },
    start(p) {
      for (const v of pts) v.copy(p)
      active = true
      mesh.visible = true
    },
    stop() {
      active = false
    },
    // Remove the ribbon from the scene (a remote player left).
    dispose() {
      scene.remove(mesh)
      geo.dispose()
      mat.dispose()
    },
    update(dt, p, width = 1.1, t = 0) {
      if (!mesh.visible) return
      acc += dt
      if (active && acc > 1 / 60) {
        acc = 0
        for (let i = N - 1; i > 0; i--) pts[i].copy(pts[i - 1])
        pts[0].copy(p)
      } else if (!active) {
        // collapse the tail toward the head, then hide
        for (let i = N - 1; i > 0; i--) pts[i].lerp(pts[i - 1], Math.min(1, dt * 12))
        if (pts[0].distanceToSquared(pts[N - 1]) < 0.01) mesh.visible = false
      }
      for (let i = 0; i < N; i++) {
        const k = i / (N - 1)
        const w = width * (1 - k * 0.85)
        const wobble = Math.sin(t * 9 + i * 0.4) * 0.06
        pos[i * 6] = pts[i].x - w
        pos[i * 6 + 1] = pts[i].y + wobble
        pos[i * 6 + 2] = pts[i].z
        pos[i * 6 + 3] = pts[i].x + w
        pos[i * 6 + 4] = pts[i].y + wobble
        pos[i * 6 + 5] = pts[i].z
        colorAt((k * 2 + t * 0.6) % 1)
        const a = (1 - k) * Math.min(1, k * 5 + 0.15) * 0.65 // soft at the head so it never covers the player
        for (let s = 0; s < 2; s++) {
          col[(i * 2 + s) * 4] = c.r * 1.3
          col[(i * 2 + s) * 4 + 1] = c.g * 1.3
          col[(i * 2 + s) * 4 + 2] = c.b * 1.3
          col[(i * 2 + s) * 4 + 3] = a
        }
      }
      geo.attributes.position.needsUpdate = true
      geo.attributes.color.needsUpdate = true
    },
  }
}
