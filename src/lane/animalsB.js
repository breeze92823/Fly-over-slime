import {
  AdditiveBlending,
  DoubleSide,
  DynamicDrawUsage,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Shape,
  TorusGeometry,
  Vector3,
} from 'three'
import { clamp01, clear, easeIn, easeInOut, easeOut, easeOutBack, geo, googly, lerp, lit, mat, metal, outline, part, spring } from './kit.js'

// Lane obstacle animals, set B: hippo, turtle, mole, bees, spider, snail,
// gorilla, pelican. MODEL CONTRACT: see animals.js. Every update(s) is pure
// choreography driven by s.phase / s.k (any phase length works); hazards.js
// owns timing, collision, markers and generic hit effects.
//
// Root conventions:
//  - single creatures (turtle, mole, pelican): root = the animal (world position,
//    root.scale = opts.scale).
//  - lane-spanning pieces (hippo wave, spider web, gorilla hands, bee cloud, snail
//    trail): root sits at an anchor on the lane (scale 1) so walls / trails keep
//    their world size; the animal itself is a child group scaled by opts.scale.

const TAU = Math.PI * 2
const UP = new Vector3(0, 1, 0)
const SLIME = ['#3fe23a', '#a6ff7a']
const seg = (k, a, b) => clamp01((k - a) / (b - a))
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v)
const tm = (s) => s.time ?? s.t ?? 0
const DEFAULT_GAP = { x0: -5, x1: 5 }
const POST_KEYS = ['p0', 'p1']

// ---------------------------------------------------------------- particles
// Reused option objects (fx.burst reads them immediately), so no per-frame garbage.
const PS = {
  splash: { x: 0, y: 0, z: 0, spread: 3, spreadY: 0.5, speed: 8, up: 1.6, lift: 3, gravity: -26, drag: 0.4, life: 0.9, size: 0.9, sizeEnd: 0.35, color: SLIME, additive: false, shape: 'square' },
  drip: { x: 0, y: 0, z: 0, spread: 1.6, spreadY: 0.3, speed: 0.6, up: 0.2, gravity: -22, life: 0.55, size: 0.45, sizeEnd: 0.25, color: SLIME, additive: false, shape: 'square' },
  spark: { x: 0, y: 0, z: 0, spread: 0.8, speed: 10, up: 1, gravity: -5, drag: 2.2, life: 0.4, size: 0.7, sizeEnd: 0.1, color: ['#ffffff', '#b8f6ff', '#5ad8ff'], shape: 'star' },
  stars: { x: 0, y: 0, z: 0, spread: 1.5, speed: 7, up: 1.3, gravity: -9, drag: 1.4, life: 0.9, size: 1.4, sizeEnd: 0.5, color: ['#fff36b', '#ffd21f', '#ffffff'], shape: 'star' },
  dust: { x: 0, y: 0, z: 0, spread: 2, speed: 7, up: 0.7, gravity: -3, drag: 2, life: 1.1, size: 1.8, sizeEnd: 3.4, color: ['#cfa97e', '#efe0c4', '#a77d55'], alpha: 0.85, additive: false },
  dirt: { x: 0, y: 0, z: 0, spread: 2, speed: 6, up: 1.5, lift: 2, gravity: -24, drag: 0.5, life: 0.8, size: 0.6, sizeEnd: 0.4, color: ['#7a4b2a', '#9a6a3c', '#5c3a20'], additive: false, shape: 'square' },
  steam: { x: 0, y: 0, z: 0, spread: 0.4, speed: 1.5, up: 1, lift: 2.5, drag: 1.2, life: 0.8, size: 0.8, sizeEnd: 2.2, color: ['#ffffff', '#e8e8e8'], alpha: 0.75, additive: false },
  angry: { x: 0, y: 0, z: 0, spread: 0.6, speed: 2, up: 1, lift: 2, drag: 1.2, life: 0.7, size: 0.9, sizeEnd: 1.8, color: ['#ff5a4a', '#ff9a6b', '#5a5a5a'], alpha: 0.8, additive: false },
  glow: { x: 0, y: 0, z: 0, spread: 8, speed: 0.6, up: 0.5, drag: 0.5, life: 1.2, size: 2.5, sizeEnd: 4, color: ['#ffe066', '#fff3a8'], alpha: 0.35 },
  sparkle: { x: 0, y: 0, z: 0, spread: 2, speed: 1.2, up: 1, drag: 1, life: 0.6, size: 0.9, sizeEnd: 0.1, color: ['#ffffff', '#e9fbff', '#fff9c4'], shape: 'star' },
  strand: { x: 0, y: 0, z: 0, spread: 3, spreadY: 1, speed: 5, up: 0.8, gravity: -14, drag: 0.8, life: 1.1, size: 0.5, sizeEnd: 0.3, color: ['#ffffff', '#f1e8ff'], additive: false, shape: 'square' },
  heart: { x: 0, y: 0, z: 0, spread: 1.2, speed: 4, up: 1.2, lift: 2, drag: 1.5, life: 0.9, size: 1.1, sizeEnd: 0.4, color: ['#ff6fb5', '#ff9ad0', '#ffffff'], shape: 'star' },
  glowFire: { x: 0, y: 0, z: 0, spread: 3, speed: 2, up: 0.6, drag: 1.5, life: 0.5, size: 1.1, sizeEnd: 0.2, color: ['#ffb21f', '#fff07a'], shape: 'dot' },
}

function emit(fx, n, p, x, y, z, spread) {
  if (!fx || n < 1) return
  p.x = x
  p.y = y
  p.z = z
  const sp = p.spread
  if (spread !== undefined) p.spread = spread
  fx.burst(Math.round(n), p)
  p.spread = sp
}
const chance = (rate, dt) => Math.random() < rate * (dt || 0.016)

// ---------------------------------------------------------------- small helpers
function eyePair(parent, x, y, z, r, o) {
  const out = []
  for (const sx of [-1, 1]) {
    const e = googly(parent, [sx * x, y, z], r, o)
    e.r = r
    out.push(e)
  }
  return out
}

// Pupils follow `player` (world), periodic blink; dizzy > 0 rolls the pupils.
// `parent` must have an up-to-date matrixWorld.
function lookEyes(eyes, parent, player, time, seed, v, dizzy = 0) {
  v.copy(player)
  parent.worldToLocal(v)
  const blink = (time + seed) % 3.6 < 0.13
  for (let i = 0; i < eyes.length; i++) {
    const e = eyes[i]
    let px, py
    if (dizzy > 0) {
      px = Math.cos(time * 11 + i * Math.PI) * 0.3
      py = Math.sin(time * 11 + i * Math.PI) * 0.3
    } else {
      const dx = v.x - e.root.position.x
      const dy = v.y - e.root.position.y
      const dz = v.z - e.root.position.z
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
      px = clampN(dx / L, -1, 1) * 0.34
      py = clampN(dy / L, -1, 1) * 0.34
    }
    e.pupil.position.set(px, py, Math.sqrt(Math.max(0.1, 0.6084 - px * px - py * py)))
    e.root.scale.y = e.r * (blink ? 0.12 : 1)
  }
}

// Stretch a unit Y-axis mesh (geo.cyl / geo.box) between a and b.
function stretch(m, a, b, r, tmp) {
  tmp.subVectors(b, a)
  const L = tmp.length()
  if (L < 1e-3) {
    m.visible = false
    return
  }
  m.visible = true
  m.position.addVectors(a, b).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(UP, tmp.multiplyScalar(1 / L))
  m.scale.set(r, L, r)
}

// Phase bookkeeping: strike time (start of hold / recover) for post-strike motion.
function tracker() {
  return { phase: '', strikeT: 0, atkDur: 0.5, lastAtkK: 0, init: false, flags: {} }
}
function step(tr, s) {
  if (s.phase === 'attack') {
    if (s.phaseDur > 0) tr.atkDur = s.phaseDur
    tr.lastAtkK = s.k
  }
  if (tr.phase === s.phase) return false
  const prev = tr.phase
  tr.phase = s.phase
  if ((s.phase === 'hold' || s.phase === 'recover') && prev !== 'hold') tr.strikeT = s.t - (s.phaseT || 0)
  return true
}
// Emits a slime splash whenever `below` flips (entering / leaving the slime).
function wet(st, key, below, fx, n, x, y, z, spread) {
  if (st[key] !== undefined && st[key] !== below) emit(fx, n, PS.splash, x, y, z, spread)
  st[key] = below
}
const yawTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz)
const disposeAll = (list) => {
  for (const m of list) m.dispose()
}
function basic(color, opacity) {
  return new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: AdditiveBlending })
}

// Private shared geometries (built once, never disposed).
let _wave = null
function waveGeo() {
  if (_wave) return _wave
  // Curling wave profile in (z, y): back slope, crest at y = 1, lip curling toward +Z.
  const sh = new Shape()
  sh.moveTo(-0.55, 0)
  sh.quadraticCurveTo(-0.45, 0.7, -0.1, 0.95)
  sh.quadraticCurveTo(0.3, 1.12, 0.42, 0.72)
  sh.quadraticCurveTo(0.32, 0.55, 0.12, 0.62)
  sh.quadraticCurveTo(0.0, 0.3, 0.35, 0)
  sh.lineTo(-0.55, 0)
  const g = new ExtrudeGeometry(sh, { depth: 1, bevelEnabled: false, curveSegments: 8 })
  g.translate(0, 0, -0.5)
  g.rotateY(-Math.PI / 2) // extrusion -> x (width), profile x -> z
  return (_wave = g)
}
let _halfTorus = null
const halfTorus = () => _halfTorus || (_halfTorus = new TorusGeometry(1, 0.34, 10, 18, Math.PI))
let _thinRing = null
const thinRing = () => _thinRing || (_thinRing = new TorusGeometry(1, 0.07, 6, 36))

