import { Color, Group, Object3D, Quaternion, Vector3 } from 'three'
import { clamp01, clear, easeIn, easeInOut, easeOut, easeOutBack, geo, googly, lerp, lit, mat, metal, outline, part } from './kit.js'

// Lane animals, set A: frog, duck, dragon, penguin, owl, goat, bat, chameleon,
// octopus, croc, puffer, squid, crab. Procedural chunky cartoon models + their
// choreography, driven by hazards.js through the MODEL CONTRACT in animals.js.
//
// Conventions used here:
// - root.scale = opts.scale; models face +Z; rotation order YXZ (yaw, then pitch).
// - Everything is animated from the phase's k (any duration works). The first
//   'hold' / 'recover' frame arrives with the attack's k (~1) from the engine, so
//   k is forced to 0 on that entry frame.
// - s.target is the player's body centre at the strike (path y + 0.9). Strikes
//   land their contact point exactly on it at attack k = 1; grabPoint returns the
//   feet position (contact point - 0.9) so the held body sits in the mouth / tip.

const PI = Math.PI
const UP = new Vector3(0, 1, 0)
const FWD = new Vector3(0, 0, 1)
const WHITE_C = new Color('#ffffff')
const FEET = 0.9 // body centre -> feet

// ---------------------------------------------------------------------------------------------
// Particles (fx.burst presets). One reusable options object: burst() reads it synchronously.
const SLIME = ['#3fe23a', '#a6ff7a', '#2bbf2a']
const P = {
  splash: { spread: 2.6, spreadY: 0.4, speed: 10, up: 1.8, jitter: 0.6, gravity: -24, drag: 0.4, life: 1.1, size: 1.0, sizeEnd: 0.45, color: SLIME, additive: false, shape: 'square' },
  splashS: { spread: 1.6, spreadY: 0.2, speed: 6, up: 1.4, gravity: -22, drag: 0.6, life: 0.8, size: 0.7, sizeEnd: 0.35, color: SLIME, additive: false, shape: 'square' },
  drip: { spread: 0.3, speed: 0.6, up: 0.2, jitter: 0.3, gravity: -16, life: 0.9, size: 0.45, sizeEnd: 0.3, color: SLIME, additive: false, shape: 'square' },
  bubble: { spread: 5, spreadY: 0.2, speed: 0.8, up: 1, lift: 1.4, gravity: -1.5, life: 0.8, size: 0.7, sizeEnd: 1.5, color: ['#a6ff7a', '#3fe23a', '#d6ffb8'], additive: false, alpha: 0.85 },
  ripple: { spread: 1.2, spreadY: 0.1, speed: 1.5, up: 0.3, gravity: -6, life: 0.6, size: 0.5, sizeEnd: 0.9, color: SLIME, additive: false, alpha: 0.8 },
  star: { spread: 0.8, speed: 14, drag: 2.5, life: 0.55, size: 2.2, sizeEnd: 0.3, color: ['#ffffff', '#fff7b0', '#ffffff'], shape: 'star' },
  chomp: { spread: 1.4, speed: 9, drag: 2, life: 0.5, size: 1.4, sizeEnd: 0.2, color: ['#ffffff', '#a6ff7a', '#fff7b0'], shape: 'star' },
  pink: { spread: 0.6, speed: 7, drag: 2.5, life: 0.45, size: 1.1, sizeEnd: 0.2, color: ['#ff6fa8', '#ffffff', '#ffb3d1'], shape: 'star' },
  spit: { spread: 0.5, speed: 7, jitter: 2, gravity: -18, life: 0.8, size: 0.6, sizeEnd: 0.3, color: SLIME, additive: false, shape: 'square' },
  cyan: { spread: 1.6, speed: 1.8, drag: 1.5, life: 0.45, size: 0.6, sizeEnd: 0.1, color: ['#7ff6ff', '#ffffff', '#3ad0ff'], shape: 'star' },
  flame: { spread: 0.3, speed: 9, jitter: 1.4, drag: 3, life: 0.35, size: 1.1, sizeEnd: 0.15, color: ['#7ff6ff', '#3a9dff', '#ffffff'], colorEnd: '#ff8a2a' },
  feather: { spread: 1.4, speed: 7, drag: 2.2, gravity: -3, life: 1.5, size: 0.9, sizeEnd: 0.7, color: ['#8a5a2b', '#f3dfb5', '#6b3f1a'], additive: false, shape: 'square' },
  dust: { spread: 0.8, speed: 2.5, up: 0.6, lift: 0.8, drag: 2, life: 0.8, size: 0.9, sizeEnd: 1.8, color: ['#c9b48a', '#a8946a', '#e2d3ae'], additive: false, alpha: 0.85 },
  puff: { spread: 0.3, speed: 2, jitter: 0.8, drag: 2, life: 0.6, size: 0.6, sizeEnd: 1.4, color: '#ffffff', additive: false, alpha: 0.7 },
  ice: { spread: 1.2, speed: 9, drag: 1.5, gravity: -12, life: 0.9, size: 0.8, sizeEnd: 0.3, color: ['#dff6ff', '#9ee8ff', '#ffffff'], additive: false, shape: 'square' },
  ink: { spread: 0.7, speed: 1, jitter: 1.2, drag: 2, gravity: -4, life: 0.8, size: 1.3, sizeEnd: 0.5, color: ['#1a1030', '#2d1b4e', '#120a20'], additive: false },
  inkSplat: { spread: 1.2, speed: 11, drag: 2, gravity: -10, life: 0.9, size: 1.5, sizeEnd: 0.6, color: ['#1a1030', '#2d1b4e', '#4a2a7a'], additive: false, shape: 'square' },
  pop: { spread: 2.6, speed: 6, drag: 2, life: 0.6, size: 1.1, sizeEnd: 0.1, color: ['#ffffff', '#bff4ff', '#ff9ef0'], shape: 'star' },
  snip: { spread: 0.6, speed: 10, drag: 2.5, life: 0.5, size: 1.4, sizeEnd: 0.2, color: ['#ff4a3a', '#ffffff', '#ffd23a'], shape: 'star' },
  bat: { spread: 0.8, speed: 8, drag: 2.5, life: 0.5, size: 1.2, sizeEnd: 0.2, color: ['#b45cff', '#ffffff', '#e2b8ff'], shape: 'star' },
  reveal: { spread: 2.4, speed: 6, drag: 2, life: 0.6, size: 1.1, sizeEnd: 0.2, color: ['#ff5a5a', '#ffd23a', '#5aff7a', '#3ad0ff', '#c77dff'], shape: 'star' },
}
const OKEYS = ['spread', 'spreadY', 'speed', 'up', 'lift', 'dir', 'jitter', 'gravity', 'drag', 'life', 'size', 'sizeEnd', 'color', 'colorEnd', 'alpha', 'additive', 'shape', 'swirl']
const OB = {}
const DIR = [0, 0, 0]
function emit(fx, n, p, x, y, z, sc = 1, dir) {
  if (!fx || !fx.burst) return
  n = Math.round(n)
  if (n < 1) return
  for (let i = 0; i < OKEYS.length; i++) OB[OKEYS[i]] = p[OKEYS[i]]
  OB.x = x
  OB.y = y
  OB.z = z
  if (sc !== 1) {
    if (OB.spread !== undefined) OB.spread *= sc
    if (OB.spreadY !== undefined) OB.spreadY *= sc
    if (OB.size !== undefined) OB.size *= sc
    if (OB.sizeEnd !== undefined) OB.sizeEnd *= sc
    if (OB.speed !== undefined) OB.speed *= Math.sqrt(sc)
  }
  if (dir) OB.dir = dir
  fx.burst(n, OB)
}
const emitV = (fx, n, p, v, sc, dir) => emit(fx, n, p, v.x, v.y, v.z, sc, dir)
function setDir(x, y, z) {
  const l = Math.hypot(x, y, z) || 1
  DIR[0] = x / l
  DIR[1] = y / l
  DIR[2] = z / l
  return DIR
}

// ---------------------------------------------------------------------------------------------
// Per-instance state + phase bookkeeping.
function base(opts) {
  const S = opts && opts.scale > 0 ? opts.scale : 1
  const root = new Group()
  root.rotation.order = 'YXZ'
  root.scale.setScalar(S)
  root.position.set(0, -1000, 0) // out of sight until the first update places it
  return {
    S,
    root,
    fx: opts && opts.fx,
    eyes: [],
    seed: Math.random() * 7,
    phase: '',
    prev: '',
    k: 0,
    prevK: 0,
    k0: -1,
    entered: false,
    strikeNow: false,
    postStarted: false,
    post: 0,
    t: 0,
    dt: 0,
    atkDur: 0.5,
    from: new Vector3(),
    a0: new Vector3(),
    anchor: null,
    anchorW: new Vector3(),
    hasAnchor: false,
    target: new Vector3(),
    sp: new Vector3(),
    v: new Vector3(),
    pitch0: 0,
    yaw0: 0,
    above: [],
    acc: [0, 0, 0, 0, 0, 0, 0, 0],
  }
}
function begin(st, s) {
  const p = s.phase
  const post = p === 'hold' || p === 'recover'
  st.phase = p
  st.entered = p !== st.prev
  st.k = st.entered && post ? 0 : clamp01(s.k || 0)
  st.k0 = st.entered ? -1 : st.prevK
  st.strikeNow = false
  st.dt = s.dt || 0
  if (st.entered) {
    st.from.copy(st.root.position)
    if (st.hasAnchor) st.a0.copy(st.anchorW)
    else st.a0.copy(st.root.position)
    if (post && !st.postStarted) {
      st.postStarted = true
      st.strikeNow = true
      st.post = 0
      st.sp.copy(st.root.position)
    }
  } else if (post) st.post += st.dt
  if (p === 'attack' && s.phaseDur > 0) st.atkDur = s.phaseDur
  st.target.copy(s.target)
  st.t = s.time ?? s.t ?? 0
  st.fx = s.fx || st.fx
}
function end(st) {
  st.prev = st.phase
  st.prevK = st.k
  if (st.anchor) {
    st.anchor.getWorldPosition(st.anchorW)
    st.hasAnchor = true
  }
}
// k crossed `k` this frame inside `phase` (fires once, also on the entry frame when k >= k).
const at = (st, phase, k) => st.phase === phase && st.k0 < k && st.k >= k
// Rate-limited emission count (per second) on accumulator slot i.
function tick(st, i, perSec) {
  st.acc[i] += perSec * st.dt
  const n = Math.floor(st.acc[i])
  st.acc[i] -= n
  return n
}
// Surface crossing on slot i: +1 popped out, -1 dived in, 0 nothing (never on the first sample).
function surf(st, i, y, surface) {
  const a = y > surface
  const prev = st.above[i]
  st.above[i] = a
  if (prev === undefined) return 0
  return a === prev ? 0 : a ? 1 : -1
}

// ---------------------------------------------------------------------------------------------
// Math helpers (module scratch, never reentrant).
const _a = new Vector3()
const _b = new Vector3()
const _c = new Vector3()
const _d = new Vector3()
const _e = new Vector3()
const _m = new Vector3()
const _n = new Vector3()
const _p0 = new Vector3()
const _p1 = new Vector3()
const _p2 = new Vector3()
const _p3 = new Vector3()
const _tn = new Vector3()
const _al1 = new Vector3()
const _al2 = new Vector3()
const _sd = new Vector3()

const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z)
const pitchOf = (d) => {
  const l = d.length()
  return l > 1e-6 ? Math.asin(Math.max(-1, Math.min(1, -d.y / l))) : 0
}
function lerpAngle(a, b, t) {
  let d = (b - a) % (2 * PI)
  if (d > PI) d -= 2 * PI
  if (d < -PI) d += 2 * PI
  return a + d * t
}
// Cylinder / sphere stretched from a to b (both in the mesh's parent space), radius r.
function stretch(mesh, a, b, r) {
  _sd.subVectors(b, a)
  const len = _sd.length()
  mesh.position.addVectors(a, b).multiplyScalar(0.5)
  if (len > 1e-6) mesh.quaternion.setFromUnitVectors(UP, _sd.multiplyScalar(1 / len))
  mesh.scale.set(r, Math.max(len, 1e-4), r)
}
// Capsule (geo.capsule: radius 0.5, height 2) from a to b, overlapping its neighbours.
function stretchCap(mesh, a, b, r) {
  _sd.subVectors(b, a)
  const len = _sd.length()
  mesh.position.addVectors(a, b).multiplyScalar(0.5)
  if (len > 1e-6) mesh.quaternion.setFromUnitVectors(UP, _sd.multiplyScalar(1 / len))
  mesh.scale.set(r * 2, Math.max(r * 0.6, (len + r) / 2), r * 2)
}
function cubic(out, a, b, c, d, u) {
  const v = 1 - u
  const w0 = v * v * v
  const w1 = 3 * v * v * u
  const w2 = 3 * v * u * u
  const w3 = u * u * u
  return out.set(a.x * w0 + b.x * w1 + c.x * w2 + d.x * w3, a.y * w0 + b.y * w1 + c.y * w2 + d.y * w3, a.z * w0 + b.z * w1 + c.z * w2 + d.z * w3)
}
function cubicTan(out, a, b, c, d, u) {
  const v = 1 - u
  const w0 = -3 * v * v
  const w1 = 3 * v * v - 6 * u * v
  const w2 = 6 * u * v - 3 * u * u
  const w3 = 3 * u * u
  return out.set(a.x * w0 + b.x * w1 + c.x * w2 + d.x * w3, a.y * w0 + b.y * w1 + c.y * w2 + d.y * w3, a.z * w0 + b.z * w1 + c.z * w2 + d.z * w3)
}
function quad(out, a, b, c, u) {
  const v = 1 - u
  return out.set(a.x * v * v + 2 * b.x * u * v + c.x * u * u, a.y * v * v + 2 * b.y * u * v + c.y * u * u, a.z * v * v + 2 * b.z * u * v + c.z * u * u)
}
// Move root so `anchor` (a descendant) sits exactly at world point w.
function alignRoot(root, anchor, w) {
  root.updateMatrixWorld(true)
  anchor.getWorldPosition(_al1)
  root.position.x += w.x - _al1.x
  root.position.y += w.y - _al1.y
  root.position.z += w.z - _al1.z
  root.updateMatrixWorld(true)
}
// Move `child` (a direct child of root) so `anchor` sits exactly at world point w.
function alignChild(root, child, anchor, w) {
  root.updateMatrixWorld(true)
  anchor.getWorldPosition(_al1)
  root.worldToLocal(_al1)
  root.worldToLocal(_al2.copy(w))
  child.position.add(_al2.sub(_al1))
  root.updateMatrixWorld(true)
}
const toLocal = (root, w, out) => root.worldToLocal(out.copy(w))

