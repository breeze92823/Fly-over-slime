import {
  BackSide,
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three'

// Shared building blocks for the lane animals (animalsA.js / animalsB.js), the
// bosses and the helpers. Chunky cartoon look like the reference thumbnails:
// glossy saturated materials, huge googly eyes and an optional thick dark
// outline (inverted hull) on the big silhouette parts.
// Every model faces +Z (toward the player, who flies toward -Z).

export const geo = {
  sphere: new SphereGeometry(1, 22, 16),
  sphereLo: new SphereGeometry(1, 12, 9),
  box: new BoxGeometry(1, 1, 1),
  cone: new ConeGeometry(1, 1, 14),
  cone4: new ConeGeometry(1, 1, 4),
  cyl: new CylinderGeometry(1, 1, 1, 16),
  cylLo: new CylinderGeometry(1, 1, 1, 8),
  torus: new TorusGeometry(1, 0.28, 10, 24),
  capsule: new CapsuleGeometry(0.5, 1, 6, 14),
}

const matCache = new Map()
// Glossy cartoon material, cached by colour + options.
export function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra)
  if (!matCache.has(key)) matCache.set(key, new MeshStandardMaterial({ color, roughness: 0.42, metalness: 0, ...extra }))
  return matCache.get(key)
}
// Metal (robot parts).
export const metal = (color, extra = {}) => mat(color, { roughness: 0.28, metalness: 0.75, ...extra })
// Self-lit (glowing eyes, lights, jets). With bloom on, intensity > 1 blooms.
export const lit = (color, k = 1.6) => mat(color, { emissive: color, emissiveIntensity: k })
// See-through (slime, bubbles, ice, webs).
export const clear = (color, opacity = 0.55, extra = {}) => mat(color, { transparent: true, opacity, roughness: 0.12, depthWrite: false, ...extra })

const outlineMat = new MeshBasicMaterial({ color: '#141821', side: BackSide })
// Thick cartoon outline: a slightly bigger back-face copy behind the mesh.
export function outline(mesh, w = 0.06) {
  const o = new Mesh(mesh.geometry, outlineMat)
  o.scale.setScalar(1 + w)
  o.castShadow = false
  o.raycast = () => {}
  mesh.add(o)
  return mesh
}

// One primitive: part(parent, geo.sphere, mat('#3fe23a'), [x, y, z], [sx, sy, sz], [rx, ry, rz]).
export function part(parent, g, m, pos = [0, 0, 0], scl = [1, 1, 1], rot) {
  const o = new Mesh(g, m)
  o.position.set(pos[0], pos[1], pos[2])
  if (typeof scl === 'number') o.scale.setScalar(scl)
  else o.scale.set(scl[0], scl[1], scl[2])
  if (rot) o.rotation.set(rot[0], rot[1], rot[2])
  o.castShadow = true
  parent.add(o)
  return o
}

// Big googly cartoon eye: white ball, black pupil, specular dot. Returns { root, pupil }
// so the pupil can be aimed with lookAt-ish offsets (pupil.position.x/y within +-0.35 r).
export function googly(parent, pos, r, { white = '#ffffff', pupil = '#111111', pupilScale = 0.55 } = {}) {
  const root = part(parent, geo.sphere, mat(white, { roughness: 0.2 }), pos, [r, r, r])
  outline(root, 0.08)
  const p = part(root, geo.sphere, mat(pupil, { roughness: 0.1 }), [0, 0, 0.78], [pupilScale, pupilScale, 0.3])
  part(p, geo.sphere, mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.8 }), [0.35, 0.4, 0.7], [0.28, 0.28, 0.2])
  return { root, pupil: p }
}

// Smooth helpers for animation.
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
export const lerp = (a, b, k) => a + (b - a) * k
export const easeOut = (s) => 1 - (1 - s) * (1 - s)
export const easeIn = (s) => s * s
export const easeInOut = (s) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(s))
export const easeOutBack = (s, o = 1.7) => 1 + (o + 1) * Math.pow(s - 1, 3) + o * Math.pow(s - 1, 2)
export const spring = (s, f = 3, d = 5) => 1 - Math.exp(-d * s) * Math.cos(f * Math.PI * s) // overshoot-and-settle 0 -> 1
export const tmpV = () => new Vector3()
