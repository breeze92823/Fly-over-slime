import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
} from 'three'
import { canvasTex } from './legokit.js'
import { paintSoftDot } from './textures.js'

// Chibi pets built from primitives: a big round head on a small body, glossy
// eyes, and per-kind ears / tails / wings / horns / shells. `look` comes from
// config (EGGS / STAND_PETS): { kind, body, accent, wings, horn, glow, mane, hat, spiky }.
// Every model is ~1 m tall with its feet at y = 0 and faces +Z.

const geo = {
  sphere: new SphereGeometry(1, 20, 14),
  box: new BoxGeometry(1, 1, 1),
  cone: new ConeGeometry(1, 1, 12),
  cone4: new ConeGeometry(1, 1, 4),
  cyl: new CylinderGeometry(1, 1, 1, 14),
  torus: new TorusGeometry(1, 0.28, 8, 20),
}
const matCache = new Map()
function mat(color, extra = {}) {
  const key = color + JSON.stringify(extra)
  if (!matCache.has(key)) matCache.set(key, new MeshStandardMaterial({ color, roughness: 0.45, metalness: 0, ...extra }))
  return matCache.get(key)
}
let glowTex = null

function part(parent, g, m, [x, y, z], [sx, sy, sz], rot) {
  const o = new Mesh(g, m)
  o.position.set(x, y, z)
  o.scale.set(sx, sy, sz)
  if (rot) o.rotation.set(rot[0], rot[1], rot[2])
  o.castShadow = true
  parent.add(o)
  return o
}

function eyes(head, y, z, spread, size, color = '#141414') {
  for (const s of [-1, 1]) {
    part(head, geo.sphere, mat(color, { roughness: 0.15 }), [s * spread, y, z], [size, size * 1.15, size * 0.6])
    part(head, geo.sphere, mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.6 }), [s * spread + size * 0.3, y + size * 0.4, z + size * 0.45], [size * 0.32, size * 0.32, size * 0.2])
  }
}

