import { ExtrudeGeometry, Group, Shape, TorusGeometry, Vector3 } from 'three'
import { clamp01, clear, easeIn, easeInOut, easeOut, easeOutBack, geo, googly, lerp, lit, mat, metal, outline, part, spring } from './kit.js'

// Bosses (King Slime Dragon, Mecha-Duck Mk II, Sky Whale), their shots
// (slimeball, missile, tailslam, geyser) and the friendly helpers (mushroom,
// seagull, fan). Models + choreography only: lane/hazards.js spawns, times and
// collides them (see the two contracts in animals.js). Every model faces +Z.

const TAU = Math.PI * 2
const PI = Math.PI

// ---- private shared bits ---------------------------------------------------------------------

// Five-point cartoon star (dizzy rings), built once.
const starGeo = (() => {
  const sh = new Shape()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.45 : 1
    const a = (i / 10) * TAU + PI / 2
    if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  sh.closePath()
  const g = new ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 1 })
  g.center()
  return g
})()

// Thin glowing ring (auras, swirls, inner fan ring), built once.
const thinRing = new TorusGeometry(1, 0.1, 8, 40)

const _e = new Vector3()
const _a = new Vector3()

const smooth = (dt, rate) => 1 - Math.exp(-dt * rate)
const clampAbs = (v, m) => (v > m ? m : v < -m ? -m : v)
function lerpAngle(a, b, f) {
  let d = (b - a) % TAU
  if (d > PI) d -= TAU
  if (d < -PI) d += TAU
  return a + d * f
}

// Particles: presets are reused objects (no per-frame allocations); emit() sets the origin.
function emit(fx, n, p, x, y, z, spread) {
  if (!fx || n <= 0) return
  p.x = x
  p.y = y
  p.z = z
  if (spread !== undefined) p.spread = spread
  fx.burst(n, p)
}
// Rate limiter: whole particles due this frame for `rate` per second.
function take(acc, i, rate, dt) {
  acc[i] += rate * dt
  const n = Math.floor(acc[i])
  acc[i] -= n
  return n
}

const GREENS = ['#5dff3a', '#2fd82a', '#b8ff6a']
const FX = {
  splash: { spread: 6, spreadY: 0.6, speed: 13, up: 1.5, gravity: -30, drag: 0.3, life: 1.1, size: 1.6, sizeEnd: 0.5, color: GREENS, additive: false },
  wake: { spread: 10, spreadY: 0.3, speed: 5, up: 1.2, gravity: -22, life: 0.7, size: 1.1, sizeEnd: 0.4, color: ['#7dff5a', '#d8ffc0', '#3fe23a'], additive: false },
  drip: { spread: 0.6, dir: [0, -1, 0], speed: 2, jitter: 1, gravity: -25, life: 0.8, size: 0.55, sizeEnd: 0.3, color: GREENS, additive: false },
  greenGlow: { spread: 1.2, speed: 3, life: 0.5, size: 0.9, sizeEnd: 0, color: ['#c8ff6a', '#7dff2a', '#ffffff'], shape: 'star' },
  gold: { spread: 2, speed: 10, up: 1.1, gravity: -6, drag: 0.6, life: 1.2, size: 1.4, sizeEnd: 0.2, color: ['#ffd23a', '#fff4a8', '#ffffff'], shape: 'star' },
  smoke: { spread: 0.8, speed: 1.5, lift: 1.5, drag: 1.2, life: 1.2, size: 1.1, sizeEnd: 3.2, color: ['#8a8f9e', '#b9bdc8', '#6b7080'], alpha: 0.7, additive: false },
  flame: { spread: 0.4, dir: [0, -1, 0], speed: 8, jitter: 2, life: 0.32, size: 1.3, sizeEnd: 0.2, color: ['#ff8a1f', '#ffd23a', '#fff0a0'] },
  boom: { spread: 1.5, speed: 16, drag: 2.2, life: 0.8, size: 2.4, sizeEnd: 0.4, color: ['#ff6a1f', '#ffb21f', '#fff0a0', '#ffffff'], shape: 'star' },
  boomSmoke: { spread: 2.5, speed: 6, up: 1, lift: 2, drag: 1.6, life: 1.6, size: 2.4, sizeEnd: 5, color: ['#4a4c58', '#7a7d8a', '#2e3038'], alpha: 0.75, additive: false },
  spray: { spread: 1, dir: [0, 1, 0], speed: 16, jitter: 7, gravity: -14, life: 1.4, size: 1.3, sizeEnd: 0.4, color: ['#7ff6ff', '#ffffff', '#b9a8ff'] },
  bubble: { spread: 5, spreadY: 0.2, speed: 1, lift: 2.5, life: 0.8, size: 0.7, sizeEnd: 0.1, color: ['#7ff6ff', '#e8ffff'] },
  sparkleUp: { spread: 3, dir: [0, 1, 0], speed: 22, jitter: 9, gravity: -8, drag: 0.4, life: 1.4, size: 1.3, sizeEnd: 0.2, color: ['#7ff6ff', '#ffffff', '#ffd23a'], shape: 'star' },
  sparkle: { spread: 3, speed: 2, lift: 1.5, life: 0.9, size: 0.8, sizeEnd: 0, color: ['#ffffff', '#7ff6ff', '#ffd23a'], shape: 'star' },
  wind: { spread: 5, spreadY: 5, dir: [0, 0, -1], speed: 32, jitter: 1, life: 0.45, size: 0.35, sizeEnd: 0.15, color: ['#e8ffff', '#7ff6ff'] },
  foam: { spread: 8, spreadY: 1, speed: 6, up: 1.4, gravity: -18, life: 0.9, size: 1.4, sizeEnd: 0.5, color: ['#eafff2', '#9dffcf', '#5dff9a'], additive: false },
  stars: { spread: 1.5, speed: 9, up: 1, gravity: -4, drag: 0.8, life: 1, size: 1.1, sizeEnd: 0.2, color: ['#ffd23a', '#ff8fb0', '#ffffff'], shape: 'star' },
}

// One-shot event bits per phase.
function makeGate() {
  return {
    phase: '',
    bits: 0,
    step(p) {
      if (p !== this.phase) {
        this.phase = p
        this.bits = 0
      }
    },
    once(bit) {
      if (this.bits & bit) return false
      this.bits |= bit
      return true
    },
  }
}

// Eyes: kit googly + our glowing variant; both carry the base radius for blinks.
function bigEye(parent, pos, r, o) {
  const e = googly(parent, pos, r, o)
  e.r = r
  return e
}
function glowEye(parent, pos, r, white, pupil) {
  const root = outline(part(parent, geo.sphere, lit(white, 0.9), pos, [r, r, r]), 0.08)
  const p = part(root, geo.sphere, mat(pupil, { roughness: 0.1 }), [0, 0, 0.78], [0.5, 0.5, 0.3])
  part(p, geo.sphere, mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.8 }), [0.35, 0.4, 0.7], [0.28, 0.28, 0.2])
  return { root, pupil: p, r }
}
const blinkK = (t, seed) => ((t * 0.29 + seed) % 1 < 0.04 ? 0.12 : 1)
// Pupils track a world point (one frame late, which is fine) + blinks.
function lookEyes(eyes, target, t, seed, amt = 0.34) {
  for (let i = 0; i < eyes.length; i++) {
    const e = eyes[i]
    e.root.worldToLocal(_e.copy(target))
    _e.normalize()
    e.pupil.position.set(_e.x * amt, _e.y * amt, 0.78)
    e.root.scale.set(e.r, e.r * blinkK(t, seed), e.r)
  }
}
function dizzyEyes(eyes, t) {
  for (let i = 0; i < eyes.length; i++) {
    const e = eyes[i]
    const a = t * 9 + i * PI
    e.pupil.position.set(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.78)
    e.root.scale.setScalar(e.r)
  }
}
function dizzyRing(parent, pos, radius, size) {
  const g = new Group()
  g.position.set(pos[0], pos[1], pos[2])
  g.visible = false
  parent.add(g)
  const m = lit('#ffe23a', 2)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU
    part(g, starGeo, m, [Math.cos(a) * radius, 0, Math.sin(a) * radius], size)
  }
  return g
}
function spinDizzy(g, t) {
  g.rotation.y = t * 3
  for (let i = 0; i < g.children.length; i++) {
    const c = g.children[i]
    c.rotation.y = -t * 3
    c.rotation.z = t * 5 + i
    c.position.y = Math.sin(t * 6 + i * 1.3) * 0.3
  }
}

// ======================================================================================
// BOSSES
// ======================================================================================