// =====================================================================
// 1. Belly-Flop Hippo (wall)
// =====================================================================
function hippo(opts = {}) {
  const sc = opts.scale ?? 1
  const root = new Group()
  root.name = 'hippo'
  const hip = new Group()
  hip.scale.setScalar(sc)
  root.add(hip)
  const body = new Group()
  hip.add(body)
  const skin = mat('#a88cf0')
  const belly = mat('#ffb3cf')
  const dark = mat('#3b2353')
  const white = mat('#ffffff', { roughness: 0.25 })
  outline(part(body, geo.sphere, skin, [0, 0, 0], [2.6, 2.0, 3.0]), 0.05)
  part(body, geo.sphere, belly, [0, -0.7, 0.4], [2.15, 1.4, 2.55])
  const head = new Group()
  head.position.set(0, 0.9, 2.6)
  body.add(head)
  outline(part(head, geo.sphere, skin, [0, 0.2, 0], [2.0, 1.6, 1.7]), 0.05)
  outline(part(head, geo.sphere, skin, [0, -0.45, 1.3], [2.1, 1.25, 1.25]), 0.05)
  part(head, geo.sphere, belly, [0, -0.9, 1.5], [1.75, 0.6, 1.0])
  const cheek = mat('#ff7fa8', { transparent: true, opacity: 0.8 })
  const nostrils = []
  for (const sx of [-1, 1]) {
    nostrils.push(part(head, geo.sphere, dark, [sx * 0.6, 0.15, 2.3], [0.24, 0.16, 0.12]))
    part(head, geo.box, white, [sx * 0.5, -1.2, 2.2], [0.38, 0.42, 0.22])
    part(head, geo.sphere, cheek, [sx * 1.45, -0.35, 1.15], [0.38, 0.26, 0.2])
  }
  const eyes = eyePair(head, 0.75, 1.3, 0.7, 0.78)
  const ears = []
  for (const sx of [-1, 1]) {
    const ear = new Group()
    ear.position.set(sx * 1.15, 1.5, -0.35)
    head.add(ear)
    part(ear, geo.sphere, skin, [0, 0.35, 0], [0.38, 0.55, 0.28])
    part(ear, geo.sphere, belly, [0, 0.35, 0.16], [0.2, 0.34, 0.12])
    ears.push(ear)
  }
  const legs = []
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) legs.push(part(body, geo.capsule, skin, [sx * 1.55, -1.6, sz * 1.6], [1.0, 0.9, 1.0]))
  part(body, geo.cone, skin, [0, 0.5, -3.0], [0.35, 0.9, 0.35], [-2.2, 0, 0])

  // the slime wave: 3 curled segments per side of the gap + foam on the crests
  const waveMat = clear('#46e83f', 0.82, { emissive: '#1d9a18', emissiveIntensity: 0.4 }).clone()
  const foamMat = mat('#f4fff0', { emissive: '#d8ffd0', emissiveIntensity: 0.35 })
  const segs = []
  for (let i = 0; i < 6; i++) {
    const m = new Mesh(waveGeo(), waveMat)
    m.renderOrder = 3
    m.visible = false
    root.add(m)
    const f0 = part(root, geo.sphereLo, foamMat)
    const f1 = part(root, geo.sphereLo, foamMat)
    f0.castShadow = f1.castShadow = false
    f0.visible = f1.visible = false
    segs.push({ m, f0, f1, ph: i * 1.7 })
  }

  const st = tracker()
  const wetS = {}
  const cur = new Vector3()
  const from = new Vector3()
  const land = new Vector3()
  const v = new Vector3()
  const tgt = new Vector3()
  let H = 10
  let D = 4
  let hNow = 0
  let hRec = 0
  let homeX = 0

  function layoutWave(s, gap, hFrac, t, foamK) {
    const hw = s.halfWidth ?? 30
    for (let i = 0; i < 6; i++) {
      const sg = segs[i]
      const j = i % 3
      const a = i < 3 ? -hw : gap.x1
      const b = i < 3 ? gap.x0 : hw
      const w = (b - a) / 3
      const on = w > 0.15 && hFrac > 0.01
      sg.m.visible = on
      sg.f0.visible = sg.f1.visible = on && foamK > 0.02
      if (!on) continue
      const cx = a + w * (j + 0.5)
      const h = H * hFrac * (1 + 0.035 * Math.sin(t * 3.1 + sg.ph))
      const d = D * (1 + 0.08 * Math.sin(t * 2.3 + sg.ph))
      sg.m.position.set(cx, 0, 0)
      sg.m.scale.set(w * 1.08, Math.max(0.01, h), d)
      const fs = Math.min(w * 0.3, 2.6) * foamK
      sg.f0.position.set(cx - w * 0.22, h * 0.98, 0.11 * d)
      sg.f0.scale.set(fs * 1.3, fs * 0.55, fs)
      sg.f1.position.set(cx + w * 0.2, h * 0.96 + 0.2, 0.16 * d)
      sg.f1.scale.set(fs, fs * 0.5, fs * 0.9)
    }
  }
  function splashWave(fx, s, gap, n) {
    const hw = s.halfWidth ?? 30
    for (let i = 0; i < 6; i++) {
      const a = i < 3 ? -hw : gap.x1
      const b = i < 3 ? gap.x0 : hw
      const w = (b - a) / 3
      if (w < 0.15) continue
      emit(fx, n, PS.splash, a + w * ((i % 3) + 0.5), s.surface + H * 0.5 * Math.max(0.2, hNow), s.target.z, Math.max(2, w))
    }
  }

  return {
    root,
    update(s) {
      const fx = s.fx || opts.fx
      const t = tm(s)
      const gap = s.gap || DEFAULT_GAP
      const hw = s.halfWidth ?? 30
      tgt.copy(s.target)
      if (!st.init) {
        st.init = true
        const gc = (gap.x0 + gap.x1) / 2
        homeX = gc > 0 ? gap.x0 - 7 * sc : gap.x1 + 7 * sc
        homeX = clampN(homeX, -hw + 4 * sc, hw - 4 * sc)
        cur.set(homeX, s.surface - 4.8 * sc, s.home.z)
      }
      if (step(st, s)) {
        from.copy(cur)
        if (s.phase === 'recover') {
          hRec = hNow
          if (hRec > 0.3) splashWave(fx, s, gap, 18)
          if (hRec > 0.3) emit(fx, 30, s.hit ? PS.stars : PS.steam, cur.x, cur.y + 3 * sc, cur.z, 3)
        }
      }
      root.position.set(0, s.surface, s.target.z)
      H = Math.max(4, s.target.y + 3 - s.surface)
      D = clampN(H * 0.4, 3, 8)
      land.set(homeX, s.surface - 0.9 * sc, s.target.z)

      let x = homeX
      let z = s.home.z
      let y = s.surface - 0.5 * sc
      let roll = 0
      let pitch = 0
      let squash = 1
      let hFrac = 0
      let foamK = 1
      let lounge = 0
      let shake = 0
      let yaw = clampN(yawTo(x, z, s.player.x, s.player.z), -0.5, 0.5) * 0.6
      const k = s.k
      if (s.phase === 'tell') {
        const rise = easeOut(seg(k, 0, 0.25))
        y = s.surface + lerp(-4.8, -0.5, rise) * sc + Math.sin(t * 2.2) * 0.15 * sc
        roll = Math.sin(t * 14) * 0.12 * seg(k, 0.2, 0.5)
        const crouch = easeIn(seg(k, 0.55, 1))
        squash = 1 - 0.22 * crouch
        y -= 0.6 * crouch * sc
        if (rise > 0.2 && chance(4, s.dt)) emit(fx, 3, PS.drip, x, y + 1.5 * sc, z, 3 * sc)
      } else if (s.phase === 'attack') {
        yaw = 0
        if (k < 0.72) {
          const a = k / 0.72
          x = lerp(from.x, land.x, easeInOut(a))
          z = lerp(from.z, land.z, easeInOut(a))
          y = lerp(from.y, land.y, a) + Math.sin(Math.PI * a) * 11 * sc
          pitch = lerp(-0.45, 0.2, a)
          squash = 1 + 0.18 * (1 - a)
          if (chance(14, s.dt)) emit(fx, 2, PS.drip, x, y - 1.5 * sc, z, 3 * sc)
        } else {
          x = land.x
          z = land.z
          y = land.y
          squash = 0.6 + 0.4 * spring(seg(k, 0.72, 1))
          if (!st.flags.flop) {
            st.flags.flop = true
            emit(fx, 60, PS.splash, x, s.surface + 0.5, z, 7 * sc)
            emit(fx, 24, PS.splash, x, s.surface + 1, z, 2)
          }
        }
        hFrac = easeOutBack(seg(k, 0.7, 1), 1.3)
        if (hFrac > 0.05 && chance(10, s.dt)) splashWave(fx, s, gap, 2)
      } else {
        // recover (knock kinds skip hold; a hold is handled the same way)
        const rk = s.phase === 'recover' ? k : 0
        x = land.x
        z = land.z
        const post = s.t - st.strikeT
        const c = easeIn(seg(rk, 0.22, 0.7))
        hFrac = hRec * (1 - c) || (s.phase === 'hold' ? 1 : 0)
        foamK = 1 - seg(rk, 0.3, 0.62)
        waveMat.opacity = 0.82 * (1 - seg(rk, 0.35, 0.72))
        if (c > 0 && c < 1 && chance(16, s.dt)) splashWave(fx, s, gap, 3)
        lounge = easeInOut(seg(rk, 0.15, 0.5))
        y = s.surface - 0.6 * sc + Math.sin(t * 2.5) * 0.2 * sc - easeIn(seg(rk, 0.72, 1)) * 5.5 * sc
        if (s.hit) {
          y += Math.abs(Math.sin(post * 7)) * 0.7 * sc * Math.exp(-post * 1.2)
          if (chance(3, s.dt)) emit(fx, 2, PS.heart, x, y + 4 * sc, z + 2 * sc, 2)
        } else {
          shake = Math.exp(-post * 1.5)
          if (chance(10 * shake, s.dt)) {
            for (const n of nostrils) {
              n.getWorldPosition(v)
              emit(fx, 2, PS.steam, v.x, v.y + 0.4, v.z, 0.3)
            }
          }
        }
        yaw = 0
      }
      if (s.phase !== 'recover') waveMat.opacity = 0.82
      hNow = hFrac
      layoutWave(s, gap, hFrac, t, foamK)

      hip.position.set(x, y - s.surface, z - s.target.z)
      hip.rotation.set(pitch, yaw, roll)
      body.scale.set(1 + (1 - squash) * 0.5, squash, 1 + (1 - squash) * 0.5)
      body.rotation.x = -1.25 * lounge
      head.rotation.x = 0.85 * lounge
      head.rotation.y = Math.sin(t * 22) * 0.35 * shake
      for (let i = 0; i < 4; i++) legs[i].rotation.x = Math.sin(t * 9 + i * 1.6) * 0.5 * lounge + (s.phase === 'attack' && k < 0.72 ? (i < 2 ? -0.5 : 0.5) : 0)
      for (let i = 0; i < 2; i++) ears[i].rotation.z = (i ? -1 : 1) * (0.15 + Math.pow(Math.abs(Math.sin(t * 7 + i * 1.3)), 12) * 0.9)
      cur.set(x, y, z)
      wet(wetS, 'top', y + 2.4 * sc < s.surface, fx, 22, x, s.surface + 0.3, z, 4 * sc)
      wet(wetS, 'mid', y < s.surface - 0.2 * sc, fx, 16, x, s.surface + 0.3, z, 4 * sc)
      root.updateMatrixWorld(true)
      lookEyes(eyes, head, s.player, t, 0.4, v)
    },
    grabPoint(out) {
      return out.copy(tgt)
    },
    dispose() {
      disposeAll([waveMat])
    },
  }
}