// ---------------------------------------------------------------------------------------------
// Eyes: googly + pupils tracking the player + blinking.
function addEye(st, parent, pos, r, o) {
  const g = googly(parent, pos, r, o)
  st.eyes.push({ root: g.root, pupil: g.pupil, r })
  return g
}
function blinkAt(t, seed) {
  const period = 2.6 + (seed % 2)
  const ph = (((t + seed * 3) % period) + period) % period
  return ph < 0.16 ? 1 - Math.sin((ph / 0.16) * PI) * 0.92 : 1
}
const _ew = new Vector3()
const _eq = new Quaternion()
function aimEyes(st, player, squint = 0) {
  const open = Math.max(0.08, Math.min(blinkAt(st.t, st.seed), 1 - squint))
  for (let i = 0; i < st.eyes.length; i++) {
    const e = st.eyes[i]
    e.root.getWorldPosition(_ew)
    _ew.set(player.x - _ew.x, player.y + FEET - _ew.y, player.z - _ew.z)
    e.root.getWorldQuaternion(_eq)
    _ew.applyQuaternion(_eq.invert())
    const len = _ew.length()
    let x = 0
    let y = 0
    if (len > 1e-4) {
      x = (_ew.x / len) * 0.55
      y = (_ew.y / len) * 0.55
    }
    const m = Math.hypot(x, y)
    if (m > 0.42 || (_ew.z < 0 && m > 1e-4)) {
      x *= 0.42 / m
      y *= 0.42 / m
    }
    e.pupil.position.set(x, y, Math.sqrt(Math.max(0, 0.62 - x * x - y * y)))
    e.pupil.rotation.set(-Math.asin(y / 0.8), Math.asin(x / 0.8), 0)
    e.root.scale.y = e.r * open
  }
}

// ---------------------------------------------------------------------------------------------
// Sticky tongue (frog + chameleon): pink cylinder + sticky tip ball, in root space.
function makeTongue(root, color, tipColor, r, tipR) {
  const mesh = part(root, geo.cyl, mat(color, { roughness: 0.25 }), [0, 0, 0], [r, 1, r])
  const tip = part(root, geo.sphere, mat(tipColor, { roughness: 0.12 }), [0, 0, 0], [tipR, tipR, tipR])
  outline(tip, 0.08)
  mesh.visible = tip.visible = false
  tip.name = 'strike'
  return { mesh, tip, r, mW: new Vector3(), tipW: new Vector3(), from: new Vector3(), out: false, back: false, la: new Vector3(), lb: new Vector3() }
}
// attack: shoots mouth -> target; hold: reels the stuck tip back; recover: snaps the rest back.
function lashTongue(st, s, T) {
  const k = st.k
  if (st.entered) {
    T.from.copy(T.tipW)
    T.back = T.out
  }
  let vis = false
  if (st.phase === 'attack') {
    T.tipW.lerpVectors(T.mW, s.target, easeOut(k))
    vis = true
  } else if (st.phase === 'hold') {
    T.tipW.lerpVectors(s.target, T.mW, 0.72 * easeInOut(k))
    vis = true
  } else if (st.phase === 'recover' && T.back) {
    const r = clamp01(k / (s.hit ? 0.2 : 0.14))
    T.tipW.lerpVectors(T.from, T.mW, easeIn(r))
    vis = r < 1
  }
  T.out = vis
}
function drawTongue(root, T) {
  T.mesh.visible = T.tip.visible = T.out
  if (!T.out) return
  root.worldToLocal(T.la.copy(T.mW))
  root.worldToLocal(T.lb.copy(T.tipW))
  stretch(T.mesh, T.la, T.lb, T.r)
  T.tip.position.copy(T.lb)
}

// Shared materials.
const SLIME_GOO = () => clear('#7dff5a', 0.75)
const TOOTH = () => mat('#ffffff', { roughness: 0.2 })

// =============================================================================================
// 1. Sticky-Tongue Frog
function frog(opts = {}) {
  const st = base(opts)
  const root = st.root
  const GREEN = mat('#5ee03a')
  const DGREEN = mat('#44c42c')
  const pad = new Group()
  root.add(pad)
  outline(part(pad, geo.cyl, mat('#36b84a'), [0, 0, 0], [3.6, 0.28, 3.6]), 0.03)
  for (let i = 0; i < 3; i++) part(pad, geo.box, mat('#279a3a'), [0, 0.15, 0], [0.16, 0.04, 6.6], [0, (i * PI) / 3, 0])
  for (let i = 0; i < 4; i++) part(pad, geo.sphere, mat('#ff7ad0'), [2.3 + Math.cos((i * PI) / 2) * 0.35, 0.4, -1.5 + Math.sin((i * PI) / 2) * 0.35], [0.4, 0.2, 0.4])
  part(pad, geo.sphere, mat('#ffe14a'), [2.3, 0.55, -1.5], [0.24, 0.2, 0.24])

  const fb = new Group()
  fb.rotation.order = 'YXZ'
  root.add(fb)
  outline(part(fb, geo.sphere, GREEN, [0, 1.6, 0], [2.2, 1.6, 2.1]), 0.05)
  part(fb, geo.sphere, mat('#f2f7a8'), [0, 1.35, 1.3], [1.6, 1.15, 1.0])
  outline(part(fb, geo.sphere, GREEN, [0, 2.75, 0.75], [2.0, 1.2, 1.7]), 0.05)
  const mouth = part(fb, geo.sphere, mat('#4a0f22'), [0, 2.45, 1.95], [1.55, 0.14, 0.55])
  for (const sx of [-1, 1]) {
    part(fb, geo.sphere, GREEN, [sx * 0.95, 3.5, 0.8], [0.85, 0.85, 0.85])
    addEye(st, fb, [sx * 0.95, 3.65, 1.12], 0.72)
    part(fb, geo.sphere, mat('#ff8fb0'), [sx * 1.45, 2.55, 1.55], [0.35, 0.2, 0.15])
    part(fb, geo.sphere, GREEN, [sx * 1.9, 0.85, -0.2], [1.0, 0.9, 1.5])
    part(fb, geo.sphere, DGREEN, [sx * 2.25, 0.12, 0.9], [0.9, 0.16, 1.15])
    part(fb, geo.sphere, GREEN, [sx * 1.2, 0.75, 1.55], [0.45, 0.85, 0.45])
    part(fb, geo.sphere, DGREEN, [sx * 1.3, 0.1, 1.95], [0.6, 0.12, 0.55])
  }
  for (const [x, y, z] of [[-0.9, 2.5, -1.2], [0.8, 2.2, -1.5], [0.1, 2.95, -0.9]]) part(fb, geo.sphere, mat('#2fa82e'), [x, y, z], [0.4, 0.25, 0.4])
  const sac = part(fb, geo.sphere, mat('#ffe27a', { roughness: 0.15 }), [0, 1.95, 1.75], [0.9, 0.7, 0.6])
  const strands = [part(fb, geo.sphere, SLIME_GOO(), [-0.6, 2.05, 2.25], [0.14, 0.45, 0.14]), part(fb, geo.sphere, SLIME_GOO(), [0.55, 2.1, 2.25], [0.12, 0.35, 0.12])]
  const mouthA = new Object3D()
  mouthA.position.set(0, 2.45, 2.35)
  fb.add(mouthA)
  const T = makeTongue(root, '#ff6fa8', '#ff3f8e', 0.3, 0.7)

  function update(s) {
    begin(st, s)
    const k = st.k
    const t = st.t
    const ph = st.phase
    const fx = st.fx
    const S = st.S
    root.position.set(s.home.x, s.surface, s.home.z)
    root.rotation.set(0, yawTo(root.position, s.target), 0)
    let by = 0.25
    let bz = 0
    let pitch = 0
    let sacA = 0.15
    let open = 0
    let sq = 1
    let padY = 0
    let squint = 0
    if (ph === 'tell') {
      const h = clamp01(k / 0.3)
      by = lerp(-4.5, 0.25, easeOut(h)) + Math.sin(h * PI) * 2.6
      bz = lerp(-3.5, 0, easeOut(h))
      pitch = -0.6 * (1 - h)
      const a = clamp01((k - 0.3) / 0.7)
      sacA = 0.15 + a * (0.5 + 0.5 * Math.sin(t * 11)) * 0.95
      sq = 1 + 0.05 * a * Math.sin(t * 11)
      if (at(st, 'tell', 0.3)) emit(fx, 12, P.splashS, root.position.x, s.surface + 0.3, root.position.z, S)
    } else if (ph === 'attack') {
      open = 1
      pitch = -0.18
      sacA = 0.3
    } else if (ph === 'hold') {
      open = 1
      pitch = -0.12 + 0.06 * Math.sin(t * 22)
      sq = 1 + 0.04 * Math.sin(t * 22)
    } else if (s.hit) {
      // gulp, spit, sink with the pad
      const g = clamp01(k / 0.35)
      sq = 1 + 0.22 * Math.sin(g * PI)
      sacA = 0.15 + 0.8 * Math.sin(g * PI)
      open = g < 0.2 ? 1 : 0
      by = 0.25 - 6.5 * easeIn(clamp01((k - 0.38) / 0.62))
      padY = -3 * easeIn(clamp01((k - 0.55) / 0.45))
    } else {
      // missed: tongue snaps back, annoyed blink, dives into the slime
      const d = clamp01((k - 0.2) / 0.8)
      squint = k < 0.3 ? 0.6 : 0
      bz = 7 * d
      by = 0.25 + 5 * d - 10.5 * d * d
      pitch = 1.9 * easeIn(d)
      padY = -3 * easeIn(clamp01((k - 0.6) / 0.4))
    }
    fb.position.set(0, by, bz)
    fb.rotation.set(pitch, 0, 0)
    fb.scale.set(sq, 1 / Math.sqrt(sq), sq)
    pad.position.y = padY + Math.sin(t * 1.7 + st.seed) * 0.06
    pad.rotation.z = Math.sin(t * 1.3) * 0.02
    sac.scale.set(0.9 * (1 + sacA * 0.8), 0.7 * (1 + sacA), 0.6 * (1 + sacA * 1.6))
    sac.position.z = 1.75 + sacA * 0.45
    mouth.scale.y = 0.14 + 0.5 * open
    for (let i = 0; i < strands.length; i++) strands[i].scale.y = (0.4 - i * 0.08) * (1 + 0.25 * Math.sin(t * 6 + i * 2)) + open * 0.3
    root.updateMatrixWorld(true)
    mouthA.getWorldPosition(T.mW)
    lashTongue(st, s, T)
    drawTongue(root, T)

    // splashes in / out of the slime, strike splat, spit, drips
    fb.getWorldPosition(_a)
    const c = surf(st, 0, _a.y + 1.4 * S, s.surface)
    if (c) emit(fx, c > 0 ? 22 : 30, P.splash, _a.x, s.surface, _a.z, S)
    if (st.strikeNow) emitV(fx, s.hit ? 22 : 10, P.pink, s.hit ? s.target : T.tipW, S)
    if (at(st, 'recover', 0.36) && s.hit) emit(fx, 14, P.spit, T.mW.x, T.mW.y, T.mW.z, S, setDir(0, 0.6, 1))
    const n = by > -1 ? tick(st, 0, 1.6) : 0
    if (n) emit(fx, n, P.drip, T.mW.x, T.mW.y - 0.3 * S, T.mW.z, S)
    aimEyes(st, s.player, squint)
    end(st)
  }
  return {
    root,
    update,
    grabPoint(out) {
      if (T.out) return out.copy(T.tipW).setY(T.tipW.y - FEET)
      return out.copy(st.target)
    },
    dispose() {},
  }
}