// 1. King Slime Dragon: swims in the slime beside the player, neck up, spits slime balls.
function kingDragon(opts = {}) {
  const S = opts.scale ?? 1
  const root = new Group()
  root.name = 'boss:kingDragon'
  const body = new Group()
  root.add(body)

  const SLIME = mat('#3fdc3a', { roughness: 0.16, emissive: '#0f6a12', emissiveIntensity: 0.3 })
  const SLIME_D = mat('#1f9e2c', { roughness: 0.3 })
  const BELLY = mat('#c4ff73', { roughness: 0.22 })
  const GOLD = metal('#ffc425', { roughness: 0.18, emissive: '#6a3c00', emissiveIntensity: 0.25 })
  const CREAM = mat('#fff4dc', { roughness: 0.3 })
  const DARK = mat('#2a0b14', { roughness: 0.5 })
  const DRIP = clear('#6dff3a', 0.85, { emissive: '#1f8a10', emissiveIntensity: 0.4 })

  // torso, half sunk in the slime, back spikes
  outline(part(body, geo.sphere, SLIME, [0, 0.4, -1], [6.4, 4.4, 8.6]), 0.035)
  part(body, geo.sphere, BELLY, [0, 0.6, 4.2], [4.3, 3.3, 3.4])
  for (let i = 0; i < 5; i++) {
    const z = -6.2 + i * 2.5
    const y = 0.4 + 4.4 * Math.sqrt(Math.max(0, 1 - ((z + 1) / 8.6) ** 2))
    outline(part(body, geo.cone, SLIME_D, [0, y + 0.6, z], [1.1 - i * 0.05, 2.4, 1.1], [-0.35, 0, 0]), 0.08)
  }
  // paddling front flippers with claws
  const flips = []
  for (const s of [-1, 1]) {
    const f = new Group()
    f.position.set(s * 5.6, 0.6, 3.2)
    body.add(f)
    outline(part(f, geo.sphere, SLIME, [s * 1.2, 0, 0.6], [2.2, 0.9, 3.0], [0, -s * 0.4, s * 0.25]), 0.06)
    for (let c = 0; c < 3; c++) part(f, geo.cone, CREAM, [s * 1.2 + (c - 1) * 0.9, -0.1, 3.4], [0.28, 0.8, 0.28], [PI / 2, 0, 0])
    flips.push(f)
  }
  // tail humps behind
  const tail = new Group()
  tail.position.set(0, 0.4, -8.6)
  body.add(tail)
  for (let i = 0; i < 3; i++) {
    const r = 2.6 - i * 0.7
    outline(part(tail, geo.sphere, SLIME, [0, 0.6 + i * 0.9, -1.5 - i * 2.4], [r, r * 0.85, r * 1.3]), 0.06)
  }
  outline(part(tail, geo.cone, SLIME_D, [0, 3.6, -8.4], [0.9, 2.6, 0.9], [-0.9, 0, 0]), 0.08)
  // neck (segments re-laid along a curve every frame)
  const neck = []
  for (let i = 0; i < 5; i++) {
    const r = 2.7 - i * 0.18
    neck.push(outline(part(body, geo.sphere, SLIME, [0, 3 + i * 2, 4], [r, r, r]), 0.05))
  }
  // head
  const head = new Group()
  head.rotation.order = 'YXZ'
  body.add(head)
  outline(part(head, geo.sphere, SLIME, [0, 0, 0], [3.3, 2.8, 3.4]), 0.05)
  outline(part(head, geo.sphere, SLIME, [0, -0.6, 2.7], [2.6, 1.5, 2.6]), 0.05)
  for (const s of [-1, 1]) part(head, geo.sphere, DARK, [s * 0.8, -0.05, 5.15], [0.32, 0.22, 0.2])
  part(head, geo.sphere, DARK, [0, -1.5, 2.6], [2.1, 0.7, 2.3]) // mouth cavity
  for (const [x, z] of [[-0.85, 4.4], [0.85, 4.4], [-1.7, 3.3], [1.7, 3.3]]) part(head, geo.cone, CREAM, [x, -1.9, z], [0.32, 1.0, 0.32], [PI, 0, 0])
  const jaw = new Group()
  jaw.position.set(0, -1.6, 0.6)
  head.add(jaw)
  outline(part(jaw, geo.sphere, SLIME, [0, -0.5, 2.0], [2.3, 0.85, 2.9]), 0.05)
  for (const s of [-1, 1]) part(jaw, geo.cone, CREAM, [s * 1.2, 0.35, 3.6], [0.26, 0.8, 0.26])
  const mouthGlow = part(head, geo.sphere, lit('#8dff2a', 3), [0, -1.7, 3.2], [1.4, 0.9, 1.4])
  mouthGlow.visible = false
  const muzzlePt = new Group()
  muzzlePt.position.set(0, -1.9, 5.6)
  head.add(muzzlePt)
  const eyes = [glowEye(head, [-1.6, 1.0, 2.2], 1.2, '#fff36a', '#c4001f'), glowEye(head, [1.6, 1.0, 2.2], 1.2, '#fff36a', '#c4001f')]
  for (const s of [-1, 1]) {
    outline(part(head, geo.box, DARK, [s * 1.55, 2.3, 2.75], [2.3, 0.5, 0.7], [0.25, 0, s * 0.38]), 0.08)
    outline(part(head, geo.cone, CREAM, [s * 2.0, 2.3, -1.0], [0.6, 2.8, 0.6], [-0.6, 0, -s * 0.55]), 0.08)
  }
  // crown
  const crown = new Group()
  crown.position.set(0, 2.55, 0.2)
  crown.rotation.z = 0.12
  head.add(crown)
  outline(part(crown, geo.cyl, GOLD, [0, 0, 0], [1.75, 1.0, 1.75]), 0.06)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU
    part(crown, geo.cone, GOLD, [Math.sin(a) * 1.45, 1.05, Math.cos(a) * 1.45], [0.42, 1.2, 0.42])
  }
  part(crown, geo.sphere, lit('#ff2d6f', 1.3), [0, 0.05, 1.72], [0.4, 0.4, 0.25])
  for (const s of [-1, 1]) part(crown, geo.sphere, lit('#35d8ff', 1.3), [s * 1.2, 0.05, 1.25], [0.28, 0.28, 0.2], [0, s * 0.7, 0])
  const dizzy = dizzyRing(head, [0, 4.8, 0], 3.2, 0.7)
  // hanging slime drips
  const drips = []
  for (const [x, y, z, onHead] of [[-1.4, -2.4, 4.0, 1], [1.0, -2.5, 3.2, 1], [-4.6, 1.6, 2.6, 0], [4.8, 1.2, 1.0, 0]]) {
    const d = part(onHead ? head : body, geo.sphere, DRIP, [x, y, z], [0.35, 0.5, 0.35])
    d.userData.y = y
    drips.push(d)
  }

  const st = { x: 0, oz: -25, init: false, rear: 0, jaw: 0.12, glow: 0, droop: 0 }
  const gate = makeGate()
  const acc = [0, 0, 0, 0]
  const mp = new Vector3()

  function update(b) {
    const dt = b.dt || 0
    const t = b.t || 0
    const k = clamp01(b.k || 0)
    const fx = b.fx || opts.fx
    const pl = b.player
    const side = b.side || 1
    const surf = b.surface ?? -2.2
    const ph = b.phase
    gate.step(ph)
    if (!st.init) {
      st.init = true
      st.x = side * 18
    }
    let tx = side * 18
    let toz = -25
    let rate = 3
    let y = surf + Math.sin(t * 1.3) * 0.5
    let rearT = 0
    let jawT = 0.12 + 0.06 * Math.sin(t * 2.2)
    let glowT = 0
    let droopT = 0
    if (ph === 'intro') {
      y = surf - 19 * (1 - easeOutBack(k, 1.2))
      if (k > 0.65) jawT = 0.12 + 0.75 * Math.sin(PI * clamp01((k - 0.65) / 0.35))
    } else if (ph === 'windup') {
      rearT = k < 0.75 ? easeInOut(k / 0.75) : 1 - 1.7 * easeOut((k - 0.75) / 0.25)
      jawT = 0.15 + 0.75 * easeOut(Math.min(1, k / 0.6))
      glowT = k
    } else if (ph === 'outro') {
      if (b.escaped) {
        y = surf - 22 * easeIn(k)
        toz = 18
        rate = 1.2
        droopT = 1
        jawT = 0.45
      } else {
        y = surf - 22 * easeIn(clamp01(k * 1.25))
        toz = -70
        rate = 1.2
      }
    }
    const f = smooth(dt, rate)
    st.x += (tx - st.x) * f
    st.oz += (toz - st.oz) * f
    st.rear += (rearT - st.rear) * smooth(dt, 16)
    st.jaw += (jawT - st.jaw) * smooth(dt, 14)
    st.glow += (glowT - st.glow) * smooth(dt, 12)
    st.droop += (droopT - st.droop) * smooth(dt, 3)
    root.position.set(st.x, y, pl.z + st.oz)
    root.scale.setScalar(S)
    const dx = pl.x - root.position.x
    const dz = pl.z - root.position.z
    const ang = Math.atan2(dx, dz)
    root.rotation.y = ang * 0.5
    body.rotation.z = Math.sin(t * 0.9) * 0.03 + st.droop * 0.15

    // head on a swaying neck, looking at the player
    const hx = Math.sin(t * 0.9) * 0.9
    const hy = 12.5 + Math.sin(t * 1.7) * 0.45 + st.rear * 2.2 - st.droop * 4
    const hz = 5.5 - st.rear * 4 + st.droop * 1.5
    head.position.set(hx, hy, hz)
    const pitch = Math.atan2(root.position.y + hy * S - (pl.y + 1), Math.max(4, Math.sqrt(dx * dx + dz * dz)))
    head.rotation.y = clampAbs(ang - root.rotation.y, 1) * 0.9
    head.rotation.x = pitch * 0.8 - st.rear * 0.45 + st.droop * 0.7
    head.rotation.z = st.droop * Math.sin(t * 3) * 0.3 + Math.sin(t * 0.8) * 0.05
    const ex = hx * 0.9
    const ey = hy - 1.8
    const ez = hz - 1.6
    const cy = hy * 0.62
    const cz = 6 - st.rear * 1.5
    for (let i = 0; i < 5; i++) {
      const u = (i + 1) / 6
      const a = (1 - u) * (1 - u)
      const c2 = 2 * u * (1 - u)
      const c = u * u
      neck[i].position.set(c * ex, a * 3 + c2 * cy + c * ey, a * 3.8 + c2 * cz + c * ez)
    }
    jaw.rotation.x = st.jaw
    mouthGlow.visible = st.glow > 0.03
    mouthGlow.scale.set(1.4, 0.9, 1.4).multiplyScalar((0.3 + 1.2 * st.glow) * (0.9 + Math.random() * 0.2))
    if (ph === 'outro' && b.escaped) dizzyEyes(eyes, t)
    else lookEyes(eyes, pl, t, 0.2)
    dizzy.visible = ph === 'outro' && b.escaped
    if (dizzy.visible) spinDizzy(dizzy, t)
    for (let i = 0; i < 2; i++) flips[i].rotation.x = Math.sin(t * 2.4 + i * PI) * 0.35
    tail.rotation.y = Math.sin(t * 1.4) * 0.35
    tail.rotation.x = Math.sin(t * 1.1) * 0.08
    for (let i = 0; i < drips.length; i++) {
      const d = drips[i]
      const p = (t * 0.5 + i * 0.37) % 1
      if (p < 0.7) {
        const q = p / 0.7
        d.position.y = d.userData.y - 0.4 * q
        d.scale.set(0.35, 0.3 + 0.6 * q, 0.35)
      } else {
        const q = (p - 0.7) / 0.3
        d.position.y = d.userData.y - 0.4 - 4 * q * q
        d.scale.set(0.35 * (1 - q), 0.9 * (1 - q) + 0.01, 0.35 * (1 - q))
      }
    }

    // particles
    const X = root.position.x
    const Z = root.position.z
    if (ph === 'intro') {
      if (gate.once(1)) emit(fx, 40, FX.splash, X, surf, Z, 14 * S)
      if (k < 0.7) emit(fx, take(acc, 0, 45, dt), FX.wake, X, surf + 0.3, Z, 16 * S)
      if (k > 0.45 && gate.once(2)) {
        emit(fx, 30, FX.splash, X, surf + 1, Z + 4 * S, 10 * S)
        muzzlePt.getWorldPosition(mp)
        emit(fx, 30, FX.gold, mp.x, mp.y + 4 * S, mp.z, 3 * S)
      }
      if (k > 0.8 && gate.once(4)) {
        muzzlePt.getWorldPosition(mp)
        emit(fx, 24, FX.greenGlow, mp.x, mp.y, mp.z, 2 * S)
      }
    } else if (ph === 'fight' || ph === 'windup') {
      emit(fx, take(acc, 0, 9, dt), FX.wake, X, surf + 0.3, Z, 14 * S)
      if (take(acc, 1, 2.5, dt)) {
        muzzlePt.getWorldPosition(mp)
        emit(fx, 1, FX.drip, mp.x, mp.y - 0.5, mp.z, 1.5)
      }
      if (ph === 'windup') {
        muzzlePt.getWorldPosition(mp)
        emit(fx, take(acc, 2, 10 + 40 * k, dt), FX.greenGlow, mp.x, mp.y, mp.z, 3 * S)
        if (k > 0.96 && gate.once(1)) emit(fx, 18, FX.splash, mp.x, mp.y, mp.z, 1.5 * S)
      }
    } else if (ph === 'outro') {
      if (b.escaped && gate.once(1)) {
        muzzlePt.getWorldPosition(mp)
        emit(fx, 30, FX.gold, mp.x, mp.y + 3 * S, mp.z, 4 * S)
      }
      if (k > 0.35 && gate.once(2)) emit(fx, 45, FX.splash, X, surf, Z, 16 * S)
      emit(fx, take(acc, 0, 20, dt), FX.wake, X, surf + 0.3, Z, 14 * S)
    }
  }

  return {
    root,
    update,
    muzzle: (out) => muzzlePt.getWorldPosition(out),
    dispose() {},
  }
}