// =====================================================================
// 2. Spinning Turtle
// =====================================================================
function turtle(opts = {}) {
  const sc = opts.scale ?? 1
  const root = new Group()
  root.name = 'turtle'
  root.scale.setScalar(sc)
  const spin = new Group()
  root.add(spin)
  const skin = mat('#8be05a')
  const shellM = mat('#2fbf4a')
  const plate = mat('#7be05a')
  const rimMat = mat('#ffb21f', { emissive: '#ff7a00', emissiveIntensity: 0.25 }).clone()
  outline(part(spin, geo.sphere, shellM, [0, 0.9, 0], [2.2, 1.35, 2.2]), 0.05)
  part(spin, geo.sphere, mat('#ffe08a'), [0, 0.55, 0], [2.0, 0.45, 2.0])
  part(spin, geo.sphere, plate, [0, 2.12, 0], [0.75, 0.22, 0.75])
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU
    part(spin, geo.sphere, plate, [Math.cos(a) * 1.3, 1.72, Math.sin(a) * 1.3], [0.5, 0.2, 0.5])
  }
  part(spin, geo.torus, rimMat, [0, 0.72, 0], [2.25, 2.25, 1.3], [Math.PI / 2, 0, 0])
  const head = new Group()
  head.position.set(0, 0.95, 2.3)
  spin.add(head)
  outline(part(head, geo.sphere, skin, [0, 0, 0], [0.95, 0.85, 1.0]), 0.06)
  part(head, geo.sphere, mat('#ff8fb0', { transparent: true, opacity: 0.75 }), [0, -0.25, 0.85], [0.5, 0.15, 0.15])
  const eyes = eyePair(head, 0.42, 0.45, 0.6, 0.55)
  const flips = []
  for (const [x, z] of [[-1.8, 1.2], [1.8, 1.2], [-1.6, -1.3], [1.6, -1.3]]) flips.push(part(spin, geo.sphere, skin, [x, 0.45, z], [0.65, 0.25, 0.85]))
  part(spin, geo.cone, skin, [0, 0.6, -2.2], [0.25, 0.6, 0.25], [-Math.PI / 2, 0, 0])
  const starMat = lit('#ffe23a', 2)
  const stars = []
  for (let i = 0; i < 3; i++) {
    const m = part(root, geo.cone4, starMat, [0, 3.2, 0], [0.35, 0.7, 0.14])
    m.visible = false
    stars.push(m)
  }

  const st = tracker()
  const wetS = {}
  const from = new Vector3()
  const dir = new Vector3()
  const v = new Vector3()
  const tgt = new Vector3()
  let spinAng = 0
  let rate = 0
  let speed = 20
  let bounceIdx = 0
  let vy = 0
  let ty = 0
  let endX = 0
  let endZ = 0

  return {
    root,
    update(s) {
      const fx = s.fx || opts.fx
      const t = tm(s)
      const dt = s.dt || 0
      const hw = s.halfWidth ?? 30
      const k = s.k
      tgt.copy(s.target)
      if (!st.init) {
        st.init = true
        root.position.set(s.home.x, s.home.y - 4.5 * sc, s.home.z)
      }
      const surfY = s.surface - 0.15 * sc
      if (step(st, s)) {
        from.copy(root.position)
        if (s.phase === 'attack') {
          dir.set(s.target.x - from.x, 0, s.target.z - from.z)
          if (dir.lengthSq() < 1e-4) dir.set(-s.side, 0, 0)
          dir.normalize()
        }
        if (s.phase === 'hold' || s.phase === 'recover') {
          if (dir.lengthSq() < 1e-4) dir.set(-s.side, 0, 0)
          speed = Math.max(12, Math.hypot(s.target.x - s.home.x, s.target.z - s.home.z) / Math.max(0.2, st.atkDur))
          if (!st.flags.struck) {
            st.flags.struck = true
            vy = s.hit ? 7 : 0
            ty = from.y
            if (s.hit) emit(fx, 26, PS.stars, from.x, from.y + 1.5 * sc, from.z, 2)
            else emit(fx, 10, PS.glowFire, from.x, from.y + 1 * sc, from.z, 2)
          }
        }
        if (s.phase === 'recover') {
          const ex = -s.side * (hw + 14)
          let dist = Math.abs(dir.x) > 0.15 ? (ex - from.x) / dir.x : 50
          dist = clampN(dist, 15, 120)
          endX = from.x + dir.x * dist
          endZ = from.z + dir.z * dist
        }
      }

      let tuck = 1
      let glow = 1
      let x = root.position.x
      let y = root.position.y
      let z = root.position.z
      let targetRate = 26
      let dizzy = 0
      if (s.phase === 'tell') {
        const rise = easeOut(seg(k, 0, 0.2))
        x = s.home.x
        z = s.home.z
        y = s.home.y + lerp(-4.5, 0, rise) * sc
        tuck = easeIn(seg(k, 0.4, 0.6))
        glow = seg(k, 0.5, 1)
        targetRate = 26 * easeIn(glow)
        y += Math.abs(Math.sin(t * 20)) * 0.2 * glow * sc
        if (glow > 0 && chance(10 * glow, dt)) emit(fx, 2, PS.glowFire, x, y + 0.8 * sc, z, 4 * sc)
        rate = targetRate
      } else if (s.phase === 'attack') {
        x = lerp(from.x, s.target.x, k)
        z = lerp(from.z, s.target.z, k)
        const base = lerp(from.y, surfY, seg(k, 0, 0.15))
        if (k < 0.7) {
          const b = k / 0.7
          y = base + Math.abs(Math.sin(b * TAU)) * 2.2 * sc
          const bi = Math.floor(b * 2)
          if (bi !== bounceIdx) {
            bounceIdx = bi
            emit(fx, 18, PS.splash, x, s.surface + 0.3, z, 3 * sc)
          }
          if (chance(30, dt)) emit(fx, 2, PS.splash, x - dir.x * 2 * sc, s.surface + 0.3, z - dir.z * 2 * sc, 2 * sc)
        } else {
          y = lerp(surfY, s.target.y - 0.6 * sc, easeOut(seg(k, 0.7, 1)))
        }
        rate = 26
        if (chance(12, dt)) emit(fx, 1, PS.glowFire, x, y + 0.8 * sc, z, 4 * sc)
      } else if (s.phase === 'hold') {
        const post = s.t - st.strikeT
        const f = s.hit ? 0.15 : 0.8
        x += dir.x * speed * f * dt
        z += dir.z * speed * f * dt
        vy -= 30 * dt
        ty = Math.max(surfY, ty + vy * dt)
        if (ty <= surfY) vy = 0
        y = ty
        if (s.hit) {
          rate *= Math.exp(-3 * dt)
          dizzy = 1
        }
        tuck = s.hit ? 1 - easeOutBack(seg(post, 0.3, 0.6)) : 1
      } else {
        // recover: slide across and off the far bank, then sink
        const f = 0.4 * k + 0.6 * k * k
        x = lerp(from.x, endX, f)
        z = lerp(from.z, endZ, f)
        vy -= 30 * dt
        ty = Math.max(surfY, ty + vy * dt)
        if (ty <= surfY) vy = 0
        y = (ty > surfY + 0.05 ? ty : surfY + Math.abs(Math.sin(k * 3 * Math.PI)) * 0.8 * sc * (1 - k)) - easeIn(seg(k, 0.82, 1)) * 4 * sc
        if (s.hit) {
          rate = lerp(rate, 0, Math.min(1, dt * 4))
          tuck = 1 - easeOutBack(seg(k, 0.15, 0.35))
          dizzy = 1
        } else rate = 26
        if (y < surfY + 0.4 * sc && chance(25, dt)) emit(fx, 2, PS.splash, x, s.surface + 0.3, z, 2.5 * sc)
        glow = 1 - k
      }
      spinAng += rate * dt
      root.position.set(x, y, z)
      const faceYaw = clampN(yawTo(x, z, s.player.x, s.player.z), -0.8, 0.8)
      spin.rotation.set(Math.sin(t * 9) * 0.06 * (rate / 26), (s.phase === 'tell' && rate < 1 ? faceYaw : 0) + spinAng, Math.cos(t * 9) * 0.06 * (rate / 26))
      const hs = Math.max(0.01, 1 - tuck)
      head.scale.setScalar(hs)
      head.position.z = lerp(2.3, 1.2, tuck)
      for (const fl of flips) fl.scale.set(0.65 * hs + 0.01, 0.25 * hs + 0.01, 0.85 * hs + 0.01)
      rimMat.emissiveIntensity = 0.25 + 3 * glow * (0.8 + 0.2 * Math.sin(t * 30))
      for (let i = 0; i < 3; i++) {
        const m = stars[i]
        m.visible = s.hit && (s.phase === 'hold' || s.phase === 'recover')
        if (!m.visible) continue
        const a = t * 6 + i * (TAU / 3)
        m.position.set(Math.cos(a) * 1.7, 3.3 + Math.sin(t * 9 + i) * 0.2, Math.sin(a) * 1.7)
        m.rotation.set(0, -a, 0.4)
      }
      wet(wetS, 'w', y + 1.5 * sc < s.surface, fx, 20, x, s.surface + 0.3, z, 3 * sc)
      root.updateMatrixWorld(true)
      lookEyes(eyes, head, s.player, t, 1.1, v, dizzy)
    },
    grabPoint(out) {
      return out.copy(tgt)
    },
    dispose() {
      disposeAll([rimMat])
    },
  }
}

// =====================================================================
// 3. Magnet Mole (robot)
// =====================================================================
function mole(opts = {}) {
  const sc = opts.scale ?? 1
  const root = new Group()
  root.name = 'mole'
  root.scale.setScalar(sc)
  const raft = new Group()
  root.add(raft)
  const dirtM = mat('#8a5a32')
  outline(part(raft, geo.cylLo, mat('#6e4226'), [0, 0, 0], [4.0, 0.8, 4.0]), 0.04)
  part(raft, geo.cylLo, mat('#5fc23a'), [0, 0.42, 0], [4.05, 0.12, 4.05])
  const mound = part(raft, geo.sphere, dirtM, [0, 0.4, 0], [2.4, 0.01, 2.4])
  const pebbles = []
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + 0.4
    pebbles.push(part(raft, geo.sphereLo, mat('#a07850'), [Math.cos(a) * 2.6, 0.55, Math.sin(a) * 2.6], [0.45, 0.3, 0.4]))
  }
  const mole = new Group()
  raft.add(mole)
  const fur = mat('#6d4c41')
  outline(part(mole, geo.sphere, fur, [0, 1.9, 0], [1.5, 1.9, 1.35]), 0.05)
  part(mole, geo.sphere, mat('#b08a6e'), [0, 1.7, 0.95], [1.1, 1.4, 0.6])
  part(mole, geo.sphere, mat('#ff7aa8'), [0, 2.75, 1.32], [0.38, 0.3, 0.3])
  part(mole, geo.box, mat('#ffffff'), [0, 2.35, 1.22], [0.32, 0.3, 0.12])
  const brass = metal('#d9a441')
  part(mole, geo.torus, mat('#2b2b33'), [0, 3.15, 0], [1.15, 1.05, 0.9], [Math.PI / 2, 0, 0])
  const eyes = eyePair(mole, 0.48, 3.2, 1.05, 0.42)
  for (const sx of [-1, 1]) part(mole, geo.torus, brass, [sx * 0.48, 3.2, 1.12], [0.5, 0.5, 0.5])
  const steel = metal('#b9c3cf')
  part(mole, geo.torus, steel, [0, 1.6, 0], [1.55, 1.42, 1.0], [Math.PI / 2, 0, 0])
  part(mole, geo.box, steel, [0.3, 2.0, 1.15], [0.3, 2.8, 0.2], [0, 0, 0.6])
  part(mole, geo.box, metal('#7d8794'), [0, 2.1, -1.35], [1.4, 1.5, 0.7])
  part(mole, geo.cylLo, steel, [0.4, 3.3, -1.35], [0.06, 1.0, 0.06])
  const bulb = part(mole, geo.sphereLo, lit('#ff3040', 2.2), [0.4, 3.85, -1.35], [0.18, 0.18, 0.18])
  part(mole, geo.sphere, mat('#ff9cb8'), [-1.35, 1.6, 0.9], [0.45, 0.35, 0.5])
  const arm = new Group()
  arm.rotation.order = 'YXZ'
  arm.position.set(1.35, 2.3, 0.2)
  mole.add(arm)
  part(arm, geo.sphere, steel, [0, 0, 0], [0.4, 0.4, 0.4])
  part(arm, geo.cylLo, steel, [0, 0, 0.75], [0.26, 1.5, 0.26], [Math.PI / 2, 0, 0])
  const magnet = new Group()
  magnet.position.set(0, 0, 1.5)
  magnet.scale.setScalar(0.9)
  arm.add(magnet)
  const red = mat('#e8262f', { roughness: 0.3 })
  outline(part(magnet, halfTorus(), red, [0, 0, 0], [1, 1, 1], [-Math.PI / 2, 0, 0]), 0.06)
  const silver = metal('#e6ecf2')
  for (const sx of [-1, 1]) {
    part(magnet, geo.cylLo, red, [sx, 0, 0.55], [0.34, 1.1, 0.34], [Math.PI / 2, 0, 0])
    part(magnet, geo.cylLo, silver, [sx, 0, 1.3], [0.36, 0.45, 0.36], [Math.PI / 2, 0, 0])
  }
  const tip = new Group()
  tip.position.set(0, 0, 1.55)
  magnet.add(tip)
  const ringMats = []
  const rings = []
  for (let i = 0; i < 4; i++) {
    const m = basic(i % 2 ? '#5ad8ff' : '#ff4b6e', 0)
    ringMats.push(m)
    const r = new Mesh(thinRing(), m)
    r.visible = false
    tip.add(r)
    rings.push(r)
  }
  const boltMat = lit('#e9fdff', 3)
  const bolt = []
  for (let i = 0; i < 6; i++) {
    const m = part(root, geo.box, boltMat)
    m.castShadow = false
    m.visible = false
    bolt.push(m)
  }

  const st = tracker()
  const wetS = {}
  const v = new Vector3()
  const a = new Vector3()
  const b = new Vector3()
  const p0 = new Vector3()
  const p1 = new Vector3()
  const tmp = new Vector3()
  const tgt = new Vector3()

  function layBolt(s, on) {
    if (!on) {
      for (const m of bolt) m.visible = false
      return
    }
    tip.getWorldPosition(a)
    a.sub(root.position).multiplyScalar(1 / sc)
    b.copy(s.target).sub(root.position).multiplyScalar(1 / sc)
    const len = a.distanceTo(b)
    p0.copy(a)
    for (let i = 0; i < 6; i++) {
      const f = (i + 1) / 6
      p1.lerpVectors(a, b, f)
      if (i < 5) p1.set(p1.x + (Math.random() - 0.5) * len * 0.12, p1.y + (Math.random() - 0.5) * len * 0.12, p1.z + (Math.random() - 0.5) * len * 0.06)
      stretch(bolt[i], p0, p1, 0.2, tmp)
      bolt[i].visible = Math.random() > 0.15
      p0.copy(p1)
    }
  }

  return {
    root,
    update(s) {
      const fx = s.fx || opts.fx
      const t = tm(s)
      const dt = s.dt || 0
      const k = s.k
      tgt.copy(s.target)
      const changed = step(st, s)
      root.position.set(s.home.x, s.surface, s.home.z)
      let raftY = 0
      let g = 1
      let pop = 1
      let rings01 = 1
      let ringRate = 0.9
      let boltOn = false
      let bounce = 0
      let shakeHead = 0
      let pump = 0
      if (s.phase === 'tell') {
        raftY = lerp(-3, 0, easeOut(seg(k, 0, 0.12)))
        g = easeOut(seg(k, 0.08, 0.35))
        if (g > 0 && g < 1 && chance(20, dt)) emit(fx, 2, PS.dirt, root.position.x, s.surface + 1.5 * sc, root.position.z, 2.5 * sc)
        const pk = seg(k, 0.32, 0.5)
        pop = pk > 0 ? easeOutBack(pk, 2.2) : 0
        if (pk > 0 && !st.flags.pop) {
          st.flags.pop = true
          emit(fx, 30, PS.dirt, root.position.x, s.surface + 2 * sc, root.position.z, 2.5 * sc)
        }
        rings01 = seg(k, 0.42, 0.62)
      } else if (s.phase === 'attack') {
        ringRate = 2.2
        boltOn = k > 0.78
        if (chance(25 + k * 40, dt)) {
          tip.getWorldPosition(v)
          emit(fx, 3, PS.spark, v.x, v.y, v.z, 1)
        }
      } else {
        const post = s.t - st.strikeT
        const rk = s.phase === 'recover' ? k : 0
        if (changed && !st.flags.zap) {
          st.flags.zap = true
          emit(fx, s.hit ? 40 : 14, PS.spark, s.target.x, s.target.y + 1, s.target.z, 1.5)
        }
        boltOn = post < 0.18
        rings01 = 1 - seg(rk, 0, 0.35)
        ringRate = 1.4
        const duck = easeIn(seg(rk, 0.15, 0.45))
        pop = 1 - duck
        g = 1 - easeIn(seg(rk, 0.4, 0.7))
        raftY = -3.5 * easeIn(seg(rk, 0.68, 1))
        if (s.hit) {
          bounce = Math.abs(Math.sin(post * 9)) * 0.5 * (1 - duck)
          pump = Math.sin(post * 14) * 0.5 * (1 - duck)
        } else {
          shakeHead = Math.exp(-post * 1.5) * (1 - duck)
          if (chance(8 * shakeHead, dt)) {
            tip.getWorldPosition(v)
            emit(fx, 2, PS.angry, v.x, v.y, v.z, 0.5)
          }
        }
      }
      raft.position.y = raftY + Math.sin(t * 2) * 0.08
      raft.rotation.set(Math.sin(t * 1.3) * 0.03, 0, Math.cos(t * 1.1) * 0.03)
      mound.scale.set(2.4 * (0.4 + 0.6 * g), Math.max(0.01, 1.6 * g), 2.4 * (0.4 + 0.6 * g))
      for (const p of pebbles) p.visible = g > 0.1
      mole.visible = pop > 0.001
      mole.position.y = lerp(-3.6, 0, pop) + bounce
      mole.rotation.set(0, clampN(yawTo(root.position.x, root.position.z, s.player.x, s.player.z), -0.7, 0.7), Math.sin(t * 24) * 0.12 * shakeHead)
      bulb.scale.setScalar(Math.sin(t * 10) > 0 ? 0.22 : 0.12)
      // aim the magnet at the player
      root.updateMatrixWorld(true)
      v.copy(s.player)
      mole.worldToLocal(v)
      const dx = v.x - arm.position.x
      const dy = v.y - arm.position.y
      const dz = v.z - arm.position.z
      arm.rotation.set(clampN(-Math.atan2(dy, Math.hypot(dx, dz)), -1.3, 0.2) + pump, clampN(Math.atan2(dx, dz), -0.8, 0.8), 0)
      magnet.position.x = s.phase === 'attack' ? (Math.random() - 0.5) * 0.15 : 0
      // pulsing magnetic rings travelling toward the player
      for (let i = 0; i < 4; i++) {
        const ph = (t * ringRate + i / 4) % 1
        const r = rings[i]
        const al = rings01 * (1 - ph) * Math.min(1, ph * 6)
        r.visible = al > 0.01 && mole.visible
        ringMats[i].opacity = al * 0.9
        r.position.z = ph * 22
        r.scale.setScalar(0.9 + ph * 5)
      }
      wet(wetS, 'r', raftY < -0.6, fx, 20, root.position.x, s.surface + 0.3, root.position.z, 4 * sc)
      root.updateMatrixWorld(true)
      layBolt(s, boltOn)
      lookEyes(eyes, mole, s.player, t, 2.2, v)
    },
    grabPoint(out) {
      return out.copy(tgt)
    },
    dispose() {
      disposeAll(ringMats)
    },
  }
}