// =============================================================================================
// 2. Robo-Duck
function duck(opts = {}) {
  const st = base(opts)
  const root = st.root
  const YEL = mat('#ffd93a')
  const YEL2 = mat('#ffc21f')
  const MET = metal('#8d99ad')
  const MET2 = metal('#c9d3e0')
  outline(part(root, geo.sphere, YEL, [0, 0, 0], [1.5, 1.3, 1.9]), 0.05)
  part(root, geo.sphere, mat('#fff08a'), [0, -0.35, 0.75], [1.15, 0.95, 1.15])
  outline(part(root, geo.sphere, YEL, [0, 1.4, 1.15], [1.05, 1.05, 1.05]), 0.05)
  part(root, geo.sphere, mat('#ff9a1f'), [0, 1.18, 2.15], [0.7, 0.2, 0.75])
  part(root, geo.sphere, mat('#ff7a1a'), [0, 1.0, 2.0], [0.55, 0.14, 0.6])
  addEye(st, root, [-0.45, 1.65, 1.95], 0.45)
  part(root, geo.cyl, MET, [0.45, 1.65, 1.95], [0.46, 0.3, 0.46], [PI / 2, 0, 0])
  part(root, geo.sphere, lit('#3af0ff', 2.2), [0.45, 1.65, 2.12], [0.33, 0.33, 0.12])
  part(root, geo.torus, MET, [0, 1.5, 1.15], [1.06, 1.06, 0.5], [PI / 2, 0, 0])
  part(root, geo.cyl, MET2, [0.3, 2.7, 1.0], [0.05, 0.6, 0.05])
  part(root, geo.sphere, lit('#3af0ff', 2), [0.3, 3.05, 1.0], [0.14, 0.14, 0.14])
  part(root, geo.cone, YEL, [0, 2.5, 1.0], [0.18, 0.5, 0.18], [-0.3, 0, 0])
  part(root, geo.cone, YEL, [0.12, 2.45, 0.85], [0.14, 0.4, 0.14], [-0.6, 0, 0.3])
  part(root, geo.cone, YEL2, [0, 0.5, -1.95], [0.5, 0.9, 0.5], [-1.9, 0, 0])
  const wings = []
  for (const sd of [-1, 1]) {
    const w = new Group()
    w.position.set(sd * 1.35, 0.35, -0.1)
    root.add(w)
    outline(part(w, geo.sphere, YEL2, [sd * 0.7, 0, 0], [0.9, 0.25, 1.2]), 0.06)
    part(w, geo.sphere, mat('#ffb000'), [sd * 1.4, 0.05, -0.3], [0.6, 0.18, 0.8])
    w.userData.sd = sd
    wings.push(w)
  }
  // ONE robotic leg with a rocket thruster foot
  const leg = new Group()
  leg.position.set(0, -1.0, 0.2)
  root.add(leg)
  part(leg, geo.sphere, MET, [0, 0, 0], [0.42, 0.42, 0.42])
  part(leg, geo.cyl, MET2, [0, -0.55, 0], [0.2, 1.1, 0.2])
  const shin = new Group()
  shin.position.set(0, -1.1, 0)
  leg.add(shin)
  part(shin, geo.sphere, MET, [0, 0, 0], [0.3, 0.3, 0.3])
  part(shin, geo.torus, lit('#3ad0ff', 2), [0, 0, 0], [0.3, 0.3, 0.3], [0, PI / 2, 0])
  part(shin, geo.cyl, MET2, [0, -0.5, 0], [0.17, 1.0, 0.17])
  const foot = new Group()
  foot.position.set(0, -1.05, 0)
  shin.add(foot)
  part(foot, geo.cone, MET, [0, -0.15, 0], [0.45, 0.6, 0.45])
  part(foot, geo.torus, lit('#3ad0ff', 2.4), [0, -0.45, 0], [0.42, 0.42, 0.42], [PI / 2, 0, 0])
  const flame = new Group()
  flame.position.set(0, -0.45, 0)
  foot.add(flame)
  part(flame, geo.cone, lit('#3ad0ff', 2.4), [0, -0.7, 0], [0.38, 1.4, 0.38], [PI, 0, 0])
  part(flame, geo.cone, lit('#ffffff', 2.2), [0, -0.5, 0], [0.2, 0.9, 0.2], [PI, 0, 0])
  const kick = new Object3D()
  kick.position.set(0, -0.5, 0)
  foot.add(kick)
  st.anchor = kick
  kick.name = 'strike'
  const L = new Vector3()

  function update(s) {
    begin(st, s)
    const k = st.k
    const t = st.t
    const ph = st.phase
    const fx = st.fx
    const S = st.S
    const sd = s.side || 1
    let flap = Math.sin(t * 16)
    let wingBase = 0.2
    let flameK = 0.3
    if (ph === 'tell') {
      L.set(s.target.x + sd * 9, s.target.y + 5, s.target.z - 13)
      const a = easeInOut(clamp01(k / 0.75))
      root.position.lerpVectors(s.home, L, a)
      root.position.y += Math.sin(a * PI) * 4 + Math.sin(t * 3) * 0.3
      const yaw = lerpAngle(yawTo(s.home, L), yawTo(root.position, s.target), clamp01((k - 0.35) / 0.45))
      const aim = clamp01((k - 0.75) / 0.25)
      root.rotation.set(0.25 * (1 - a) - 0.35 * aim, yaw, Math.sin(t * 2) * 0.08)
      leg.rotation.x = -0.35
      shin.rotation.x = 0.8
      flameK = 0.25 + 0.9 * k
      const n = tick(st, 1, 6 + 30 * k)
      if (n) {
        foot.getWorldPosition(_a)
        emit(fx, n, P.flame, _a.x, _a.y - 0.6 * S, _a.z, S * 0.7, setDir(0, -1, 0))
      }
    } else if (ph === 'attack') {
      _d.subVectors(s.target, st.a0)
      const len = _d.length()
      if (len > 1e-4) st.v.copy(_d).multiplyScalar(1 / len)
      const ext = easeOut(clamp01(k / 0.3))
      leg.rotation.x = lerp(-0.35, -1.35, ext)
      shin.rotation.x = lerp(0.8, 0, ext)
      st.yaw0 = Math.atan2(st.v.x, st.v.z)
      st.pitch0 = pitchOf(st.v) - 0.27 * ext
      root.rotation.set(st.pitch0, st.yaw0, Math.sin(t * 30) * 0.04)
      _b.lerpVectors(st.a0, s.target, 0.3 * k + 0.7 * k * k)
      alignRoot(root, kick, _b)
      wingBase = 0.9
      flap = Math.sin(t * 30) * 0.3
      flameK = 1.7
      const n = tick(st, 1, 80)
      if (n) emit(fx, n, P.flame, _b.x, _b.y, _b.z, S, setDir(-st.v.x, -st.v.y, -st.v.z))
    } else {
      // tumble / spin away and fly off
      const ts = st.post
      if (st.strikeNow) {
        if (s.hit) emitV(fx, 30, P.star, s.target, S)
        emitV(fx, 16, P.flame, s.target, S)
      }
      const spin = s.hit ? 1 : 0.4
      root.position.copy(st.sp).addScaledVector(st.v, 15 * ts)
      root.position.x += sd * 9 * ts * ts
      root.position.y += 9 * ts * ts
      root.rotation.set(st.pitch0 + ts * 11 * spin, st.yaw0 + ts * 2 * sd, ts * 5 * sd * spin)
      leg.rotation.x = -0.35 - Math.sin(t * 9) * 0.4
      shin.rotation.x = 0.6
      flameK = 1 + 0.3 * Math.sin(t * 25)
      flap = Math.sin(t * 24)
      const n = tick(st, 1, 30)
      if (n) {
        foot.getWorldPosition(_a)
        emit(fx, n, P.flame, _a.x, _a.y, _a.z, S * 0.8, setDir(0, -1, 0))
      }
    }
    for (let i = 0; i < 2; i++) {
      const w = wings[i]
      w.rotation.set(ph === 'attack' ? 0.5 : 0, 0, w.userData.sd * (wingBase + flap * 0.7))
    }
    const fl = flameK * (0.85 + 0.3 * Math.random())
    flame.scale.set(Math.min(1.4, 0.6 + flameK * 0.5), fl, Math.min(1.4, 0.6 + flameK * 0.5))
    aimEyes(st, s.player)
    end(st)
  }
  return { root, update, grabPoint: (out) => out.copy(st.target), dispose() {} }
}

// =============================================================================================
// 3. Slime Dragon (serpent rising from the slime)
function dragon(opts = {}) {
  const st = base(opts)
  const root = st.root
  const G = mat('#43d13a')
  const BEL = mat('#f6e7a1')
  const FIN = mat('#2bb38a')
  const W = TOOTH()
  const NSEG = 8
  const segs = []
  for (let i = 0; i < NSEG; i++) {
    const sg = part(root, geo.sphere, G)
    outline(sg, 0.05)
    part(sg, geo.sphere, BEL, [0, 0, 0.72], [0.72, 0.78, 0.36])
    part(sg, geo.cone, FIN, [0, 0, -0.95], [0.3, 0.6, 0.3], [-PI / 2, 0, 0])
    segs.push(sg)
  }
  const HS = 1.3 // big chunky head
  const head = new Group()
  head.rotation.order = 'YXZ'
  head.scale.setScalar(HS)
  root.add(head)
  outline(part(head, geo.sphere, G, [0, 0.6, 0.5], [1.8, 1.3, 1.9]), 0.05)
  outline(part(head, geo.sphere, G, [0, 0.35, 2.0], [1.4, 0.75, 1.6]), 0.05)
  for (const sx of [-1, 1]) {
    part(head, geo.sphere, mat('#1f5a1c'), [sx * 0.45, 0.85, 3.45], [0.2, 0.12, 0.12])
    addEye(st, head, [sx * 0.85, 1.6, 1.25], 0.8)
    part(head, geo.cone, mat('#fff0c2'), [sx * 0.75, 1.9, -0.3], [0.32, 1.7, 0.32], [-0.75, 0, -sx * 0.3])
    part(head, geo.sphere, FIN, [sx * 1.8, 0.85, 0.0], [0.18, 0.95, 1.15], [0.3, 0, -sx * 0.55])
    part(head, geo.cone, W, [sx * 0.8, -0.45, 2.85], [0.2, 0.75, 0.2], [PI, 0, 0])
    part(head, geo.cone, W, [sx * 0.38, -0.45, 3.3], [0.16, 0.55, 0.16], [PI, 0, 0])
  }
  part(head, geo.sphere, mat('#ff6f9a'), [0, 0.0, 1.6], [1.3, 0.55, 1.75])
  const jaw = new Group()
  head.add(jaw)
  outline(part(jaw, geo.sphere, G, [0, -0.4, 1.6], [1.35, 0.45, 1.9]), 0.05)
  part(jaw, geo.sphere, BEL, [0, -0.62, 1.5], [1.15, 0.3, 1.6])
  for (const sx of [-1, 1]) part(jaw, geo.cone, W, [sx * 0.65, 0.05, 2.75], [0.17, 0.6, 0.17])
  part(jaw, geo.sphere, mat('#ff4f8a'), [0, -0.12, 1.3], [0.65, 0.2, 1.2])
  const strands = []
  for (const [x, z] of [[-0.55, 2.4], [0.5, 2.7], [0.05, 3.1]]) strands.push(part(head, geo.sphere, SLIME_GOO(), [x, -0.45, z], [0.14, 0.55, 0.14]))
  const anchor = new Object3D()
  anchor.position.set(0, -0.1, 2.0)
  head.add(anchor)
  st.anchor = anchor
  anchor.name = 'strike'
  const tl = new Vector3()
  const dl = new Vector3()
  const peek = new Vector3(0, -2.2, 0.6)
  const rf = new Vector3()
  const B = new Vector3(0, -9, -3)

  function placeHead() {
    _a.copy(anchor.position).multiplyScalar(HS).applyEuler(head.rotation)
    head.position.copy(dl).sub(_a)
  }
  function neck() {
    // cubic S-curve from deep under the slime to the back of the head
    _p3.set(0, 0.2 * HS, -1.0 * HS).applyEuler(head.rotation).add(head.position)
    _p1.set(0, lerp(B.y, _p3.y, 0.5), -5)
    _n.set(0, -0.5, -1).normalize().applyEuler(head.rotation)
    const dist = _p3.distanceTo(B)
    _p2.copy(_p3).addScaledVector(_n, Math.max(2.5, dist * 0.3))
    const segLen = (dist * 1.2) / NSEG
    for (let i = 0; i < NSEG; i++) {
      const u = (i + 0.6) / (NSEG + 0.4)
      const r = lerp(1.65, 1.15, i / (NSEG - 1))
      const sg = segs[i]
      cubic(sg.position, B, _p1, _p2, _p3, u)
      cubicTan(_tn, B, _p1, _p2, _p3, u)
      const l = _tn.length()
      if (l > 1e-5) sg.quaternion.setFromUnitVectors(UP, _tn.multiplyScalar(1 / l))
      sg.scale.set(r, Math.max(r, segLen * 0.62), r)
    }
  }

  function update(s) {
    begin(st, s)
    const k = st.k
    const t = st.t
    const ph = st.phase
    const fx = st.fx
    const S = st.S
    root.position.set(s.home.x, s.surface, s.home.z)
    root.rotation.set(0, 0, 0)
    root.updateMatrixWorld(true)
    toLocal(root, s.target, tl)
    let hx = -0.05
    let hy = 0
    let hz = 0
    let open = 0
    let squint = 0
    if (ph === 'tell') {
      const r = easeOut(clamp01(k / 0.4))
      dl.set(0, lerp(-6, -2.2, r) + Math.sin(t * 2.2) * 0.15, 0.6)
      peek.copy(dl)
      open = 0.3 * easeIn(k)
      hy = Math.max(-0.7, Math.min(0.7, yawTo(root.position, s.player)))
      const n = tick(st, 1, 4 + 14 * k)
      if (n) emit(fx, n, P.bubble, root.position.x, s.surface + 0.1, root.position.z + 0.6 * S, S)
    } else if (ph === 'attack') {
      dl.lerpVectors(peek, tl, 1 - Math.pow(1 - k, 2.2))
      hx = -0.55 * Math.sin(k * PI)
      open = k < 0.8 ? lerp(0.3, 1, easeOut(k / 0.8)) : 1 - easeIn((k - 0.8) / 0.2)
      if (at(st, 'attack', 0)) emit(fx, 40, P.splash, root.position.x, s.surface, root.position.z, S * 1.4)
    } else if (ph === 'hold') {
      // chomped: shake the player
      const sh = clamp01(k * 5)
      dl.copy(tl)
      dl.x += Math.sin(t * 22) * 0.35 * sh
      dl.y += Math.sin(t * 31) * 0.15 * sh
      hy = Math.sin(t * 19) * 0.4 * sh
      hz = Math.sin(t * 15) * 0.25 * sh
      open = 0.12
    } else {
      if (st.entered) rf.copy(dl)
      const d = s.hit ? k : clamp01((k - 0.3) / 0.7)
      if (!s.hit && k < 0.4) {
        // missed: empty chomp-chomp and an annoyed head shake
        open = Math.abs(Math.sin((k / 0.4) * PI * 2)) * 0.75
        hy = Math.sin(t * 9) * 0.35
        squint = 0.5
      } else open = 0.35 * Math.sin(d * PI)
      dl.copy(rf)
      dl.y = lerp(rf.y, -10, easeIn(d))
      hx = 0.75 * easeIn(d)
    }
    head.rotation.set(hx, hy, hz)
    jaw.rotation.x = open * 0.95
    placeHead()
    neck()
    for (let i = 0; i < 3; i++) strands[i].scale.y = 0.55 * (1 + 0.25 * Math.sin(t * 7 + i * 2)) + open * 0.5

    root.updateMatrixWorld(true)
    anchor.getWorldPosition(_a)
    const c = surf(st, 0, _a.y + 0.6 * S, s.surface)
    if (c) emit(fx, c > 0 ? 34 : 50, P.splash, _a.x, s.surface, _a.z, S * 1.4)
    if (st.strikeNow) {
      emitV(fx, s.hit ? 26 : 14, P.chomp, s.target, S)
      emitV(fx, 12, P.spit, s.target, S)
    }
    if ((ph === 'attack' || ph === 'hold') && _a.y > s.surface) {
      const n = tick(st, 0, 7)
      if (n) emit(fx, n, P.drip, _a.x, _a.y - 0.5 * S, _a.z, S)
    }
    if (ph !== 'tell' && _a.y > s.surface) {
      const n = tick(st, 2, 10)
      if (n) emit(fx, n, P.ripple, root.position.x, s.surface + 0.1, root.position.z, S * 2)
    }
    aimEyes(st, s.player, squint)
    end(st)
  }
  return {
    root,
    update,
    grabPoint(out) {
      if (st.phase === 'hold' || (st.phase === 'recover' && st.k < 0.05)) return anchor.getWorldPosition(out).setY(out.y - FEET)
      return out.copy(st.target)
    },
    dispose() {},
  }
}