// 2. Mecha-Duck Mk II: chrome duck with a jet pack, flying beside the player, fires missiles.
function mechaDuck(opts = {}) {
  const S = opts.scale ?? 1
  const root = new Group()
  root.name = 'boss:mechaDuck'
  const body = new Group()
  body.rotation.order = 'YXZ'
  root.add(body)

  const CHROME = metal('#d9e2ee')
  const STEEL = metal('#7d8aa0')
  const DARKM = metal('#2b3140', { roughness: 0.4 })
  const YEL = metal('#ffb21f', { roughness: 0.3, metalness: 0.4 })
  const CYAN = lit('#38f4ff', 2)
  const RED = lit('#ff2a2a', 2.4)
  const VISOR = clear('#16233d', 0.88, { metalness: 0.6, roughness: 0.08 })
  const FLAME = lit('#ff8a1f', 2.6)
  const FLAME2 = lit('#fff0a0', 3)
  const MRED = mat('#ff3030', { roughness: 0.3 })

  const lights = []
  outline(part(body, geo.sphere, CHROME, [0, 0, 0], [4.2, 4.4, 4.6]), 0.035)
  part(body, geo.sphere, STEEL, [0, -0.3, 3.9], [3.2, 3.4, 1.1])
  for (const [x, y, z] of [[-1, 0.7, 4.85], [0, -0.3, 5.0], [1, 0.7, 4.85]]) lights.push(part(body, geo.sphere, CYAN, [x, y, z], [0.45, 0.45, 0.3]))
  // head
  const head = new Group()
  head.position.set(0, 5.6, 1.2)
  head.rotation.order = 'YXZ'
  body.add(head)
  outline(part(head, geo.sphere, CHROME, [0, 0, 0], [3.0, 2.8, 3.0]), 0.05)
  part(head, geo.sphere, VISOR, [0, 0.55, 0.9], [3.05, 1.05, 2.35])
  outline(part(head, geo.box, STEEL, [0, 2.6, -0.2], [0.6, 1.0, 3.2]), 0.08)
  part(head, geo.cyl, STEEL, [0.9, 3.2, -0.6], [0.12, 1.8, 0.12])
  lights.push(part(head, geo.sphere, CYAN, [0.9, 4.2, -0.6], [0.45, 0.45, 0.45]))
  const eyes = [bigEye(head, [-1.15, 0.8, 2.7], 1.15), bigEye(head, [1.15, 0.8, 2.7], 1.15)]
  for (const s of [-1, 1]) outline(part(head, geo.box, DARKM, [s * 1.15, 2.05, 3.0], [1.7, 0.4, 0.6], [0.2, 0, s * 0.3]), 0.08)
  outline(part(head, geo.sphere, YEL, [0, -0.7, 3.0], [1.9, 0.65, 2.0]), 0.06)
  const beakLow = new Group()
  beakLow.position.set(0, -1.0, 1.6)
  head.add(beakLow)
  outline(part(beakLow, geo.sphere, YEL, [0, -0.25, 1.1], [1.6, 0.45, 1.6]), 0.06)
  // armoured wings
  const wings = []
  for (const s of [-1, 1]) {
    const w = new Group()
    w.position.set(s * 3.9, 0.4, -0.6)
    body.add(w)
    outline(part(w, geo.box, CHROME, [s * 1.2, 0, 0], [2.6, 0.45, 4.6]), 0.06)
    part(w, geo.box, STEEL, [s * 2.4, -0.15, -1.0], [1.8, 0.35, 3.4])
    w.userData.s = s
    wings.push(w)
  }
  for (let i = 0; i < 3; i++) part(body, geo.box, CHROME, [(i - 1) * 0.9, 1.4 + (i === 1 ? 0.5 : 0), -4.6], [0.6, 2.2, 1.6], [-0.7, 0, (i - 1) * 0.35])
  // rocket legs
  const flames = []
  for (const s of [-1, 1]) {
    part(body, geo.cyl, CHROME, [s * 1.8, -5.0, 0.3], [0.75, 2.4, 0.75])
    outline(part(body, geo.cyl, STEEL, [s * 1.8, -6.6, 0.3], [1.15, 1.6, 1.15]), 0.06)
    part(body, geo.sphere, YEL, [s * 1.8, -7.2, 1.5], [1.1, 0.35, 1.6])
    part(body, geo.cone, DARKM, [s * 1.8, -7.7, 0.3], [0.9, 1.0, 0.9])
    flames.push(part(body, geo.cone, FLAME, [s * 1.8, -9.2, 0.3], [0.75, 2.2, 0.75], [PI, 0, 0]))
    flames.push(part(body, geo.cone, FLAME2, [s * 1.8, -8.8, 0.3], [0.4, 1.4, 0.4], [PI, 0, 0]))
  }
  // jet pack
  const jets = []
  for (const s of [-1, 1]) {
    outline(part(body, geo.cyl, STEEL, [s * 1.4, 0.6, -4.6], [1.0, 4.4, 1.0]), 0.06)
    part(body, geo.sphere, MRED, [s * 1.4, 2.8, -4.6], [1.0, 0.6, 1.0])
    part(body, geo.cone, DARKM, [s * 1.4, -2.1, -4.6], [1.0, 1.1, 1.0])
    const fl = part(body, geo.cone, FLAME, [s * 1.4, -4.3, -4.6], [0.85, 3.2, 0.85], [PI, 0, 0])
    flames.push(fl, part(body, geo.cone, FLAME2, [s * 1.4, -3.7, -4.6], [0.45, 2.0, 0.45], [PI, 0, 0]))
    jets.push(fl)
  }
  for (const f of flames) f.userData.sy = f.scale.y
  // shoulder missile pods with opening lids
  const pods = []
  for (const s of [-1, 1]) {
    const p = new Group()
    p.position.set(s * 4.3, 3.1, 0.4)
    p.scale.setScalar(1.3)
    body.add(p)
    outline(part(p, geo.box, STEEL, [0, 0, 0], [2.2, 1.8, 3.0]), 0.06)
    part(p, geo.box, MRED, [0, 0.35, 0], [2.25, 0.3, 3.05])
    const tips = new Group()
    p.add(tips)
    for (const dx of [-0.6, 0, 0.6]) part(tips, geo.cone, MRED, [dx, -0.2, 0.9], [0.35, 0.9, 0.35], [PI / 2, 0, 0])
    lights.push(part(p, geo.sphere, CYAN, [0, 1.0, 0.8], [0.3, 0.3, 0.3]))
    const lid = new Group()
    lid.position.set(0, 0.9, 1.55)
    p.add(lid)
    part(lid, geo.box, DARKM, [0, -0.92, 0], [2.3, 1.85, 0.25])
    const mz = new Group()
    mz.position.set(0, -0.2, 2.4)
    p.add(mz)
    pods.push({ lid, tips, mz })
  }
  const dizzy = dizzyRing(head, [0, 4.2, 0], 3, 0.6)

  const st = { x: 0, oy: 6, oz: -20, init: false, open: 0, pod: 0, spin: 0, recoil: 0 }
  const gate = makeGate()
  const acc = [0, 0, 0, 0]
  const jp = new Vector3()

  function update(b) {
    const dt = b.dt || 0
    const t = b.t || 0
    const k = clamp01(b.k || 0)
    const fx = b.fx || opts.fx
    const pl = b.player
    const side = b.side || 1
    const surf = b.surface ?? -2.2
    const ph = b.phase
    if (ph === 'windup' && gate.phase !== 'windup') st.pod ^= 1
    gate.step(ph)
    let tx = side * 16
    let toy = 6
    let toz = -20
    let rate = 3
    let openT = 0
    let alarm = false
    let flameK = 1
    if (!st.init) {
      st.init = true
      st.x = side * 55
      st.oy = 40
      st.oz = -120
    }
    if (ph === 'intro') {
      const p = easeOut(k)
      st.x = lerp(side * 55, side * 16, p)
      st.oy = lerp(40, 6, p)
      st.oz = lerp(-120, -20, p)
      tx = st.x
      toy = st.oy
      toz = st.oz
      flameK = 1.6 - 0.6 * k
    } else if (ph === 'windup') {
      openT = easeOutBack(Math.min(1, k / 0.4))
      alarm = true
      st.recoil = k > 0.9 ? (k - 0.9) * 10 : st.recoil
    } else if (ph === 'outro') {
      if (b.escaped) {
        toy = 6 - 40 * easeIn(k)
        toz = 18
        rate = 1.5
        st.spin += dt * (2 + 6 * k)
        flameK = 0.4
      } else {
        toy = 6 + 45 * easeIn(k)
        toz = -20 - 110 * easeIn(k)
        rate = 4
        flameK = 1.8
      }
    }
    const f = smooth(dt, rate)
    st.x += (tx - st.x) * f
    st.oy += (toy - st.oy) * f
    st.oz += (toz - st.oz) * f
    st.open += (openT - st.open) * smooth(dt, 14)
    st.recoil += (0 - st.recoil) * smooth(dt, 6)
    let y = pl.y + st.oy + Math.sin(t * 2) * 0.8
    if (ph === 'outro' && b.escaped && y < surf - 6) y = surf - 6
    root.position.set(st.x, y, pl.z + st.oz - st.recoil * 1.5)
    root.scale.setScalar(S)
    const dx = pl.x - root.position.x
    const dz = pl.z - root.position.z
    const ang = Math.atan2(dx, dz)
    root.rotation.y = ang * 0.7 + st.spin
    body.rotation.x = 0.1 + Math.sin(t * 1.6) * 0.05 - st.recoil * 0.2
    body.rotation.z = Math.sin(t * 1.3) * 0.08 + (ph === 'outro' && b.escaped ? 0.5 * k : 0)
    head.rotation.y = clampAbs(ang - root.rotation.y, 0.8) * 0.6 + Math.sin(t * 0.7) * 0.1
    head.rotation.x = Math.atan2(root.position.y + 5.6 * S - (pl.y + 1), Math.max(4, Math.sqrt(dx * dx + dz * dz))) * 0.6
    beakLow.rotation.x = 0.1 + (alarm ? 0.4 * Math.abs(Math.sin(t * 18)) : 0.05 * Math.sin(t * 3))
    for (const w of wings) w.rotation.z = w.userData.s * (0.15 + Math.sin(t * 4) * 0.2)
    for (let i = 0; i < flames.length; i++) {
      const fl = flames[i]
      fl.scale.y = fl.userData.sy * flameK * (0.8 + Math.random() * 0.4)
    }
    for (let i = 0; i < 2; i++) {
      const p = pods[i]
      p.lid.rotation.x = -1.9 * st.open
      p.tips.position.z = 0.8 * st.open * (i === st.pod ? 1 : 0.5)
    }
    const blinkRed = alarm && Math.sin(t * 26) > 0
    for (let i = 0; i < lights.length; i++) lights[i].material = blinkRed ? RED : CYAN
    if (ph === 'outro' && b.escaped) dizzyEyes(eyes, t)
    else lookEyes(eyes, pl, t, 0.55)
    dizzy.visible = ph === 'outro' && b.escaped
    if (dizzy.visible) spinDizzy(dizzy, t)

    // particles: jet flames + smoke, alarm sparks, crash
    const jetRate = ph === 'intro' ? 40 : ph === 'outro' ? 30 : 14
    const nf = take(acc, 0, jetRate, dt)
    const ns = take(acc, 1, jetRate * 0.6, dt)
    if (nf + ns > 0) {
      for (let i = 0; i < 2; i++) {
        jets[i].getWorldPosition(jp)
        emit(fx, nf, FX.flame, jp.x, jp.y - 1.5 * S, jp.z, 0.6 * S)
        emit(fx, ns, FX.smoke, jp.x, jp.y - 2.5 * S, jp.z, 0.8 * S)
      }
    }
    if (ph === 'intro' && k > 0.85 && gate.once(1)) emit(fx, 30, FX.sparkle, root.position.x, root.position.y + 4 * S, root.position.z, 6 * S)
    if (ph === 'windup') {
      pods[st.pod].mz.getWorldPosition(jp)
      emit(fx, take(acc, 2, 25, dt), FX.flame, jp.x, jp.y, jp.z, 0.8 * S)
      if (k > 0.96 && gate.once(1)) emit(fx, 14, FX.smoke, jp.x, jp.y, jp.z, 1.2 * S)
    }
    if (ph === 'outro' && b.escaped) {
      if (gate.once(1)) emit(fx, 30, FX.boom, root.position.x, root.position.y + 3 * S, root.position.z, 4 * S)
      emit(fx, take(acc, 2, 25, dt), FX.boomSmoke, root.position.x, root.position.y + 2 * S, root.position.z, 3 * S)
      if (root.position.y < surf + 2 && gate.once(2)) emit(fx, 45, FX.splash, root.position.x, surf, root.position.z, 10 * S)
    }
  }

  return {
    root,
    update,
    muzzle: (out) => pods[st.pod].mz.getWorldPosition(out),
    dispose() {},
  }
}