// =====================================================================
// 4. Bee Swarm (area) — InstancedMesh bees + additive haze
// =====================================================================
function bees(opts = {}) {
  const sc = opts.scale ?? 1
  const N = 32
  const R = 6
  const root = new Group()
  root.name = 'bees'
  const mk = (g, m, count) => {
    const im = new InstancedMesh(g, m, count)
    im.instanceMatrix.setUsage(DynamicDrawUsage)
    im.frustumCulled = false
    im.castShadow = false
    root.add(im)
    return im
  }
  const bodyIM = mk(geo.sphereLo, mat('#ffd21f', { roughness: 0.3 }), N)
  const stripeIM = mk(geo.torus, mat('#1c1c24'), N * 2)
  const eyeIM = mk(geo.sphereLo, mat('#ffffff', { roughness: 0.2 }), N * 2)
  const pupilIM = mk(geo.sphereLo, mat('#111111', { roughness: 0.1 }), N * 2)
  const stingIM = mk(geo.cone, mat('#2b2b33'), N)
  const wingIM = mk(geo.sphereLo, clear('#eaf6ff', 0.7), N * 2)
  const hazeMats = [basic('#ffe066', 0), basic('#fff3a8', 0)]
  hazeMats[0].side = DoubleSide
  hazeMats[1].side = DoubleSide
  const haze0 = new Mesh(geo.sphereLo, hazeMats[0])
  const haze1 = new Mesh(geo.sphereLo, hazeMats[1])
  haze0.renderOrder = haze1.renderOrder = 4
  root.add(haze0, haze1)

  // part matrices in bee space (bee faces +Z, ~1.4 m long before scaling)
  const qI = new Quaternion()
  const compose = (p, q, s3) => new Matrix4().compose(new Vector3(...p), q, new Vector3(...s3))
  const qStripe = qI
  const qSting = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
  const L_body = compose([0, 0, 0], qI, [0.55, 0.5, 0.7])
  const L_stripe = [compose([0, 0, -0.05], qStripe, [0.47, 0.43, 0.5]), compose([0, 0, -0.38], qStripe, [0.37, 0.34, 0.5])]
  const L_eye = [compose([-0.2, 0.15, 0.55], qI, [0.2, 0.2, 0.2]), compose([0.2, 0.15, 0.55], qI, [0.2, 0.2, 0.2])]
  const L_pupil = [compose([-0.2, 0.17, 0.72], qI, [0.1, 0.12, 0.06]), compose([0.2, 0.17, 0.72], qI, [0.1, 0.12, 0.06])]
  const L_sting = compose([0, 0, -0.78], qSting, [0.12, 0.3, 0.12])
  const W_pre = [compose([-0.38, 0, 0], qI, [0.45, 0.06, 0.3]), compose([0.38, 0, 0], qI, [0.45, 0.06, 0.3])]
  const W_piv = [new Vector3(-0.3, 0.42, 0.05), new Vector3(0.3, 0.42, 0.05)]

  const B = []
  for (let i = 0; i < N; i++) {
    B.push({
      p1: Math.random() * TAU, p2: Math.random() * TAU, p3: Math.random() * TAU,
      w1: 0.8 + Math.random() * 1.4, w2: 0.9 + Math.random() * 1.6, w3: 0.4 + Math.random() * 0.8,
      r: 0.45 + Math.random() * 0.55,
      d: (i / N) * 0.4,
      ox: (Math.random() - 0.5) * 8, oy: (Math.random() - 0.5) * 6, oz: (Math.random() - 0.5) * 8,
      fl: Math.random() * TAU,
      dart: i % 5 === 0,
    })
  }
  const prev = new Float32Array(N * 3)
  const dirs = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) dirs[i * 3 + 2] = 1
  const st = tracker()
  const o = new Vector3()
  const pos = new Vector3()
  const start = new Vector3()
  const ctrl = new Vector3()
  const pl = new Vector3()
  const dv = new Vector3()
  const zero = new Vector3()
  const sv = new Vector3()
  const q = new Quaternion()
  const mB = new Matrix4()
  const mL = new Matrix4()
  const mW = new Matrix4()
  const mOut = new Matrix4()
  const tgt = new Vector3()
  let halfL = 20
  let first = true

  function orbit(i, tau, chaos, out) {
    const b = B[i]
    const a = b.p1 + tau * b.w1 * chaos
    const c = b.p2 + tau * b.w2 * chaos
    const d = b.p3 + tau * b.w3 * chaos
    out.set(
      R * b.r * (0.78 * Math.sin(a) + 0.22 * Math.sin(c * 1.7)),
      R * 0.72 * b.r * (0.7 * Math.sin(c) + 0.3 * Math.cos(d * 1.3)),
      halfL * b.r * (0.82 * Math.sin(d) + 0.18 * Math.sin(a * 0.7)),
    )
  }

  return {
    root,
    update(s) {
      const fx = s.fx || opts.fx
      const t = tm(s)
      const dt = s.dt || 0
      const k = s.k
      tgt.copy(s.target)
      if (step(st, s) && s.phase === 'recover') {
        emit(fx, s.hit ? 24 : 16, s.hit ? PS.stars : PS.steam, s.target.x, s.target.y, s.target.z, R)
      }
      root.position.copy(s.target)
      halfL = Math.max(4, (s.length || 40) / 2)
      const sideSign = Math.sign(s.home.x - s.target.x) || s.side || 1
      start.set(s.home.x + sideSign * 30, s.home.y + 4, s.home.z - 10).sub(s.target)
      ctrl.copy(s.home).sub(s.target)
      pl.copy(s.player).sub(s.target)
      const inside = (pl.x / R) ** 2 + (pl.y / R) ** 2 + (pl.z / halfL) ** 2 < 1.4
      const minY = s.surface + 1 - s.target.y
      const beeS = 1.25 * sc
      let chaos = 1
      let haze = 0
      if (s.phase === 'tell') haze = seg(k, 0.35, 1)
      else if (s.phase === 'recover') haze = 1 - seg(k, 0, 0.5)
      else {
        haze = 1
        chaos = 1.2
      }
      for (let i = 0; i < N; i++) {
        const b = B[i]
        orbit(i, s.t, chaos, o)
        let size = beeS
        if (s.phase === 'tell') {
          const p = clamp01((k - b.d) / 0.55)
          const e = easeInOut(p)
          // quadratic bezier: entry point -> home -> orbit slot
          const u = 1 - e
          pos.set(
            u * u * (start.x + b.ox) + 2 * u * e * (ctrl.x + b.ox * 0.5) + e * e * o.x,
            u * u * (start.y + b.oy) + 2 * u * e * (ctrl.y + b.oy * 0.5) + e * e * o.y + Math.sin(p * Math.PI * 3 + b.fl) * (1 - p) * 1.5,
            u * u * (start.z + b.oz) + 2 * u * e * (ctrl.z + b.oz * 0.5) + e * e * o.z,
          )
          size = beeS * clamp01(p * 6)
        } else if (s.phase === 'recover') {
          const e = easeIn(k)
          pos.set(o.x * (1 + e * 4), o.y * (1 + e * 2) + e * 18, o.z * (1 + e * 1.5))
          if (s.hit) pos.y += Math.sin(t * 8 + b.fl) * 2 * (1 - k)
          size = beeS * (1 - seg(k, 0.75, 1))
        } else {
          pos.copy(o)
          if (b.dart && inside) {
            const d = Math.pow(0.5 - 0.5 * Math.cos(t * 3 + b.fl), 2)
            pos.x = lerp(pos.x, pl.x + Math.sin(b.fl) * 1.2, d * 0.85)
            pos.y = lerp(pos.y, pl.y + 1 + Math.cos(b.fl) * 0.8, d * 0.85)
            pos.z = lerp(pos.z, pl.z, d * 0.85)
          }
        }
        pos.x += Math.sin(t * 13 + b.fl) * 0.25
        pos.y += Math.cos(t * 11 + b.fl * 1.3) * 0.25
        if (pos.y < minY) pos.y = minY
        // heading from motion
        const i3 = i * 3
        dv.set(pos.x - prev[i3], pos.y - prev[i3 + 1], pos.z - prev[i3 + 2])
        if (!first && dv.lengthSq() > 1e-6) {
          dv.normalize()
          dirs[i3] = dv.x
          dirs[i3 + 1] = dv.y * 0.6
          dirs[i3 + 2] = dv.z
        }
        prev[i3] = pos.x
        prev[i3 + 1] = pos.y
        prev[i3 + 2] = pos.z
        dv.set(dirs[i3], dirs[i3 + 1], dirs[i3 + 2])
        if (dv.lengthSq() < 1e-6) dv.set(0, 0, 1)
        mL.lookAt(dv, zero, UP)
        q.setFromRotationMatrix(mL)
        sv.setScalar(Math.max(1e-4, size))
        mB.compose(pos, q, sv)
        mOut.multiplyMatrices(mB, L_body)
        bodyIM.setMatrixAt(i, mOut)
        mOut.multiplyMatrices(mB, L_sting)
        stingIM.setMatrixAt(i, mOut)
        for (let j = 0; j < 2; j++) {
          mOut.multiplyMatrices(mB, L_stripe[j])
          stripeIM.setMatrixAt(i * 2 + j, mOut)
          mOut.multiplyMatrices(mB, L_eye[j])
          eyeIM.setMatrixAt(i * 2 + j, mOut)
          mOut.multiplyMatrices(mB, L_pupil[j])
          pupilIM.setMatrixAt(i * 2 + j, mOut)
          const flap = Math.sin(t * 70 + b.fl) * 0.7 * (j ? 1 : -1)
          mW.makeRotationZ(flap)
          mW.setPosition(W_piv[j])
          mL.multiplyMatrices(mW, W_pre[j])
          mOut.multiplyMatrices(mB, mL)
          wingIM.setMatrixAt(i * 2 + j, mOut)
        }
      }
      first = false
      bodyIM.instanceMatrix.needsUpdate = true
      stingIM.instanceMatrix.needsUpdate = true
      stripeIM.instanceMatrix.needsUpdate = true
      eyeIM.instanceMatrix.needsUpdate = true
      pupilIM.instanceMatrix.needsUpdate = true
      wingIM.instanceMatrix.needsUpdate = true
      // soft haze
      const pulse = 0.85 + 0.15 * Math.sin(t * 5)
      hazeMats[0].opacity = 0.1 * haze * pulse
      hazeMats[1].opacity = 0.12 * haze * pulse
      haze0.visible = haze1.visible = haze > 0.01
      haze0.scale.set(R * 1.2, R * 0.95, halfL * 1.08)
      haze1.scale.set(R * 0.7, R * 0.55, halfL * 0.7)
      if (haze > 0.3 && chance(10 * haze, dt)) emit(fx, 2, PS.glow, s.target.x, s.target.y, s.target.z + (Math.random() - 0.5) * halfL * 1.6, R * 1.4)
      if (s.phase === 'attack' && inside && chance(6, dt)) emit(fx, 2, PS.sparkle, s.player.x, s.player.y + 1, s.player.z, 2)
    },
    grabPoint(out) {
      return out.copy(tgt)
    },
    dispose() {
      disposeAll(hazeMats)
      for (const im of [bodyIM, stripeIM, eyeIM, pupilIM, stingIM, wingIM]) im.dispose()
    },
  }
}