// =============================================================================================
// 4. Freeze-Ray Penguin
function penguin(opts = {}) {
  const st = base(opts)
  const root = st.root
  const NAVY = mat('#24324f')
  const NAVY2 = mat('#1b2740')
  const MET = metal('#5b6b82')
  const MET2 = metal('#c9d3e0')
  const CYAN = lit('#3ad0ff', 2.2)
  const rise = new Group()
  root.add(rise)
  outline(part(rise, geo.cylLo, mat('#e6fbff', { roughness: 0.15 }), [0, -0.1, 0], [3, 0.7, 2.6]), 0.03)
  part(rise, geo.box, mat('#c9f1ff', { roughness: 0.15 }), [-1.8, 0.25, 1.0], [0.9, 0.6, 0.8], [0.2, 0.5, 0.1])
  part(rise, geo.box, mat('#c9f1ff', { roughness: 0.15 }), [1.9, 0.2, -0.9], [0.7, 0.5, 0.7], [0.1, 0.9, 0.2])
  const pg = new Group()
  pg.rotation.order = 'YXZ'
  rise.add(pg)
  outline(part(pg, geo.sphere, NAVY, [0, 1.7, 0], [1.25, 1.7, 1.15]), 0.05)
  part(pg, geo.sphere, mat('#ffffff'), [0, 1.55, 0.6], [0.95, 1.35, 0.7])
  outline(part(pg, geo.sphere, NAVY, [0, 3.55, 0.1], [0.95, 0.95, 0.95]), 0.05)
  part(pg, geo.sphere, mat('#ffffff'), [0, 3.45, 0.6], [0.75, 0.65, 0.5])
  for (const sx of [-1, 1]) addEye(st, pg, [sx * 0.33, 3.65, 0.95], 0.38)
  part(pg, geo.cone, mat('#ff9a1f'), [0, 3.35, 1.2], [0.22, 0.5, 0.22], [PI / 2, 0, 0])
  part(pg, geo.sphere, clear('#bfefff', 0.28), [0, 3.55, 0.1], [1.45, 1.45, 1.45])
  part(pg, geo.torus, MET2, [0, 2.6, 0.1], [1.1, 1.1, 1.1], [PI / 2, 0, 0])
  part(pg, geo.cyl, MET2, [0, 5.25, 0.1], [0.06, 0.7, 0.06])
  part(pg, geo.sphere, lit('#ff4466', 2), [0, 5.65, 0.1], [0.18, 0.18, 0.18])
  part(pg, geo.box, MET, [0, 2.0, 1.15], [0.8, 0.6, 0.15])
  part(pg, geo.sphere, CYAN, [-0.18, 2.05, 1.25], [0.1, 0.1, 0.06])
  part(pg, geo.sphere, lit('#ffd23a', 2), [0.18, 2.05, 1.25], [0.1, 0.1, 0.06])
  for (const sx of [-1, 1]) part(pg, geo.sphere, mat('#ff9a1f'), [sx * 0.5, 0.12, 0.5], [0.45, 0.18, 0.65])
  part(pg, geo.sphere, NAVY2, [-1.25, 1.9, 0], [0.25, 0.95, 0.5], [0, 0, 0.35])
  part(pg, geo.sphere, NAVY2, [1.15, 2.0, 0.45], [0.25, 0.85, 0.45], [-0.9, 0, 0.4])
  const gun = new Group()
  gun.position.set(1.05, 2.2, 0.85)
  pg.add(gun)
  part(gun, geo.box, MET, [0, 0, 0], [0.6, 0.7, 1.4])
  part(gun, geo.cyl, MET2, [0, 0.1, 1.2], [0.25, 1.2, 0.25], [PI / 2, 0, 0])
  part(gun, geo.torus, CYAN, [0, 0.1, 1.0], [0.32, 0.32, 0.32])
  part(gun, geo.torus, CYAN, [0, 0.1, 1.5], [0.32, 0.32, 0.32])
  part(gun, geo.box, MET, [0, -0.5, -0.2], [0.25, 0.6, 0.3])
  part(gun, geo.cyl, lit('#7ff6ff', 1.8), [0, 0.5, -0.2], [0.2, 0.6, 0.2], [PI / 2, 0, 0])
  const orb = part(gun, geo.sphere, lit('#7ff6ff', 3), [0, 0.1, 1.95], [0.5, 0.5, 0.5])
  const muzzle = new Object3D()
  muzzle.position.set(0, 0.1, 1.95)
  gun.add(muzzle)
  // beams fade -> per-instance materials
  const coreMat = lit('#bff8ff', 2.6).clone()
  coreMat.transparent = true
  coreMat.depthWrite = false
  const glowMat = clear('#5ad8ff', 0.4).clone()
  const core = part(root, geo.cylLo, coreMat)
  const glow = part(root, geo.cylLo, glowMat)
  core.castShadow = glow.castShadow = false
  core.visible = glow.visible = false
  const mW = new Vector3()
  const endW = new Vector3()
  const la = new Vector3()
  const lb = new Vector3()

  function update(s) {
    begin(st, s)
    const k = st.k
    const t = st.t
    const ph = st.phase
    const fx = st.fx
    const S = st.S
    root.position.set(s.home.x, s.surface, s.home.z)
    root.rotation.set(0, yawTo(root.position, s.target), 0)
    let riseY = 0
    let orbK = 0.15
    let beamA = 0
    let shiver = 0
    pg.position.set(0, 0.25, 0)
    pg.rotation.set(0, 0, 0)
    if (ph === 'tell') {
      riseY = lerp(-4.2, 0, easeOutBack(clamp01(k / 0.2)))
      orbK = 0.15 + 0.85 * easeIn(clamp01((k - 0.2) / 0.8))
      shiver = clamp01((k - 0.7) / 0.3)
    } else if (ph === 'attack') {
      orbK = 1 + 0.15 * Math.sin(t * 40)
      beamA = 1
      pg.position.z = -0.25 * k
    } else {
      // beam fades into ice shards, belly-slide off the floe
      beamA = 1 - clamp01(k / 0.3)
      orbK = 1 - clamp01(k / 0.3)
      const tip = easeInOut(clamp01(k / 0.25))
      const slide = 7 * easeIn(clamp01((k - 0.2) / 0.6))
      const fall = Math.max(0, slide - 2.6) * 0.9 + 5 * easeIn(clamp01((k - 0.6) / 0.4))
      pg.rotation.x = tip * PI * 0.5
      pg.position.set(0, 0.25 + tip * 0.95 - fall, slide)
      riseY = -3 * easeIn(clamp01((k - 0.55) / 0.45))
    }
    rise.position.y = riseY + Math.sin(t * 1.6 + st.seed) * 0.06
    pg.rotation.z = shiver * Math.sin(t * 45) * 0.04
    orb.scale.setScalar(Math.max(0.01, 0.55 * orbK))
    root.updateMatrixWorld(true)
    if (ph === 'tell' || ph === 'attack') gun.lookAt(s.target)
    root.updateMatrixWorld(true)
    muzzle.getWorldPosition(mW)

    if (ph === 'attack') endW.lerpVectors(mW, s.target, easeOut(k))
    else if (st.strikeNow) endW.copy(s.target)
    core.visible = glow.visible = beamA > 0.01 && (ph === 'attack' || ph === 'recover' || ph === 'hold')
    if (core.visible) {
      toLocal(root, mW, la)
      toLocal(root, endW, lb)
      const flick = 0.85 + 0.3 * Math.random()
      stretch(core, la, lb, 0.22 * flick * (0.4 + 0.6 * beamA))
      stretch(glow, la, lb, 0.6 * flick * (0.5 + 0.5 * beamA))
      coreMat.opacity = beamA
      glowMat.opacity = 0.4 * beamA
    }

    if (st.strikeNow) {
      emitV(fx, s.hit ? 36 : 18, P.ice, endW, S)
      emitV(fx, 20, P.cyan, endW, S)
      for (let i = 1; i <= 5; i++) {
        _a.lerpVectors(mW, endW, i / 6)
        emitV(fx, 5, P.ice, _a, S * 0.6)
      }
    }
    if (ph === 'tell' && orbK > 0.2) {
      const n = tick(st, 1, 20 * orbK)
      if (n) emit(fx, n, P.cyan, mW.x, mW.y, mW.z, S * (0.4 + orbK))
    }
    if (ph === 'attack') {
      const n = tick(st, 1, 40)
      if (n) emitV(fx, n, P.cyan, endW, S)
    }
    pg.getWorldPosition(_a)
    const c = surf(st, 0, _a.y + 1.5 * S, s.surface)
    if (c) emit(fx, c > 0 ? 20 : 30, P.splash, _a.x, s.surface, _a.z, S)
    aimEyes(st, s.player, shiver * 0.4)
    end(st)
  }
  return {
    root,
    update,
    grabPoint: (out) => out.copy(st.target),
    dispose() {
      coreMat.dispose()
      glowMat.dispose()
    },
  }
}

// =============================================================================================
// 5. Dive-Bomb Owl
function owl(opts = {}) {
  const st = base(opts)
  const root = st.root
  const BR = mat('#8a5a2b')
  const BR2 = mat('#6b3f1a')
  const CREAM = mat('#f3dfb5')
  outline(part(root, geo.sphere, BR, [0, 0, 0], [1.5, 1.9, 1.4]), 0.05)
  part(root, geo.sphere, CREAM, [0, -0.3, 0.75], [1.15, 1.4, 0.8])
  for (const [x, y] of [[-0.4, -0.2], [0.35, -0.6], [-0.1, -1.0]]) part(root, geo.cone4, BR2, [x, y, 1.45], [0.14, 0.18, 0.05], [PI, 0, 0])
  const brows = []
  for (const sx of [-1, 1]) {
    part(root, geo.sphere, CREAM, [sx * 0.62, 1.0, 1.0], [0.85, 0.85, 0.4])
    addEye(st, root, [sx * 0.6, 1.05, 1.3], 0.62, { white: '#ffe35a', pupilScale: 0.6 })
    brows.push(part(root, geo.box, mat('#3f2410'), [sx * 0.6, 1.78, 1.3], [0.9, 0.22, 0.25], [0, 0, sx * 0.35]))
    part(root, geo.cone, BR2, [sx * 0.95, 1.95, 0.2], [0.3, 0.9, 0.3], [0, 0, -sx * 0.4])
  }
  part(root, geo.cone, mat('#ff9a1f'), [0, 0.6, 1.5], [0.22, 0.55, 0.22], [PI * 0.8, 0, 0])
  part(root, geo.sphere, BR2, [0, -1.6, -1.1], [0.8, 0.3, 0.9], [0.5, 0, 0])
  for (const sx of [-1, 1]) {
    part(root, geo.sphere, mat('#ffc21f'), [sx * 0.5, -1.85, 0.5], [0.3, 0.25, 0.35])
    part(root, geo.cone, mat('#3a2a1a'), [sx * 0.5 - 0.12, -2.05, 0.85], [0.08, 0.35, 0.08], [1.9, 0, 0])
    part(root, geo.cone, mat('#3a2a1a'), [sx * 0.5 + 0.12, -2.05, 0.85], [0.08, 0.35, 0.08], [1.9, 0, 0])
  }
  const wings = []
  for (const sd of [-1, 1]) {
    const w = new Group()
    w.position.set(sd * 1.3, 0.6, -0.1)
    root.add(w)
    outline(part(w, geo.sphere, mat('#7a4a20'), [0, -1.1, 0], [0.45, 1.3, 0.9]), 0.06)
    part(w, geo.sphere, mat('#a0703a'), [0, -2.1, -0.25], [0.35, 0.95, 0.7])
    part(w, geo.sphere, CREAM, [sd * 0.12, -1.0, 0.25], [0.3, 0.9, 0.5])
    w.userData.sd = sd
    wings.push(w)
  }
  const anchor = new Object3D()
  anchor.position.set(0, 0.2, 1.5)
  root.add(anchor)
  st.anchor = anchor
  anchor.name = 'strike'

  function update(s) {
    begin(st, s)
    const k = st.k
    const t = st.t
    const ph = st.phase
    const fx = st.fx
    const S = st.S
    const sd = s.side || 1
    let spread = 1
    let flap = Math.sin(t * 9)
    let screech = 0
    if (ph === 'tell') {
      const app = easeOut(clamp01(k / 0.35))
      const ang = t * 1.6 + st.seed
      root.position.set(s.home.x + Math.cos(ang) * 4, s.home.y + Math.sin(t * 2.6) * 0.6 + (1 - app) * 16, s.home.z + Math.sin(ang) * 2.4 - (1 - app) * 30)
      screech = clamp01((k - 0.72) / 0.2)
      root.rotation.set(-0.35 * screech, yawTo(root.position, s.player), Math.sin(t * 1.6) * 0.12)
      flap *= 1 - screech * 0.8
    } else if (ph === 'attack') {
      _d.subVectors(s.target, st.a0)
      const len = _d.length()
      if (len > 1e-4) st.v.copy(_d).multiplyScalar(1 / len)
      st.yaw0 = Math.atan2(st.v.x, st.v.z)
      st.pitch0 = pitchOf(st.v)
      root.rotation.set(st.pitch0, st.yaw0, 0)
      _b.lerpVectors(st.a0, s.target, 0.2 * k + 0.8 * k * k)
      alignRoot(root, anchor, _b)
      spread = 0
      flap = 0
      const n = tick(st, 1, 14)
      if (n) emitV(fx, n, P.feather, _b, S * 0.5)
    } else {
      // pull up and fly off
      const ts = st.post
      if (st.strikeNow && s.hit) {
        emitV(fx, 40, P.feather, s.target, S)
        emitV(fx, 18, P.star, s.target, S)
      }
      _n.set(st.v.x, 0, st.v.z)
      if (_n.lengthSq() < 1e-6) _n.set(0, 0, 1)
      _n.normalize()
      root.position.copy(st.sp).addScaledVector(_n, 18 * ts)
      root.position.x += sd * 6 * ts
      root.position.y += -4 * ts + 12 * ts * ts
      root.rotation.set(lerp(st.pitch0, -0.6, clamp01(ts * 2.2)), st.yaw0, Math.sin(t * 7) * 0.15)
      flap = Math.sin(t * 14)
    }
    for (let i = 0; i < 2; i++) {
      const w = wings[i]
      const z = spread * (1.35 + flap * 0.45 + screech * 0.25) + (1 - spread) * 0.18
      w.rotation.set((1 - spread) * 0.4, 0, w.userData.sd * z)
    }
    for (let i = 0; i < 2; i++) brows[i].position.y = 1.78 + screech * 0.18
    aimEyes(st, s.player)
    end(st)
  }
  return { root, update, grabPoint: (out) => out.copy(st.target), dispose() {} }
}