// 3. Sky Whale: a huge galaxy whale floating high ahead, tail slams + geysers.
function skyWhale(opts = {}) {
  const S = opts.scale ?? 1
  const root = new Group()
  root.name = 'boss:skyWhale'
  const body = new Group()
  body.rotation.order = 'YXZ'
  root.add(body)

  const BLUE = mat('#1f3fa8', { roughness: 0.25, emissive: '#0a1450', emissiveIntensity: 0.35 })
  const BELLY = mat('#8fd0ff', { roughness: 0.3 })
  const FIN = mat('#5ef2ff', { emissive: '#38d8ff', emissiveIntensity: 1.3, transparent: true, opacity: 0.85, roughness: 0.15 })
  const DARK = mat('#0b1030')
  const STAR = lit('#fff6c8', 2)
  const STAR2 = lit('#ffc8ff', 2)

  outline(part(body, geo.sphere, BLUE, [0, 0, 0], [7.5, 6.5, 13]), 0.03)
  part(body, geo.sphere, BELLY, [0, -2.4, 1.5], [6.2, 4.4, 11])
  part(body, geo.sphere, DARK, [0, -1.7, 12.35], [3.4, 0.38, 0.6])
  for (const s of [-1, 1]) {
    part(body, geo.sphere, DARK, [s * 3.3, -1.25, 11.9], [0.9, 0.35, 0.5], [0, 0, -s * 0.5])
    part(body, geo.sphere, clear('#ff8fc8', 0.7), [s * 4.9, -0.9, 10.2], [1.2, 0.7, 0.5], [0, s * 0.5, 0])
  }
  const eyes = [bigEye(body, [-4.3, 1.6, 10.2], 1.9), bigEye(body, [4.3, 1.6, 10.2], 1.9)]
  eyes[0].root.rotation.y = -0.45
  eyes[1].root.rotation.y = 0.45
  // star freckles on the back
  for (let i = 0; i < 16; i++) {
    const yN = 0.15 + (0.8 * (i + 0.5)) / 16
    const rN = Math.sqrt(1 - yN * yN)
    const a = i * 2.39996
    part(body, geo.sphereLo, i % 3 ? STAR : STAR2, [7.5 * rN * Math.sin(a), 6.5 * yN, 13 * rN * Math.cos(a)], 0.3 + (i % 4) * 0.08)
  }
  // glowing pectoral fins
  const fins = []
  for (const s of [-1, 1]) {
    const g = new Group()
    g.position.set(s * 6.6, -2.4, 4)
    body.add(g)
    outline(part(g, geo.sphere, FIN, [s * 3.2, -0.6, 0], [4.5, 0.5, 2.4], [0, s * 0.3, -s * 0.35]), 0.05)
    g.userData.s = s
    fins.push(g)
  }
  const blowhole = part(body, geo.torus, DARK, [0, 5.75, 6.5], [0.9, 0.9, 0.9], [PI / 2, 0, 0])
  const blowMark = new Group()
  blowMark.position.set(0, 6.4, 6.5)
  body.add(blowMark)
  outline(part(body, geo.cone, BLUE, [0, 6.6, -4], [1.4, 3, 0.5], [-0.5, 0, 0]), 0.06)
  // tail
  const tail = new Group()
  tail.position.set(0, 0.5, -11)
  body.add(tail)
  outline(part(tail, geo.sphere, BLUE, [0, 0, -3], [3.6, 3.2, 5]), 0.04)
  outline(part(tail, geo.sphere, BLUE, [0, 0.2, -7], [2.2, 2, 4]), 0.05)
  const flukes = new Group()
  flukes.position.set(0, 0.4, -10.5)
  tail.add(flukes)
  for (const s of [-1, 1]) {
    const fl = outline(part(flukes, geo.sphere, BLUE, [s * 4.2, 0, -1], [5.5, 0.6, 2.6], [0, s * 0.5, 0]), 0.05)
    part(fl, geo.sphere, FIN, [0, 0, -0.12], [1.05, 0.7, 1.1])
  }
  const dizzy = dizzyRing(body, [0, 9, 8], 4, 0.9)
  blowhole.castShadow = false

  const st = { x: 0, y: 0, oz: -70, init: false, raise: 0, puff: 0 }
  const gate = makeGate()
  const acc = [0, 0, 0, 0]
  const bp = new Vector3()

  function update(b) {
    const dt = b.dt || 0
    const t = b.t || 0
    const k = clamp01(b.k || 0)
    const fx = b.fx || opts.fx
    const pl = b.player
    const surf = b.surface ?? -2.2
    const ph = b.phase
    gate.step(ph)
    let toy = pl.y + 22
    let toz = -70
    let rate = 1.5
    let raiseT = 0
    let beat = 1.1
    let roll = 0
    if (!st.init) {
      st.init = true
      st.x = 0
      st.y = pl.y + 80
      st.oz = -140
    }
    if (ph === 'intro') {
      const p = easeOut(k)
      st.y = lerp(pl.y + 80, pl.y + 22, p)
      st.oz = lerp(-140, -70, p)
      toy = st.y
      toz = st.oz
    } else if (ph === 'windup') {
      raiseT = easeOut(k)
    } else if (ph === 'outro') {
      if (b.escaped) {
        toy = Math.max(surf - 8, lerp(pl.y + 22, surf - 10, easeIn(k)))
        toz = 10
        rate = 1.2
        roll = 0.9 * easeInOut(k)
        beat = 0.5
      } else {
        toy = pl.y + 22 + 60 * easeIn(k)
        toz = -70 - 150 * easeIn(k)
        rate = 2
        beat = 2.4
      }
    }
    const f = smooth(dt, rate)
    st.x += (0 - st.x) * f
    st.y += (toy - st.y) * f
    st.oz += (toz - st.oz) * f
    st.raise += (raiseT - st.raise) * smooth(dt, 10)
    root.position.set(st.x, st.y + Math.sin(t * 0.8) * 1.2, pl.z + st.oz)
    root.scale.setScalar(S * 1.3)
    const dx = pl.x - root.position.x
    const dz = pl.z - root.position.z
    root.rotation.y = Math.atan2(dx, dz) * 0.4
    body.rotation.x = Math.sin(t * 0.7) * 0.06 + st.raise * 0.18 + 0.12
    body.rotation.z = Math.sin(t * 0.5) * 0.05 + roll
    const bs = 1 + 0.03 * Math.sin(t * 1.4) + 0.05 * st.raise
    body.scale.set(bs, bs, 1)
    tail.rotation.x = Math.sin(t * beat) * 0.25 + st.raise * 0.75
    flukes.rotation.x = Math.sin(t * beat - 0.8) * 0.35 + st.raise * 0.4
    for (const g of fins) g.rotation.z = g.userData.s * Math.sin(t * 1.6) * 0.3
    if (ph === 'outro' && b.escaped) dizzyEyes(eyes, t)
    else lookEyes(eyes, pl, t, 0.8)
    dizzy.visible = ph === 'outro' && b.escaped
    if (dizzy.visible) spinDizzy(dizzy, t)

    // particles: blowhole spray, fin sparkles
    blowMark.getWorldPosition(bp)
    const X = root.position.x
    const Y = root.position.y
    const Z = root.position.z
    if (ph === 'intro') {
      if (gate.once(1)) emit(fx, 50, FX.gold, X, Y, Z, 20 * S)
      emit(fx, take(acc, 0, 30, dt), FX.sparkle, X, Y, Z, 20 * S)
      if (k > 0.6 && gate.once(2)) emit(fx, 40, FX.spray, bp.x, bp.y, bp.z, 1.5 * S)
    } else if (ph === 'fight') {
      emit(fx, take(acc, 0, 6, dt), FX.sparkle, X, Y - 3 * S, Z, 16 * S)
      // a spout every ~3 s
      if ((t % 3.2) < 0.45) emit(fx, take(acc, 1, 40, dt), FX.spray, bp.x, bp.y, bp.z, 1 * S)
    } else if (ph === 'windup') {
      emit(fx, take(acc, 1, 15 + 30 * k, dt), FX.spray, bp.x, bp.y, bp.z, 0.8 * S)
      if (k > 0.9 && gate.once(1)) emit(fx, 30, FX.spray, bp.x, bp.y, bp.z, 2 * S)
    } else if (ph === 'outro') {
      if (b.escaped) {
        if (gate.once(1)) emit(fx, 30, FX.gold, bp.x, bp.y + 3 * S, bp.z, 6 * S)
        if (Y < surf + 6 && gate.once(2)) emit(fx, 60, FX.splash, X, surf, Z, 22 * S)
      } else emit(fx, take(acc, 0, 20, dt), FX.sparkle, X, Y, Z, 18 * S)
    }
  }

  return {
    root,
    update,
    muzzle: (out) => blowMark.getWorldPosition(out),
    dispose() {},
  }
}