export function buildPet(look) {
  const root = new Group()
  const body = mat(look.body, look.glow ? { emissive: look.glow, emissiveIntensity: 0.18 } : {})
  const accent = mat(look.accent)
  const k = look.kind
  const head = new Group()
  root.add(head)
  const R = 0.36 // head radius

  // body
  const tallBody = ['penguin', 'owl', 'duck'].includes(k)
  const quad = ['dog', 'cat', 'fox', 'bear', 'horse', 'lizard', 'turtle', 'dragon'].includes(k)
  if (k === 'snail') {
    part(root, geo.sphere, body, [0, 0.14, 0.05], [0.26, 0.14, 0.5])
    head.position.set(0, 0.42, 0.42)
    part(head, geo.sphere, body, [0, 0, 0], [0.24, 0.26, 0.24])
    eyes(head, 0.04, 0.2, 0.09, 0.055)
    for (const s of [-1, 1]) part(head, geo.cyl, body, [s * 0.08, 0.3, 0], [0.025, 0.22, 0.025])
    const shell = part(root, geo.torus, accent, [0, 0.46, -0.12], [0.28, 0.28, 0.4], [0, Math.PI / 2, 0])
    part(root, geo.sphere, accent, [0, 0.46, -0.12], [0.2, 0.3, 0.3])
    shell.rotation.z = 0
  } else if (k === 'turtle') {
    part(root, geo.sphere, accent, [0, 0.3, 0], [0.48, 0.3, 0.52])
    for (let i = 0; i < 5; i++) part(root, geo.sphere, mat('#4a9a2a'), [Math.cos(i * 1.26) * 0.25, 0.5, Math.sin(i * 1.26) * 0.25], [0.12, 0.06, 0.12])
    head.position.set(0, 0.42, 0.5)
    part(head, geo.sphere, body, [0, 0, 0], [0.26, 0.24, 0.26])
    eyes(head, 0.05, 0.2, 0.1, 0.06)
    for (const [x, z] of [[-0.32, 0.25], [0.32, 0.25], [-0.32, -0.25], [0.32, -0.25]]) part(root, geo.sphere, body, [x, 0.1, z], [0.12, 0.1, 0.14])
  } else {
    const by = tallBody ? 0.36 : quad ? 0.28 : 0.3
    part(root, geo.sphere, body, [0, by, quad ? -0.05 : 0], tallBody ? [0.32, 0.36, 0.3] : quad ? [0.28, 0.24, 0.36] : [0.27, 0.27, 0.26])
    part(root, geo.sphere, accent, [0, by - 0.02, quad ? 0.18 : 0.2], tallBody ? [0.22, 0.27, 0.14] : [0.17, 0.16, 0.12])
    // feet
    const feet = quad ? [[-0.15, 0.2], [0.15, 0.2], [-0.15, -0.22], [0.15, -0.22]] : [[-0.13, 0.05], [0.13, 0.05]]
    for (const [x, z] of feet) part(root, geo.sphere, ['duck', 'penguin', 'bird', 'owl'].includes(k) ? mat('#ff9a1f') : body, [x, 0.07, z], [0.09, 0.08, 0.12])
    head.position.set(0, by + 0.42, quad ? 0.18 : 0.04)
    part(head, geo.sphere, body, [0, 0, 0], [R, R * 0.95, R * 0.92])
    if (k !== 'bird' && k !== 'duck' && k !== 'penguin' && k !== 'owl') part(head, geo.sphere, accent, [0, -0.11, R * 0.72], [0.17, 0.12, 0.12]) // muzzle
    eyes(head, 0.04, R * 0.8, 0.14, 0.075)
    // nose / beak
    if (['bird', 'duck', 'penguin', 'owl'].includes(k)) {
      const beak = mat(k === 'bird' && look.accent ? '#ffb21f' : '#ff9a1f')
      if (k === 'duck') part(head, geo.sphere, beak, [0, -0.08, R * 0.95], [0.16, 0.06, 0.14])
      else part(head, geo.cone, beak, [0, -0.06, R * 0.95], [0.07, 0.16, 0.07], [Math.PI / 2, 0, 0])
    } else if (k !== 'frog') {
      part(head, geo.sphere, mat('#2a1a1a'), [0, -0.06, R * 0.98], [0.05, 0.04, 0.03])
    }
    // cheeks
    for (const s of [-1, 1]) part(head, geo.sphere, mat('#ff8fb0', { transparent: true, opacity: 0.7 }), [s * 0.22, -0.08, R * 0.75], [0.06, 0.04, 0.02])
    // ears
    const ear = (shape, sx, sy, y, spread, tilt, m = body) => {
      for (const s of [-1, 1]) part(head, shape, m, [s * spread, y, 0], [sx, sy, sx * 0.7], [0, 0, -s * tilt])
    }
    if (k === 'cat' || k === 'fox' || k === 'lizard') ear(geo.cone4, 0.12, 0.22, R * 0.85, 0.2, 0.3)
    if (k === 'cat' || k === 'fox') ear(geo.cone4, 0.06, 0.12, R * 0.85, 0.2, 0.3, accent)
    if (k === 'dog') for (const s of [-1, 1]) part(head, geo.sphere, accent, [s * 0.33, 0.02, -0.02], [0.08, 0.2, 0.13], [0, 0, s * 0.3])
    if (k === 'bunny') ear(geo.sphere, 0.07, 0.3, R + 0.2, 0.12, 0.12)
    if (k === 'bear') ear(geo.sphere, 0.11, 0.11, R * 0.8, 0.24, 0)
    if (k === 'horse') ear(geo.cone4, 0.07, 0.18, R * 0.9, 0.17, 0.15)
    if (k === 'owl') ear(geo.cone4, 0.08, 0.18, R * 0.9, 0.2, 0.4, accent)
    if (k === 'frog') for (const s of [-1, 1]) {
      part(head, geo.sphere, body, [s * 0.17, R * 0.75, 0.1], [0.13, 0.13, 0.13])
      part(head, geo.sphere, mat('#111'), [s * 0.17, R * 0.8, 0.2], [0.07, 0.08, 0.05])
    }
    if (k === 'dragon') ear(geo.cone, 0.07, 0.24, R * 0.9, 0.17, 0.35, accent)
    // tails
    if (k === 'cat' || k === 'dog' || k === 'lizard' || k === 'dragon') part(root, geo.cone, body, [0, 0.36, -0.42], [0.08, 0.38, 0.08], [-1.1, 0, 0])
    if (k === 'fox') part(root, geo.sphere, body, [0, 0.4, -0.45], [0.16, 0.16, 0.3], [0.6, 0, 0])
    if (k === 'bunny') part(root, geo.sphere, accent, [0, 0.2, -0.27], [0.11, 0.11, 0.11])
    if (k === 'horse') part(root, geo.sphere, accent, [0, 0.34, -0.42], [0.08, 0.26, 0.1], [0.5, 0, 0])
    // mane / hat / horn / spikes
    if (look.mane) part(head, geo.torus, accent, [0, 0, -0.05], [0.42, 0.42, 0.42])
    if (k === 'horse') part(head, geo.sphere, accent, [0, R * 0.7, -0.12], [0.08, 0.22, 0.25])
    if (look.horn) {
      const hornMat = mat(k === 'bear' ? '#d8e6ff' : '#ffe57a', { emissive: '#ffd23a', emissiveIntensity: 0.3 })
      if (k === 'bear') for (const s of [-1, 1]) part(head, geo.cone, hornMat, [s * 0.18, R + 0.05, 0.05], [0.05, 0.18, 0.05], [0, 0, -s * 0.4])
      else part(head, geo.cone, hornMat, [0, R + 0.12, 0.12], [0.05, 0.3, 0.05], [0.35, 0, 0])
    }
    if (look.hat) {
      part(head, geo.cyl, mat('#2b2b4a'), [0, R * 0.9, 0], [0.32, 0.05, 0.32])
      part(head, geo.cyl, mat('#2b2b4a'), [0, R * 0.9 + 0.13, 0], [0.18, 0.24, 0.18])
      part(head, geo.cyl, mat('#ff3b3b'), [0, R * 0.9 + 0.06, 0], [0.185, 0.05, 0.185])
      part(head, geo.sphere, mat('#ffd23a', { emissive: '#ffb21f', emissiveIntensity: 0.4 }), [0, R * 0.9 + 0.14, 0.18], [0.05, 0.05, 0.02])
      // eye patch + goggles for the captain
      part(head, geo.torus, mat('#5ad8ff', { emissive: '#1a8cff', emissiveIntensity: 0.5 }), [0.14, 0.04, R * 0.82], [0.09, 0.09, 0.09])
    }
    if (look.samurai) {
      // kabuto helmet: red dome, gold crest horns, a little neck guard
      const red = mat('#d8282e')
      const gold = mat('#ffd23a', { emissive: '#ffae12', emissiveIntensity: 0.35 })
      part(head, geo.sphere, red, [0, R * 0.55, -0.02], [R * 1.05, R * 0.62, R * 1.05])
      part(head, geo.cyl, mat('#2b2b3a'), [0, R * 0.32, -0.04], [R * 1.12, 0.05, R * 1.12])
      for (const s of [-1, 1]) part(head, geo.cone, gold, [s * 0.16, R * 1.05, R * 0.55], [0.05, 0.32, 0.04], [0.3, 0, -s * 0.55])
      part(head, geo.sphere, gold, [0, R * 0.78, R * 0.82], [0.07, 0.07, 0.03])
    }
    if (look.spiky) {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2
        part(head, geo.cone, mat('#fffbe6', { emissive: '#ffe066', emissiveIntensity: 0.7 }), [Math.cos(a) * R * 0.85, Math.sin(a) * R * 0.85 + 0.05, -0.15], [0.07, 0.36, 0.07], [0, 0, a - Math.PI / 2])
      }
    }
  }
  // wings
  if (look.wings) {
    const wingMat = mat(look.accent, look.glow ? { emissive: look.glow, emissiveIntensity: 0.35 } : {})
    const wings = new Group()
    for (const s of [-1, 1]) {
      const w = new Group()
      w.position.set(s * 0.25, 0.48, -0.12)
      for (let i = 0; i < 3; i++) part(w, geo.sphere, wingMat, [s * (0.18 + i * 0.13), 0.08 + i * 0.07, -i * 0.04], [0.15, 0.06 + 0.02 * (2 - i), 0.24 - i * 0.04], [0, 0, s * 0.4])
      wings.add(w)
      w.userData.side = s
    }
    root.add(wings)
    root.userData.wings = wings
  }
  // glow aura
  if (look.glow) {
    glowTex ||= canvasTex(paintSoftDot(64))
    const aura = new Sprite(new SpriteMaterial({ map: glowTex, color: new Color(look.glow), transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false }))
    aura.scale.setScalar(1.8)
    aura.position.y = 0.6
    root.add(aura)
  }
  root.userData.head = head
  return root
}

// Flap wings and bob, called per frame for live pets.
export function animatePet(pet, t, moving) {
  const wings = pet.userData.wings
  if (wings) for (const w of wings.children) w.rotation.z = w.userData.side * (0.3 + Math.sin(t * 12) * 0.5)
  const head = pet.userData.head
  if (head) head.rotation.z = Math.sin(t * 2.2) * 0.08
  pet.children[0] && (pet.children[0].position.y = pet.children[0].position.y)
  return moving
}