// =============================================================================================
// 6. Ram Goat
function goat(opts = {}) {
  const st = base(opts)
  const root = st.root
  const WH = mat('#f7f7f2')
  const HORN = mat('#c9a26b')
  const HOOF = mat('#3a3030')
  const rock = new Group()
  root.add(rock)
  outline(part(rock, geo.sphereLo, mat('#8c8f99'), [0, -0.2, 0], [3.0, 1.25, 2.6]), 0.04)
  part(rock, geo.sphereLo, mat('#767984'), [-1.9, -0.1, 1.2], [1.1, 0.8, 1.0])
  part(rock, geo.sphereLo, mat('#9a9da8'), [2.0, -0.2, -0.9], [1.0, 0.7, 1.1])
  part(rock, geo.sphere, mat('#5bbf3a'), [-0.4, 0.95, -0.3], [1.6, 0.25, 1.4])
  const gt = new Group()
  gt.rotation.order = 'YXZ'
  root.add(gt)
  outline(part(gt, geo.sphere, WH, [0, 1.85, -0.1], [1.15, 1.0, 1.7]), 0.05)
  part(gt, geo.sphere, WH, [0.3, 2.6, -0.5], [0.6, 0.5, 0.7])
  part(gt, geo.sphere, WH, [-0.35, 2.55, 0.3], [0.55, 0.45, 0.6])
  part(gt, geo.sphere, WH, [0, 2.1, -1.75], [0.25, 0.3, 0.2])
  const hd = new Group()
  hd.position.set(0, 2.4, 1.25)
  gt.add(hd)
  outline(part(hd, geo.sphere, WH, [0, 0.45, 0.45], [0.65, 0.7, 0.85]), 0.05)
  part(hd, geo.sphere, mat('#efd6cf'), [0, 0.2, 1.05], [0.42, 0.38, 0.45])
  part(hd, geo.cone, mat('#d9d9cf'), [0, -0.25, 0.95], [0.17, 0.55, 0.17], [PI, 0, 0])
  for (const sx of [-1, 1]) {
    addEye(st, hd, [sx * 0.36, 0.75, 0.85], 0.3)
    part(hd, geo.sphere, WH, [sx * 0.72, 0.7, 0.25], [0.45, 0.13, 0.22], [0, 0, -sx * 0.35])
    part(hd, geo.torus, HORN, [sx * 0.55, 1.05, 0.1], [0.48, 0.48, 0.75], [0, PI / 2, 0])
    part(hd, geo.cone, HORN, [sx * 0.55, 0.75, 0.7], [0.17, 0.65, 0.17], [PI / 2, 0, 0])
  }
  const horn = new Object3D()
  horn.position.set(0, 0.8, 1.15)
  hd.add(horn)
  st.anchor = horn
  horn.name = 'strike'
  const fl = new Group()
  fl.position.set(-0.55, 1.2, 0.95)
  gt.add(fl)
  part(fl, geo.cyl, WH, [0, -0.6, 0], [0.2, 1.2, 0.2])
  const hoof = part(fl, geo.cyl, HOOF, [0, -1.12, 0], [0.24, 0.2, 0.24])
  const legs = [fl]
  for (const [x, z] of [[0.55, 0.95], [-0.55, -1.0], [0.55, -1.0]]) {
    const g = new Group()
    g.position.set(x, 1.2, z)
    gt.add(g)
    part(g, geo.cyl, WH, [0, -0.6, 0], [0.2, 1.2, 0.2])
    part(g, geo.cyl, HOOF, [0, -1.12, 0], [0.24, 0.2, 0.24])
    legs.push(g)
  }
  const gp = new Vector3()
  const vl = new Vector3()

  function update(s) {
    begin(st, s)
    const k = st.k
    const t = st.t
    const ph = st.phase
    const fx = st.fx
    const S = st.S
    root.position.set(s.home.x, s.surface, s.home.z)
    const yaw = yawTo(root.position, s.target)
    root.rotation.set(0, yaw, 0)
    let rockY = 0
    if (ph === 'tell') {
      const rise = lerp(-5, 0, easeOutBack(clamp01(k / 0.22)))
      rockY = rise
      const sc = clamp01((k - 0.28) / 0.6)
      const low = easeInOut(clamp01((k - 0.35) / 0.5))
      gt.position.set(0, 0.95 + rise - 0.25 * clamp01((k - 0.7) / 0.3), 0)
      gt.rotation.set(0.08 * low, 0, 0)
      hd.rotation.x = 0.75 * low
      fl.rotation.x = sc > 0 && sc < 1 ? Math.sin(t * 13) * 0.7 : 0
      for (let i = 1; i < 4; i++) legs[i].rotation.x = 0
      if (sc > 0 && sc < 1) {
        const n = tick(st, 1, 12)
        if (n) {
          hoof.getWorldPosition(_a)
          emit(fx, n, P.dust, _a.x, _a.y, _a.z, S)
        }
      }
      if (at(st, 'tell', 0.85)) {
        hd.getWorldPosition(_a)
        emit(fx, 8, P.puff, _a.x, _a.y, _a.z, S, setDir(Math.sin(yaw), -0.3, Math.cos(yaw)))
      }
    } else if (ph === 'attack') {
      const h = 3.5
      hd.rotation.x = 0.85
      for (let i = 0; i < 4; i++) legs[i].rotation.x = i < 2 ? -0.9 : 0.9
      _b.lerpVectors(st.a0, s.target, k)
      _b.y += h * 4 * k * (1 - k)
      _d.subVectors(s.target, st.a0)
      _d.y += h * 4 * (1 - 2 * k)
      st.v.copy(_d).multiplyScalar(1 / Math.max(0.05, st.atkDur))
      _c.copy(_d).applyAxisAngle(UP, -yaw)
      gt.rotation.set(pitchOf(_c) * 0.8, Math.atan2(_c.x, _c.z), 0)
      alignChild(root, gt, horn, _b)
    } else {
      // carries on across and splashes into the slime
      if (st.strikeNow) {
        if (s.hit) emitV(fx, 30, P.star, s.target, S)
        emitV(fx, 14, P.dust, s.target, S)
        gp.copy(gt.position)
        vl.copy(st.v).applyAxisAngle(UP, -yaw).multiplyScalar(1 / S)
        st.pitch0 = gt.rotation.x
      }
      const ts = st.post
      gt.position.copy(gp).addScaledVector(vl, ts * 0.7)
      gt.position.y -= (0.5 * 28 * ts * ts) / S
      if (ph === 'recover') gt.position.y -= 10 * easeIn(clamp01((k - 0.7) / 0.3))
      gt.rotation.x = st.pitch0 + ts * 3
      rockY = ph === 'recover' ? -4 * easeIn(clamp01((k - 0.4) / 0.6)) : 0
    }
    rock.position.y = rockY + Math.sin(t * 1.4 + st.seed) * 0.06
    gt.getWorldPosition(_a)
    const c = surf(st, 0, _a.y + 1.6 * S, s.surface)
    if (c) emit(fx, c > 0 ? 18 : 34, P.splash, _a.x, s.surface, _a.z, S)
    aimEyes(st, s.player, ph === 'tell' ? 0.35 * clamp01((k - 0.4) / 0.3) : 0)
    end(st)
  }
  return { root, update, grabPoint: (out) => out.copy(st.target), dispose() {} }
}

// =============================================================================================
// 7. Bat (one of a squad of 3)
function bat(opts = {}) {
  const st = base(opts)
  const root = st.root
  const PUR = mat('#7b3fc4')
  const MEM = mat('#5a2a9a')
  outline(part(root, geo.sphere, PUR, [0, 0, 0], [0.45, 0.55, 0.45]), 0.07)
  part(root, geo.sphere, mat('#a875e8'), [0, -0.05, 0.25], [0.32, 0.38, 0.25])
  outline(part(root, geo.sphere, PUR, [0, 0.6, 0.15], [0.42, 0.42, 0.42]), 0.07)
  for (const sx of [-1, 1]) {
    part(root, geo.cone, PUR, [sx * 0.24, 1.05, 0.1], [0.16, 0.45, 0.16], [0, 0, -sx * 0.3])
    addEye(st, root, [sx * 0.16, 0.68, 0.5], 0.2)
    part(root, geo.cone, TOOTH(), [sx * 0.08, 0.42, 0.52], [0.05, 0.14, 0.05], [PI, 0, 0])
  }
  part(root, geo.sphere, mat('#ff8fd0'), [0, 0.55, 0.57], [0.07, 0.05, 0.05])
  const wings = []
  for (const sd of [-1, 1]) {
    const w = new Group()
    w.position.set(sd * 0.35, 0.15, 0)
    root.add(w)
    outline(part(w, geo.sphere, MEM, [sd * 0.7, 0, -0.1], [0.75, 0.11, 0.5]), 0.08)
    part(w, geo.sphere, MEM, [sd * 1.3, 0, -0.18], [0.5, 0.09, 0.4])
    part(w, geo.cyl, mat('#3a1a6a'), [sd * 0.75, 0.04, 0.2], [0.04, 1.4, 0.04], [0, 0, PI / 2])
    w.userData.sd = sd
    wings.push(w)
  }
  const anchor = new Object3D()
  anchor.position.set(0, 0.3, 0.3)
  root.add(anchor)
  st.anchor = anchor
  anchor.name = 'strike'
  const P0 = new Vector3()

  function update(s) {
    begin(st, s)
    const k = st.k
    const t = st.t
    const ph = st.phase
    const fx = st.fx
    const S = st.S
    const sd = s.side || 1
    let flapA = 0.8
    let flapF = 16
    if (ph === 'tell') {
      _d.subVectors(s.home, s.target)
      _d.y = 0
      if (_d.lengthSq() < 1e-6) _d.set(sd, 0, -1)
      _d.normalize()
      P0.copy(s.target).addScaledVector(_d, 12)
      P0.y += 2.5
      const a = easeInOut(k)
      root.position.lerpVectors(s.home, P0, a)
      _n.subVectors(P0, s.home)
      _n.set(_n.z, 0, -_n.x)
      if (_n.lengthSq() > 1e-6) _n.normalize()
      root.position.addScaledVector(_n, Math.sin(k * PI * 5) * 2.5 * (1 - k))
      root.position.y += Math.sin(k * PI * 7 + st.seed) * 0.8 * (1 - k)
      root.rotation.set(-0.1, yawTo(root.position, s.player), Math.sin(k * PI * 5) * 0.3 * (1 - k))
    } else if (ph === 'attack') {
      _b.lerpVectors(st.a0, s.target, k)
      _b.y -= 2.2 * Math.sin(k * PI)
      _d.subVectors(s.target, st.a0)
      _d.y -= 2.2 * PI * Math.cos(k * PI)
      const len = _d.length()
      if (len > 1e-4) st.v.copy(_d).multiplyScalar(1 / len)
      st.yaw0 = Math.atan2(st.v.x, st.v.z)
      st.pitch0 = pitchOf(st.v)
      root.rotation.set(st.pitch0, st.yaw0, 0)
      alignRoot(root, anchor, _b)
      flapA = 0.35
      flapF = 30
    } else {
      // flutter away
      const ts = st.post
      if (st.strikeNow && s.hit) emitV(fx, 18, P.bat, s.target, S)
      root.position.copy(st.sp)
      root.position.x += sd * 8 * ts + Math.sin(t * 9) * 0.3
      root.position.y += 7 * ts + Math.sin(t * 11) * 0.4
      root.position.z += 4 * ts
      root.rotation.set(-0.3, st.yaw0 + (s.hit ? ts * 9 : sd * ts * 1.5), Math.sin(t * 9) * 0.4)
      flapF = 22
    }
    for (let i = 0; i < 2; i++) {
      const w = wings[i]
      w.rotation.set(0, 0, w.userData.sd * (0.25 + Math.sin(t * flapF + st.seed) * flapA))
    }
    aimEyes(st, s.player)
    end(st)
  }
  return { root, update, grabPoint: (out) => out.copy(st.target), dispose() {} }
}