// ======================================================================================
// ENCOUNTERS (shots + helpers)
// ======================================================================================

// 4. Slime ball spat by the King Slime Dragon: high arc from the mouth, falls onto the target.
function slimeball(opts = {}) {
  const S = opts.scale ?? 1
  const root = new Group()
  root.name = 'enc:slimeball'
  const ball = new Group()
  root.add(ball)
  const GOO = mat('#59ff3a', { roughness: 0.08, emissive: '#1c9a12', emissiveIntensity: 0.35 })
  const DARK = mat('#163a10')
  outline(part(ball, geo.sphere, GOO, [0, 0, 0], [1.5, 1.5, 1.5]), 0.07)
  part(ball, geo.sphere, mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.9 }), [0.75, 0.85, 0.95], [0.4, 0.25, 0.16], [0, 0.6, -0.5])
  for (const [x, y, z, r] of [[-0.9, -0.5, 1.0, 0.25], [1.1, -0.3, 0.8, 0.18], [0.3, 1.2, -0.6, 0.22]]) part(ball, geo.sphereLo, clear('#e4ffc4', 0.7), [x, y, z], r)
  const eyes = [bigEye(ball, [-0.55, 0.35, 1.2], 0.48), bigEye(ball, [0.55, 0.35, 1.2], 0.48)]
  for (const s of [-1, 1]) part(ball, geo.box, DARK, [s * 0.55, 0.95, 1.38], [0.7, 0.16, 0.2], [0, 0, s * 0.4])
  part(ball, geo.sphere, DARK, [0, -0.5, 1.4], [0.45, 0.2, 0.12])
  const drips = []
  for (const [x, y, z] of [[-0.6, -1.3, -0.2], [0.5, -1.35, 0.3], [0, -1.2, -0.9]]) {
    const d = part(ball, geo.sphere, GOO, [x, y, z], [0.3, 0.55, 0.3])
    d.userData.y = y
    drips.push(d)
  }

  const pos = new Vector3()
  const prev = new Vector3()
  const vel = new Vector3()
  const st = { started: false, splat: -1, landed: -1 }
  const gate = makeGate()
  const acc = [0, 0]

  function pathAt(s, u, out) {
    const h = s.home
    const tg = s.target
    const dx = tg.x - h.x
    const dz = tg.z - h.z
    const arc = 6 + 0.12 * Math.sqrt(dx * dx + dz * dz)
    return out.set(h.x + dx * u, h.y + (tg.y - h.y) * u + arc * Math.sin(PI * u), h.z + dz * u)
  }

  function update(s) {
    const dt = s.dt || 0
    const t = s.t || 0
    const k = clamp01(s.k || 0)
    const fx = s.fx || opts.fx
    const surf = s.surface ?? -2.2
    const pl = s.player || s.target
    gate.step(s.phase)
    let size = S * clamp01(0.25 + t / 0.2)
    let squash = 0
    if (s.phase === 'tell' || s.phase === 'attack') {
      const u = s.phase === 'tell' ? 0.75 * k : 0.75 + 0.25 * k
      prev.copy(pos)
      pathAt(s, u, pos)
      if (st.started && dt > 0) vel.subVectors(pos, prev).divideScalar(dt)
      st.started = true
      emit(fx, take(acc, 0, 16, dt), FX.drip, pos.x, pos.y - 1.2 * S, pos.z, 1.2 * S)
    } else {
      if (!st.started) {
        pathAt(s, 1, pos)
        st.started = true
      }
      if (s.hit) {
        if (st.splat < 0) {
          st.splat = 0
          emit(fx, 40, FX.splash, pos.x, pos.y, pos.z, 2.5 * S)
          emit(fx, 14, FX.greenGlow, pos.x, pos.y, pos.z, 2 * S)
        }
        st.splat += dt
        pos.set(pl.x, pl.y + 1.2, pl.z)
        squash = clamp01(st.splat / 0.12)
        size *= Math.max(0.001, 1 - clamp01((st.splat - 0.1) / 0.3))
      } else if (st.landed < 0) {
        vel.y -= 32 * dt
        pos.addScaledVector(vel, dt)
        if (pos.y <= surf + 0.4) {
          pos.y = surf + 0.4
          st.landed = 0
          emit(fx, 45, FX.splash, pos.x, surf, pos.z, 4 * S)
          emit(fx, 20, FX.wake, pos.x, surf + 0.3, pos.z, 6 * S)
        }
      } else {
        st.landed += dt
        squash = clamp01(st.landed / 0.1)
        pos.y = surf + 0.4 - st.landed * 4
        size *= Math.max(0.001, 1 - clamp01(st.landed / 0.3))
      }
    }
    root.position.copy(pos)
    root.rotation.y = Math.atan2(pl.x - pos.x, pl.z - pos.z)
    const w = 0.12 * Math.sin(t * 9)
    const sq = 1 - 0.6 * squash
    ball.scale.set(size * (1 + w) * (1 + 0.5 * squash), size * (1 - w) * sq, size * (1 + w * 0.5) * (1 + 0.5 * squash))
    ball.visible = size > 0.01
    ball.rotation.z = Math.sin(t * 5) * 0.15
    lookEyes(eyes, pl, t, 0.1)
    for (let i = 0; i < drips.length; i++) {
      const p = (t * 1.4 + i * 0.33) % 1
      drips[i].position.y = drips[i].userData.y - 0.5 * p
      drips[i].scale.set(0.3 * (1 - p * 0.6), 0.55 + p * 0.5, 0.3 * (1 - p * 0.6))
    }
  }

  return {
    root,
    update,
    grabPoint: (out) => out.copy(root.position),
    dispose() {},
  }
}

// 5. Missile from the Mecha-Duck: curving cartoon rocket with smoke trail, always explodes.
function missile(opts = {}) {
  const S = opts.scale ?? 1
  const root = new Group()
  root.name = 'enc:missile'
  const rocket = new Group()
  root.add(rocket)
  const spin = new Group()
  rocket.add(spin)
  const WHITE = mat('#ffffff', { roughness: 0.3 })
  const RED = mat('#ff3030', { roughness: 0.3 })
  const DARK = metal('#2b3140')
  outline(part(spin, geo.cyl, WHITE, [0, 0, 0], [0.5, 2.6, 0.5], [PI / 2, 0, 0]), 0.07)
  outline(part(spin, geo.cone, RED, [0, 0, 1.85], [0.5, 1.1, 0.5], [PI / 2, 0, 0]), 0.07)
  part(spin, geo.cyl, RED, [0, 0, 0.3], [0.53, 0.35, 0.53], [PI / 2, 0, 0])
  for (let i = 0; i < 4; i++) {
    const a = (i * PI) / 2 + PI / 4
    outline(part(spin, geo.box, RED, [Math.cos(a) * 0.75, Math.sin(a) * 0.75, -1.0], [0.9, 0.08, 0.9], [0, 0, a]), 0.1)
  }
  part(spin, geo.cyl, DARK, [0, 0, -1.45], [0.38, 0.4, 0.38], [PI / 2, 0, 0])
  const fl1 = part(rocket, geo.cone, lit('#ff8a1f', 2.6), [0, 0, -2.3], [0.4, 1.6, 0.4], [-PI / 2, 0, 0])
  const fl2 = part(rocket, geo.cone, lit('#fff0a0', 3), [0, 0, -2.0], [0.22, 1.0, 0.22], [-PI / 2, 0, 0])
  const eyes = [bigEye(rocket, [-0.24, 0.4, 0.95], 0.26), bigEye(rocket, [0.24, 0.4, 0.95], 0.26)]
  // explosion: fading fireball + smoke puff (cloned materials)
  const fireMat = mat('#ff9a1f', { emissive: '#ff6a00', emissiveIntensity: 2.2, transparent: true, depthWrite: false }).clone()
  const smokeMat = mat('#55586a', { transparent: true, depthWrite: false, roughness: 0.9 }).clone()
  const fireball = part(root, geo.sphere, fireMat, [0, 0, 0], 0.01)
  const smokeBall = part(root, geo.sphere, smokeMat, [0, 0.5, 0], 0.01)
  fireball.visible = smokeBall.visible = false
  fireball.castShadow = smokeBall.castShadow = false

  const pos = new Vector3()
  const prev = new Vector3()
  const vel = new Vector3()
  const ctrl = new Vector3()
  const look = new Vector3()
  const st = { started: false, boom: -1 }
  const acc = [0, 0]

  function bez(s, u, out) {
    const h = s.home
    const tg = s.target
    const lat = Math.sign(h.x - tg.x) || s.side || 1
    ctrl.set((h.x + tg.x) / 2 + lat * 10, Math.max(h.y, tg.y) + 8, (h.z + tg.z) / 2)
    const a = (1 - u) * (1 - u)
    const b = 2 * u * (1 - u)
    const c = u * u
    return out.set(a * h.x + b * ctrl.x + c * tg.x, a * h.y + b * ctrl.y + c * tg.y, a * h.z + b * ctrl.z + c * tg.z)
  }
  function explode(fx, surf) {
    st.boom = 0
    rocket.visible = false
    fireball.visible = smokeBall.visible = true
    fireball.position.set(0, 0, 0)
    root.position.copy(pos)
    emit(fx, 36, FX.boom, pos.x, pos.y, pos.z, 2 * S)
    emit(fx, 22, FX.boomSmoke, pos.x, pos.y, pos.z, 2.5 * S)
    if (pos.y < surf + 1.5) emit(fx, 30, FX.splash, pos.x, surf, pos.z, 4 * S)
  }

  function update(s) {
    const dt = s.dt || 0
    const t = s.t || 0
    const k = clamp01(s.k || 0)
    const fx = s.fx || opts.fx
    const surf = s.surface ?? -2.2
    const pl = s.player || s.target
    if (st.boom >= 0) {
      st.boom += dt
      const q = clamp01(st.boom / 0.6)
      fireball.scale.setScalar(S * (0.5 + 4 * easeOut(q)))
      fireMat.opacity = 1 - q
      fireball.visible = q < 1
      smokeBall.scale.setScalar(S * (1 + 4.5 * easeOut(clamp01(st.boom / 1.2))))
      smokeBall.position.y = st.boom * 2 * S
      smokeMat.opacity = 0.8 * (1 - clamp01(st.boom / 1.2))
      smokeBall.visible = st.boom < 1.2
      return
    }
    if (s.phase === 'tell' || s.phase === 'attack') {
      const u = s.phase === 'tell' ? 0.65 * k : 0.65 + 0.35 * k
      prev.copy(pos)
      bez(s, u, pos)
      if (st.started && dt > 0) vel.subVectors(pos, prev).divideScalar(dt)
      st.started = true
    } else {
      if (!st.started) {
        bez(s, 1, pos)
        st.started = true
      }
      if (s.hit) {
        explode(fx, surf)
        return
      }
      vel.y -= 12 * dt
      pos.addScaledVector(vel, dt)
      if (pos.y <= surf + 0.3 || (s.phase === 'recover' && k > 0.95)) {
        pos.y = Math.max(pos.y, surf + 0.3)
        explode(fx, surf)
        return
      }
    }
    root.position.copy(pos)
    // nose along the flight direction (toward the target until it has a velocity)
    if (vel.lengthSq() > 1e-4) look.copy(pos).add(vel)
    else bez(s, Math.min(1, (s.phase === 'tell' ? 0.65 * k : 0.65 + 0.35 * k) + 0.02), look)
    if (look.distanceToSquared(pos) > 1e-6) root.lookAt(look)
    root.scale.setScalar(S * clamp01(0.3 + t / 0.15))
    spin.rotation.z = t * 6
    fl1.scale.y = 1.6 * (0.8 + Math.random() * 0.5)
    fl2.scale.y = 1.0 * (0.8 + Math.random() * 0.5)
    lookEyes(eyes, pl, t, 0.4)
    // trail
    _a.set(0, 0, -2.4 * S).applyQuaternion(root.quaternion).add(pos)
    emit(fx, take(acc, 0, 30, dt), FX.smoke, _a.x, _a.y, _a.z, 0.6 * S)
    emit(fx, take(acc, 1, 25, dt), FX.flame, _a.x, _a.y, _a.z, 0.4 * S)
  }

  return {
    root,
    update,
    grabPoint: (out) => out.copy(root.position),
    dispose() {
      fireMat.dispose()
      smokeMat.dispose()
    },
  }
}