// =====================================================================
// 5. Web Spider (wall trap)
// =====================================================================
function spider(opts = {}) {
  const sc = opts.scale ?? 1
  const root = new Group()
  root.name = 'spider'
  const webMat = mat('#ffffff', { emissive: '#e8f4ff', emissiveIntensity: 0.55, transparent: true, opacity: 1, roughness: 0.2 }).clone()
  const web = new Group()
  root.add(web)
  const strand = () => {
    const m = new Mesh(geo.cylLo, webMat)
    m.visible = false
    web.add(m)
    return m
  }
  const poly = () => ({ a: new Vector3(), m: new Vector3(), b: new Vector3(), s1: strand(), s2: strand(), g: 0 })
  const rows = []
  for (let i = 0; i < 10; i++) rows.push(poly()) // 5 rows x 2 sides
  const cols = []
  for (let i = 0; i < 6; i++) cols.push(poly()) // 3 verticals x 2 sides
  const topGap = poly()
  const bridge = poly()
  const thread = strand()
  const diags = []
  for (let i = 0; i < 4; i++) diags.push(strand()) // an X across each side
  const all = [...rows, ...cols, topGap]
  const postM = mat('#8a5a34')
  const posts = []
  for (let i = 0; i < 2; i++) {
    const p = part(root, geo.cylLo, postM)
    const cap = part(root, geo.sphere, mat('#ffcf5a'))
    posts.push({ p, cap })
  }
  // the spider
  const sp = new Group()
  sp.scale.setScalar(1.2 * sc)
  root.add(sp)
  const purple = mat('#5b2a86')
  const black = mat('#1d1426')
  outline(part(sp, geo.sphere, purple, [0, 0.3, -0.9], [1.3, 1.2, 1.4]), 0.05)
  part(sp, geo.sphere, mat('#ff6fb5'), [0, 0.95, -1.2], [0.45, 0.25, 0.5])
  const headG = new Group()
  headG.position.set(0, 0, 0.6)
  sp.add(headG)
  outline(part(headG, geo.sphere, black, [0, 0, 0], [1.0, 0.9, 0.95]), 0.05)
  const eyes = eyePair(headG, 0.42, 0.35, 0.65, 0.55)
  for (const sx of [-1, 1]) part(headG, geo.cone, mat('#ffd0e8'), [sx * 0.25, -0.6, 0.75], [0.12, 0.35, 0.12], [Math.PI, 0, 0])
  const legs = []
  const la = new Vector3()
  const lb = new Vector3()
  const lt = new Vector3()
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1
    const j = i % 4
    const lg = new Group()
    lg.position.set(side * 0.6, 0, 0.8 - j * 0.5)
    lg.rotation.y = side * (-0.7 + j * 0.45)
    sp.add(lg)
    const u = part(lg, geo.cylLo, black)
    const l = part(lg, geo.cylLo, black)
    la.set(0, 0, 0)
    lb.set(side * 1.4, 0.9, 0)
    stretch(u, la, lb, 0.13, lt)
    la.set(side * 2.4, -0.9, 0)
    stretch(l, lb, la, 0.11, lt)
    legs.push({ g: lg, side, j })
  }

  const st = tracker()
  const wetS = {}
  const v = new Vector3()
  const tmp = new Vector3()
  const ta = new Vector3()
  const tb = new Vector3()
  const spPos = new Vector3()
  const spFrom = new Vector3()
  const tgt = new Vector3()
  let bulge = 0
  let hitX = 0
  let hitY = 0
  let P = 28.5
  let topY = 10
  let bridgeY = 16
  let hangX = 0
  let hangY = 13

  const bz = (x, y) => -bulge * Math.exp(-((x - hitX) ** 2 + (y - hitY) ** 2) / 32)
  function setPt(out, x, y, dz = 0) {
    out.set(x, y, bz(x, y) + dz)
  }
  function drawPoly(pl, g, r) {
    if (g <= 0.001) {
      pl.s1.visible = pl.s2.visible = false
      return
    }
    const h = g * 2
    if (h <= 1) {
      tmp.lerpVectors(pl.a, pl.m, h)
      stretch(pl.s1, pl.a, tmp, r, ta)
      pl.s2.visible = false
    } else {
      stretch(pl.s1, pl.a, pl.m, r, ta)
      tmp.lerpVectors(pl.m, pl.b, h - 1)
      stretch(pl.s2, pl.m, tmp, r, ta)
    }
  }

  return {
    root,
    update(s) {
      const fx = s.fx || opts.fx
      const t = tm(s)
      const dt = s.dt || 0
      const k = s.k
      const gap = s.gap || DEFAULT_GAP
      const hw = s.halfWidth ?? 30
      tgt.copy(s.target)
      root.position.set(0, s.surface, s.target.z)
      P = hw - 1.5
      topY = s.target.y + 4 - s.surface
      bridgeY = topY + 6
      const gx0 = Math.max(gap.x0, -P)
      const gx1 = Math.min(gap.x1, P)
      hangX = (gx0 + gx1) / 2
      hangY = topY + 3
      const capY = bridgeY + 1
      if (!st.init) {
        st.init = true
        spPos.set(-P, capY - bridgeY - 6 + 1.6 * sc, 0)
      }
      if (step(st, s)) {
        spFrom.copy(spPos)
        if (s.phase === 'recover') {
          for (let i = 0; i < 10; i += 2) emit(fx, 10, PS.strand, rows[i].m.x, s.surface + rows[i].m.y, s.target.z, 6)
          emit(fx, 24, PS.strand, s.target.x, s.target.y + 1, s.target.z, 4)
        }
        if (s.phase === 'hold' && s.hit) {
          hitX = clampN(s.target.x, -P + 1, P - 1)
          hitY = s.target.y + 0.9 - s.surface
          emit(fx, 30, PS.sparkle, s.target.x, s.target.y + 1, s.target.z, 3)
        }
      }

      let postRise = 1
      let gBridge = 1
      let gWeb = 1
      let sag = 0
      let opacity = 1
      let legRate = 6
      let legAmp = 0.15
      if (s.phase === 'tell') {
        postRise = easeOut(seg(k, 0, 0.25))
        gBridge = seg(k, 0.25, 0.42)
        sag = 1
        const sk = seg(k, 0.4, 0.6)
        const dk = seg(k, 0.6, 0.78)
        if (k < 0.4) spPos.set(-P, capY + 1.6 * sc - (1 - postRise) * (bridgeY + 6), 0)
        else if (dk <= 0) spPos.set(lerp(-P, hangX, easeInOut(sk)), bridgeY - 1.2 * sc, 0)
        else spPos.set(hangX, lerp(bridgeY - 1.2 * sc, hangY, easeOutBack(dk, 1.6)), 0)
        if (sk > 0 && sk < 1) legRate = 30
        spPos.y += k > 0.78 ? Math.sin(t * 2.5) * 0.3 : 0
        gWeb = 0 // per-strand below
      } else if (s.phase === 'attack') {
        sag = (1 - easeIn(k)) + (k > 0.85 ? Math.sin((k - 0.85) * 60) * 0.3 * (1 - k) : 0)
        spPos.set(hangX, hangY + Math.sin(k * Math.PI * 3) * 0.6 * k, 0)
        if (chance(30, dt)) emit(fx, 2, PS.sparkle, lerp(-P, P, Math.random()), s.surface + Math.random() * topY, s.target.z, 1)
        if (k >= 0.999 && !st.flags.taut) {
          st.flags.taut = true
          emit(fx, 30, PS.sparkle, hangX, s.surface + topY * 0.5, s.target.z, 20)
        }
      } else if (s.phase === 'hold') {
        if (s.hit) {
          const post = s.t - st.strikeT
          bulge = 2.8 * spring(clamp01(post / 0.7), 2.5, 4)
          const mk = easeInOut(seg(k, 0, 0.35))
          const dk = easeOutBack(seg(k, 0.3, 0.9), 1.2)
          spPos.set(lerp(spFrom.x, hitX, mk), lerp(spFrom.y, hitY + 2.6, dk), lerp(spFrom.z, -bulge + 0.8, dk))
          legRate = 14
          legAmp = 0.25
          if (chance(4, dt)) emit(fx, 2, PS.sparkle, s.target.x, s.target.y + 1, s.target.z, 3)
        } else {
          spPos.set(hangX, hangY + Math.abs(Math.sin(t * 12)) * 0.6, 0)
          legRate = 26
          legAmp = 0.35
          sag = Math.sin(t * 20) * 0.2
        }
      } else {
        // recover: web tears, spider climbs back to the post, posts sink
        const climb = easeInOut(seg(k, 0, 0.35))
        const run = easeInOut(seg(k, 0.35, 0.6))
        const sink = easeIn(seg(k, 0.62, 1))
        if (run <= 0) spPos.set(spFrom.x, lerp(spFrom.y, bridgeY - 1.2 * sc, climb), lerp(spFrom.z, 0, climb))
        else if (sink <= 0) spPos.set(lerp(spFrom.x, -P, run), lerp(bridgeY - 1.2 * sc, capY + 1.6 * sc, run), 0)
        else spPos.set(-P, capY + 1.6 * sc, 0)
        postRise = 1 - sink
        spPos.y -= sink * (bridgeY + 6)
        bulge *= Math.exp(-dt * 6)
        gBridge = 1 - seg(k, 0.55, 0.68)
        opacity = 1 - seg(k, 0.15, 0.6)
        legRate = climb < 1 || run < 1 ? 26 : 6
        if (!s.hit) {
          legAmp = 0.3
          if (chance(5 * (1 - k), dt)) emit(fx, 2, PS.angry, spPos.x, s.surface + spPos.y + 1, s.target.z, 0.6)
        }
      }
      webMat.opacity = opacity
      const r = 0.17
      // rows
      for (let i = 0; i < 10; i++) {
        const pl = rows[i]
        const j = i >> 1
        const left = (i & 1) === 0
        const y = 0.6 + (topY - 0.6) * (j / 4)
        const A = left ? -P : gx1
        const Bx = left ? gx0 : P
        if (Bx - A < 0.5) {
          pl.s1.visible = pl.s2.visible = false
          continue
        }
        const mx = bulge > 0.01 ? clampN(hitX, A + 0.3, Bx - 0.3) : (A + Bx) / 2
        // grows from the post outward
        if (left) {
          setPt(pl.a, A, y)
          setPt(pl.b, Bx, y)
        } else {
          setPt(pl.a, Bx, y)
          setPt(pl.b, A, y)
        }
        setPt(pl.m, mx, y - sag * 1.4 - (j > 0 ? 0.35 : 0))
        pl.g = growth(s, k, 0.3 + j * 0.06, i)
        drawPoly(pl, pl.g, r)
      }
      for (let i = 0; i < 6; i++) {
        const pl = cols[i]
        const left = i < 3
        const f = [0.34, 0.67, 1][i % 3]
        const post = left ? -P : P
        const edge = left ? gx0 : gx1
        if (Math.abs(edge - post) < 0.5) {
          pl.s1.visible = pl.s2.visible = false
          continue
        }
        const x = lerp(post, edge, f)
        const my = bulge > 0.01 ? clampN(hitY, 0.8, topY - 0.8) : topY * 0.5
        setPt(pl.a, x, topY)
        setPt(pl.m, x, my, sag * 0.8)
        setPt(pl.b, x, 0.3)
        pl.g = growth(s, k, 0.45 + (i % 3) * 0.08, i + 10)
        drawPoly(pl, pl.g, i % 3 === 2 ? r * 1.4 : r)
      }
      for (let i = 0; i < 4; i++) {
        const left = i < 2
        const post = left ? -P : P
        const edge = left ? gx0 : gx1
        const m = diags[i]
        if (Math.abs(edge - post) < 2) {
          m.visible = false
          continue
        }
        const up = i % 2 === 0
        setPt(ta, post, up ? topY * 0.12 : topY * 0.9)
        setPt(v, edge, up ? topY * 0.8 : topY * 0.25)
        const g = growth(s, k, 0.55 + (i % 2) * 0.08, i + 20)
        if (g <= 0.001) m.visible = false
        else {
          tb.lerpVectors(ta, v, g)
          stretch(m, ta, tb, r * 0.8, tmp)
        }
      }
      setPt(topGap.a, gx0, topY)
      setPt(topGap.b, gx1, topY)
      setPt(topGap.m, (gx0 + gx1) / 2, topY - sag)
      topGap.g = gx1 - gx0 > 0.3 ? growth(s, k, 0.7, 17) : 0
      drawPoly(topGap, topGap.g, r)
      // bridge between the post tops + the spider's thread
      const lift = (1 - postRise) * (bridgeY + 6)
      bridge.a.set(-P, bridgeY - lift, 0)
      bridge.b.set(P, bridgeY - lift, 0)
      bridge.m.set(0, bridgeY - lift - 0.6 - sag * 0.5, 0)
      drawPoly(bridge, gBridge, r)
      const hanging = spPos.y < bridgeY - 1.3 * sc && gBridge > 0.99
      if (hanging) {
        ta.set(spPos.x, bridgeY - lift - 0.3, spPos.z * 0.3)
        tb.set(spPos.x, spPos.y + 1.4 * sc, spPos.z)
        stretch(thread, ta, tb, 0.08, v)
      } else thread.visible = false
      for (let i = 0; i < 2; i++) {
        const x = i ? P : -P
        const h = capY + 3
        posts[i].p.position.set(x, h / 2 - 3 - lift, 0)
        posts[i].p.scale.set(0.9, h, 0.9)
        posts[i].cap.position.set(x, capY - lift, 0)
        posts[i].cap.scale.setScalar(1.3)
        wet(wetS, POST_KEYS[i], postRise < 0.05, fx, 22, x, s.surface + 0.3, s.target.z, 3)
      }
      // spider
      sp.position.copy(spPos)
      sp.rotation.set(Math.sin(t * 3) * 0.08, 0, Math.sin(t * 2.2) * 0.1)
      for (const L of legs) L.g.rotation.z = Math.sin(t * legRate + L.j * 1.3 + (L.side > 0 ? 0.6 : 0)) * legAmp * L.side
      if (s.phase === 'tell' && k > 0.3 && k < 0.95 && chance(25, dt)) {
        const pl = all[(Math.random() * all.length) | 0]
        if (pl.s1.visible) emit(fx, 2, PS.sparkle, pl.s1.position.x, s.surface + pl.s1.position.y, s.target.z, 1.5)
      }
      root.updateMatrixWorld(true)
      lookEyes(eyes, headG, s.player, t, 0.9, v)
    },
    grabPoint(out) {
      return out.set(tgt.x, tgt.y, tgt.z - bulge)
    },
    dispose() {
      disposeAll([webMat])
    },
  }

  // strand growth: shoots out in the tell, stays, retracts (tears) in recover
  function growth(s, k, delay, i) {
    if (s.phase === 'tell') return easeOut(seg(k, delay, delay + 0.28))
    if (s.phase === 'recover') return 1 - easeIn(seg(k, 0.05 + (i % 6) * 0.04, 0.4 + (i % 6) * 0.04))
    return 1
  }
}