// =============================================================================================
// 8. Chameleon on a floating log (stealth -> reveal -> tongue)
function chameleon(opts = {}) {
  const st = base(opts)
  const root = st.root
  const log = new Group()
  root.add(log)
  outline(part(log, geo.cyl, mat('#8a5a33'), [0, 0, 0], [1.0, 7, 1.0], [0, 0, PI / 2]), 0.04)
  for (const sx of [-1, 1]) part(log, geo.cyl, mat('#d9b27a'), [sx * 3.51, 0, 0], [0.9, 0.04, 0.9], [0, 0, PI / 2])
  part(log, geo.cyl, mat('#7a4a28'), [1.6, 0.75, 0.3], [0.22, 0.9, 0.22], [0.3, 0, -0.4])
  part(log, geo.sphere, mat('#4fd14a'), [1.95, 1.25, 0.45], [0.45, 0.15, 0.3], [0, 0, 0.3])
  for (const x of [-2.2, 0.6]) part(log, geo.sphere, mat('#5bbf3a'), [x, 0.8, -0.3], [0.7, 0.2, 0.6])

  const ch = new Group()
  ch.rotation.order = 'YXZ'
  root.add(ch)
  const G = mat('#3fd36a')
  outline(part(ch, geo.sphere, G, [0, 1.1, 0], [0.9, 1.1, 1.9]), 0.05)
  part(ch, geo.sphere, mat('#f6f39a'), [0, 0.6, 0.1], [0.6, 0.5, 1.6])
  for (let i = 0; i < 4; i++) part(ch, geo.cone, mat('#2fa85a'), [0, 2.15 - Math.abs(i - 1.5) * 0.12, 1.0 - i * 0.65], [0.16, 0.45, 0.16], [-0.3, 0, 0])
  for (const [x, z] of [[0.82, 0.4], [-0.8, -0.4], [0.75, -0.9]]) part(ch, geo.sphere, mat('#ff8a3a'), [x, 1.2, z], [0.15, 0.35, 0.4])
  part(ch, geo.sphere, G, [0, 0.9, -1.85], [0.45, 0.45, 0.5])
  part(ch, geo.torus, G, [0, 0.75, -2.35], [0.6, 0.6, 1.1], [0, PI / 2, 0])
  const hd = new Group()
  hd.position.set(0, 1.5, 1.6)
  ch.add(hd)
  outline(part(hd, geo.sphere, G, [0, 0, 0], [0.8, 0.75, 1.0]), 0.05)
  part(hd, geo.cone, G, [0, 0.6, -0.3], [0.5, 0.9, 0.5], [-0.9, 0, 0])
  const mouth = part(hd, geo.sphere, mat('#5a1030'), [0, -0.3, 0.65], [0.55, 0.06, 0.45])
  for (const sx of [-1, 1]) {
    part(hd, geo.sphere, G, [sx * 0.62, 0.25, 0.25], [0.45, 0.45, 0.45])
    addEye(st, hd, [sx * 0.78, 0.3, 0.45], 0.36)
  }
  for (const [x, z] of [[0.6, 1.1], [-0.6, 1.1], [0.6, -1.0], [-0.6, -1.0]]) {
    part(ch, geo.cyl, G, [x, 0.25, z], [0.16, 0.7, 0.16], [0, 0, x > 0 ? 0.4 : -0.4])
    part(ch, geo.sphere, mat('#2fa85a'), [x * 1.25, -0.08, z], [0.25, 0.12, 0.3])
  }
  const mouthA = new Object3D()
  mouthA.position.set(0, -0.3, 1.0)
  hd.add(mouthA)
  // stealth: per-instance clones of every material on the chameleon (outline included)
  const clones = new Map()
  ch.traverse((o) => {
    if (!o.isMesh) return
    let c = clones.get(o.material)
    if (!c) {
      c = o.material.clone()
      c.transparent = true
      c.userData.base = c.color.clone()
      c.userData.op = o.material.opacity
      if (c.emissive) {
        c.userData.be = c.emissive.clone()
        c.userData.bi = c.emissiveIntensity
      }
      clones.set(o.material, c)
    }
    o.material = c
  })
  const cm = [...clones.values()]
  const T = makeTongue(root, '#ff5fa2', '#ff2f7e', 0.26, 0.6)

  function setLook(vis, flash) {
    const t = st.t
    for (let i = 0; i < cm.length; i++) {
      const c = cm[i]
      c.opacity = c.userData.op * vis
      c.depthWrite = vis > 0.95
      if (vis < 0.95) c.color.setHSL((t * 0.35 + i * 0.09) % 1, 0.9, 0.6).lerp(c.userData.base, vis * 0.5)
      else c.color.copy(c.userData.base)
      if (c.emissive) {
        c.emissive.copy(c.userData.be).lerp(WHITE_C, flash)
        c.emissiveIntensity = lerp(c.userData.bi, 1.2, flash)
      }
    }
  }

  function update(s) {
    begin(st, s)
    const k = st.k
    const t = st.t
    const ph = st.phase
    const fx = st.fx
    const S = st.S
    root.position.set(s.home.x, s.surface, s.home.z)
    root.rotation.set(0, yawTo(root.position, s.target), 0)
    let vis = 1
    let flash = 0
    let open = 0
    let by = 0.85
    let bz = 0
    let pitch = 0
    let logY = 0
    let squint = 0
    let sway = Math.sin(t * 2.2) * 0.06
    if (ph === 'tell') {
      vis = 0.16 + 0.04 * Math.sin(t * 3)
      ch.position.x = Math.sin(t * 1.1) * 0.25
    } else if (ph === 'attack') {
      flash = Math.max(0, 1 - (s.phaseT || k * 0.35) * 5)
      open = 1
      pitch = -0.1
      ch.position.x = 0
      if (at(st, 'attack', 0)) {
        hd.getWorldPosition(_a)
        emitV(fx, 30, P.reveal, _a, S)
      }
    } else if (ph === 'hold') {
      open = 1
      pitch = -0.1 + 0.05 * Math.sin(t * 22)
      sway = 0
    } else if (s.hit) {
      open = k < 0.08 ? 1 : 0
      by = 0.85 - 6 * easeIn(clamp01((k - 0.35) / 0.65))
      logY = -4 * easeIn(clamp01((k - 0.45) / 0.55))
    } else {
      const d = clamp01((k - 0.15) / 0.85)
      squint = k < 0.3 ? 0.6 : 0
      bz = 6 * d
      by = 0.85 + 4 * d - 9.5 * d * d
      pitch = 1.8 * easeIn(d)
      logY = -4 * easeIn(clamp01((k - 0.6) / 0.4))
    }
    setLook(vis, flash)
    ch.position.y = by
    ch.position.z = bz
    ch.rotation.set(pitch, 0, sway)
    log.position.y = logY + Math.sin(t * 1.5 + st.seed) * 0.08
    log.rotation.x = Math.sin(t * 1.1) * 0.03
    mouth.scale.y = 0.06 + 0.35 * open
    root.updateMatrixWorld(true)
    mouthA.getWorldPosition(T.mW)
    lashTongue(st, s, T)
    drawTongue(root, T)
    ch.getWorldPosition(_a)
    const c = surf(st, 0, _a.y + 1.0 * S, s.surface)
    if (c) emit(fx, c > 0 ? 18 : 28, P.splash, _a.x, s.surface, _a.z, S)
    if (st.strikeNow) emitV(fx, s.hit ? 22 : 10, P.pink, s.hit ? s.target : T.tipW, S)
    aimEyes(st, s.player, squint)
    end(st)
  }
  return {
    root,
    update,
    grabPoint(out) {
      if (T.out) return out.copy(T.tipW).setY(T.tipW.y - FEET)
      return out.copy(st.target)
    },
    dispose() {
      for (const c of cm) c.dispose()
    },
  }
}

// =============================================================================================
// 9. Slime Octopus (wall): tentacle pillars everywhere except the gap
function octopus(opts = {}) {
  const st = base(opts)
  const root = st.root
  const MAXT = 6
  const SEG = 4
  const discMat = clear('#1d0830', 0.6).clone()
  discMat.opacity = 0
  const disc = part(root, geo.cylLo, discMat, [0, 0.08, 0], [1, 0.02, 1])
  disc.castShadow = false
  const PUR = mat('#a64ae8')
  const SUCK = mat('#ff9ad5')
  const mh = new Group()
  root.add(mh)
  outline(part(mh, geo.sphere, mat('#8a3fd6'), [0, 2.2, -0.5], [3.6, 4.2, 3.6]), 0.04)
  for (const [x, y, z] of [[1.6, 4.2, 1.6], [-1.9, 3.4, 1.9], [0.2, 5.6, 0.9]]) part(mh, geo.sphere, mat('#c77dff'), [x, y, z], [0.7, 0.55, 0.3])
  for (const sx of [-1, 1]) addEye(st, mh, [sx * 1.45, 0.9, 2.6], 1.25)
  const tents = []
  for (let j = 0; j < MAXT; j++) {
    const segsJ = []
    for (let i = 0; i < SEG; i++) {
      const c = part(root, geo.capsule, PUR)
      if (i < 2) {
        outline(c, 0.04)
        part(c, geo.sphere, SUCK, [0, 0.1, 0.47], [0.36, 0.14, 0.1])
      }
      segsJ.push(c)
    }
    tents.push({ segs: segsJ, cx: 0, r: 1, on: false })
  }
  const coil = part(root, geo.torus, PUR, [0, 0, 0], [1, 1, 1], [PI / 2, 0, 0])
  coil.visible = false
  let layKey = ''
  let nT = 0
  let mx = 0
  const g0 = new Vector3()
  const grabW = new Vector3()
  const coilL = new Vector3()

  function layout(s) {
    const hw = s.halfWidth || 30
    const gx0 = s.gap ? Math.min(s.gap.x0, s.gap.x1) : 0
    const gx1 = s.gap ? Math.max(s.gap.x0, s.gap.x1) : 0
    const key = gx0 + ':' + gx1 + ':' + hw
    if (key === layKey) return
    layKey = key
    const a0 = -hw
    const a1 = s.gap ? gx0 - 0.3 : hw
    const b0 = gx1 + 0.3
    const b1 = s.gap ? hw : hw
    const L1 = Math.max(0, a1 - a0)
    const L2 = s.gap ? Math.max(0, b1 - b0) : 0
    let n1 = L1 > 1 ? Math.max(1, Math.round(L1 / 8)) : 0
    let n2 = L2 > 1 ? Math.max(1, Math.round(L2 / 8)) : 0
    if (n1 + n2 > MAXT) {
      n1 = L1 > 1 ? Math.max(1, Math.round((MAXT * L1) / (L1 + L2))) : 0
      n2 = Math.min(MAXT - n1, L2 > 1 ? Math.max(1, MAXT - n1) : 0)
    }
    nT = n1 + n2
    const S = st.S
    const hx = s.home.x
    for (let j = 0; j < MAXT; j++) {
      const T = tents[j]
      T.on = j < nT
      if (!T.on) continue
      const inA = j < n1
      const len = inA ? L1 / n1 : L2 / n2
      const x = inA ? a0 + (j + 0.5) * len : b0 + (j - n1 + 0.5) * len
      T.cx = (x - hx) / S
      T.r = Math.max(1.2, len * 0.5 + 0.25) / S
    }
    mx = ((L1 >= L2 ? (a0 + a1) / 2 : (b0 + b1) / 2) - hx) / S
  }
  function tentPoint(out, T, j, base0, top, u, t, sway) {
    const c = u * u * u
    out.set(T.cx + Math.sin(t * 1.7 + j * 2.1 + u * 3) * 0.25 * u * sway - Math.sign(T.cx) * c * T.r * 0.6 * sway, lerp(base0, top, u) - c * T.r * 0.5 * sway, Math.sin(t * 2.1 + j * 1.3 + u * 2.5) * 1.4 * u * sway + c * (2.2 + T.r * 0.8) * sway)
    return out
  }
  function drawStraight(T, j, top, t, sway) {
    const base0 = -6
    for (let i = 0; i < SEG; i++) {
      tentPoint(_p0, T, j, base0, top, i / SEG, t, sway)
      tentPoint(_p1, T, j, base0, top, (i + 1) / SEG, t, sway)
      stretchCap(T.segs[i], _p0, _p1, T.r * (1 - 0.62 * ((i + 0.5) / SEG)))
    }
  }
  function drawGrab(T, t) {
    _p0.set(T.cx, -6, 0)
    _p1.set(lerp(T.cx, coilL.x, 0.5), Math.max(coilL.y, 0) + 5 / st.S, lerp(0, coilL.z, 0.5) + 1)
    for (let i = 0; i < SEG; i++) {
      quad(_p2, _p0, _p1, coilL, i / SEG)
      quad(_p3, _p0, _p1, coilL, (i + 1) / SEG)
      stretchCap(T.segs[i], _p2, _p3, T.r * (1 - 0.6 * ((i + 0.5) / SEG)))
    }
  }

  function update(s) {
    begin(st, s)
    const k = st.k
    const t = st.t
    const ph = st.phase
    const fx = st.fx
    const S = st.S
    root.position.set(s.home.x, s.surface, s.home.z)
    root.rotation.set(0, 0, 0)
    layout(s)
    const hw = s.halfWidth || 30
    const Htop = (s.target.y + 4 - s.surface) / S
    let discA = 0
    let discW = 0.1
    let mY = -9
    let grabJ = -1
    if (ph === 'hold' || (ph === 'recover' && s.hit)) {
      if (st.strikeNow) g0.copy(s.player)
      let best = 1e9
      for (let j = 0; j < nT; j++) {
        const dx = Math.abs(tents[j].cx * S + s.home.x - g0.x)
        if (dx < best) {
          best = dx
          grabJ = j
        }
      }
      const pull = ph === 'hold' ? 0.85 * easeIn(k) : 0.85 + 0.15 * k
      grabW.copy(g0)
      grabW.y = lerp(g0.y, s.surface - (ph === 'hold' ? 1.5 : 9), pull)
    }
    for (let j = 0; j < MAXT; j++) {
      const T = tents[j]
      for (let i = 0; i < SEG; i++) T.segs[i].visible = T.on
      if (!T.on) continue
      let top
      let sway = 1
      if (ph === 'tell') {
        top = -6 + 6.2 * easeOut(clamp01((k - 0.3 - j * 0.07) / 0.35)) + Math.sin(t * 5 + j * 1.7) * 0.35
        sway = 0.5
      } else if (ph === 'attack') {
        const f = easeOutBack(clamp01((k - j * 0.035) / 0.8), 1.3)
        top = lerp(0.2, Htop, f)
      } else if (ph === 'hold') top = Htop + Math.sin(t * 3 + j) * 0.4
      else top = lerp(Htop, -7, easeIn(k))
      if (j === grabJ) continue
      drawStraight(T, j, top, t, sway)
      const c = surf(st, j, s.surface + top * S, s.surface)
      if (c) emit(fx, c > 0 ? 18 : 22, P.splash, s.home.x + T.cx * S, s.surface, s.home.z, Math.max(1, T.r * S * 0.5))
    }
    coil.visible = grabJ >= 0
    if (grabJ >= 0) {
      root.updateMatrixWorld(true)
      _a.copy(grabW)
      _a.y += FEET
      toLocal(root, _a, coilL)
      drawGrab(tents[grabJ], t)
      coil.position.copy(coilL)
      coil.rotation.set(PI / 2, 0, t * 4)
      coil.scale.set(0.95 / S, 0.95 / S, 2.2 / S)
      coil.visible = _a.y > s.surface - 2
    }
    if (ph === 'tell') {
      const g = easeOut(clamp01(k / 0.7))
      discA = 0.55 * g
      discW = g
      mY = lerp(-9, -0.9, easeOut(clamp01((k - 0.25) / 0.5)))
      const n = tick(st, 1, 6 + 16 * k)
      if (n) emit(fx, n, P.bubble, s.home.x + (Math.random() - 0.5) * hw * 1.6 * g, s.surface + 0.1, s.home.z, S)
    } else if (ph === 'attack') {
      discA = 0.55 * (1 - 0.5 * k)
      discW = 1
      mY = -0.9
      if (at(st, 'attack', 0)) for (let j = 0; j < nT; j++) emit(fx, 20, P.splash, s.home.x + tents[j].cx * S, s.surface, s.home.z, Math.max(1, tents[j].r * S * 0.5))
    } else if (ph === 'hold') {
      discA = 0.25
      discW = 1
      mY = -0.9 + Math.sin(t * 3) * 0.2
    } else {
      discA = 0.25 * (1 - k)
      discW = 1
      mY = lerp(-0.9, -10, easeIn(k))
    }
    discMat.opacity = discA
    disc.visible = discA > 0.01
    disc.scale.set(Math.max(0.1, (hw * 1.05 * discW) / S), 0.02, Math.max(0.1, (8 * discW) / S))
    mh.position.set(mx, mY, -12)
    mh.rotation.set(0, 0, Math.sin(t * 1.3) * 0.05)
    if (st.strikeNow && s.hit) {
      emit(fx, 30, P.splash, s.player.x, s.player.y + FEET, s.player.z, S)
      emit(fx, 14, P.pink, s.player.x, s.player.y + FEET, s.player.z, S)
    }
    aimEyes(st, s.player)
    end(st)
  }
  return {
    root,
    update,
    grabPoint(out) {
      if (st.phase === 'hold') return out.copy(grabW)
      return out.copy(st.target)
    },
    dispose() {
      discMat.dispose()
    },
  }
}