// 6. Tail slam (wall): glowing whale tails rise out of the slime on both sides of the gap,
//    slam down at k = 1 and leave a wave wall across the lane except the gap.
function tailslam(opts = {}) {
  const S = opts.scale ?? 1
  const root = new Group()
  root.name = 'enc:tailslam'
  const TAIL = mat('#2a55d8', { emissive: '#1b3cff', emissiveIntensity: 0.5, roughness: 0.25 })
  const GLOW = lit('#62f6ff', 1.8)
  const STAR = lit('#fff6c8', 2)
  const WAVE = clear('#46f59a', 0.72, { emissive: '#1fc87a', emissiveIntensity: 0.7 })
  const FOAM = mat('#eafff2', { emissive: '#bfffe0', emissiveIntensity: 0.4 })

  const segs = []
  for (let n = 0; n < 2; n++) {
    const seg = new Group()
    root.add(seg)
    const tailRise = new Group() // vertical offset (rise / sink)
    seg.add(tailRise)
    const tail = new Group() // pivot at the slime: slam rotation
    tailRise.add(tail)
    outline(part(tail, geo.cyl, TAIL, [0, 6, 0], [2.0, 12, 2.0]), 0.06)
    part(tail, geo.sphere, TAIL, [0, 0.4, 0], [2.7, 1.6, 2.7])
    for (let i = 0; i < 3; i++) part(tail, geo.sphereLo, STAR, [(i - 1) * 0.7, 3 + i * 3, 1.85], 0.32)
    outline(part(tail, geo.sphere, TAIL, [0, 12, 0], [1.9, 1.7, 1.9]), 0.06)
    const flukes = new Group()
    flukes.position.set(0, 12.6, 0)
    tail.add(flukes)
    const fl = []
    for (const s of [-1, 1]) {
      const f = outline(part(flukes, geo.sphere, TAIL, [s * 3, 1.6, 0], [3.4, 2.6, 0.9], [0, 0, s * 0.3]), 0.06)
      part(f, geo.sphere, GLOW, [0, 0, -0.12], [1.06, 1.12, 0.7])
      fl.push(f)
    }
    const wave = new Group()
    seg.add(wave)
    const wbody = part(wave, geo.box, WAVE, [0, 0, 0], [1, 1, 3.5])
    wbody.castShadow = false
    const crest = part(wave, geo.cyl, FOAM, [0, 0, 1.1], [1.6, 1, 1.6], [0, 0, PI / 2])
    const foam = []
    for (let i = 0; i < 4; i++) foam.push(part(wave, geo.sphereLo, FOAM, [0, 0, 0.6], 1.2))
    segs.push({ seg, tailRise, tail, flukes, fl, wave, wbody, crest, foam, w: 0, cx: 0 })
  }

  const gate = makeGate()
  const acc = [0, 0]
  const gap0 = { x0: -3, x1: 3 }

  function update(s) {
    const dt = s.dt || 0
    const t = s.t || 0
    const k = clamp01(s.k || 0)
    const fx = s.fx || opts.fx
    const surf = s.surface ?? -2.2
    const hw = s.halfWidth ?? 30
    const gap = s.gap || gap0
    const tg = s.target
    gate.step(s.phase)
    root.position.set(0, surf, tg.z)
    const H = Math.max(tg.y + 3 - surf, 6)
    const TS = 1.35 * S // tail size
    const L = 14.5 * TS
    // per-phase pose
    let rise = 1
    let theta = -0.15
    let waveK = 0
    let sink = 0
    if (s.phase === 'tell') {
      rise = easeOut(k)
      theta = -0.15 + Math.sin(t * 3) * 0.05
    } else if (s.phase === 'attack') {
      theta = k < 0.65 ? lerp(-0.15, -0.45, easeInOut(k / 0.65)) : lerp(-0.45, 1.45, easeIn((k - 0.65) / 0.35))
      waveK = k < 0.8 ? 0 : easeOutBack((k - 0.8) / 0.2)
    } else if (s.phase === 'hold') {
      theta = 1.45
      waveK = 1 + 0.03 * Math.sin(t * 6)
    } else {
      theta = 1.45
      waveK = 1
      sink = easeIn(k)
    }
    for (let n = 0; n < 2; n++) {
      const g = segs[n]
      const a = n === 0 ? -hw : Math.max(-hw, Math.min(hw, gap.x1))
      const b = n === 0 ? Math.max(-hw, Math.min(hw, gap.x0)) : hw
      const w = b - a
      g.seg.visible = w > 0.5
      if (!g.seg.visible) continue
      const cx = (a + b) / 2
      g.w = w
      g.cx = cx
      g.seg.position.set(cx, 0, 0)
      // tail: fluke span follows the segment width
      const span = Math.max(0.8, Math.min(8, w * 0.25)) * S
      g.tail.scale.setScalar(TS)
      g.fl[0].scale.set(span / TS, 2.6, 0.9)
      g.fl[1].scale.set(span / TS, 2.6, 0.9)
      g.fl[0].position.x = (-span / TS) * 0.9
      g.fl[1].position.x = (span / TS) * 0.9
      g.tail.position.z = -L * 0.95
      g.tail.rotation.x = theta
      g.flukes.rotation.x = Math.sin(t * 4) * 0.1 * (1 - waveK * 0.5)
      g.tailRise.position.y = -(L + 4) * (1 - rise) - (H + L) * sink
      // wave wall
      const h = Math.max(0, H * waveK)
      g.wave.visible = h > 0.05
      g.wave.position.y = -(H + 4) * sink
      g.wbody.scale.set(w, h, 3.5)
      g.wbody.position.y = h / 2
      g.crest.scale.set(1.6, w, 1.6)
      g.crest.position.y = h
      for (let i = 0; i < 4; i++) {
        const f = g.foam[i]
        f.position.set(-w / 2 + (w * (i + 0.5)) / 4, h + 0.6 + Math.sin(t * 7 + i * 1.7) * 0.4, 0.6)
        f.scale.setScalar(Math.min(2, 0.6 + w * 0.06) * (1 + 0.15 * Math.sin(t * 9 + i)))
      }
    }
    // particles
    for (let n = 0; n < 2; n++) {
      const g = segs[n]
      if (!g.seg.visible) continue
      if (s.phase === 'tell') emit(fx, take(acc, n, 25, dt), FX.bubble, g.cx, surf + 0.2, tg.z - L * 0.9, Math.max(2, g.w * 0.8))
      else if (s.phase === 'attack') {
        if (k > 0.97 && gate.once(1 << n)) {
          emit(fx, 45, FX.foam, g.cx, surf + 1, tg.z, g.w)
          emit(fx, 20, FX.sparkleUp, g.cx, surf + 2, tg.z, g.w)
        }
      } else if (s.phase === 'hold') emit(fx, take(acc, n, 18, dt), FX.foam, g.cx, surf + H, tg.z, g.w)
      else {
        if (gate.once(1 << n)) emit(fx, 30, FX.foam, g.cx, surf + H * 0.6, tg.z, g.w)
        emit(fx, take(acc, n, 20 * (1 - k), dt), FX.splash, g.cx, surf, tg.z, g.w)
      }
    }
  }

  return {
    root,
    update,
    grabPoint: (out) => out.set(0, root.position.y, root.position.z),
    dispose() {},
  }
}