// =====================================================================
// 6. Mega Snail (sticky trail area on the slime)
// =====================================================================
function snail(opts = {}) {
  const sc = opts.scale ?? 1
  const root = new Group()
  root.name = 'snail'
  const trailMat = clear('#c8ff5a', 0.6, { emissive: '#7dff3a', emissiveIntensity: 0.6 }).clone()
  const sheenMat = clear('#ffffff', 0.35, { emissive: '#eaffd0', emissiveIntensity: 0.8 }).clone()
  const trail = new Mesh(geo.box, trailMat)
  const sheen = new Mesh(geo.box, sheenMat)
  trail.renderOrder = sheen.renderOrder = 2
  trail.visible = sheen.visible = false
  root.add(trail, sheen)
  const sn = new Group()
  sn.scale.setScalar(sc)
  root.add(sn)
  const bodyG = new Group()
  sn.add(bodyG)
  const skin = mat('#ffd45e')
  outline(part(bodyG, geo.sphere, skin, [0, 0.55, 0.2], [1.7, 0.85, 4.6]), 0.04)
  part(bodyG, geo.sphere, mat('#ffb84a'), [0, 0.2, 0.2], [1.9, 0.35, 4.8])
  const head = new Group()
  head.position.set(0, 1.9, 3.7)
  bodyG.add(head)
  outline(part(head, geo.sphere, skin, [0, 0, 0], [1.3, 1.6, 1.3]), 0.05)
  part(head, geo.sphere, mat('#7a2a3a'), [0, -0.3, 1.22], [0.45, 0.18, 0.12])
  for (const sx of [-1, 1]) part(head, geo.sphere, mat('#ff8fb0', { transparent: true, opacity: 0.75 }), [sx * 0.8, 0, 1.0], [0.3, 0.2, 0.12])
  const stalks = []
  for (const sx of [-1, 1]) {
    const g = new Group()
    g.position.set(sx * 0.45, 1.3, 0.1)
    g.rotation.z = -sx * 0.3
    head.add(g)
    part(g, geo.cylLo, skin, [0, 0.8, 0], [0.17, 1.6, 0.17])
    const e = googly(g, [0, 1.85, 0.1], 0.62)
    e.r = 0.62
    stalks.push({ g, sx, eyes: [e] })
  }
  const shell = new Group()
  shell.position.set(0, 3.4, -1.1)
  bodyG.add(shell)
  outline(part(shell, geo.sphere, mat('#ff63b4', { roughness: 0.25 }), [0, 0, 0], [2.7, 2.7, 2.4]), 0.04)
  const swirlC = ['#5fe0ff', '#fff05a', '#b66bff']
  for (const sx of [-1, 1]) {
    ;[[1.95, 1.85], [2.3, 1.25], [2.55, 0.68]].forEach(([x, r], i) => {
      part(shell, geo.torus, mat(swirlC[i], { roughness: 0.25 }), [sx * x, 0, 0], [r, r, 1.6], [0, Math.PI / 2, 0])
    })
    part(shell, geo.sphere, mat('#ffffff', { roughness: 0.2 }), [sx * 2.62, 0, 0], [0.3, 0.35, 0.35])
  }

  const st = tracker()
  const wetS = {}
  const v = new Vector3()
  const cur = new Vector3()
  const from = new Vector3()
  const tgt = new Vector3()
  let yaw = 0
  let trailEnd = 0
  let endX = 0

  return {
    root,
    update(s) {
      const fx = s.fx || opts.fx
      const t = tm(s)
      const dt = s.dt || 0
      const k = s.k
      tgt.copy(s.target)
      root.position.set(s.target.x, s.surface, s.target.z)
      const L = Math.max(4, s.length || 60)
      const dirZ = s.home.z > s.target.z ? -1 : 1
      const zs = -dirZ * L / 2
      const ze = dirZ * L / 2
      const hx = s.home.x - s.target.x
      const hz = s.home.z - s.target.z
      const hy = s.home.y - s.surface
      if (!st.init) {
        st.init = true
        cur.set(hx, hy - 6 * sc, hz)
        trailEnd = zs
      }
      if (step(st, s)) {
        from.copy(cur)
        if (s.phase === 'recover') {
          const sgn = s.target.x >= 0 ? 1 : -1
          endX = sgn * ((s.halfWidth ?? 30) + 12) - s.target.x
          emit(fx, 16, s.hit ? PS.heart : PS.steam, s.target.x + cur.x, s.surface + 7 * sc, s.target.z + cur.z, 2)
        }
      }
      let x = cur.x
      let y = cur.y
      let z = cur.z
      let tYaw = yaw
      let trailA = 1
      let glow = 0.6
      let droop = 0
      let wig = 0
      let moving = 0
      if (s.phase === 'tell') {
        const rise = easeOut(seg(k, 0, 0.12))
        const a = easeInOut(seg(k, 0.08, 0.3))
        const b = seg(k, 0.3, 1)
        y = lerp(hy - 6 * sc, hy, rise) * (1 - seg(k, 0.1, 0.3))
        if (b <= 0) {
          x = lerp(hx, 0, a)
          z = lerp(hz, zs, a)
          tYaw = yawTo(hx, hz, 0, zs)
          moving = a > 0 && a < 1 ? 1 : 0
        } else {
          x = 0
          z = lerp(zs, ze + dirZ * 4.5 * sc, b)
          tYaw = dirZ > 0 ? 0 : Math.PI
          moving = 1
        }
        trailEnd = b > 0 ? clampN(z - dirZ * 4.5 * sc, Math.min(zs, ze), Math.max(zs, ze)) : zs
      } else if (s.phase === 'attack' || s.phase === 'hold') {
        tYaw = yawTo(s.target.x + x, s.target.z + z, s.player.x, s.player.z)
        glow = 0.6 + 0.6 * Math.pow(Math.sin(t * 6), 2)
        trailEnd = ze
        if (chance(20, dt)) emit(fx, 2, PS.sparkle, s.target.x + (Math.random() - 0.5) * 6, s.surface + 0.3, s.target.z + (Math.random() - 0.5) * L, 1)
        wig = 0.3
      } else {
        trailEnd = ze
        trailA = 1 - seg(k, 0.05, 0.75)
        glow = 0.6 * trailA
        const m = easeIn(seg(k, 0.1, 0.85))
        x = lerp(from.x, endX, m)
        z = lerp(from.z, from.z + dirZ * 8, m)
        y = from.y - easeIn(seg(k, 0.78, 1)) * 6 * sc
        tYaw = yawTo(from.x, from.z, endX, from.z + dirZ * 8)
        moving = m > 0 && m < 1 ? 1 : 0
        if (s.hit) wig = 1 - k
        else droop = easeOut(seg(k, 0, 0.25))
      }
      // smooth turn
      let dy = tYaw - yaw
      dy = Math.atan2(Math.sin(dy), Math.cos(dy))
      yaw += dy * Math.min(1, (dt || 0.016) * 8)
      if (s.t === 0) yaw = tYaw
      cur.set(x, y, z)
      sn.position.copy(cur)
      sn.rotation.y = yaw
      bodyG.scale.set(1, 1 - 0.04 * Math.sin(t * 8) * moving, 1 + 0.06 * Math.sin(t * 8) * moving)
      shell.rotation.x = Math.sin(t * 2) * 0.05
      head.rotation.x = Math.sin(t * 3) * 0.05 + droop * 0.25
      for (const S of stalks) {
        S.g.rotation.z = -S.sx * (0.3 + Math.sin(t * 9 + S.sx) * 0.25 * wig)
        S.g.rotation.x = droop * 0.9
      }
      // trail strip (on the slime, from the start end to behind the snail)
      const len = Math.abs(trailEnd - zs)
      trail.visible = sheen.visible = len > 0.2 && trailA > 0.01
      if (trail.visible) {
        const zc = (trailEnd + zs) / 2
        trail.position.set(0, 0.07, zc)
        trail.scale.set(7, 0.14, len)
        sheen.position.set(Math.sin(t * 1.3) * 0.8, 0.16, zc)
        sheen.scale.set(2.2, 0.04, len * 0.96)
      }
      trailMat.opacity = 0.6 * trailA
      trailMat.emissiveIntensity = glow
      sheenMat.opacity = 0.35 * trailA * (0.6 + 0.4 * Math.sin(t * 4))
      if (moving && chance(14, dt)) emit(fx, 2, PS.drip, s.target.x + x, s.surface + 0.4, s.target.z + z, 3)
      wet(wetS, 'w', y < -3 * sc, fx, 24, s.target.x + x, s.surface + 0.3, s.target.z + z, 5 * sc)
      root.updateMatrixWorld(true)
      for (const S of stalks) lookEyes(S.eyes, S.g, s.player, t, S.sx > 0 ? 0.3 : 0.37, v)
    },
    grabPoint(out) {
      return out.copy(tgt)
    },
    dispose() {
      disposeAll([trailMat, sheenMat])
    },
  }
}