// =============================================================================================
// 10. Snap-Croc
function croc(opts = {}) {
  const st = base(opts)
  const root = st.root
  const G = mat('#3f9a3a')
  const DG = mat('#2f7a2c')
  const W = TOOTH()
  const cr = new Group()
  cr.rotation.order = 'YXZ'
  root.add(cr)
  outline(part(cr, geo.sphere, G, [0, 0.35, 2.0], [1.15, 0.5, 2.7]), 0.05)
  outline(part(cr, geo.sphere, G, [0, 0.5, 0.1], [1.35, 0.85, 1.3]), 0.05)
  for (const sx of [-1, 1]) {
    part(cr, geo.sphere, G, [sx * 0.62, 1.05, 0.45], [0.5, 0.5, 0.5])
    addEye(st, cr, [sx * 0.62, 1.22, 0.7], 0.42, { white: '#fff4a0' })
    part(cr, geo.sphere, DG, [sx * 0.28, 0.78, 4.2], [0.16, 0.12, 0.16])
    for (const z of [1.6, 2.6, 3.6]) part(cr, geo.cone, W, [sx * (1.02 - z * 0.12), -0.15, z], [0.19, 0.62, 0.19], [PI, 0, 0])
    part(cr, geo.cone, DG, [sx * 0.4, 1.2, -0.6], [0.2, 0.4, 0.2], [-0.4, 0, 0])
  }
  part(cr, geo.sphere, mat('#ff7a9a'), [0, 0.05, 2.0], [1.0, 0.22, 2.4])
  const jaw = new Group()
  cr.add(jaw)
  outline(part(jaw, geo.sphere, G, [0, -0.25, 1.9], [1.05, 0.38, 2.6]), 0.05)
  part(jaw, geo.sphere, mat('#e4ec9a'), [0, -0.42, 1.8], [0.95, 0.24, 2.3])
  for (const sx of [-1, 1]) for (const z of [2.2, 3.4]) part(jaw, geo.cone, W, [sx * (0.95 - z * 0.12), 0.15, z], [0.18, 0.55, 0.18])
  const body = []
  for (let i = 0; i < 3; i++) {
    const c = part(root, geo.capsule, G)
    part(c, geo.cone, DG, [0, 0, -0.5], [0.2, 0.3, 0.2], [-PI / 2, 0, 0])
    body.push(c)
  }
  const anchor = new Object3D()
  anchor.position.set(0, 0.05, 2.6)
  cr.add(anchor)
  st.anchor = anchor
  anchor.name = 'strike'
  const B = new Vector3(0, -7, -4)
  const r0 = new Vector3()

  function update(s) {
    begin(st, s)
    const k = st.k
    const t = st.t
    const ph = st.phase
    const fx = st.fx
    const S = st.S
    root.position.set(s.home.x, s.surface, s.home.z)
    root.rotation.set(0, 0, 0)
    let open = 0
    let squint = 0
    if (ph === 'tell') {
      const r = easeOut(clamp01(k / 0.25))
      cr.rotation.set(0, Math.sin(t * 1.3) * 0.15, 0)
      cr.position.set(Math.sin(t * 0.9 + st.seed) * 0.4, lerp(-3.2, -0.95, r) + Math.sin(t * 2) * 0.08, lerp(-7, 0, easeInOut(k)))
      if (r > 0.9) {
        const n = tick(st, 1, 7)
        if (n) {
          anchor.getWorldPosition(_a)
          emit(fx, n, P.ripple, _a.x, s.surface + 0.05, _a.z + 1.5 * S, S)
        }
      }
    } else if (ph === 'attack') {
      open = k < 0.72 ? easeOut(k / 0.72) : 1 - easeIn((k - 0.72) / 0.28)
      cr.rotation.set((-PI / 2) * easeOut(clamp01(k / 0.45)), 0, 0)
      _b.lerpVectors(st.a0, s.target, easeOut(k))
      alignChild(root, cr, anchor, _b)
    } else if (ph === 'hold') {
      // death roll with the player between the jaws
      open = 0.1
      cr.rotation.set(-PI / 2, easeInOut(k) * PI * 3, 0)
      _b.copy(s.target)
      _b.y -= 1.5 * easeIn(k)
      alignChild(root, cr, anchor, _b)
    } else {
      if (st.entered) r0.copy(st.anchorW)
      const d = s.hit ? k : clamp01((k - 0.3) / 0.7)
      if (!s.hit && k < 0.4) {
        open = Math.abs(Math.sin((k / 0.4) * PI * 2)) * 0.8
        squint = 0.5
      }
      cr.rotation.set(lerp(-PI / 2, -1.1, d), cr.rotation.y, 0)
      _b.copy(r0)
      _b.y = lerp(r0.y, s.surface - 9 * S, easeIn(d))
      alignChild(root, cr, anchor, _b)
    }
    jaw.rotation.x = open * 0.9
    // body chain from the back of the head down into the slime
    _p0.set(0, 0.2, -1.0).applyEuler(cr.rotation).add(cr.position)
    _p1.set(0, 0, -3.5).applyEuler(cr.rotation).add(_p0)
    for (let i = 0; i < 3; i++) {
      quad(_p2, _p0, _p1, B, i / 3)
      quad(_p3, _p0, _p1, B, (i + 1) / 3)
      stretchCap(body[i], _p2, _p3, lerp(1.2, 0.9, i / 2))
    }
    root.updateMatrixWorld(true)
    anchor.getWorldPosition(_a)
    const c = surf(st, 0, _a.y, s.surface)
    if (c) emit(fx, c > 0 ? 30 : 34, P.splash, _a.x, s.surface, _a.z, S)
    if (st.strikeNow) {
      emitV(fx, s.hit ? 24 : 12, P.chomp, s.target, S)
      if (s.hit) emitV(fx, 10, P.spit, s.target, S)
    }
    if (ph !== 'tell' && _a.y > s.surface) {
      const n = tick(st, 0, 5)
      if (n) emit(fx, n, P.drip, _a.x, _a.y - 0.4 * S, _a.z, S)
    }
    aimEyes(st, s.player, squint)
    end(st)
  }
  return {
    root,
    update,
    grabPoint(out) {
      if (st.phase === 'hold') return anchor.getWorldPosition(out).setY(out.y - FEET)
      return out.copy(st.target)
    },
    dispose() {},
  }
}

// =============================================================================================
// 11. Bubble Pufferfish
function puffer(opts = {}) {
  const st = base(opts)
  const root = st.root
  const pf = new Group()
  pf.rotation.order = 'YXZ'
  root.add(pf)
  const bodyG = new Group()
  pf.add(bodyG)
  outline(part(bodyG, geo.sphere, mat('#ffd23a'), [0, 0, 0], [1.6, 1.6, 1.6]), 0.05)
  part(bodyG, geo.sphere, mat('#fff6d0'), [0, -0.6, 0.6], [1.3, 1.0, 1.1])
  for (const [x, y, z] of [[0.9, 0.9, -0.6], [-1.0, 0.7, -0.4], [0.1, 1.3, -0.7]]) part(bodyG, geo.sphere, mat('#e59a1f'), [x, y, z], [0.3, 0.3, 0.12])
  const spikes = []
  const SPK = mat('#fff1b0')
  for (let i = 0; i < 18 && spikes.length < 12; i++) {
    const y = 1 - ((i + 0.5) / 18) * 2
    const r = Math.sqrt(1 - y * y)
    const a = i * 2.39996
    const d = new Vector3(Math.cos(a) * r, y, Math.sin(a) * r)
    if (d.z > 0.45 && d.y > -0.6) continue
    const sp = part(bodyG, geo.cone, SPK, [0, 0, 0], [0.18, 0.7, 0.18])
    sp.quaternion.setFromUnitVectors(UP, d)
    sp.userData.d = d
    spikes.push(sp)
  }
  for (const sx of [-1, 1]) addEye(st, bodyG, [sx * 0.75, 0.65, 1.25], 0.6)
  const cheeks = [part(bodyG, geo.sphere, mat('#ff8fb0'), [-1.0, -0.2, 1.15], [0.45, 0.45, 0.4]), part(bodyG, geo.sphere, mat('#ff8fb0'), [1.0, -0.2, 1.15], [0.45, 0.45, 0.4])]
  part(bodyG, geo.torus, mat('#ff5a5a'), [0, -0.2, 1.6], [0.28, 0.28, 0.4])
  const fins = []
  for (const sx of [-1, 1]) fins.push(part(pf, geo.sphere, mat('#4fc3ff'), [sx * 1.65, 0, -0.1], [0.15, 0.5, 0.7]))
  const tail = part(pf, geo.cone4, mat('#4fc3ff'), [0, 0.1, -2.0], [0.8, 0.9, 0.18], [-PI / 2, 0, 0])
  part(pf, geo.sphere, mat('#4fc3ff'), [0, 1.65, -0.3], [0.12, 0.45, 0.6])
  const mouthA = new Object3D()
  mouthA.position.set(0, -0.2, 1.8)
  bodyG.add(mouthA)
  const bubble = part(root, geo.sphere, clear('#c9f6ff', 0.42, { emissive: '#3ac8ff', emissiveIntensity: 0.55 }), [0, 0, 0], [1, 1, 1])
  part(bubble, geo.sphere, clear('#ffffff', 0.85, { emissive: '#ffffff', emissiveIntensity: 0.6 }), [0.45, 0.5, 0.55], [0.2, 0.13, 0.06], [0, 0.7, 0.5])
  part(bubble, geo.torus, clear('#ff9ef0', 0.5, { emissive: '#ff6ad5', emissiveIntensity: 0.6 }), [0, 0, 0], [0.99, 0.99, 0.12], [PI / 2, 0, 0])
  bubble.castShadow = false
  bubble.name = 'strike'
  bubble.visible = false
  const bc = new Vector3()
  const bf = new Vector3()
  const mW = new Vector3()
  let bR = 0.4

  function update(s) {
    begin(st, s)
    const k = st.k
    const t = st.t
    const ph = st.phase
    const fx = st.fx
    const S = st.S
    root.position.set(s.home.x, s.surface, s.home.z)
    root.rotation.set(0, yawTo(root.position, s.target), 0)
    let py = 1.25
    let inf = 0
    let cheek = 0.2
    let spin = 0
    let squint = 0
    let wob = 0
    if (st.entered) bf.copy(bc)
    if (ph === 'tell') {
      py = lerp(-3.5, 1.25, easeOut(clamp01(k / 0.18)))
      inf = easeOut(clamp01((k - 0.18) / 0.7))
      cheek = 0.3 + 0.7 * Math.abs(Math.sin(t * 6)) * inf
    } else if (ph === 'attack') {
      inf = lerp(1, 0.55, easeOut(k))
      cheek = 1 - k
    } else if (ph === 'hold') {
      inf = 0.6 + 0.08 * Math.sin(t * 5)
      py += Math.abs(Math.sin(t * 8)) * 0.25 // giggling bob
    } else {
      const d = clamp01((k - 0.4) / 0.6)
      inf = 0.6 * (1 - clamp01(k / 0.4))
      spin = clamp01(k / 0.4) * 6
      squint = s.hit ? 0 : 0.5
      py = 1.25 - 6 * easeIn(d)
    }
    pf.position.set(0, py + Math.sin(t * 2 + st.seed) * 0.1, 0)
    pf.rotation.set(0, spin, Math.sin(t * 1.7) * 0.06)
    bodyG.scale.setScalar(1 + 0.45 * inf)
    for (let i = 0; i < spikes.length; i++) {
      const sp = spikes[i]
      const g = 0.25 + 0.75 * inf
      sp.scale.set(0.18 * g, 0.7 * g, 0.18 * g)
      sp.position.copy(sp.userData.d).multiplyScalar(1 + 0.3 * g)
    }
    for (let i = 0; i < 2; i++) cheeks[i].scale.setScalar(0.3 + 0.35 * cheek)
    for (let i = 0; i < 2; i++) fins[i].rotation.set(0, Math.sin(t * 10 + i * PI) * 0.5, 0)
    tail.rotation.set(-PI / 2, 0, Math.sin(t * 6) * 0.3)
    root.updateMatrixWorld(true)
    mouthA.getWorldPosition(mW)

    let show = false
    if (ph === 'attack') {
      bc.lerpVectors(mW, s.target, easeOut(k))
      bR = lerp(0.35, 1.9, easeOut(k))
      show = true
      wob = 0.05
      const n = tick(st, 1, 20)
      if (n) emitV(fx, n, P.cyan, bc, S * 0.6)
    } else if (ph === 'hold') {
      // the player is trapped inside, drifting slowly down
      if (st.strikeNow) bf.copy(s.target)
      const wa = clamp01(k * 5)
      bc.copy(bf)
      bc.y -= 1.6 * k - Math.sin(t * 2.5) * 0.15 * wa
      bc.x += Math.sin(t * 1.7) * 0.2 * wa
      bR = 1.9
      wob = 0.08
      show = true
    } else if (ph === 'recover') {
      const popAt = s.hit ? 0 : 0.45
      if (!s.hit) {
        bc.copy(bf)
        bc.y += 2.5 * k
        bc.z += 3 * k
      }
      show = k < popAt
      if (at(st, 'recover', popAt) && bubble.visible) {
        emitV(fx, 34, P.pop, bc, S)
        emitV(fx, 10, P.cyan, bc, S)
      }
    }
    bubble.visible = show
    if (show) {
      toLocal(root, bc, bubble.position)
      const r = bR / S
      const w = Math.sin(t * 9) * wob
      bubble.scale.set(r * (1 + w), r * (1 - w), r * (1 + w * 0.5))
      bubble.rotation.y = t * 0.6
    }
    pf.getWorldPosition(_a)
    const c = surf(st, 0, _a.y + 0.5 * S, s.surface)
    if (c) emit(fx, c > 0 ? 18 : 26, P.splash, _a.x, s.surface, _a.z, S)
    if (ph !== 'recover') {
      const n = tick(st, 0, 1.2)
      if (n) emit(fx, n, P.drip, _a.x, _a.y - 1.2 * S, _a.z, S)
    }
    aimEyes(st, s.player, squint)
    end(st)
  }
  return {
    root,
    update,
    grabPoint(out) {
      if (st.phase === 'hold') return out.copy(bc).setY(bc.y - FEET)
      return out.copy(st.target)
    },
    dispose() {},
  }
}