// 7. Geyser (helper): glowing spout erupting under the player's path; fly into it for a boost.
function geyser(opts = {}) {
  const S = opts.scale ?? 1
  const root = new Group()
  root.name = 'enc:geyser'
  const colMat = clear('#7ff8ff', 0.5, { emissive: '#3fe8ff', emissiveIntensity: 0.9 }).clone()
  const coreMat = mat('#e8ffff', { emissive: '#e8ffff', emissiveIntensity: 2, transparent: true, opacity: 0.9, depthWrite: false }).clone()
  const ring = part(root, geo.torus, lit('#5ef2ff', 1.6), [0, 0.15, 0], [1, 1, 1], [PI / 2, 0, 0])
  const ring2 = part(root, geo.torus, clear('#ffffff', 0.7, { emissive: '#bffcff', emissiveIntensity: 1 }), [0, 0.1, 0], [1, 1, 0.6], [PI / 2, 0, 0])
  const bubbles = []
  for (let i = 0; i < 6; i++) bubbles.push(part(root, geo.sphereLo, clear('#c8ffff', 0.7, { emissive: '#7ff6ff', emissiveIntensity: 0.5 }), [0, 0, 0], 0.01))
  const col = new Group()
  root.add(col)
  const outer = part(col, geo.cyl, colMat, [0, 0, 0], [3, 1, 3])
  const core = part(col, geo.cyl, coreMat, [0, 0, 0], [1.3, 1, 1.3])
  const cap = part(col, geo.sphere, colMat, [0, 0, 0], [3.2, 1.6, 3.2])
  outer.castShadow = core.castShadow = cap.castShadow = false
  const swirls = []
  for (let i = 0; i < 3; i++) swirls.push(part(col, thinRing, lit('#9ffcff', 2), [0, 0, 0], [3.3, 3.3, 3.3], [PI / 2, 0, 0]))
  const crown = []
  for (let i = 0; i < 5; i++) crown.push(part(col, geo.sphereLo, mat('#ffffff', { emissive: '#bffcff', emissiveIntensity: 0.8 }), [0, 0, 0], 1))

  const gate = makeGate()
  const acc = [0, 0, 0]
  const st = { h: 0 }

  function update(s) {
    const dt = s.dt || 0
    const t = s.t || 0
    const k = clamp01(s.k || 0)
    const fx = s.fx || opts.fx
    const surf = s.surface ?? -2.2
    const tg = s.target
    gate.step(s.phase)
    root.position.set(tg.x, surf, tg.z)
    const H = Math.max(tg.y + 6 - surf, 4)
    let ringR = 3.2
    let h = 0
    let rad = 1
    let fade = 1
    if (s.phase === 'tell') {
      ringR = lerp(0.4, 3.2, easeOut(k))
    } else if (s.phase === 'attack') {
      h = H * Math.max(0, easeOutBack(k, 1.1))
      if (gate.once(1)) emit(fx, 30, FX.splash, tg.x, surf, tg.z, 4 * S)
    } else if (s.phase === 'hold') {
      h = H * (1 + 0.03 * Math.sin(t * 8))
      rad = 1 + 0.06 * Math.sin(t * 10)
    } else if (s.hit) {
      h = H * (1 + 0.6 * easeOut(k))
      rad = 1 + 0.4 * k
      fade = 1 - easeIn(k)
      if (gate.once(1)) {
        emit(fx, 60, FX.sparkleUp, tg.x, tg.y, tg.z, 4 * S)
        emit(fx, 30, FX.gold, tg.x, tg.y + 2, tg.z, 3 * S)
      }
    } else {
      h = H * (1 - easeIn(k))
      rad = 1 + 0.3 * k
      fade = 1 - k * 0.6
      if (k > 0.5 && gate.once(1)) emit(fx, 35, FX.splash, tg.x, surf, tg.z, 5 * S)
    }
    st.h = h
    ring.scale.set(ringR * S * (1 + 0.05 * Math.sin(t * 12)), ringR * S, 1)
    ring2.scale.set(ringR * 0.7 * S, ringR * 0.7 * S, 0.6)
    ring.rotation.z = t * 1.5
    for (let i = 0; i < 6; i++) {
      const p = (t * 1.6 + i * 0.17) % 1
      const a = i * 1.05 + Math.floor(t * 1.6 + i * 0.17) * 2.1
      const r = ringR * S * (0.4 + 0.5 * ((i * 0.37) % 1))
      bubbles[i].position.set(Math.cos(a) * r, 0.2 + p * 0.6, Math.sin(a) * r)
      bubbles[i].scale.setScalar(Math.max(0.01, Math.sin(p * PI) * 0.6 * S))
    }
    col.visible = h > 0.05
    if (col.visible) {
      const r = rad * S
      outer.scale.set(3 * r, h, 3 * r)
      outer.position.y = h / 2
      core.scale.set(1.3 * r * (1 + 0.15 * Math.sin(t * 14)), h, 1.3 * r)
      core.position.y = h / 2
      cap.scale.set(3.2 * r, 1.6 * r, 3.2 * r)
      cap.position.y = h
      for (let i = 0; i < 3; i++) {
        const q = (t * 0.7 + i / 3) % 1
        swirls[i].position.y = q * h
        swirls[i].scale.setScalar(3.3 * r * (1 + 0.1 * Math.sin(q * PI)))
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + t * 2
        crown[i].position.set(Math.cos(a) * 2.2 * r, h + 0.8 * r + Math.sin(t * 9 + i) * 0.5, Math.sin(a) * 2.2 * r)
        crown[i].scale.setScalar(r * (0.9 + 0.3 * Math.sin(t * 7 + i * 2)))
      }
    }
    colMat.opacity = 0.62 * fade
    coreMat.opacity = 0.9 * fade
    // ambient particles
    if (s.phase === 'tell') emit(fx, take(acc, 0, 22, dt), FX.bubble, tg.x, surf + 0.2, tg.z, ringR * 1.6 * S)
    else if (col.visible && fade > 0.3) emit(fx, take(acc, 1, 16, dt), FX.sparkle, tg.x, surf + h * Math.random(), tg.z, 6 * S)
  }

  return {
    root,
    update,
    grabPoint: (out) => out.set(root.position.x, root.position.y + Math.max(st.h, 0), root.position.z),
    dispose() {
      colMat.dispose()
      coreMat.dispose()
    },
  }
}

// 8. Bouncy mushroom (helper) on a floating lily raft; BOING when the player lands on it.
function mushroom(opts = {}) {
  const S = opts.scale ?? 1
  const root = new Group()
  root.name = 'enc:mushroom'
  const float = new Group()
  root.add(float)
  const PAD = mat('#3fcf4a', { roughness: 0.35 })
  const CREAM = mat('#fff1d8', { roughness: 0.4 })
  const RED = mat('#ff2a3a', { roughness: 0.22 })
  const DARK = mat('#3a1a12')
  outline(part(float, geo.cyl, PAD, [0, 0.1, 0], [4.2, 0.35, 4.2]), 0.05)
  part(float, geo.box, mat('#2aa838'), [2.6, 0.3, 0], [3.2, 0.08, 0.25])
  for (const [x, z] of [[-2.8, 1.8], [2.4, -2.4]]) {
    part(float, geo.sphere, mat('#ff8fd0'), [x, 0.5, z], [0.55, 0.35, 0.55])
    part(float, geo.sphere, mat('#ffe14a', { emissive: '#ffb21f', emissiveIntensity: 0.4 }), [x, 0.75, z], 0.2)
  }
  const glowRing = part(float, thinRing, lit('#ffd23a', 1.8), [0, 0.35, 0], [4.8, 4.8, 3], [PI / 2, 0, 0])
  const mush = new Group()
  mush.position.y = 0.3
  float.add(mush)
  const stem = outline(part(mush, geo.cyl, CREAM, [0, 1, 0], [1.1, 2, 1.1]), 0.06)
  part(mush, geo.sphere, CREAM, [0, 0.4, 0], [1.45, 0.8, 1.45])
  const face = new Group()
  mush.add(face)
  const eyes = [bigEye(face, [-0.5, 0, 1.05], 0.42), bigEye(face, [0.5, 0, 1.05], 0.42)]
  part(face, geo.sphere, DARK, [0, -0.6, 1.08], [0.32, 0.14, 0.1])
  for (const s of [-1, 1]) part(face, geo.sphere, clear('#ff8fb0', 0.7), [s * 0.85, -0.45, 0.85], [0.22, 0.13, 0.08])
  const capG = new Group()
  mush.add(capG)
  outline(part(capG, geo.sphere, RED, [0, 0.6, 0], [3.6, 2.0, 3.6]), 0.05)
  part(capG, geo.sphere, mat('#ffe6c4'), [0, 0.15, 0], [3.3, 0.6, 3.3])
  for (let i = 0; i < 7; i++) {
    const top = i === 6
    const a = i * 1.047 + 0.3
    const el = top ? 1 : 0.55
    const dx = top ? 0 : Math.cos(a) * Math.cos(el)
    const dz = top ? 0 : Math.sin(a) * Math.cos(el)
    const dy = top ? 1 : Math.sin(el)
    const sp = part(capG, geo.sphere, mat('#ffffff', { roughness: 0.3 }), [dx * 3.5, 0.6 + dy * 1.95, dz * 3.5], [0.75, 0.75, 0.75])
    sp.lookAt(dx * 10, 0.6 + dy * 10, dz * 10)
    sp.scale.set(0.75, 0.75, 0.25)
  }

  const gate = makeGate()
  const acc = [0, 0]
  const st = { boing: -1, top: 4 }

  function update(s) {
    const dt = s.dt || 0
    const t = s.t || 0
    const k = clamp01(s.k || 0)
    const fx = s.fx || opts.fx
    const surf = s.surface ?? -2.2
    const tg = s.target
    gate.step(s.phase)
    // stem length so the cap top sits at the target height (min ~3.5 m tall)
    const hs = Math.max(1.2, Math.min(12, (tg.y - surf) / S - 2.9))
    stem.scale.y = hs
    stem.position.y = hs / 2
    capG.position.y = hs
    face.position.y = hs - 1.1
    st.top = surf + (hs + 2.9) * S
    root.position.set(tg.x, surf, tg.z)
    root.scale.setScalar(S)
    let fy = Math.sin(t * 2) * 0.2
    let grow = 1
    let sy = 1
    if (s.phase === 'tell') {
      const q = easeOutBack(k)
      fy = lerp(-5, 0, easeOut(clamp01(k * 1.4)))
      grow = Math.max(0.001, q)
      if (gate.once(1)) emit(fx, 25, FX.splash, tg.x, surf, tg.z, 6 * S)
    } else if (s.phase === 'attack') {
      fy *= 1 - k
      sy = 1 + 0.06 * Math.sin(t * 6)
    }
    if (s.hit && (s.phase === 'hold' || s.phase === 'recover')) {
      if (st.boing < 0) {
        st.boing = 0
        emit(fx, 40, FX.stars, tg.x, st.top, tg.z, 3 * S)
        emit(fx, 20, FX.gold, tg.x, st.top, tg.z, 4 * S)
      }
      st.boing += dt
      sy = 0.5 + 0.5 * spring(clamp01(st.boing / 0.9), 4, 4)
      if (s.phase === 'recover' && k > 0.7) fy = -6 * easeIn((k - 0.7) / 0.3)
    } else if (s.phase === 'recover') {
      fy = -6 * easeIn(k)
    }
    float.position.y = fy
    const sx = 1 / Math.sqrt(Math.max(0.2, sy))
    mush.scale.set(grow * sx, grow * sy, grow * sx)
    capG.rotation.z = Math.sin(t * 2.6) * 0.04
    glowRing.rotation.z = t * 0.8
    glowRing.scale.set(4.8 * (1 + 0.05 * Math.sin(t * 5)), 4.8 * (1 + 0.05 * Math.sin(t * 5)), 3)
    lookEyes(eyes, s.player || tg, t, 0.3)
    if (s.phase !== 'recover') emit(fx, take(acc, 0, 7, dt), FX.sparkle, tg.x, surf + 1, tg.z, 8 * S)
  }

  return {
    root,
    update,
    grabPoint: (out) => out.set(root.position.x, st.top, root.position.z),
    dispose() {},
  }
}