// =====================================================================
// 7. Clap Gorilla (wall with gap)
// =====================================================================
function gorilla(opts = {}) {
  const sc = (opts.scale ?? 1) * 1.25 // a size up: it towers over its own hands
  const root = new Group()
  root.name = 'gorilla'
  const fur = mat('#3d3550')
  const face = mat('#c9a99a')
  const dark = mat('#2a1820')
  const gor = new Group()
  gor.scale.setScalar(sc)
  root.add(gor)
  outline(part(gor, geo.sphere, fur, [0, 5, 0], [6.0, 6.5, 4.6]), 0.04)
  part(gor, geo.sphere, mat('#8a7690'), [0, 6.2, 3.3], [4.4, 4.2, 1.6])
  for (const sx of [-1, 1]) outline(part(gor, geo.sphere, fur, [sx * 6.2, 8.6, 0.4], [3.2, 3.2, 3.2]), 0.04)
  const head = new Group()
  head.position.set(0, 12.4, 1.4)
  gor.add(head)
  outline(part(head, geo.sphere, fur, [0, 0, 0], [3.6, 3.3, 3.3]), 0.04)
  part(head, geo.sphere, fur, [0, 1.0, 2.4], [3.5, 0.9, 1.3])
  part(head, geo.sphere, face, [0, -0.3, 2.0], [2.9, 2.4, 1.8])
  part(head, geo.sphere, face, [0, -1.4, 2.8], [2.3, 1.5, 1.6])
  const nostrils = []
  for (const sx of [-1, 1]) {
    nostrils.push(part(head, geo.sphere, dark, [sx * 0.45, -0.95, 4.3], [0.3, 0.2, 0.15]))
    part(head, geo.box, mat('#ffffff'), [sx * 0.4, -1.75, 4.35], [0.35, 0.35, 0.2])
    part(head, geo.sphere, face, [sx * 3.4, 0, 0], [0.9, 1.1, 0.6])
  }
  const mouth = part(head, geo.sphere, mat('#5a1428'), [0, -2.0, 4.05], [1.5, 0.5, 0.6])
  const eyes = eyePair(head, 1.2, 0.2, 2.8, 1.1)
  // hands: unit box space (x -0.5..0.5, y 0..1, z -0.5..0.5) scaled to the wall size
  const palmC = mat('#a58f9a')
  function makeHand(outer) {
    const g = new Group()
    root.add(g)
    outline(part(g, geo.box, fur, [0, 0.3, 0], [1, 0.6, 1]), 0.03)
    part(g, geo.box, palmC, [0, 0.32, 0.47], [0.86, 0.5, 0.1])
    for (let f = 0; f < 4; f++) part(g, geo.capsule, fur, [-0.36 + f * 0.24, 0.74, 0], [0.2, 0.26, 0.8])
    part(g, geo.capsule, fur, [outer * 0.52, 0.36, 0.15], [0.2, 0.2, 0.6], [0, 0, outer * 0.5])
    return g
  }
  const hands = [makeHand(-1), makeHand(1)]
  const arms = [outline(part(root, geo.cylLo, fur), 0.04), outline(part(root, geo.cylLo, fur), 0.04)]
  const shockMat = basic('#fff3c4', 0)
  const shock = new Mesh(geo.torus, shockMat)
  shock.visible = false
  root.add(shock)

  const st = tracker()
  const wetS = {}
  const v = new Vector3()
  const sh = new Vector3()
  const wr = new Vector3()
  const tmp = new Vector3()
  const tgt = new Vector3()
  // per-hand state at recover start
  const recIn = [0, 0]
  const snapIn = [0, 0]
  const recY = [0, 0]
  const curIn = [0, 0]
  const curY = [0, 0]
  let gorY = -26
  let gorRec = 0

  function clap(fx, s, gap, H, gc) {
    st.flags.clap = true
    for (let j = 0; j < 4; j++) {
      const yy = s.surface + (H * j) / 3
      emit(fx, 8, PS.dust, gap.x0, yy, s.target.z + 1, 2)
      emit(fx, 8, PS.dust, gap.x1, yy, s.target.z + 1, 2)
    }
    emit(fx, 30, PS.stars, gc, s.target.y + 1, s.target.z + 1, 3)
    emit(fx, 30, PS.splash, gc, s.surface + 0.5, s.target.z, 8)
  }

  return {
    root,
    update(s) {
      const fx = s.fx || opts.fx
      const t = tm(s)
      const dt = s.dt || 0
      const k = s.k
      const gap = s.gap || DEFAULT_GAP
      const hw = s.halfWidth ?? 30
      tgt.copy(s.target)
      root.position.set(0, s.surface, s.target.z)
      const H = Math.max(4, s.target.y + 4 - s.surface)
      const D = 3.5
      const gc = (gap.x0 + gap.x1) / 2
      const gx = clampN(gc, -8, 8)
      const widths = [gap.x0 + hw, hw - gap.x1]
      const changed = step(st, s)
      if (changed && (s.phase === 'hold' || s.phase === 'recover') && !st.flags.rec) {
        // the strike: if the slam was (nearly) done, finish it at the gap edges
        st.flags.rec = true
        const slammed = st.lastAtkK > 0.75
        for (let i = 0; i < 2; i++) {
          snapIn[i] = curIn[i]
          recIn[i] = slammed ? (i ? gap.x1 : gap.x0) : curIn[i]
          recY[i] = slammed ? 0 : curY[i]
        }
        gorRec = gorY
        if (slammed) clap(fx, s, gap, H, gc)
      }
      // hand pose: blend between a fist near the chest (f = 0) and the wall pose (f = 1)
      let f = 1
      let beat = 0
      let roar = 0
      let laugh = 0
      let huff = 0
      const inner = [0, 0]
      const yb = [0, 0]
      if (s.phase === 'tell') {
        gorY = lerp(-26, 0, easeOut(seg(k, 0, 0.35)))
        beat = seg(k, 0.35, 0.72) > 0 && k < 0.72 ? 1 : 0
        roar = beat
        f = easeInOut(seg(k, 0.72, 1))
        inner[0] = -hw - 3
        inner[1] = hw + 3
        yb[0] = yb[1] = 1.5
        if (beat && chance(10, dt)) emit(fx, 2, PS.dust, gx, s.surface + (gorY + 6) * sc, s.target.z - 25 + 4 * sc, 2 * sc)
      } else if (s.phase === 'attack') {
        gorY = 0
        const e = Math.pow(k, 2.2)
        inner[0] = lerp(-hw - 3, gap.x0, e)
        inner[1] = lerp(hw + 3, gap.x1, e)
        yb[0] = yb[1] = lerp(1.5, 0, k)
        roar = k
        if (k >= 0.999 && !st.flags.clap) {
          clap(fx, s, gap, H, gc)
          st.strikeT = s.t
        }
      } else {
        const post = s.t - st.strikeT
        const rk = s.phase === 'recover' ? k : 0
        const out = easeInOut(seg(rk, 0.25, 0.7))
        const sink = easeIn(seg(rk, 0.4, 1))
        const vib = Math.sin(post * 40) * 0.3 * Math.exp(-post * 5)
        const snap = clamp01(post / 0.06)
        inner[0] = lerp(lerp(snapIn[0], recIn[0], snap), -hw - 6, out) - vib
        inner[1] = lerp(lerp(snapIn[1], recIn[1], snap), hw + 6, out) + vib
        yb[0] = lerp(recY[0], -H - 6, sink)
        yb[1] = lerp(recY[1], -H - 6, sink)
        gorY = lerp(gorRec, -26, easeIn(seg(rk, 0.3, 1)))
        if (s.hit) laugh = Math.exp(-post * 0.8)
        else {
          huff = Math.exp(-post * 1.2)
          if (chance(10 * huff, dt)) {
            for (const n of nostrils) {
              n.getWorldPosition(v)
              emit(fx, 2, PS.steam, v.x, v.y, v.z + 0.5, 0.4)
            }
          }
        }
      }
      // shockwave ring at the clap
      const sp = s.t - st.strikeT
      shock.visible = st.flags.clap === true && sp < 0.6 && sp >= 0
      if (shock.visible) {
        shock.position.set(gc, s.target.y + 1 - s.surface, 1)
        shock.scale.set(1 + sp * 30, 1 + sp * 30, 0.6)
        shockMat.opacity = 0.9 * (1 - sp / 0.6)
      }
      gor.position.set(gx, gorY * sc, -25)
      gor.rotation.set(-0.08 + Math.sin(t * 1.5) * 0.02, 0, 0)
      head.rotation.set(Math.sin(t * 14) * 0.08 * laugh - 0.15 * roar, Math.sin(t * 20) * 0.3 * huff, 0)
      mouth.scale.set(1.5, 0.5 + 1.0 * Math.max(roar, laugh * Math.abs(Math.sin(t * 14))), 0.6)
      for (let i = 0; i < 2; i++) {
        const hand = hands[i]
        const sgn = i ? 1 : -1
        const w = widths[i]
        const wallSX = Math.max(0.3, w)
        const cxWall = inner[i] + sgn * wallSX / 2
        // fist pose next to the chest (chest-beats alternate)
        const fs = 3.2 * sc
        const punch = beat ? Math.max(0, Math.sin(t * 16 + i * Math.PI)) : 0
        const fx0 = gx + sgn * 2.6 * sc
        const fy0 = (gorY + 6.5) * sc - fs / 2
        const fz0 = -25 + (5.5 - punch * 1.4) * sc
        hand.position.set(lerp(fx0, cxWall, f), lerp(fy0, yb[i], f), lerp(fz0, 0, f))
        hand.scale.set(lerp(fs, wallSX, f), lerp(fs, H, f), lerp(fs, D, f))
        hand.visible = w > 0.3 || f < 0.95
        curIn[i] = inner[i]
        curY[i] = yb[i]
        // stretchy arm from the shoulder to the back of the hand
        sh.set(gx + sgn * 6.2 * sc, (gorY + 8.6) * sc, -25 + 0.4 * sc)
        wr.set(hand.position.x, hand.position.y + hand.scale.y * 0.4, hand.position.z - hand.scale.z * 0.45)
        stretch(arms[i], sh, wr, 1.5 * sc, tmp)
        arms[i].visible = hand.visible
      }
      wet(wetS, 'g', gorY * sc + 15.7 * sc < 0, fx, 40, s.target.x, s.surface + 0.3, s.target.z - 25, 8 * sc)
      root.updateMatrixWorld(true)
      lookEyes(eyes, head, s.player, t, 1.7, v)
    },
    grabPoint(out) {
      return out.copy(tgt)
    },
    dispose() {
      disposeAll([shockMat])
    },
  }
}