// =============================================================================================
// 12. Ink Squid
function squid(opts = {}) {
  const st = base(opts)
  const root = st.root
  const PK = mat('#ff5fa2')
  const sq = new Group()
  sq.rotation.order = 'YXZ'
  root.add(sq)
  const mantle = part(sq, geo.sphere, PK, [0, 2.6, 0], [1.2, 2.2, 1.2])
  outline(mantle, 0.05)
  for (const sx of [-1, 1]) part(sq, geo.sphere, mat('#ff8ac0'), [sx * 1.0, 3.9, 0], [0.18, 0.9, 0.7], [0, 0, sx * 0.5])
  for (const [x, y, z] of [[0.6, 3.0, 0.9], [-0.7, 2.4, 0.85], [0.1, 3.8, 0.85]]) part(sq, geo.sphere, mat('#c2337a'), [x, y, z], [0.25, 0.25, 0.12])
  outline(part(sq, geo.sphere, mat('#ff7ab4'), [0, 0.7, 0], [1.0, 0.8, 1.0]), 0.05)
  for (const sx of [-1, 1]) addEye(st, sq, [sx * 0.62, 1.0, 0.75], 0.55)
  part(sq, geo.cyl, mat('#e0458a'), [0, 0.25, 1.1], [0.22, 0.8, 0.22], [PI / 2, 0, 0])
  const siphon = new Object3D()
  siphon.position.set(0, 0.25, 1.55)
  sq.add(siphon)
  const arms = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2
    const long = i === 2 || i === 6
    const g = new Group()
    g.position.set(Math.cos(a) * 0.55, 0.0, Math.sin(a) * 0.55)
    sq.add(g)
    part(g, geo.capsule, PK, [0, long ? -1.3 : -0.8, 0], long ? [0.3, 1.3, 0.3] : [0.36, 0.8, 0.36])
    if (long) part(g, geo.sphere, mat('#ff8ac0'), [0, -2.6, 0], [0.32, 0.45, 0.32])
    g.userData.a = a
    arms.push(g)
  }
  const blob = part(root, geo.sphere, mat('#1a1030', { roughness: 0.12 }), [0, 0, 0], [1, 1, 1])
  part(blob, geo.sphere, mat('#2d1b4e', { roughness: 0.12 }), [0.8, -0.3, 0.2], [0.4, 0.4, 0.4])
  part(blob, geo.sphere, mat('#2d1b4e', { roughness: 0.12 }), [-0.6, 0.5, -0.3], [0.3, 0.3, 0.3])
  part(blob, geo.sphere, mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.5 }), [0.35, 0.5, 0.65], [0.2, 0.14, 0.08])
  blob.visible = false
  blob.name = 'strike'
  const bc = new Vector3()
  const bv = new Vector3()
  const sW = new Vector3()
  let blobLive = false

  function update(s) {
    begin(st, s)
    const k = st.k
    const t = st.t
    const ph = st.phase
    const fx = st.fx
    const S = st.S
    root.position.set(s.home.x, s.surface, s.home.z)
    root.rotation.set(0, yawTo(root.position, s.target), 0)
    let y = 0
    let lean = 0
    let pulse = Math.sin(t * 7) * 0.06
    if (ph === 'tell') {
      y = lerp(-7.5, 0, easeOut(clamp01(k / 0.3)))
      pulse = Math.sin(t * 7) * (0.08 + 0.14 * k)
      lean = -0.15 * k
    } else if (ph === 'attack') {
      lean = 0.3
      pulse = k < 0.25 ? -0.25 * Math.sin((k / 0.25) * PI) : 0
    } else {
      const d = clamp01((k - 0.15) / 0.85)
      y = -7.5 * easeIn(d)
      lean = 0.3 * (1 - d)
      pulse = -0.1
    }
    sq.position.set(0, y + Math.sin(t * 1.8 + st.seed) * 0.12, 0)
    sq.rotation.set(lean, 0, Math.sin(t * 1.3) * 0.05)
    mantle.scale.set(1.2 * (1 + pulse), 2.2 * (1 - pulse * 0.5), 1.2 * (1 + pulse))
    for (let i = 0; i < arms.length; i++) {
      const g = arms[i]
      const a = g.userData.a
      const sw = Math.sin(t * 4 + i * 0.9) * 0.35
      g.rotation.set(Math.sin(a) * 0.35 + sw * Math.cos(a), 0, -Math.cos(a) * 0.35 + sw * Math.sin(a))
    }
    root.updateMatrixWorld(true)
    siphon.getWorldPosition(sW)

    if (ph === 'attack') {
      blobLive = true
      bc.lerpVectors(sW, s.target, k)
      bc.y += 2.5 * Math.sin(k * PI)
      bv.subVectors(s.target, sW).multiplyScalar(1 / Math.max(0.05, st.atkDur))
      bv.y -= (2.5 * PI) / Math.max(0.05, st.atkDur)
    } else if (st.strikeNow) {
      if (blobLive && s.hit) {
        emitV(fx, 40, P.inkSplat, s.target, S)
        blobLive = false
      }
      bc.copy(s.target)
    } else if (blobLive && ph !== 'tell') {
      // missed: the blob flies on and plops into the slime
      bc.addScaledVector(bv, st.dt)
      bv.y -= 25 * st.dt
      if (bc.y < s.surface) {
        emit(fx, 24, P.inkSplat, bc.x, s.surface, bc.z, S)
        emit(fx, 14, P.splash, bc.x, s.surface, bc.z, S)
        blobLive = false
      }
    }
    blob.visible = blobLive && ph !== 'tell'
    if (blob.visible) {
      toLocal(root, bc, blob.position)
      const r = (ph === 'attack' ? lerp(0.4, 1.1, easeOut(Math.min(1, k * 2))) : 1.1) / S
      const w = Math.sin(t * 14) * 0.08
      blob.scale.set(r * (1 + w), r * (1 - w), r)
      blob.rotation.set(t * 3, t * 2, 0)
      const n = tick(st, 1, 45)
      if (n) emitV(fx, n, P.ink, bc, S)
    }
    sq.getWorldPosition(_a)
    const c = surf(st, 0, _a.y + 1.5 * S, s.surface)
    if (c) emit(fx, c > 0 ? 20 : 28, P.splash, _a.x, s.surface, _a.z, S)
    aimEyes(st, s.player)
    end(st)
  }
  return { root, update, grabPoint: (out) => out.copy(st.target), dispose() {} }
}

// =============================================================================================
// 13. Claw Crab
function crab(opts = {}) {
  const st = base(opts)
  const root = st.root
  const RED = mat('#ff3b2f')
  const RED2 = mat('#e0302a')
  const rock = new Group()
  root.add(rock)
  outline(part(rock, geo.sphereLo, mat('#8c8f99'), [0, -0.3, 0], [3.2, 1.3, 2.8]), 0.04)
  part(rock, geo.sphereLo, mat('#767984'), [-2.1, -0.2, 1.1], [1.0, 0.8, 1.0])
  part(rock, geo.sphereLo, mat('#9a9da8'), [2.1, -0.2, -1.0], [1.0, 0.7, 1.1])
  for (const [x, z] of [[0.9, 1.6], [-1.2, -1.4]]) part(rock, geo.cone, mat('#e8e2d0'), [x, 0.8, z], [0.25, 0.3, 0.25])
  const cb = new Group()
  root.add(cb)
  outline(part(cb, geo.sphere, RED, [0, 1.0, 0], [1.9, 0.95, 1.5]), 0.05)
  for (const [x, z] of [[0.8, -0.3], [-0.7, 0.2], [0.1, -0.9]]) part(cb, geo.sphere, mat('#ff7a5a'), [x, 1.75, z], [0.35, 0.15, 0.3])
  for (const sx of [-1, 1]) {
    part(cb, geo.cyl, RED, [sx * 0.5, 1.95, 0.9], [0.12, 0.8, 0.12])
    addEye(st, cb, [sx * 0.5, 2.45, 0.95], 0.42)
  }
  part(cb, geo.sphere, mat('#7a1010'), [0, 0.75, 1.45], [0.45, 0.14, 0.12])
  const legs = []
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const l = part(cb, geo.cyl, RED2, [sx * 1.95, 0.45, -0.7 + i * 0.7], [0.14, 1.3, 0.14], [0, 0, sx * 0.95])
    l.userData.sx = sx
    l.userData.i = i
    legs.push(l)
  }
  part(cb, geo.cyl, RED2, [-1.6, 1.0, 1.1], [0.16, 0.9, 0.16], [0.9, 0, 0.6])
  part(cb, geo.sphere, RED, [-1.95, 1.35, 1.65], [0.45, 0.35, 0.55])
  part(cb, geo.cone, RED, [-1.95, 1.35, 2.2], [0.15, 0.5, 0.12], [PI / 2, 0, 0])
  const shoulder = new Object3D()
  shoulder.position.set(1.45, 1.15, 0.9)
  cb.add(shoulder)
  const arm = part(root, geo.cyl, RED2)
  const elbow = part(root, geo.sphere, RED)
  const cl = new Group()
  root.add(cl)
  outline(part(cl, geo.sphere, RED, [0, 0, 0], [1.1, 0.85, 1.3]), 0.05)
  part(cl, geo.cone, RED, [0, -0.3, 1.45], [0.42, 1.5, 0.3], [PI / 2, 0, 0])
  part(cl, geo.cone, TOOTH(), [0, -0.12, 1.2], [0.08, 0.25, 0.08])
  const fg = new Group()
  fg.position.set(0, 0.25, 0.7)
  cl.add(fg)
  part(fg, geo.cone, RED, [0, 0.05, 0.8], [0.4, 1.4, 0.3], [PI / 2, 0, 0])
  part(fg, geo.cone, TOOTH(), [0, -0.15, 0.6], [0.08, 0.25, 0.08], [PI, 0, 0])
  const clawA = new Object3D()
  clawA.position.set(0, -0.05, 1.6)
  cl.add(clawA)
  st.anchor = clawA
  clawA.name = 'strike'
  const sL = new Vector3()
  const aL = new Vector3()
  const dir = new Vector3()
  const strikeL = new Vector3()
  let lastOpen = 0

  function placeClaw() {
    dir.subVectors(aL, sL)
    const len = dir.length()
    if (len > 1e-4) dir.multiplyScalar(1 / len)
    else dir.set(0, 1, 0)
    cl.quaternion.setFromUnitVectors(FWD, dir)
    _c.copy(clawA.position).applyQuaternion(cl.quaternion)
    cl.position.copy(aL).sub(_c) // the claw tip lands exactly on aL
    _c.copy(cl.position).addScaledVector(dir, -0.8)
    stretch(arm, sL, _c, 0.32)
    elbow.position.lerpVectors(sL, _c, 0.5)
    elbow.scale.setScalar(0.48)
  }

  function update(s) {
    begin(st, s)
    const k = st.k
    const t = st.t
    const ph = st.phase
    const fx = st.fx
    const S = st.S
    root.position.set(s.home.x, s.surface, s.home.z)
    root.rotation.set(0, yawTo(root.position, s.target), 0)
    let rockY = 0
    let open = 0
    let scuttle = 0
    cb.position.set(0, 0.95, 0)
    if (ph === 'tell') {
      rockY = lerp(-4.5, 0, easeOutBack(clamp01(k / 0.18)))
      cb.position.y += rockY
      open = Math.abs(Math.sin(t * 7))
    } else if (ph === 'attack') {
      open = k < 0.82 ? 1 : 1 - easeIn((k - 0.82) / 0.18)
    } else {
      const sc = clamp01((k - 0.3) / 0.4)
      cb.position.x = 4.5 * easeInOut(sc)
      cb.position.y = 0.95 - 6 * easeIn(clamp01((k - 0.62) / 0.38))
      scuttle = sc > 0 && sc < 1 ? 1 : 0
      open = s.hit ? 0 : k < 0.3 ? Math.abs(Math.sin(k * 30)) : 0.2
      rockY = -4 * easeIn(clamp01((k - 0.6) / 0.4))
    }
    rock.position.y = rockY + Math.sin(t * 1.4 + st.seed) * 0.06
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i]
      l.rotation.set(scuttle * Math.sin(t * 22 + l.userData.i * 2) * 0.4, 0, l.userData.sx * (0.95 + Math.sin(t * 3 + i) * 0.05))
    }
    root.updateMatrixWorld(true)
    shoulder.getWorldPosition(_a)
    toLocal(root, _a, sL)
    // claw rest pose: raised, pointing half toward the target
    toLocal(root, s.target, _d)
    _d.sub(sL).normalize().multiplyScalar(0.4)
    _d.y += 0.9
    _d.x += 0.3 // a little out to the crab's right side
    _d.normalize()
    _e.copy(sL).addScaledVector(_d, 3.4) // rest anchor (local)
    if (ph === 'tell') aL.copy(_e)
    else if (ph === 'attack') {
      _b.lerpVectors(st.a0, s.target, easeOut(k))
      toLocal(root, _b, aL)
    } else {
      if (st.strikeNow) toLocal(root, s.target, strikeL)
      aL.lerpVectors(strikeL, _e, easeInOut(clamp01(k / 0.3)))
    }
    placeClaw()
    fg.rotation.x = -open * 0.7
    if (ph === 'tell' && lastOpen > 0.25 && open <= 0.25) {
      clawA.getWorldPosition(_a)
      emitV(fx, 4, P.snip, _a, S * 0.5)
    }
    lastOpen = open
    if (st.strikeNow) {
      emitV(fx, s.hit ? 28 : 12, P.snip, s.target, S)
      if (s.hit) emitV(fx, 16, P.star, s.target, S)
    }
    cb.getWorldPosition(_a)
    const c = surf(st, 0, _a.y + 1.0 * S, s.surface)
    if (c) emit(fx, c > 0 ? 18 : 28, P.splash, _a.x, s.surface, _a.z, S)
    aimEyes(st, s.player, !s.hit && ph === 'recover' ? 0.5 : 0)
    end(st)
  }
  return { root, update, grabPoint: (out) => out.copy(st.target), dispose() {} }
}

export const ANIMALS_A = { frog, duck, dragon, penguin, owl, goat, bat, chameleon, octopus, croc, puffer, squid, crab }