// 9. Friendly seagull (helper) with a golden boost ring; meets the player at the target.
function seagull(opts = {}) {
  const S = opts.scale ?? 1
  const root = new Group()
  root.name = 'enc:seagull'
  root.rotation.order = 'YXZ'
  const WHITE = mat('#ffffff', { roughness: 0.4 })
  const GREY = mat('#9aa6b8', { roughness: 0.4 })
  const ORANGE = mat('#ffa21f', { roughness: 0.35 })
  const bird = new Group()
  root.add(bird)
  outline(part(bird, geo.sphere, WHITE, [0, 0, 0], [1.0, 0.9, 1.6]), 0.07)
  outline(part(bird, geo.sphere, WHITE, [0, 0.75, 1.3], [0.8, 0.8, 0.8]), 0.07)
  outline(part(bird, geo.cone, ORANGE, [0, 0.55, 2.3], [0.25, 0.9, 0.25], [PI / 2, 0, 0]), 0.1)
  const eyes = [bigEye(bird, [-0.38, 0.98, 1.82], 0.3), bigEye(bird, [0.38, 0.98, 1.82], 0.3)]
  const wings = []
  for (const s of [-1, 1]) {
    const w = new Group()
    w.position.set(s * 0.8, 0.3, 0)
    bird.add(w)
    outline(part(w, geo.sphere, WHITE, [s * 1.8, 0, 0], [1.9, 0.18, 0.8]), 0.08)
    part(w, geo.sphere, GREY, [s * 3.3, 0, -0.2], [0.8, 0.16, 0.6])
    w.userData.s = s
    wings.push(w)
  }
  part(bird, geo.box, WHITE, [0, 0.1, -1.7], [0.9, 0.15, 0.9], [0, PI / 4, 0])
  for (const s of [-1, 1]) part(bird, geo.sphere, ORANGE, [s * 0.3, -0.8, -0.4], [0.2, 0.15, 0.3])
  const aura = part(root, thinRing, lit('#ffd23a', 2), [0, 0.3, 0], [2.6, 2.6, 2.6])
  const glow = part(root, geo.sphere, clear('#ffe27a', 0.2, { emissive: '#ffc21f', emissiveIntensity: 0.8 }), [0, 0.3, 0], 2.4)
  aura.castShadow = glow.castShadow = false

  const pos = new Vector3()
  const prev = new Vector3()
  const vel = new Vector3()
  const p0 = new Vector3()
  const p1 = new Vector3()
  const hitPos = new Vector3()
  const st = { started: false, yaw: 0, away: -1 }
  const gate = makeGate()
  const acc = [0, 0]

  function bez(s, u, out) {
    const tg = s.target
    const side = s.side || 1
    p0.set(tg.x + side * 26, tg.y + 12, tg.z - 30)
    p1.set(tg.x + side * 6, tg.y + 6, tg.z - 20)
    const a = (1 - u) * (1 - u)
    const b = 2 * u * (1 - u)
    const c = u * u
    return out.set(a * p0.x + b * p1.x + c * tg.x, a * p0.y + b * p1.y + c * tg.y, a * p0.z + b * p1.z + c * tg.z)
  }

  function update(s) {
    const dt = s.dt || 0
    const t = s.t || 0
    const k = clamp01(s.k || 0)
    const fx = s.fx || opts.fx
    const side = s.side || 1
    gate.step(s.phase)
    prev.copy(pos)
    let flapF = 9
    let auraK = 1
    let faceAway = false
    if (s.phase === 'tell' || s.phase === 'attack') {
      bez(s, s.phase === 'tell' ? 0.85 * k : 0.85 + 0.15 * k, pos)
      if (s.phase === 'attack') flapF = 6
    } else {
      if (!st.started) bez(s, 1, pos)
      if (st.away < 0) {
        st.away = 0
        hitPos.copy(pos)
        if (s.hit) {
          emit(fx, 30, FX.stars, pos.x, pos.y + 1, pos.z, 2 * S)
          emit(fx, 20, FX.gold, pos.x, pos.y, pos.z, 3 * S)
        }
      }
      st.away += dt
      const a = st.away
      if (s.hit) {
        pos.set(hitPos.x, hitPos.y + 2 * a, hitPos.z - (40 * a + 70 * a * a))
        flapF = 18
        faceAway = true
        emit(fx, take(acc, 1, 40, dt), FX.gold, pos.x, pos.y, pos.z + 1, 1 * S)
      } else {
        pos.set(hitPos.x + side * 18 * a * a, hitPos.y + 10 * a, hitPos.z - 12 * a)
        flapF = 12
        auraK = Math.max(0.001, 1 - a * 1.5)
      }
    }
    if (st.started && dt > 0) vel.subVectors(pos, prev).divideScalar(dt)
    st.started = true
    root.position.copy(pos)
    root.scale.setScalar(S * clamp01(0.2 + t / 0.3))
    // face the flight direction, bank into turns
    const hv = Math.sqrt(vel.x * vel.x + vel.z * vel.z)
    let yawT = st.yaw
    if (faceAway) yawT = PI
    else if (hv > 0.5) yawT = Math.atan2(vel.x, vel.z)
    const prevYaw = st.yaw
    st.yaw = lerpAngle(st.yaw, yawT, smooth(dt, 6))
    root.rotation.y = st.yaw
    root.rotation.x = clampAbs(-Math.atan2(vel.y, Math.max(1, hv)) * 0.6, 0.6)
    root.rotation.z = dt > 0 ? clampAbs(-((st.yaw - prevYaw) / dt) * 0.3, 0.6) : 0
    const fl = Math.sin(t * flapF) * 0.7
    for (const w of wings) w.rotation.z = w.userData.s * fl
    bird.position.y = -fl * 0.15
    aura.rotation.z = t * 2
    aura.scale.setScalar(2.6 * auraK * (1 + 0.06 * Math.sin(t * 8)))
    glow.scale.setScalar(2.4 * auraK)
    aura.visible = glow.visible = auraK > 0.01
    lookEyes(eyes, s.player || s.target, t, 0.6)
    if (s.phase === 'tell' || s.phase === 'attack') emit(fx, take(acc, 0, 10, dt), FX.sparkle, pos.x, pos.y, pos.z, 3 * S)
  }

  return {
    root,
    update,
    grabPoint: (out) => out.copy(root.position),
    dispose() {},
  }
}

// 10. Wind fan (helper): floating fan ring blowing forward; fly through it for a boost.
function fan(opts = {}) {
  const S = opts.scale ?? 1
  const root = new Group()
  root.name = 'enc:fan'
  const fanG = new Group()
  root.add(fanG)
  const RING = metal('#c9d3e0')
  const DARKM = metal('#2b3140', { roughness: 0.4 })
  const BLADE = metal('#f4f7ff', { roughness: 0.25, metalness: 0.4 })
  outline(part(fanG, geo.torus, RING, [0, 0, 0], [3.2, 3.2, 3.2]), 0.05)
  const inner = part(fanG, thinRing, lit('#38f4ff', 2.2), [0, 0, 0], [2.75, 2.75, 1.2])
  const disc = part(fanG, geo.cyl, clear('#7ff8ff', 0.16, { emissive: '#38f4ff', emissiveIntensity: 0.5 }), [0, 0, 0], [2.6, 0.05, 2.6], [PI / 2, 0, 0])
  disc.castShadow = false
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + PI / 2
    part(fanG, geo.cyl, DARKM, [Math.cos(a) * 1.5, Math.sin(a) * 1.5, -0.35], [0.12, 3, 0.12], [0, 0, a - PI / 2])
  }
  const blades = new Group()
  fanG.add(blades)
  outline(part(blades, geo.sphere, DARKM, [0, 0, 0], [0.6, 0.6, 0.6]), 0.1)
  part(blades, geo.cone, mat('#38f4ff', { emissive: '#38f4ff', emissiveIntensity: 1 }), [0, 0, 0.6], [0.35, 0.6, 0.35], [PI / 2, 0, 0])
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU
    const bl = part(blades, geo.box, BLADE, [Math.cos(a) * 1.35, Math.sin(a) * 1.35, 0], [2.1, 0.7, 0.08], [0.45, 0, a])
    bl.rotation.order = 'ZXY'
    bl.rotation.set(0.45, 0, a)
  }
  // little rotor on top so it reads as floating
  part(fanG, geo.cyl, DARKM, [0, 3.7, 0], [0.12, 0.8, 0.12])
  const rotor = part(fanG, geo.box, BLADE, [0, 4.15, 0], [2.6, 0.06, 0.3])

  const gate = makeGate()
  const acc = [0, 0]
  const st = { spin: 0, rate: 6 }

  function update(s) {
    const dt = s.dt || 0
    const t = s.t || 0
    const k = clamp01(s.k || 0)
    const fx = s.fx || opts.fx
    const surf = s.surface ?? -2.2
    const tg = s.target
    gate.step(s.phase)
    let y = tg.y
    let rateT = 6
    let sc = 1
    if (s.phase === 'tell') {
      y = lerp(surf - 5, tg.y, easeOutBack(k, 1.2)) + Math.sin(t * 2) * 0.3 * k
      if (gate.once(1)) emit(fx, 25, FX.splash, tg.x, surf, tg.z, 5 * S)
    } else if (s.phase === 'attack') {
      y = tg.y + Math.sin(t * 2) * 0.3 * (1 - k)
      rateT = 8
    } else if (s.hit) {
      rateT = 45
      sc = 1 + 0.25 * (1 - spring(clamp01(k * 2), 3, 5)) + 0.1
      if (gate.once(1)) {
        emit(fx, 50, FX.wind, tg.x, tg.y, tg.z - 2, 3 * S)
        emit(fx, 25, FX.sparkle, tg.x, tg.y, tg.z, 5 * S)
      }
      if (k > 0.6) sc *= Math.max(0.001, 1 - (k - 0.6) / 0.4)
    } else {
      y = tg.y - 8 * easeIn(k)
      rateT = 6 * (1 - k)
      sc = Math.max(0.001, 1 - easeIn(clamp01((k - 0.5) / 0.5)))
    }
    st.rate += (rateT - st.rate) * smooth(dt, 4)
    st.spin += st.rate * dt
    root.position.set(tg.x, y, tg.z)
    root.scale.setScalar(S * sc)
    blades.rotation.z = st.spin
    rotor.rotation.y = t * 20
    fanG.rotation.z = Math.sin(t * 1.3) * 0.05
    inner.scale.set(2.6, 2.6, 2 * (1 + 0.2 * Math.sin(t * 8)))
    const windRate = s.phase === 'recover' ? (s.hit ? 60 : 0) : s.phase === 'tell' ? 10 * k : 22
    emit(fx, take(acc, 0, windRate, dt), FX.wind, root.position.x, root.position.y, root.position.z - 1, 4.5 * S)
  }

  return {
    root,
    update,
    grabPoint: (out) => out.copy(root.position),
    dispose() {},
  }
}

export const BOSSES = { kingDragon, mechaDuck, skyWhale }
export const ENCOUNTERS_C = { slimeball, missile, tailslam, geyser, mushroom, seagull, fan }