// =====================================================================
// 8. Pelican Scooper (carry)
// =====================================================================
function pelican(opts = {}) {
  const sc = opts.scale ?? 1
  const root = new Group()
  root.name = 'pelican'
  root.rotation.order = 'YXZ'
  root.scale.setScalar(sc)
  const white = mat('#f7f7fb', { roughness: 0.35 })
  const orange = mat('#ff9a1f')
  outline(part(root, geo.sphere, white, [0, 0, 0], [1.5, 1.4, 2.2]), 0.05)
  part(root, geo.sphere, mat('#e9eef5'), [0, -0.4, 0.3], [1.2, 1.0, 1.6])
  part(root, geo.cone4, mat('#dfe5ee'), [0, 0.2, -2.3], [0.9, 1.2, 0.35], [-Math.PI / 2, 0, 0])
  outline(part(root, geo.capsule, white, [0, 1.3, 1.6], [0.75, 1.2, 0.75], [0.5, 0, 0]), 0.05)
  const head = new Group()
  head.position.set(0, 2.4, 2.2)
  root.add(head)
  outline(part(head, geo.sphere, white, [0, 0, 0], [0.95, 0.9, 1.0]), 0.06)
  part(head, geo.cone, mat('#ffd85a'), [0, 0.95, -0.3], [0.2, 0.6, 0.2], [-0.5, 0, 0])
  const eyes = eyePair(head, 0.5, 0.25, 0.55, 0.5)
  const upper = new Group()
  upper.position.set(0, -0.05, 0.7)
  head.add(upper)
  outline(part(upper, geo.box, orange, [0, 0, 1.5], [0.55, 0.22, 3.0]), 0.05)
  part(upper, geo.sphere, mat('#ff6a1f'), [0, -0.1, 3.0], [0.28, 0.22, 0.3])
  const lower = new Group()
  lower.position.set(0, -0.25, 0.7)
  head.add(lower)
  part(lower, geo.box, orange, [0, 0, 1.5], [0.5, 0.12, 3.0])
  const pouch = outline(part(lower, geo.sphere, mat('#ff8a2a', { roughness: 0.25 }), [0, -0.35, 1.5], [0.6, 0.35, 1.4]), 0.04)
  const anchor = new Group()
  lower.add(anchor)
  const wings = []
  for (const sx of [-1, 1]) {
    const w = new Group()
    w.position.set(sx * 1.3, 0.6, 0.2)
    root.add(w)
    outline(part(w, geo.sphere, white, [sx * 2.4, 0, 0], [2.6, 0.25, 1.2]), 0.05)
    part(w, geo.sphere, mat('#2b2f3a'), [sx * 4.8, 0, -0.2], [1.4, 0.2, 0.9])
    wings.push({ w, sx })
  }
  const feet = new Group()
  feet.position.set(0, -1.2, -0.6)
  root.add(feet)
  for (const sx of [-1, 1]) {
    part(feet, geo.cylLo, orange, [sx * 0.5, -0.3, 0], [0.1, 0.7, 0.1])
    part(feet, geo.sphere, orange, [sx * 0.5, -0.7, 0.2], [0.35, 0.08, 0.45])
  }

  const st = tracker()
  const v = new Vector3()
  const off = new Vector3()
  const want = new Vector3()
  const start = new Vector3()
  const p0 = new Vector3()
  const strike = new Vector3()
  const recFrom = new Vector3()
  const anc = new Vector3()
  const tgt = new Vector3()
  let open = 0
  let fill = 0

  // place root so that the pouch anchor lands on `w` (current pose)
  function placeAnchor(w) {
    root.position.set(0, 0, 0)
    root.updateMatrixWorld(true)
    anchor.getWorldPosition(off)
    root.position.copy(w).sub(off)
  }

  return {
    root,
    update(s) {
      const fx = s.fx || opts.fx
      const t = tm(s)
      const dt = s.dt || 0
      const k = s.k
      tgt.copy(s.target)
      const side = s.side || 1
      if (!st.init) {
        st.init = true
        start.set(s.home.x + side * 70, s.home.y + 30, s.home.z - 80)
        root.position.copy(start)
      }
      if (step(st, s)) {
        p0.copy(anc)
        recFrom.copy(root.position)
        if (s.phase === 'hold' || (s.phase === 'recover' && !st.flags.struck)) {
          st.flags.struck = true
          strike.copy(s.hit ? s.target : anc)
          if (!s.hit) emit(fx, 12, PS.angry, anc.x, anc.y + 2 * sc, anc.z, 1)
          else emit(fx, 20, PS.splash, anc.x, anc.y, anc.z, 2)
        }
      }
      let yaw = 0
      let pitch = 0
      let roll = 0
      let flapF = 9
      let flapA = 0.7
      let sweep = 0
      let shakeH = 0
      let byAnchor = false
      if (s.phase === 'tell') {
        const a = easeOut(seg(k, 0, 0.75))
        root.position.lerpVectors(start, s.home, a)
        root.position.y += Math.sin(t * 3) * 0.6 * sc
        const toward = yawTo(start.x, start.z, s.home.x, s.home.z)
        const look = yawTo(s.home.x, s.home.z, s.player.x, s.player.z)
        const b = easeInOut(seg(k, 0.4, 0.9))
        yaw = lerp(toward, look, b)
        roll = -side * 0.4 * (1 - b)
        open = easeInOut(seg(k, 0.35, 0.9))
        fill = 0
      } else if (s.phase === 'attack') {
        const u = 0.3 * k + 0.7 * k * k
        const c = 1 - u
        // quadratic bezier dive from the pouch's position at attack start to the target
        const cx = lerp(p0.x, s.target.x, 0.5)
        const cy = s.target.y + (p0.y - s.target.y) * 0.2 - 2
        const cz = lerp(p0.z, s.target.z, 0.7)
        want.set(
          c * c * p0.x + 2 * c * u * cx + u * u * s.target.x,
          c * c * p0.y + 2 * c * u * cy + u * u * s.target.y,
          c * c * p0.z + 2 * c * u * cz + u * u * s.target.z,
        )
        yaw = clampN(yawTo(p0.x, p0.z, s.target.x, s.target.z), -1, 1)
        pitch = lerp(0.5, 0.05, k)
        flapA = 0.25
        sweep = 0.5 * (1 - k)
        open = 1
        byAnchor = true
      } else if (s.phase === 'hold' && s.hit) {
        want.set(strike.x, strike.y + Math.sin(t * 6) * 0.3, strike.z + (s.carry || 0) * easeInOut(k))
        pitch = -0.2
        flapF = 17
        flapA = 1
        open = 0.25
        fill = 1
        byAnchor = true
      } else if (s.hit) {
        // recover after a carry: drop the player, climb away
        const e = easeIn(k)
        root.position.set(recFrom.x - side * 25 * e, recFrom.y + 4 * easeOut(k) + 26 * e, recFrom.z + 35 * e)
        pitch = -0.4 * easeOut(k)
        roll = side * 0.4 * e
        flapF = 12
        open = k < 0.3 ? 1 : lerp(1, 0.1, seg(k, 0.3, 0.6))
        fill = Math.max(0, 1 - k * 5)
        yaw = lerp(0, -side * 0.6, e)
      } else {
        // missed: overshoot past the target, then flap away annoyed
        const post = s.t - st.strikeT
        const rk = s.phase === 'recover' ? k : 0
        const o = 1 - Math.exp(-post * 3)
        const e = easeIn(seg(rk, 0.25, 1))
        root.position.set(recFrom.x - side * 22 * e, recFrom.y - 3 * Math.sin(Math.PI * Math.min(1, o)) * (1 - e) + 28 * e, recFrom.z + 14 * o + 25 * e)
        pitch = lerp(0.3, -0.45, e)
        roll = side * 0.3 * e
        flapF = 14
        open = 0.05
        shakeH = Math.exp(-post * 1.2)
        if (chance(6 * shakeH, dt)) emit(fx, 2, PS.angry, root.position.x, root.position.y + 3 * sc, root.position.z + 2 * sc, 0.8)
      }
      // pose (before anchoring, so the anchor offset matches this frame)
      root.rotation.set(pitch, yaw, roll)
      head.rotation.set(0, Math.sin(t * 25) * 0.4 * shakeH, 0)
      upper.rotation.x = -open * 0.25
      lower.rotation.x = open * 0.85 * (1 - fill * 0.7)
      const pf = Math.max(open, fill)
      pouch.position.y = -0.35 - 0.9 * pf
      pouch.scale.set(0.6 + 0.6 * pf, 0.35 + 1.1 * pf, 1.4 + 0.2 * fill)
      anchor.position.set(0, pouch.position.y - pouch.scale.y * 0.55, 1.5)
      const flap = Math.sin(t * flapF)
      for (const W of wings) {
        W.w.rotation.set(0, W.sx * sweep, W.sx * flap * flapA)
      }
      feet.rotation.x = s.phase === 'attack' ? -0.9 : -0.3 + Math.sin(t * 4) * 0.1
      if (byAnchor) placeAnchor(want)
      root.updateMatrixWorld(true)
      anchor.getWorldPosition(anc)
      if (flapF > 15 && chance(8, dt)) emit(fx, 2, PS.sparkle, root.position.x, root.position.y + 1, root.position.z - 1, 6 * sc)
      lookEyes(eyes, head, s.player, t, 1.3, v)
    },
    grabPoint(out) {
      return out.copy(anc)
    },
  }
}

export const ANIMALS_B = { hippo, turtle, mole, bees, spider, snail, gorilla, pelican }
