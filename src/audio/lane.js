// Sounds of the lane encounters (lane.js), all synthesised on the shared audio
// core (core.js / synth.js). Everything returns quietly before the first gesture
// or when the voice budget is spent.
//  - warn(id): the telegraph the moment an animal shows up; each one is built so
//    you can tell the animal by ear (croak, quack, bleat, screech, chest drum...)
//  - attack(id) / hit(id) / miss(id): the strike, the player getting hit (a heavy
//    cartoon body impact plus the animal's flavour: gulp, clang, feathers, squelch,
//    boom) and the animal missing (empty chomp, annoyed grunt, splash dive)
//  - dodge / nearMiss / combo: whooshes past the ear and a glockenspiel that climbs
//    a pentatonic scale with the streak
//  - shield, dash, traps (bubble, web) and the mash to escape, freeze/thaw, ink
//  - two continuous beds driven every frame: the bee swarm and the magnet hum
//  - helper boosts, the three bosses, danger regions and the beginner jingle
//
// Animal voices come from call(): a buzzy oscillator through one to three vocal
// formant bands, with optional pulse AM (the rattle of a croak or a grunt), ring
// modulation (robot voice), vibrato and soft clipping. Physical layers (impacts,
// water, slime, metal, ice) come from burst / modal / bubble like flight.js.
import { COARSE_POINTER } from '../config.js'
import { A, isMuted, now, onStart, ready, voice } from './core.js'
import { bubble, bubbles, burst, crinkle, env, modal, pick, rnd, route, saturation, tone, vary } from './synth.js'

export const ANIMAL_IDS = [
  'frog', 'duck', 'dragon', 'penguin', 'owl', 'goat', 'bat', 'chameleon', 'octopus', 'croc', 'puffer', 'squid',
  'crab', 'hippo', 'turtle', 'mole', 'bees', 'spider', 'snail', 'gorilla', 'pelican', 'slimeball', 'missile', 'tailslam',
]
export const HELPER_IDS = ['mushroom', 'seagull', 'fan', 'geyser']
export const BOSS_IDS = ['kingDragon', 'mechaDuck', 'skyWhale']
// A boss reusing an animal's warn/attack/hit/miss when the engine asks for one.
const ALIAS = { kingDragon: 'dragon', mechaDuck: 'duck', skyWhale: 'tailslam' }
const who = (id) => ALIAS[id] ?? id

const GLOCK = [[1, 1, 1.4], [2.756, 0.32, 0.45], [5.404, 0.1, 0.18], [8.933, 0.04, 0.08]]
const COIN = [[1, 1, 0.5], [1.504, 0.6, 0.36], [2.24, 0.45, 0.26], [2.71, 0.3, 0.18], [3.47, 0.22, 0.12], [4.03, 0.12, 0.08]]
const TROPHY = [[1, 1, 0.7], [2.05, 0.5, 0.5], [3.1, 0.34, 0.32], [4.33, 0.2, 0.2], [5.6, 0.1, 0.12]]
const GLASS = [[1, 1, 0.45], [2.32, 0.5, 0.28], [4.25, 0.28, 0.16], [6.63, 0.14, 0.1]]
const WOOD = [[1, 1, 0.07], [2.57, 0.45, 0.035], [4.2, 0.22, 0.016], [6.1, 0.08, 0.01]]
// A struck steel shell (robot animals): inharmonic plate modes with a long ring.
const METAL = [[1, 1, 0.9], [2.76, 0.6, 0.6], [5.4, 0.4, 0.4], [8.93, 0.25, 0.25], [13.3, 0.12, 0.15]]
// Hollow keratin: a turtle shell, a beak or a claw clacking shut.
const SHELL = [[1, 1, 0.12], [1.93, 0.5, 0.07], [3.31, 0.25, 0.04], [5.2, 0.1, 0.02]]
// Ice shards: bright, short, very inharmonic.
const ICE = [[1, 1, 0.3], [2.71, 0.6, 0.2], [5.15, 0.35, 0.12], [8.4, 0.2, 0.07]]
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]
const semi = (n) => Math.pow(2, n / 12)
const C5 = 523.25
const C6 = 1046.5
const lite = COARSE_POINTER ? 0.6 : 1
const clamp01 = (x) => Math.max(0, Math.min(1, Number(x) || 0))

const lastAt = new Map()
function limit(name, ms) {
  const t = performance.now()
  if (t - (lastAt.get(name) ?? -1e9) < ms) return false
  lastAt.set(name, t)
  return true
}
function buzz(pattern) {
  if (!COARSE_POINTER || isMuted()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // not allowed in this frame
  }
}
function glock(t, notes, gap, gain = 0.12, verb = 0.3) {
  notes.forEach((n, i) => modal({ t: t + i * gap, f: C6 * semi(n), modes: GLOCK, gain: gain * rnd(0.85, 1), strike: 0.1, pan: (i / Math.max(1, notes.length - 1) - 0.5) * 0.5, verb }))
}
// Streak -> a pentatonic step that runs up, then back down, so a long streak keeps singing.
function scaleStep(streak) {
  const step = Math.max(0, streak | 0) % (PENTA.length * 2 - 2)
  return PENTA[step < PENTA.length ? step : PENTA.length * 2 - 2 - step]
}
const curves = new Map()
function curve(drive) {
  let c = curves.get(drive)
  if (!c) curves.set(drive, (c = saturation(drive)))
  return c
}

// Animal vocal. { t, type, f, f2, glide, f3 (pitch at the end: a rise-and-fall contour),
//   a, hold, d, gain, formants: [[f, q, amp, f2?], ...] | lp, am (Hz), am2 (Hz at the end),
//   amDepth 0..1, ring (Hz: ring modulation, robot), vib (Hz), vibDepth (cents), drive, pan, verb, bus }
function call(o) {
  const ctx = A.ctx
  const t = o.t
  const a = o.a ?? 0.01
  const hold = o.hold ?? 0
  const d = o.d ?? 0.2
  const dur = a + hold + d
  const end = t + dur + 0.05
  const osc = ctx.createOscillator()
  osc.type = o.type ?? 'sawtooth'
  osc.frequency.setValueAtTime(o.f, t)
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide ?? (o.f3 ? dur * 0.5 : dur)))
  if (o.f3) osc.frequency.exponentialRampToValueAtTime(o.f3, t + dur)
  const nodes = [osc]
  if (o.vib) {
    const lfo = ctx.createOscillator()
    lfo.frequency.value = vary(o.vib, 0.1)
    const depth = ctx.createGain()
    depth.gain.value = o.vibDepth ?? 30
    lfo.connect(depth).connect(osc.detune)
    nodes.push(lfo)
  }
  let last = osc
  if (o.am || o.ring) {
    const m = ctx.createGain()
    const lfo = ctx.createOscillator()
    const depth = ctx.createGain()
    if (o.ring) {
      m.gain.value = 0
      lfo.frequency.value = o.ring
      depth.gain.value = 1
    } else {
      const k = o.amDepth ?? 0.8
      m.gain.value = 1 - k / 2
      depth.gain.value = k / 2
      lfo.frequency.setValueAtTime(o.am, t)
      if (o.am2) lfo.frequency.exponentialRampToValueAtTime(o.am2, t + dur)
    }
    lfo.connect(depth).connect(m.gain)
    last.connect(m)
    last = m
    nodes.push(lfo)
  }
  if (o.drive) {
    const ws = ctx.createWaveShaper()
    ws.curve = curve(o.drive)
    last.connect(ws)
    last = ws
  }
  const g = ctx.createGain()
  env(g.gain, t, a, o.gain ?? 0.2, d, hold)
  if (o.formants) {
    for (const [ff, q, amp, ff2] of o.formants) {
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.setValueAtTime(ff, t)
      if (ff2) bp.frequency.exponentialRampToValueAtTime(ff2, t + dur)
      bp.Q.value = q
      const fg = ctx.createGain()
      fg.gain.value = amp
      last.connect(bp).connect(fg).connect(g)
    }
  } else if (o.lp) {
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = o.lp
    lp.Q.value = o.lpq ?? 0.7
    last.connect(lp).connect(g)
  } else last.connect(g)
  for (const n of nodes) {
    n.start(t)
    n.stop(end)
  }
  route(g, o)
  return t + dur
}

// Air rushing past: band-swept noise that also travels across the stereo field and
// rises then falls in pitch (a cheap doppler). { t, a, d, f, f2 (peak), f3, q, gain, from, to }
function passBy({ t, a = 0.12, d = 0.25, f = 600, f2 = 2400, f3 = 500, q = 0.9, gain = 0.2, from = -0.7, to = 0.7, noise = 'pink', verb = 0.1, bus = A.sfx }) {
  const ctx = A.ctx
  const dur = a + d
  const buf = A.noise[noise] ?? A.noise.white
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  src.start(t, Math.random() * (buf.duration - 0.1))
  src.stop(t + dur + 0.05)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = q
  bp.frequency.setValueAtTime(f, t)
  bp.frequency.exponentialRampToValueAtTime(f2, t + a)
  bp.frequency.exponentialRampToValueAtTime(f3, t + dur)
  const g = ctx.createGain()
  env(g.gain, t, a, gain, d)
  const p = ctx.createStereoPanner()
  p.pan.setValueAtTime(Math.max(-1, Math.min(1, from)), t)
  p.pan.linearRampToValueAtTime(Math.max(-1, Math.min(1, to)), t + dur)
  src.connect(bp).connect(g).connect(p)
  route(p, { bus, verb })
  return t + dur
}

// --- Shared voices ----------------------------------------------------------------------------
function croak(t, p, k = 1) {
  call({ t, f: vary(88 * k, 0.05), f2: 104 * k, a: 0.03, hold: 0.12, d: 0.1, am: vary(32, 0.1), amDepth: 1, formants: [[420, 3, 3.2], [1150, 5, 1.6]], drive: 2, gain: 0.3 * Math.min(1.2, k), pan: p, verb: 0.15 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 300, a: 0.01, d: 0.15, gain: 0.12 * k, pan: p })
}
// k = pitch scale, ring = robot carrier Hz (mecha duck).
function quack(t, p, k = 1, ring = 0, gain = 0.3) {
  const f = vary(520 * k, 0.06)
  call({ t, f, f2: f * 0.72, a: 0.008, hold: 0.05, d: 0.1, formants: [[1150, 4, 2.6, 820], [2600, 6, 1.4]], drive: 1.5, ring, gain, pan: p, verb: 0.12 })
  if (ring) call({ t, type: 'square', f: f * 0.5, f2: f * 0.36, a: 0.008, hold: 0.05, d: 0.1, formants: [[1150, 6, 1.5, 820]], gain: gain * 0.4, pan: p })
  burst({ t, f: 1600, q: 2, a: 0.002, d: 0.03, gain: 0.08, pan: p }) // the bill clapping open
}
function bleat(t, p) {
  call({ t, f: vary(420, 0.06), f2: 370, a: 0.03, hold: 0.32, d: 0.16, am: vary(9, 0.15), amDepth: 0.85, vib: 9, vibDepth: 55, formants: [[820, 3, 2.6], [1800, 5, 1.5], [2800, 7, 0.7]], gain: 0.28, pan: p, verb: 0.15 })
}
function grunt(t, p, k = 1, gain = 0.22) {
  call({ t, f: vary(110 * k, 0.08), f2: 82 * k, a: 0.02, hold: 0.09, d: 0.12, am: vary(22, 0.15), amDepth: 0.8, formants: [[340, 2, 2.6], [900, 4, 1]], drive: 2, gain, pan: p, verb: 0.1 })
  burst({ t: t + 0.04, noise: 'pink', f: 1100, q: 0.9, a: 0.01, d: 0.14, gain: gain * 0.35, pan: p }) // annoyed snort
}
function honk(t, p, f = 260) {
  call({ t, f: vary(f, 0.05), f2: f * 0.88, a: 0.02, hold: 0.13, d: 0.1, formants: [[700, 3, 2.2], [1350, 4, 1.6], [2400, 6, 0.6]], drive: 1.8, gain: 0.25, pan: p, verb: 0.15 })
}
function flap(t, p, gain = 0.2) {
  burst({ t, noise: 'pink', type: 'lowpass', f: vary(700, 0.15), f2: 260, q: 1.1, a: 0.025, d: 0.11, gain, pan: p })
  burst({ t: t + 0.02, f: 2400, q: 0.7, a: 0.01, d: 0.05, gain: gain * 0.25, pan: p })
}
function squeak(t, p) {
  tone({ t, f: rnd(5200, 7400), f2: rnd(2600, 3600), glide: 0.035, a: 0.002, d: 0.045, gain: rnd(0.04, 0.07), pan: p })
}
// Giant jaws slamming shut: a hollow clack of teeth, a meaty thump, a wet smack.
function chomp(t, p, k = 1) {
  modal({ t, f: vary(210 / k, 0.06), modes: SHELL, gain: 0.35, strike: 0.45, decay: 1.4, pan: p })
  burst({ t, type: 'highpass', f: 3000, q: 0.6, a: 0.0006, d: 0.025, gain: 0.3, pan: p })
  tone({ t, f: 150 / k, f2: 60 / k, d: 0.14, gain: 0.42, pan: p })
  burst({ t: t + 0.01, noise: 'pink', type: 'lowpass', f: 1500, f2: 400, q: 1.2, a: 0.003, d: 0.1, gain: 0.2, pan: p })
}
// Body slap on liquid: crack, low thump, a wave of slime rising and falling back.
function belly(t, p, k = 1) {
  burst({ t, noise: 'pink', f: 1200, q: 0.8, a: 0.001, d: 0.06, gain: 0.5 * k, pan: p })
  burst({ t, type: 'highpass', f: 2600, q: 0.5, a: 0.0005, d: 0.03, gain: 0.35 * k, pan: p })
  tone({ t, f: 85, f2: 36, d: 0.35, gain: 0.5 * k })
  burst({ t: t + 0.04, noise: 'brown', type: 'lowpass', f: 300, f2: 1100, q: 0.7, a: 0.2, d: 0.55, gain: 0.35 * k, verb: 0.3 })
  burst({ t: t + 0.08, type: 'highpass', f: 2500, q: 0.4, a: 0.1, d: 0.45, gain: 0.1 * k, verb: 0.2 })
  bubbles({ t: t + 0.05, n: Math.round(16 * lite), dur: 0.6, f0: 200, f1: 1200, gain: 0.1, verb: 0.15 })
}

// --- Telegraph: one per animal, identifiable by ear ---------------------------------------
const WARN = {
  frog(t, p) {
    tone({ t, f: 150, f2: 235, a: 0.35, d: 0.25, gain: 0.08, pan: p, lp: 600 }) // the throat sac swelling
    croak(t + 0.04, p, 0.85)
    croak(t + 0.34, p, 1.15)
  },
  duck(t, p) {
    tone({ t, type: 'sawtooth', f: 650, f2: 2300, glide: 0.6, a: 0.3, hold: 0.2, d: 0.2, gain: 0.04, lp: 4200, pan: p })
    tone({ t, f: 1300, f2: 4600, glide: 0.6, a: 0.3, hold: 0.2, d: 0.2, gain: 0.025, pan: p })
    burst({ t, noise: 'pink', f: 1400, f2: 5000, q: 0.9, a: 0.45, d: 0.25, gain: 0.12, pan: p })
    quack(t + 0.42, p)
    quack(t + 0.6, p, 1.06, 0, 0.24)
  },
  dragon(t, p) {
    call({ t, f: 52, f2: 74, a: 0.35, hold: 0.4, d: 0.4, am: 21, amDepth: 0.9, formants: [[250, 2, 3.4, 420], [700, 4, 1.2]], drive: 2.5, gain: 0.36, pan: p, verb: 0.2 })
    burst({ t, noise: 'brown', type: 'lowpass', f: 220, a: 0.3, hold: 0.3, d: 0.5, gain: 0.35, pan: p })
    bubbles({ t, n: Math.round(18 * lite), dur: 1.0, f0: 110, f1: 520, gain: 0.13, d: [0.04, 0.1], rise: 0.8, verb: 0.1 })
  },
  penguin(t, p) {
    call({ t, type: 'square', f: 110, f2: 880, glide: 0.9, a: 0.55, hold: 0.33, d: 0.08, am: 6, am2: 42, amDepth: 0.6, lp: 2400, gain: 0.08, pan: p })
    tone({ t, f: 220, f2: 1760, glide: 0.9, a: 0.6, hold: 0.28, d: 0.08, gain: 0.05, pan: p })
    const n = Math.round(8 * lite)
    for (let i = 0; i < n; i++) burst({ t: t + Math.pow(i / n, 0.6) * 0.85, type: 'highpass', f: rnd(4000, 7000), q: 0.7, a: 0.0005, d: rnd(0.003, 0.008), gain: 0.03 + 0.05 * (i / n), pan: p + rnd(-0.2, 0.2) })
  },
  owl(t, p) {
    burst({ t, f: 3200, f2: 2300, q: 2.4, a: 0.05, hold: 0.3, d: 0.35, gain: 0.22, pan: p, verb: 0.45 })
    call({ t, f: vary(1500, 0.05), f2: 1100, a: 0.05, hold: 0.3, d: 0.3, am: 70, amDepth: 0.45, formants: [[2800, 3, 2], [4500, 5, 1]], gain: 0.12, pan: p, verb: 0.45 })
    passBy({ t: t + 0.25, a: 0.25, d: 0.3, f: 1600, f2: 900, f3: 400, gain: 0.08, from: p, to: p * 0.3, verb: 0.2 })
  },
  goat(t, p) {
    for (let i = 0; i < 2; i++) {
      const at = t + i * 0.16
      burst({ t: at, noise: 'pink', f: vary(1900, 0.1), f2: 900, q: 1.6, a: 0.01, d: 0.1, gain: 0.16, pan: p })
      crinkle({ t: at, n: Math.round(6 * lite), dur: 0.09, gain: 0.05, f0: 1200, f1: 3800, width: 0.2 })
      modal({ t: at, f: vary(700, 0.05), modes: WOOD, gain: 0.12, strike: 0.2, pan: p })
    }
    bleat(t + 0.36, p)
  },
  bat(t, p) {
    const n = 4 + Math.floor(Math.random() * 3)
    for (let i = 0; i < n; i++) squeak(t + i * rnd(0.06, 0.12), p + rnd(-0.3, 0.3))
    for (let i = 0; i < 4; i++) burst({ t: t + 0.05 + i * 0.09, noise: 'pink', type: 'lowpass', f: 900, q: 0.9, a: 0.01, d: 0.05, gain: 0.08, pan: p })
  },
  chameleon(t, p) {
    const n = Math.round(9 * lite)
    for (let i = 0; i < n; i++) modal({ t: t + rnd(0, 0.7), f: rnd(3600, 7600), modes: GLASS, gain: 0.018, decay: 0.6, pan: p + rnd(-0.4, 0.4), verb: 0.3 })
    burst({ t, type: 'highpass', f: 5000, q: 0.5, a: 0.35, d: 0.4, gain: 0.04, pan: p, verb: 0.2 })
    call({ t, type: 'sine', f: 2400, f2: 2900, a: 0.3, hold: 0.1, d: 0.4, am: 11, amDepth: 0.9, gain: 0.02, pan: p, verb: 0.3 })
  },
  octopus(t, p) {
    burst({ t, noise: 'brown', type: 'lowpass', f: 180, a: 0.4, hold: 0.2, d: 0.7, gain: 0.5, pan: p })
    tone({ t, type: 'triangle', f: 42, f2: 58, a: 0.4, hold: 0.2, d: 0.5, gain: 0.3, lp: 200 })
    for (let i = 0; i < 6; i++) bubble({ t: t + 0.15 + i * rnd(0.1, 0.17), f: rnd(90, 210), d: rnd(0.1, 0.18), gain: rnd(0.14, 0.24), rise: rnd(0.8, 1.4), pan: p + rnd(-0.3, 0.3) })
    burst({ t: t + 0.5, noise: 'pink', type: 'lowpass', f: 900, f2: 300, q: 1.4, a: 0.02, d: 0.2, gain: 0.15, pan: p })
  },
  croc(t, p) {
    call({ t, type: 'triangle', f: 68, f2: 58, a: 0.15, hold: 0.35, d: 0.3, am: 16, amDepth: 0.9, drive: 3, lp: 500, gain: 0.3, pan: p })
    bubbles({ t: t + 0.05, n: Math.round(14 * lite), dur: 0.8, f0: 120, f1: 450, gain: 0.15, d: [0.04, 0.1], rise: 0.6 })
  },
  puffer(t, p) {
    call({ type: 'triangle', t, f: 280, f2: 900, glide: 0.7, a: 0.05, hold: 0.55, d: 0.1, vib: 18, vibDepth: 80, lp: 3200, gain: 0.14, pan: p })
    burst({ t, noise: 'pink', f: 600, f2: 2400, q: 1.2, a: 0.55, d: 0.15, gain: 0.12, pan: p })
    for (let i = 0; i < 5; i++) burst({ t: t + 0.1 + i * 0.12, f: rnd(900, 1600), q: rnd(5, 9), a: 0.001, d: 0.025, gain: 0.05, pan: p })
  },
  squid(t, p) {
    for (let i = 0; i < 2; i++) {
      const at = t + i * 0.22
      burst({ t: at, noise: 'pink', type: 'lowpass', f: 1700, f2: 300, q: 1.6, a: 0.008, d: 0.17, gain: 0.32, pan: p })
      bubble({ t: at + 0.02, f: vary(230, 0.1), d: 0.1, gain: 0.25, rise: 1.2, pan: p })
    }
    bubbles({ t: t + 0.1, n: Math.round(8 * lite), dur: 0.4, f0: 400, f1: 1600, gain: 0.06 })
  },
  crab(t, p) {
    for (let i = 0; i < 6; i++) {
      const at = t + i * 0.085 + (i % 2) * 0.02
      const side = i % 2 ? 0.25 : -0.25
      modal({ t: at, f: vary(2100, 0.1), modes: SHELL, gain: 0.14, strike: 0.25, pan: p + side })
      if (i % 2) burst({ t: at + 0.012, type: 'highpass', f: 5200, q: 0.7, a: 0.0005, d: 0.015, gain: 0.12, pan: p + side })
    }
  },
  hippo(t, p) {
    call({ t, f: vary(68, 0.06), f2: 54, a: 0.04, hold: 0.24, d: 0.2, am: 24, amDepth: 0.9, formants: [[250, 2, 3.2], [620, 4, 1.2]], drive: 2.2, gain: 0.42, pan: p, verb: 0.15 })
    burst({ t: t + 0.25, noise: 'brown', type: 'lowpass', f: 900, f2: 260, q: 0.8, a: 0.05, d: 0.4, gain: 0.3, pan: p })
    bubbles({ t: t + 0.28, n: Math.round(10 * lite), dur: 0.4, f0: 220, f1: 900, gain: 0.08 })
  },
  turtle(t, p) {
    call({ t, type: 'triangle', f: 160, f2: 330, a: 0.2, hold: 0.5, d: 0.2, am: 12, am2: 32, amDepth: 0.9, lp: 1800, gain: 0.16, pan: p })
    burst({ t, noise: 'pink', f: 900, f2: 1900, q: 1.4, a: 0.3, hold: 0.3, d: 0.2, gain: 0.1, pan: p })
    crinkle({ t, n: Math.round(14 * lite), dur: 0.8, gain: 0.03, f0: 1500, f1: 4500, width: 0.3 })
  },
  mole(t, p) {
    for (let i = 0; i < 4; i++) {
      const at = t + i * rnd(0.09, 0.13)
      burst({ t: at, noise: 'brown', type: 'lowpass', f: vary(900, 0.2), q: 0.8, a: 0.003, d: 0.06, gain: 0.26, pan: p })
      crinkle({ t: at, n: Math.round(5 * lite), dur: 0.06, gain: 0.05, f0: 800, f1: 3000, width: 0.2 })
    }
    call({ t: t + 0.3, f: 50, f2: 60, a: 0.45, hold: 0.25, d: 0.25, am: 6, amDepth: 0.6, lp: 520, gain: 0.14, pan: p })
    tone({ t: t + 0.3, f: 120, f2: 124, a: 0.45, hold: 0.25, d: 0.25, gain: 0.05, pan: p })
  },
  bees(t, p) {
    const n = Math.round(3 * lite) || 2
    for (let i = 0; i < n; i++) call({ t: t + i * 0.04, f: rnd(200, 260), f2: rnd(250, 300), a: 0.6, hold: 0.3, d: 0.3, vib: rnd(6, 12), vibDepth: 45, formants: [[520, 1.5, 2], [1500, 3, 0.8]], gain: 0.07, pan: p + (i - (n - 1) / 2) * 0.35 })
  },
  spider(t, p) {
    for (let i = 0; i < 3; i++) {
      const at = t + i * 0.13
      burst({ t: at, f: 1400, f2: 6200, sweep: 0.06, q: 3, a: 0.002, d: 0.08, gain: 0.14, pan: p + (i - 1) * 0.3 })
      tone({ t: at + 0.05, type: 'triangle', f: vary(620, 0.08), f2: 900, glide: 0.04, d: 0.1, gain: 0.05, lp: 3000, pan: p })
    }
  },
  snail(t, p) {
    burst({ t, noise: 'pink', type: 'lowpass', f: 300, f2: 1400, sweep: 0.7, q: 2.2, a: 0.3, hold: 0.2, d: 0.25, gain: 0.28, pan: p })
    call({ t, type: 'sine', f: 190, f2: 360, a: 0.3, hold: 0.2, d: 0.25, vib: 7, vibDepth: 70, gain: 0.08, pan: p })
    for (let i = 0; i < 4; i++) bubble({ t: t + 0.2 + i * 0.15, f: rnd(250, 500), d: 0.08, gain: 0.1, rise: 0.8, pan: p })
  },
  gorilla(t, p) {
    let at = t
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 0.15 : -0.15
      tone({ t: at, f: vary(125, 0.05), f2: 72, d: 0.11, gain: 0.42, pan: p + side })
      burst({ t: at, noise: 'pink', type: 'lowpass', f: 750, q: 0.9, a: 0.002, d: 0.06, gain: 0.24, pan: p + side, verb: 0.15 })
      at += 0.11 - i * 0.007 // speeding up
    }
    grunt(at + 0.05, p, 0.7, 0.24)
  },
  pelican(t, p) {
    honk(t, p)
    honk(t + 0.22, p, 240)
    for (let i = 0; i < 3; i++) flap(t + 0.42 + i * 0.13, p, 0.18)
  },
  slimeball(t, p) {
    burst({ t, noise: 'pink', type: 'lowpass', f: 2400, f2: 500, q: 1.3, a: 0.002, d: 0.08, gain: 0.3, pan: p })
    burst({ t: t + 0.01, type: 'highpass', f: 3500, q: 0.5, a: 0.003, d: 0.12, gain: 0.08, pan: p })
    bubble({ t: t + 0.01, f: vary(380, 0.1), d: 0.07, gain: 0.25, rise: 1.2, pan: p })
    tone({ t, f: 260, f2: 120, d: 0.08, gain: 0.15, pan: p })
  },
  missile(t, p) {
    burst({ t, type: 'highpass', f: 2500, q: 0.6, a: 0.0006, d: 0.03, gain: 0.3, pan: p }) // ignition click
    burst({ t: t + 0.02, f: 2000, f2: 6000, q: 0.6, a: 0.06, hold: 0.45, d: 0.4, gain: 0.2, pan: p, verb: 0.2 })
    burst({ t: t + 0.02, noise: 'brown', type: 'lowpass', f: 300, a: 0.1, hold: 0.3, d: 0.5, gain: 0.35, pan: p })
    tone({ t: t + 0.05, type: 'sawtooth', f: 400, f2: 1300, glide: 0.8, a: 0.2, hold: 0.4, d: 0.2, gain: 0.03, lp: 3000, pan: p })
  },
  tailslam(t, p) {
    call({ t, type: 'triangle', f: 85, f2: 140, f3: 78, a: 0.4, hold: 0.5, d: 0.6, vib: 3, vibDepth: 25, lp: 600, gain: 0.34, pan: p, verb: 0.6 })
    call({ t: t + 0.05, type: 'sine', f: 128, f2: 210, f3: 117, a: 0.4, hold: 0.45, d: 0.55, vib: 3.5, vibDepth: 30, gain: 0.12, pan: p, verb: 0.6 })
    burst({ t, noise: 'brown', type: 'lowpass', f: 160, a: 0.5, d: 0.8, gain: 0.3 })
  },
}
function alertRise(t, p) {
  tone({ t, type: 'square', f: 440, f2: 660, glide: 0.12, d: 0.14, gain: 0.05, lp: 2400, pan: p })
  tone({ t: t + 0.16, type: 'square', f: 660, f2: 990, glide: 0.12, d: 0.18, gain: 0.05, lp: 2600, pan: p })
  burst({ t, noise: 'pink', f: 400, f2: 2400, q: 0.8, a: 0.3, d: 0.1, gain: 0.08 })
}

export function warn(id) {
  const key = who(id)
  if (!limit('warn:' + key, 150) || !voice(1.6, 3)) return
  const t = now()
  const p = rnd(-0.3, 0.3)
  const fn = WARN[key]
  if (fn) fn(t, p)
  else alertRise(t, p)
}

// --- The strike -----------------------------------------------------------------------------
function thwip(t, p, k = 1) {
  tone({ t, f: 380 * k, f2: 2600 * k, glide: 0.06, d: 0.08, gain: 0.22, pan: p })
  burst({ t, f: 800, f2: 5200, q: 1.2, a: 0.002, d: 0.07, gain: 0.2, pan: p })
  tone({ t: t + 0.06, type: 'triangle', f: 320 * k, f2: 520 * k, glide: 0.05, d: 0.1, gain: 0.08, lp: 2400, pan: p }) // the elastic twang
}
function zap(t, p, k = 1) {
  call({ t, type: 'square', f: 1700 * k, f2: 150, glide: 0.22, a: 0.002, hold: 0.04, d: 0.22, am: 58, amDepth: 0.8, lp: 4800, gain: 0.13, pan: p })
  tone({ t, f: 1900 * k, f2: 300, glide: 0.18, d: 0.2, gain: 0.08, pan: p })
  for (let i = 0; i < Math.round(6 * lite); i++) burst({ t: t + rnd(0, 0.2), type: 'highpass', f: rnd(3500, 7000), q: 0.6, a: 0.0004, d: rnd(0.003, 0.01), gain: rnd(0.06, 0.12), pan: p + rnd(-0.3, 0.3) })
}
const ATTACK = {
  frog: (t, p) => thwip(t, p),
  chameleon(t, p) {
    thwip(t, p, 1.3)
    modal({ t: t + 0.07, f: 900, modes: WOOD, gain: 0.15, strike: 0.2, pan: p }) // sticky tip landing
  },
  duck(t, p) {
    passBy({ t, a: 0.12, d: 0.12, f: 900, f2: 3600, f3: 2000, gain: 0.14, from: p - 0.3, to: p })
    const b = t + 0.18
    tone({ t: b, f: 72, f2: 30, d: 0.45, gain: 0.5 })
    burst({ t: b, noise: 'brown', type: 'lowpass', f: 800, f2: 200, q: 0.6, a: 0.003, d: 0.5, gain: 0.45, verb: 0.3 })
    burst({ t: b, noise: 'pink', f: 3000, f2: 900, q: 0.7, a: 0.01, d: 0.6, gain: 0.22, pan: p })
    modal({ t: b, f: 520, modes: METAL, gain: 0.08, beat: 6, strike: 0.25, decay: 0.5, pan: p })
  },
  dragon(t, p) {
    chomp(t, p, 1.25)
    call({ t: t + 0.08, f: 60, f2: 48, a: 0.02, hold: 0.15, d: 0.25, am: 24, amDepth: 0.9, formants: [[260, 2, 3]], drive: 2.5, gain: 0.22, pan: p })
    bubble({ t: t + 0.05, f: 160, d: 0.12, gain: 0.25, rise: 1.2, pan: p })
  },
  penguin: (t, p) => zap(t, p),
  owl(t, p) {
    tone({ t, f: 2700, f2: 1150, glide: 0.5, a: 0.05, hold: 0.3, d: 0.15, vib: 0, gain: 0.08, pan: p, verb: 0.2 })
    passBy({ t: t + 0.1, a: 0.3, d: 0.25, f: 500, f2: 2800, f3: 700, gain: 0.26, from: -p - 0.4, to: p + 0.4 })
  },
  goat(t, p) {
    for (let i = 0; i < 4; i++) modal({ t: t + i * 0.07, f: vary(620, 0.06), modes: WOOD, gain: 0.14, strike: 0.25, pan: p })
    passBy({ t: t + 0.1, a: 0.15, d: 0.1, f: 500, f2: 2200, f3: 1000, gain: 0.16, from: p, to: p * 0.2 })
    tone({ t: t + 0.32, f: 95, f2: 40, d: 0.25, gain: 0.45 })
    modal({ t: t + 0.32, f: 260, modes: SHELL, gain: 0.25, strike: 0.3, pan: p }) // horns
  },
  bat(t, p) {
    passBy({ t, a: 0.15, d: 0.2, f: 700, f2: 3200, f3: 900, gain: 0.2, from: p - 0.5, to: p + 0.5 })
    squeak(t + 0.12, p)
    squeak(t + 0.2, p)
  },
  octopus(t, p) {
    burst({ t, noise: 'brown', type: 'lowpass', f: 900, f2: 200, q: 0.8, a: 0.005, d: 0.5, gain: 0.5, verb: 0.2 })
    bubbles({ t, n: Math.round(16 * lite), dur: 0.5, f0: 150, f1: 900, gain: 0.14, rise: 0.9 })
    burst({ t: t + 0.08, f: 600, f2: 5000, sweep: 0.08, q: 1.3, a: 0.002, d: 0.09, gain: 0.25, pan: p }) // tentacle whip
    burst({ t: t + 0.17, noise: 'pink', f: 1300, q: 0.9, a: 0.001, d: 0.05, gain: 0.35, pan: p })
  },
  croc(t, p) {
    chomp(t, p, 0.9)
    chomp(t + 0.13, p, 0.85)
  },
  puffer(t, p) {
    call({ type: 'triangle', t, f: 200, f2: 620, a: 0.03, hold: 0.25, d: 0.15, vib: 9, vibDepth: 120, lp: 2000, gain: 0.12, pan: p })
    bubbles({ t, n: Math.round(18 * lite), dur: 0.5, f0: 400, f1: 2000, gain: 0.1, rise: 0.5 })
    bubble({ t: t + 0.25, f: 240, d: 0.18, gain: 0.3, rise: 0.9, pan: p })
  },
  squid(t, p) {
    burst({ t, noise: 'pink', type: 'lowpass', f: 900, f2: 200, q: 1.4, a: 0.005, d: 0.25, gain: 0.45, pan: p })
    call({ t, f: 95, f2: 62, a: 0.005, hold: 0.08, d: 0.15, am: 38, amDepth: 1, lp: 700, gain: 0.25, pan: p }) // the splort
    bubbles({ t: t + 0.03, n: Math.round(12 * lite), dur: 0.35, f0: 250, f1: 1100, gain: 0.1 })
  },
  crab(t, p) {
    modal({ t, f: vary(2600, 0.06), modes: METAL, gain: 0.1, decay: 0.2, strike: 0.4, pan: p })
    burst({ t, type: 'highpass', f: 4500, q: 0.7, a: 0.0005, d: 0.03, gain: 0.3, pan: p })
    burst({ t: t + 0.03, f: 6500, f2: 3000, q: 2, a: 0.001, d: 0.05, gain: 0.15, pan: p }) // blades sliding
    modal({ t: t + 0.05, f: 1300, modes: SHELL, gain: 0.25, strike: 0.4, pan: p })
  },
  hippo(t, p) {
    passBy({ t, a: 0.2, d: 0.08, f: 300, f2: 1400, f3: 900, gain: 0.15, from: p, to: p })
    belly(t + 0.25, p, 1.1)
    buzz(50)
  },
  turtle(t, p) {
    burst({ t, noise: 'pink', f: 1600, f2: 700, q: 3, a: 0.01, hold: 0.22, d: 0.2, gain: 0.25, pan: p })
    crinkle({ t, n: Math.round(18 * lite), dur: 0.4, gain: 0.05, f0: 1500, f1: 5000, width: 0.3 })
    modal({ t: t + 0.42, f: vary(240, 0.06), modes: SHELL, gain: 0.35, strike: 0.3, decay: 1.4, pan: p })
  },
  mole: (t, p) => {
    zap(t, p, 0.7)
    tone({ t, f: 90, f2: 45, d: 0.22, gain: 0.35 })
    call({ t, f: 55, a: 0.01, hold: 0.1, d: 0.25, am: 100, amDepth: 0.7, lp: 600, gain: 0.15 })
  },
  bees(t, p) {
    for (let i = 0; i < 3; i++) call({ t: t + i * 0.03, f: rnd(240, 300), f2: rnd(330, 400), a: 0.1, hold: 0.25, d: 0.2, vib: rnd(10, 16), vibDepth: 60, formants: [[700, 1.5, 2], [1800, 3, 0.8]], gain: 0.08, pan: p + (i - 1) * 0.4 })
    passBy({ t, a: 0.2, d: 0.2, f: 900, f2: 2600, f3: 1200, gain: 0.12, from: p - 0.4, to: p + 0.4 })
  },
  spider(t, p) {
    tone({ t, type: 'triangle', f: 950, f2: 300, glide: 0.05, d: 0.16, gain: 0.14, lp: 3500, pan: p })
    burst({ t, type: 'highpass', f: 3200, q: 0.6, a: 0.0006, d: 0.03, gain: 0.3, pan: p })
    burst({ t: t + 0.05, noise: 'pink', type: 'lowpass', f: 1300, f2: 400, q: 1, a: 0.003, d: 0.1, gain: 0.25, pan: p })
  },
  snail(t, p) {
    burst({ t, noise: 'pink', type: 'lowpass', f: 400, f2: 1800, q: 2, a: 0.15, d: 0.08, gain: 0.25, pan: p })
    burst({ t: t + 0.2, noise: 'pink', type: 'lowpass', f: 2000, f2: 400, q: 1.4, a: 0.003, d: 0.15, gain: 0.32, pan: p })
    bubble({ t: t + 0.21, f: 300, d: 0.1, gain: 0.22, rise: 1.3, pan: p })
  },
  gorilla(t, p) {
    // A clap is a few slaps of skin a few ms apart, then the room answering.
    for (let i = 0; i < 4; i++) burst({ t: t + i * rnd(0.004, 0.009), noise: 'pink', f: vary(1150, 0.1), q: 1.1, a: 0.0006, d: 0.07, gain: 0.55, pan: p, verb: 0.5 })
    burst({ t, type: 'highpass', f: 2000, q: 0.5, a: 0.0005, d: 0.05, gain: 0.45, verb: 0.4 })
    tone({ t, f: 62, f2: 26, d: 0.75, gain: 0.7 })
    burst({ t, noise: 'brown', type: 'lowpass', f: 600, f2: 120, q: 0.6, a: 0.003, d: 0.8, gain: 0.5, verb: 0.5 })
    passBy({ t: t + 0.03, a: 0.04, d: 0.5, f: 3500, f2: 2500, f3: 300, gain: 0.2, from: p, to: p })
    buzz([70, 30, 90])
  },
  pelican(t, p) {
    passBy({ t, a: 0.15, d: 0.15, f: 1800, f2: 1200, f3: 400, gain: 0.2, from: p - 0.3, to: p + 0.3 })
    burst({ t: t + 0.18, noise: 'brown', type: 'lowpass', f: 900, f2: 300, q: 0.7, a: 0.03, d: 0.3, gain: 0.35, pan: p })
    bubbles({ t: t + 0.18, n: Math.round(12 * lite), dur: 0.35, f0: 250, f1: 1200, gain: 0.1 })
    modal({ t: t + 0.42, f: 520, modes: SHELL, gain: 0.3, strike: 0.4, pan: p }) // beak clacks shut
  },
  slimeball(t, p) {
    burst({ t, noise: 'pink', type: 'lowpass', f: 1500, f2: 280, q: 1.4, a: 0.002, d: 0.2, gain: 0.45, pan: p })
    tone({ t, f: 150, f2: 60, d: 0.14, gain: 0.3, pan: p })
    bubbles({ t: t + 0.02, n: Math.round(10 * lite), dur: 0.3, f0: 300, f1: 1400, gain: 0.1 })
  },
  missile(t, p) {
    passBy({ t, a: 0.3, d: 0.35, f: 600, f2: 3200, f3: 500, q: 0.6, gain: 0.3, from: p - 0.6, to: p + 0.6, verb: 0.2 })
    tone({ t, type: 'sawtooth', f: 1500, f2: 650, glide: 0.6, a: 0.25, d: 0.35, gain: 0.035, lp: 3000, pan: p })
    burst({ t, noise: 'brown', type: 'lowpass', f: 260, a: 0.25, d: 0.35, gain: 0.35 })
  },
  tailslam(t, p) {
    passBy({ t, a: 0.25, d: 0.08, f: 200, f2: 900, f3: 600, gain: 0.2, from: p, to: p })
    belly(t + 0.3, p, 1.3)
    tone({ t: t + 0.3, f: 48, f2: 24, d: 0.9, gain: 0.55 })
    buzz([60, 30, 80])
  },
}
export function attack(id) {
  const key = who(id)
  if (!limit('attack:' + key, 120) || !voice(1.2, 4)) return
  const t = now()
  const p = rnd(-0.25, 0.25)
  const fn = ATTACK[key]
  if (fn) fn(t, p)
  else passBy({ t, a: 0.12, d: 0.2, f: 600, f2: 2600, f3: 700, gain: 0.2, from: p - 0.4, to: p + 0.4 })
}

// --- The player got hit --------------------------------------------------------------------
// Heavy but cartoon: a deep body thump, a slap of skin, a crack, then a bonk that
// drops in pitch (the classic "doink"). k = how big the animal is.
function impact(t, k = 1) {
  tone({ t, f: vary(110, 0.08), f2: 40, d: 0.3 * k, gain: 0.5 * Math.min(1.2, k) })
  burst({ t, noise: 'brown', type: 'lowpass', f: 900, f2: 200, q: 0.7, a: 0.002, d: 0.24 * k, gain: 0.45 * Math.min(1.2, k), verb: 0.18 })
  burst({ t, type: 'highpass', f: 2400, q: 0.6, a: 0.0005, d: 0.025, gain: 0.3 * k })
  burst({ t: t + 0.004, noise: 'pink', f: 1100, q: 0.9, a: 0.001, d: 0.08, gain: 0.22 * k })
  tone({ t: t + 0.02, type: 'triangle', f: vary(560, 0.1), f2: 170, glide: 0.2, d: 0.22, gain: 0.08, lp: 2400 })
}
const FLAVOUR = {
  gulp(t, p) {
    burst({ t: t + 0.03, noise: 'pink', type: 'lowpass', f: 1800, f2: 400, q: 1.2, a: 0.004, d: 0.14, gain: 0.3, pan: p })
    bubble({ t: t + 0.08, f: vary(170, 0.08), d: 0.16, gain: 0.45, rise: 1.5, pan: p }) // GULP
    tone({ t: t + 0.2, f: 240, f2: 90, glide: 0.18, d: 0.2, gain: 0.18, pan: p }) // down the throat
    bubble({ t: t + 0.34, f: vary(120, 0.1), d: 0.12, gain: 0.2, rise: 0.8, pan: p })
  },
  clang(t, p) {
    modal({ t, f: vary(380, 0.08), modes: METAL, gain: 0.2, beat: 6, strike: 0.4, decay: 0.8, pan: p, verb: 0.25 })
    modal({ t: t + 0.01, f: vary(1240, 0.08), modes: METAL, gain: 0.06, beat: 9, decay: 0.4, pan: -p })
    burst({ t, f: 2600, q: 1.5, a: 0.0008, d: 0.04, gain: 0.2, pan: p })
  },
  feather(t, p) {
    burst({ t, noise: 'pink', f: 1800, q: 0.6, a: 0.01, d: 0.35, gain: 0.2, pan: p })
    crinkle({ t, n: Math.round(18 * lite), dur: 0.45, gain: 0.05, f0: 1500, f1: 5000, width: 0.8 })
    flap(t + 0.06, p, 0.16)
    flap(t + 0.18, -p, 0.1)
  },
  squelch(t, p) {
    burst({ t, noise: 'pink', type: 'lowpass', f: 2000, f2: 300, q: 1.5, a: 0.003, d: 0.2, gain: 0.4, pan: p })
    bubble({ t: t + 0.02, f: vary(200, 0.1), d: 0.14, gain: 0.3, rise: 1.3, pan: p })
    bubbles({ t: t + 0.03, n: Math.round(12 * lite), dur: 0.35, f0: 250, f1: 1400, gain: 0.1 })
    crinkle({ t: t + 0.02, n: Math.round(8 * lite), dur: 0.2, gain: 0.04, f0: 800, f1: 2500 })
  },
  boom(t) {
    tone({ t, f: 62, f2: 24, d: 0.9, gain: 0.7 })
    burst({ t, noise: 'brown', type: 'lowpass', f: 900, f2: 150, q: 0.6, a: 0.003, d: 1.1, gain: 0.6, verb: 0.5 })
    burst({ t, type: 'highpass', f: 1600, q: 0.5, a: 0.0005, d: 0.06, gain: 0.5 })
    burst({ t: t + 0.01, noise: 'pink', f: 800, f2: 300, q: 0.7, a: 0.005, d: 0.6, gain: 0.3 })
    crinkle({ t: t + 0.05, n: Math.round(22 * lite), dur: 0.8, gain: 0.06, f0: 800, f1: 4000, width: 0.9 }) // debris
    buzz([80, 40, 120])
  },
  thud(t, p) {
    tone({ t, f: 72, f2: 30, d: 0.42, gain: 0.5 })
    burst({ t, noise: 'brown', type: 'lowpass', f: 320, q: 0.7, a: 0.003, d: 0.32, gain: 0.4, pan: p, verb: 0.2 })
  },
  sting(t, p) {
    tone({ t, type: 'sawtooth', f: 3400, f2: 900, glide: 0.08, d: 0.1, gain: 0.05, lp: 5200, pan: p })
    burst({ t, type: 'highpass', f: 5000, q: 0.7, a: 0.0005, d: 0.02, gain: 0.2, pan: p })
    call({ t: t + 0.05, f: 260, f2: 230, a: 0.02, hold: 0.15, d: 0.2, vib: 14, vibDepth: 70, formants: [[600, 1.5, 2], [1600, 3, 0.8]], gain: 0.1, pan: p })
  },
  snip(t, p) {
    modal({ t, f: vary(2600, 0.06), modes: METAL, gain: 0.12, decay: 0.25, strike: 0.4, pan: p })
    burst({ t, type: 'highpass', f: 5000, q: 0.7, a: 0.0005, d: 0.02, gain: 0.25, pan: p })
    burst({ t: t + 0.03, type: 'highpass', f: 5500, q: 0.7, a: 0.0005, d: 0.02, gain: 0.2, pan: p })
  },
  web(t, p) {
    tone({ t, type: 'triangle', f: 720, f2: 220, glide: 0.12, d: 0.2, gain: 0.12, lp: 3000, pan: p })
    crinkle({ t, n: Math.round(14 * lite), dur: 0.3, gain: 0.05, f0: 1200, f1: 3500, width: 0.6 })
    burst({ t, noise: 'pink', type: 'lowpass', f: 1200, f2: 350, q: 1.2, a: 0.003, d: 0.12, gain: 0.25, pan: p })
  },
  zap: (t, p) => zap(t, p, 0.85),
  knock(t, p) {
    modal({ t, f: vary(240, 0.06), modes: SHELL, gain: 0.35, strike: 0.3, decay: 1.5, pan: p })
  },
}
// [flavours, body weight]
const HIT = {
  frog: [['gulp'], 1], chameleon: [['gulp'], 0.9], croc: [['gulp', 'thud'], 1.15], dragon: [['gulp', 'squelch'], 1.2], pelican: [['gulp', 'feather'], 1],
  duck: [['clang'], 1.05], penguin: [['clang', 'zap'], 1], mole: [['clang', 'zap'], 0.95], missile: [['boom', 'clang'], 1.25],
  owl: [['feather'], 0.9], bat: [['feather'], 0.8],
  goat: [['thud', 'knock'], 1.15], hippo: [['thud', 'squelch'], 1.3], gorilla: [['thud'], 1.35], turtle: [['knock', 'thud'], 1.1], tailslam: [['thud', 'squelch'], 1.4],
  octopus: [['squelch'], 1.05], squid: [['squelch'], 0.95], snail: [['squelch'], 0.85], slimeball: [['squelch'], 0.85], puffer: [['squelch'], 0.9],
  spider: [['web'], 0.75], crab: [['snip'], 0.9], bees: [['sting'], 0.7],
}
export function hit(id) {
  const key = who(id)
  if (!limit('hit', 140) || !voice(1.3, 5)) return
  const t = now()
  const p = rnd(-0.2, 0.2)
  const [flavours, k] = HIT[key] ?? [['thud'], 1]
  impact(t, ALIAS[id] ? k * 1.2 : k)
  for (const name of flavours) FLAVOUR[name](t, p)
  if (!flavours.includes('boom')) buzz(k > 1.1 ? [60, 30, 70] : [45, 25, 50])
}

// --- The animal missed (quieter) --------------------------------------------------------------
const MISSF = {
  snap(t, p) {
    modal({ t, f: vary(650, 0.08), modes: SHELL, gain: 0.22, strike: 0.45, pan: p })
    burst({ t, type: 'highpass', f: 3500, q: 0.6, a: 0.0005, d: 0.02, gain: 0.15, pan: p })
  },
  retract(t, p) {
    tone({ t, f: 2200, f2: 330, glide: 0.12, d: 0.14, gain: 0.1, pan: p })
    burst({ t, f: 4000, f2: 700, q: 1.3, a: 0.003, d: 0.1, gain: 0.1, pan: p })
    burst({ t: t + 0.12, noise: 'pink', type: 'lowpass', f: 900, q: 1, a: 0.002, d: 0.05, gain: 0.12, pan: p }) // plap back in the mouth
  },
  croak: (t, p) => croak(t + 0.18, p, 0.7),
  grunt: (t, p) => grunt(t + 0.08, p, rnd(0.85, 1.1), 0.18),
  splash(t, p) {
    burst({ t, f: 1800, f2: 600, q: 0.9, a: 0.004, d: 0.35, gain: 0.2, pan: p })
    tone({ t, f: 120, f2: 55, d: 0.2, gain: 0.2 })
    burst({ t, noise: 'brown', type: 'lowpass', f: 600, f2: 200, q: 0.7, a: 0.01, d: 0.3, gain: 0.2, pan: p })
    bubbles({ t: t + 0.05, n: Math.round(12 * lite), dur: 0.5, f0: 200, f1: 1100, gain: 0.07, verb: 0.1 })
  },
  flapAway(t, p) {
    const side = p >= 0 ? 1 : -1
    for (let i = 0; i < 4; i++) flap(t + i * 0.11, side * (0.2 + i * 0.15), 0.14 * (1 - i * 0.2))
  },
  sadBot(t, p) {
    tone({ t, type: 'square', f: 880, f2: 660, glide: 0.1, d: 0.13, gain: 0.04, lp: 2600, pan: p })
    tone({ t: t + 0.15, type: 'square', f: 520, f2: 260, glide: 0.25, d: 0.28, gain: 0.045, lp: 2200, pan: p })
  },
  whiff: (t, p) => passBy({ t, a: 0.1, d: 0.18, f: 700, f2: 2400, f3: 600, gain: 0.12, from: p, to: p + 0.6 }),
  skid(t, p) {
    burst({ t, noise: 'pink', f: 1700, f2: 600, q: 2.5, a: 0.01, hold: 0.15, d: 0.18, gain: 0.15, pan: p })
    crinkle({ t, n: Math.round(10 * lite), dur: 0.3, gain: 0.04, f0: 1200, f1: 4000, width: 0.3 })
  },
  snipAir(t, p) {
    for (let i = 0; i < 2; i++) modal({ t: t + i * 0.1, f: vary(2200, 0.08), modes: SHELL, gain: 0.12, strike: 0.3, pan: p })
  },
  dig(t, p) {
    for (let i = 0; i < 3; i++) burst({ t: t + 0.2 + i * 0.1, noise: 'brown', type: 'lowpass', f: 800, q: 0.8, a: 0.003, d: 0.06, gain: 0.16 * (1 - i * 0.25), pan: p })
  },
  buzzOff(t, p) {
    call({ t, f: 240, f2: 190, a: 0.04, hold: 0.2, d: 0.35, vib: 11, vibDepth: 50, formants: [[520, 1.5, 2], [1400, 3, 0.7]], gain: 0.08, pan: p >= 0 ? 0.7 : -0.7 })
  },
  twang(t, p) {
    call({ t, type: 'triangle', f: 480, f2: 470, a: 0.002, d: 0.45, vib: 7, vibDepth: 40, lp: 2500, gain: 0.1, pan: p })
  },
  deflate(t, p) {
    call({ t, f: 150, f2: 70, a: 0.01, hold: 0.25, d: 0.15, am: 42, amDepth: 1, lp: 900, gain: 0.2, pan: p }) // pbbbt
    burst({ t, f: 2000, f2: 900, q: 1, a: 0.01, hold: 0.2, d: 0.15, gain: 0.08, pan: p })
  },
  plop(t, p) {
    bubble({ t, f: vary(260, 0.1), d: 0.1, gain: 0.22, rise: 1.3, pan: p })
    burst({ t, noise: 'pink', type: 'lowpass', f: 1200, f2: 300, q: 1.2, a: 0.003, d: 0.1, gain: 0.15, pan: p })
  },
  fizzle(t, p) {
    passBy({ t, a: 0.08, d: 0.5, f: 2400, f2: 3000, f3: 400, q: 0.6, gain: 0.2, from: p, to: p > 0 ? 1 : -1 })
    tone({ t: t + 0.55, f: 70, f2: 35, d: 0.5, gain: 0.18, lp: 300 }) // a distant boom
    burst({ t: t + 0.55, noise: 'brown', type: 'lowpass', f: 300, a: 0.01, d: 0.6, gain: 0.2, verb: 0.5 })
  },
}
const MISS = {
  frog: ['retract', 'croak'], chameleon: ['retract'], duck: ['whiff', 'sadBot'], dragon: ['snap', 'splash'], penguin: ['sadBot'],
  owl: ['flapAway'], goat: ['skid', 'grunt'], bat: ['flapAway'], octopus: ['splash'], croc: ['snap', 'splash'], puffer: ['deflate'],
  squid: ['splash'], crab: ['snipAir'], hippo: ['grunt', 'splash'], turtle: ['skid'], mole: ['sadBot', 'dig'], bees: ['buzzOff'],
  spider: ['twang'], snail: ['plop', 'grunt'], gorilla: ['grunt'], pelican: ['snap', 'flapAway'], slimeball: ['plop'], missile: ['fizzle'],
  tailslam: ['splash'],
}
export function miss(id) {
  const key = who(id)
  if (!limit('miss:' + key, 150) || !voice(1, 2)) return
  const t = now()
  const p = rnd(-0.35, 0.35)
  for (const name of MISS[key] ?? ['whiff']) MISSF[name](t, p)
}

// --- Dodging --------------------------------------------------------------------------------
// Clean dodge: a short airy whoosh and a glock note that climbs with the streak.
export function dodge(streak = 0) {
  if (!limit('dodge', 60) || !voice(0.7, 1)) return
  const t = now()
  const dir = Math.random() < 0.5 ? -1 : 1
  passBy({ t, a: 0.06, d: 0.14, f: vary(900, 0.1), f2: vary(2600, 0.1), f3: 900, q: 1, gain: 0.12, from: dir * 0.4, to: -dir * 0.4 })
  modal({ t: t + 0.03, f: C6 * semi(scaleStep(streak)), modes: GLOCK, gain: 0.08, strike: 0.1, pan: rnd(-0.2, 0.2), verb: 0.25 })
}

// Close call: a louder rush right past the ear, a sparkle and a coin clink.
export function nearMiss(streak = 0) {
  if (!limit('nearMiss', 90) || !voice(1, 2)) return
  const t = now()
  const dir = Math.random() < 0.5 ? -1 : 1
  passBy({ t, a: 0.09, d: 0.3, f: 500, f2: vary(3600, 0.08), f3: 380, q: 0.8, gain: 0.3, from: dir * 0.9, to: -dir * 0.9, verb: 0.15 })
  burst({ t: t + 0.08, noise: 'brown', type: 'lowpass', f: 300, a: 0.03, d: 0.2, gain: 0.2 })
  for (let i = 0; i < Math.round(4 * lite); i++) modal({ t: t + 0.08 + rnd(0, 0.15), f: rnd(3500, 6500), modes: GLASS, gain: 0.025, decay: 0.5, pan: rnd(-0.6, 0.6), verb: 0.3 })
  modal({ t: t + 0.1, f: vary(2900, 0.03), modes: COIN, gain: 0.08, beat: 7, strike: 0.3, decay: 0.8, verb: 0.1 })
  modal({ t: t + 0.1, f: C6 * semi(scaleStep(streak) + 12), modes: GLOCK, gain: 0.06, strike: 0.1, verb: 0.3 })
  buzz(18)
}

// Streak milestone (5, 10, 15...): a bright fanfare, bigger for bigger streaks.
export function combo(n = 5) {
  if (!limit('combo', 300) || !voice(1.8, 4)) return
  const t = now()
  const tier = Math.max(1, Math.min(6, Math.floor(n / 5)))
  const notes = [0, 4, 7, 12, 16, 19, 24].slice(0, 3 + Math.min(4, tier))
  glock(t, notes, Math.max(0.045, 0.075 - tier * 0.005), 0.11, 0.35)
  const top = t + notes.length * 0.06
  if (tier >= 2) {
    // a brassy major chord under the top note
    for (const s of [0, 4, 7]) tone({ t: top, type: 'sawtooth', f: C5 * semi(s), a: 0.02, hold: 0.15 + tier * 0.03, d: 0.4, gain: 0.03 + tier * 0.004, lp: 1800 + tier * 300, detune: rnd(-6, 6) })
  }
  if (tier >= 3) burst({ t: top, type: 'highpass', f: 5000, q: 0.4, a: 0.003, d: 0.6 + tier * 0.1, gain: 0.07 + tier * 0.01, verb: 0.3 }) // cymbal
  if (tier >= 4) glock(top + 0.05, [24, 28, 31, 36], 0.04, 0.06, 0.4)
  burst({ t, noise: 'pink', f: 400, f2: 3200, q: 0.8, a: 0.15, d: 0.25, gain: 0.08 + tier * 0.015 })
  buzz([25, 30, 25])
}

// --- Shield, dash ---------------------------------------------------------------------------
// The bubble takes the hit: a glassy POP, the hit muffled under it, a protective chime.
export function shieldBlock() {
  if (!limit('shieldBlock', 120) || !voice(1.2, 5)) return
  const t = now()
  burst({ t, type: 'highpass', f: 3000, q: 0.6, a: 0.0005, d: 0.03, gain: 0.35 })
  bubble({ t, f: vary(900, 0.06), d: 0.05, gain: 0.3, rise: 2.5 })
  modal({ t, f: vary(1800, 0.04), modes: GLASS, gain: 0.16, strike: 0.2, decay: 1.2, verb: 0.3 })
  tone({ t, f: 120, f2: 60, d: 0.18, gain: 0.25, lp: 400 }) // the absorbed impact, muffled
  crinkle({ t: t + 0.01, n: Math.round(12 * lite), dur: 0.25, gain: 0.04, f0: 3000, f1: 8000, width: 0.8 })
  glock(t + 0.06, [12, 19, 24], 0.06, 0.09, 0.4)
  buzz(30)
}

// Shield bubble forming at launch: a soft shimmering swell.
export function shieldUp() {
  if (!limit('shieldUp', 400) || !voice(1.4, 3)) return
  const t = now()
  burst({ t, noise: 'pink', f: 400, f2: 2400, q: 1, a: 0.55, d: 0.4, gain: 0.12, verb: 0.3 })
  call({ t, type: 'sine', f: C5, f2: C5 * 1.003, a: 0.5, hold: 0.15, d: 0.6, am: 7, amDepth: 0.5, gain: 0.05, verb: 0.4 })
  call({ t, type: 'sine', f: C5 * 1.5, a: 0.5, hold: 0.15, d: 0.6, am: 9, amDepth: 0.5, gain: 0.035, verb: 0.4 })
  for (let i = 0; i < Math.round(8 * lite); i++) modal({ t: t + rnd(0.1, 0.7), f: rnd(2800, 6000), modes: GLASS, gain: 0.02, decay: 0.6, pan: rnd(-0.6, 0.6), verb: 0.3 })
  glock(t + 0.45, [7, 12], 0.08, 0.06, 0.4)
}

// Air dash: a sharp jet whoosh.
export function dash() {
  if (!limit('dash', 100) || !voice(0.6, 3)) return
  const t = now()
  burst({ t, type: 'highpass', f: 2600, q: 0.6, a: 0.0006, d: 0.025, gain: 0.25 })
  burst({ t, f: vary(4200, 0.08), f2: 800, q: 0.9, a: 0.005, d: 0.28, gain: 0.3 })
  burst({ t, noise: 'pink', f: 700, f2: 300, q: 0.8, a: 0.01, d: 0.2, gain: 0.2 })
  tone({ t, type: 'sawtooth', f: vary(1300, 0.06), f2: 420, glide: 0.25, d: 0.25, gain: 0.035, lp: 3200 })
  tone({ t, f: 150, f2: 70, d: 0.15, gain: 0.2 })
  buzz(20)
}

// --- Traps ----------------------------------------------------------------------------------
export function trapped(id) {
  if (!limit('trapped', 300) || !voice(1.2, 4)) return
  const t = now()
  if (id === 'puffer') {
    // engulfed in a bubble: a big low bubble closing, the world going wobbly and muffled
    bubble({ t, f: 200, d: 0.3, gain: 0.35, rise: 0.8 })
    call({ t, type: 'sine', f: 300, f2: 260, a: 0.05, hold: 0.3, d: 0.4, vib: 6, vibDepth: 150, gain: 0.12, verb: 0.3 })
    burst({ t, noise: 'pink', type: 'lowpass', f: 600, f2: 250, q: 1.2, a: 0.01, d: 0.3, gain: 0.3 })
    modal({ t: t + 0.05, f: 900, modes: GLASS, gain: 0.06, decay: 1.4, verb: 0.3 })
  } else {
    // wrapped in silk: zips around the body, a sticky stretch and creak
    for (let i = 0; i < 4; i++) burst({ t: t + i * 0.09, f: 1200, f2: 5500, sweep: 0.06, q: 3, a: 0.002, d: 0.08, gain: 0.14, pan: i % 2 ? 0.4 : -0.4 })
    crinkle({ t: t + 0.1, n: Math.round(16 * lite), dur: 0.45, gain: 0.05, f0: 900, f1: 3000, width: 0.5 })
    tone({ t: t + 0.36, type: 'triangle', f: 300, f2: 180, glide: 0.3, d: 0.35, gain: 0.08, lp: 1500 })
    burst({ t: t + 0.36, noise: 'pink', type: 'lowpass', f: 900, q: 1, a: 0.003, d: 0.1, gain: 0.25 })
  }
  buzz([30, 20, 30])
}

// One tap while trapped (i of need): a rubbery strain whose pitch climbs toward escape.
export function mashTap(i = 0, need = 10) {
  if (!limit('mashTap', 35) || !voice(0.3, 1)) return
  const t = now()
  const p = clamp01(i / Math.max(1, need))
  const f = vary(170 * Math.pow(2, p * 1.6), 0.04)
  call({ t, type: 'triangle', f, f2: f * 1.1, a: 0.005, hold: 0.04, d: 0.09, vib: 9 + p * 12, vibDepth: 60, lp: 1800 + 2400 * p, gain: 0.1 + 0.05 * p, pan: rnd(-0.3, 0.3) })
  burst({ t, f: rnd(700, 1400) * (1 + p), q: rnd(4, 8), a: 0.001, d: 0.03, gain: 0.06 + 0.06 * p, pan: rnd(-0.3, 0.3) }) // creak
  if (i > 0 && i % 2 === 0) modal({ t: t + 0.01, f: C5 * semi(PENTA[Math.round(p * (PENTA.length - 1))] + 12), modes: GLOCK, gain: 0.035, verb: 0.2 })
  buzz(8)
}

// Broke free: a pop and a tear, then a triumphant blip.
export function escape() {
  if (!limit('escape', 300) || !voice(1, 4)) return
  const t = now()
  burst({ t, type: 'highpass', f: 2800, q: 0.6, a: 0.0005, d: 0.04, gain: 0.35 })
  bubble({ t, f: 600, d: 0.06, gain: 0.3, rise: 2 })
  burst({ t, f: 3500, f2: 700, q: 1.4, a: 0.002, d: 0.14, gain: 0.2 }) // tear
  crinkle({ t, n: Math.round(14 * lite), dur: 0.15, gain: 0.06, f0: 1500, f1: 6000, width: 0.7 })
  tone({ t: t + 0.08, type: 'square', f: C5 * 2, f2: C5 * 4, glide: 0.08, d: 0.12, gain: 0.04, lp: 4000 })
  glock(t + 0.1, [0, 7, 12, 19], 0.05, 0.1)
  buzz([30, 20, 50])
}

// Frozen solid by the penguin: ice crackling over the body, a crystalline shimmer, sealed shut.
export function freeze() {
  if (!limit('freeze', 300) || !voice(1.4, 4)) return
  const t = now()
  const n = Math.round(22 * lite)
  for (let i = 0; i < n; i++) {
    const at = t + Math.pow(i / n, 1.4) * 0.6
    burst({ t: at, type: 'highpass', f: rnd(2500, 6000), q: 0.7, a: 0.0005, d: rnd(0.004, 0.015), gain: rnd(0.06, 0.14), pan: rnd(-0.6, 0.6) })
  }
  burst({ t, type: 'highpass', f: 4000, q: 0.5, a: 0.3, d: 0.5, gain: 0.08, verb: 0.3 }) // cold breath
  for (let i = 0; i < Math.round(8 * lite); i++) modal({ t: t + rnd(0.1, 0.7), f: rnd(2600, 6200), modes: ICE, gain: 0.035, decay: 1.5, pan: rnd(-0.5, 0.5), verb: 0.35 })
  modal({ t: t + 0.62, f: 420, modes: ICE, gain: 0.12, strike: 0.2, decay: 1.2, verb: 0.3 })
  tone({ t: t + 0.62, f: 110, f2: 70, d: 0.15, gain: 0.2 })
  buzz([20, 20, 20, 20, 40])
}

// Thawed: the ice shatters into falling shards.
export function thaw() {
  if (!limit('thaw', 300) || !voice(1.2, 4)) return
  const t = now()
  burst({ t, type: 'highpass', f: 2200, q: 0.5, a: 0.0005, d: 0.05, gain: 0.4 })
  tone({ t, f: 140, f2: 60, d: 0.15, gain: 0.25 })
  const n = Math.round(18 * lite)
  for (let i = 0; i < n; i++) {
    const at = t + Math.pow(Math.random(), 1.5) * 0.55
    modal({ t: at, f: rnd(1800, 7000), modes: ICE, gain: rnd(0.03, 0.07) * (1 - (at - t)), strike: 0.2, decay: rnd(0.3, 0.8), pan: rnd(-0.7, 0.7), verb: 0.15 })
  }
  crinkle({ t, n: Math.round(20 * lite), dur: 0.4, gain: 0.06, f0: 2500, f1: 8000, width: 0.8 })
  buzz([40, 20, 30])
}

// Ink over the screen: a wet splort, then everything muffled and dripping.
export function inked() {
  if (!limit('inked', 250) || !voice(1.2, 4)) return
  const t = now()
  burst({ t, noise: 'pink', type: 'lowpass', f: 700, f2: 170, q: 1.4, a: 0.003, d: 0.3, gain: 0.55 })
  call({ t, f: 90, f2: 58, a: 0.003, hold: 0.1, d: 0.18, am: 34, amDepth: 1, lp: 600, gain: 0.25 })
  tone({ t, f: 110, f2: 45, d: 0.2, gain: 0.35 })
  bubbles({ t: t + 0.02, n: Math.round(10 * lite), dur: 0.3, f0: 180, f1: 700, gain: 0.1 })
  for (let i = 0; i < 3; i++) bubble({ t: t + 0.35 + i * rnd(0.15, 0.25), f: rnd(500, 900), d: 0.05, gain: 0.06, rise: 1.2, pan: rnd(-0.4, 0.4), verb: 0.2 }) // drips
  buzz([50, 20, 30])
}

// --- Continuous beds ------------------------------------------------------------------------
// Bee swarm: a few detuned sawtooth "bees" each wavering on its own, spread across
// the stereo field through a wing-band filter, a wing hiss on top and a slow surge.
const swarm = { ok: false, gain: null, band: null, oscs: [], base: [], level: -1 }
onStart((ctx) => {
  const gain = ctx.createGain()
  gain.gain.value = 0
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 600
  band.Q.value = 0.9
  const n = COARSE_POINTER ? 2 : 4
  const oscs = []
  const base = []
  for (let i = 0; i < n; i++) {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    const f = 185 + i * 23 + Math.random() * 10
    o.frequency.value = f
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 3 + i * 1.7 + Math.random()
    const depth = ctx.createGain()
    depth.gain.value = 35 + i * 10
    lfo.connect(depth).connect(o.detune)
    const og = ctx.createGain()
    og.gain.value = 1 / n
    const pan = ctx.createStereoPanner()
    pan.pan.value = n > 1 ? (i / (n - 1) - 0.5) * 1.2 : 0
    o.connect(og).connect(pan).connect(band)
    o.start()
    lfo.start()
    oscs.push(o)
    base.push(f)
  }
  const src = ctx.createBufferSource()
  src.buffer = A.noise.pinkStereo ?? A.noise.pink
  src.loop = true
  const hiss = ctx.createBiquadFilter()
  hiss.type = 'bandpass'
  hiss.frequency.value = 3000
  hiss.Q.value = 1
  const hissGain = ctx.createGain()
  hissGain.gain.value = 0.12
  src.connect(hiss).connect(hissGain).connect(gain)
  band.connect(gain)
  const surge = ctx.createGain()
  surge.gain.value = 1
  const slfo = ctx.createOscillator()
  slfo.frequency.value = 0.9
  const sdepth = ctx.createGain()
  sdepth.gain.value = 0.2
  slfo.connect(sdepth).connect(surge.gain)
  gain.connect(surge).connect(A.sfx)
  src.start()
  slfo.start()
  Object.assign(swarm, { ok: true, gain, band, oscs, base })
})
// k 0..1 = how close / thick the swarm is (0 = silent); called every frame.
export function setBuzz(k) {
  if (!swarm.ok || !ready()) return
  const c = clamp01(k)
  if (Math.abs(c - swarm.level) < 0.003) return
  swarm.level = c
  const t = A.ctx.currentTime
  swarm.gain.gain.setTargetAtTime(c * 0.18, t, 0.1)
  swarm.band.frequency.setTargetAtTime(480 + 1400 * c, t, 0.15)
  swarm.oscs.forEach((o, i) => o.frequency.setTargetAtTime(swarm.base[i] * (1 + 0.22 * c), t, 0.2))
}

// Magnet hum: mains-like 55 Hz with harmonics, pulsing, opening up and speeding up
// as it gets stronger, with the odd electric spark.
const hum = { ok: false, gain: null, lp: null, lfo: null, oscs: [], level: -1 }
onStart((ctx) => {
  const gain = ctx.createGain()
  gain.gain.value = 0
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 300
  lp.Q.value = 2
  const pulse = ctx.createGain()
  pulse.gain.value = 0.7
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 3
  const depth = ctx.createGain()
  depth.gain.value = 0.3
  lfo.connect(depth).connect(pulse.gain)
  const oscs = []
  for (const [type, mul, g] of [['sawtooth', 1, 0.6], ['sine', 2, 0.5], ['square', 3, 0.12]]) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = 55 * mul
    const og = ctx.createGain()
    og.gain.value = g
    o.connect(og).connect(lp)
    o.start()
    oscs.push([o, mul])
  }
  lp.connect(pulse).connect(gain).connect(A.sfx)
  lfo.start()
  Object.assign(hum, { ok: true, gain, lp, lfo, oscs })
})
// k 0..1 = magnet strength (0 = silent); called every frame.
export function setHum(k) {
  if (!hum.ok || !ready()) return
  const c = clamp01(k)
  if (Math.abs(c - hum.level) >= 0.003) {
    hum.level = c
    const t = A.ctx.currentTime
    hum.gain.gain.setTargetAtTime(c * 0.22, t, 0.1)
    hum.lp.frequency.setTargetAtTime(280 + 1400 * c, t, 0.12)
    hum.lfo.frequency.setTargetAtTime(3 + 9 * c, t, 0.2)
    for (const [o, mul] of hum.oscs) o.frequency.setTargetAtTime(55 * mul * (1 + 0.3 * c), t, 0.2)
  }
  if (c > 0.35 && Math.random() < c * 0.04 && limit('humSpark', 90) && voice(0.1, 0.5)) {
    burst({ t: now(), type: 'highpass', f: rnd(3000, 7000), q: 0.7, a: 0.0004, d: rnd(0.003, 0.012), gain: 0.05 + 0.07 * c, pan: rnd(-0.5, 0.5) })
  }
}

// --- Helper boosts (all rewarding, rising) ----------------------------------------------------
const BOOST = {
  mushroom(t) {
    tone({ t, f: 90, f2: 45, d: 0.15, gain: 0.4 }) // the bounce
    burst({ t, noise: 'brown', type: 'lowpass', f: 600, q: 0.7, a: 0.003, d: 0.1, gain: 0.3 })
    call({ t, type: 'triangle', f: 110, f2: 540, glide: 0.3, a: 0.005, hold: 0.1, d: 0.5, vib: 14, vibDepth: 120, lp: 2600, gain: 0.32 })
    tone({ t, f: 55, f2: 270, glide: 0.3, a: 0.005, hold: 0.1, d: 0.4, gain: 0.2 })
    glock(t + 0.18, [0, 4, 7, 12], 0.06, 0.08)
    buzz([40, 30, 40])
  },
  seagull(t) {
    for (let i = 0; i < 3; i++) call({ t: t + i * 0.13, f: vary(1300 + i * 120, 0.04), f2: 950 + i * 100, a: 0.01, hold: 0.07, d: 0.08, formants: [[2000, 3, 2.2], [3300, 5, 1]], drive: 1.5, gain: 0.18, pan: 0.3 })
    passBy({ t: t + 0.2, a: 0.25, d: 0.25, f: 400, f2: 2800, f3: 2000, gain: 0.22, from: 0.5, to: -0.3 })
    flap(t + 0.25, 0.2, 0.15)
    glock(t + 0.35, [7, 12, 16, 19], 0.06, 0.08)
    buzz(30)
  },
  fan(t) {
    const n = Math.round(10 * lite)
    let at = t
    for (let i = 0; i < n; i++) {
      // blade passes speeding up and rising
      burst({ t: at, noise: 'pink', f: 500 + i * 120, q: 1.2, a: 0.015, d: 0.06, gain: 0.08 + i * 0.012, pan: rnd(-0.2, 0.2) })
      at += 0.075 - i * 0.004
    }
    passBy({ t: t + 0.25, a: 0.3, d: 0.4, f: 300, f2: 3200, f3: 2200, q: 0.6, gain: 0.3, from: 0, to: 0, verb: 0.2 })
    call({ t, type: 'triangle', f: 90, f2: 240, a: 0.3, hold: 0.2, d: 0.3, am: 10, am2: 40, amDepth: 0.8, lp: 1200, gain: 0.1 })
    glock(t + 0.5, [0, 7, 12, 19], 0.05, 0.07)
    buzz(40)
  },
  geyser(t) {
    burst({ t, noise: 'brown', type: 'lowpass', f: 300, a: 0.08, d: 0.6, gain: 0.35 })
    burst({ t, f: 1300, f2: 3800, q: 0.7, a: 0.15, hold: 0.35, d: 0.5, gain: 0.28, verb: 0.3 })
    bubbles({ t, n: Math.round(26 * lite), dur: 0.8, f0: 300, f1: 2400, gain: 0.08, verb: 0.15 })
    for (let i = 0; i < Math.round(8 * lite); i++) modal({ t: t + rnd(0.3, 0.9), f: rnd(3000, 6500), modes: GLASS, gain: 0.025, decay: 0.6, pan: rnd(-0.6, 0.6), verb: 0.3 })
    glock(t + 0.4, [0, 4, 7, 12, 16], 0.06, 0.08)
    buzz([30, 30, 50])
  },
}
export function boost(id) {
  if (!limit('boost:' + id, 200) || !voice(1.4, 4)) return
  const t = now()
  const fn = BOOST[id]
  if (fn) fn(t)
  else glock(t, [0, 4, 7, 12], 0.06, 0.1)
}

// --- Bosses ---------------------------------------------------------------------------------
const INTRO = {
  kingDragon(t) {
    // the roar: two detuned throats through moving vowels, clipped hard, room tail
    for (const f of [88, 92]) call({ t, f: vary(f, 0.03), f2: f * 1.55, f3: f * 0.8, a: 0.15, hold: 0.9, d: 0.6, am: 30, amDepth: 0.65, formants: [[400, 1.5, 3, 700], [1100, 3, 1.6, 850], [2500, 4, 0.6]], drive: 3, gain: 0.32, pan: f > 90 ? 0.2 : -0.2, verb: 0.5 })
    burst({ t, noise: 'pink', f: 800, f2: 600, q: 0.8, a: 0.15, hold: 0.8, d: 0.6, gain: 0.2, verb: 0.4 })
    tone({ t, f: 45, f2: 32, a: 0.2, hold: 0.8, d: 0.6, gain: 0.4 })
    // the slime erupting
    burst({ t: t + 0.05, noise: 'brown', type: 'lowpass', f: 900, f2: 200, q: 0.6, a: 0.01, d: 1.4, gain: 0.55, verb: 0.4 })
    bubbles({ t: t + 0.05, n: Math.round(30 * lite), dur: 1.4, f0: 120, f1: 900, gain: 0.14, d: [0.03, 0.1], rise: 0.9, verb: 0.15 })
    burst({ t: t + 0.08, type: 'highpass', f: 2500, q: 0.4, a: 0.05, d: 0.8, gain: 0.12, verb: 0.3 })
    buzz([120, 40, 160])
  },
  mechaDuck(t) {
    // boot-up: relay clicks, a rising beep sequence, a servo whine
    for (let i = 0; i < 4; i++) {
      modal({ t: t + i * 0.12, f: vary(3200, 0.05), modes: WOOD, gain: 0.08, strike: 0.3 })
      tone({ t: t + 0.04 + i * 0.12, type: 'square', f: C5 * semi([0, 4, 7, 12][i]), d: 0.08, gain: 0.04, lp: 3000 })
    }
    call({ t: t + 0.4, f: 300, f2: 1300, glide: 0.4, a: 0.1, hold: 0.25, d: 0.15, am: 30, amDepth: 0.4, lp: 3000, gain: 0.06 })
    // jet roar
    const j = t + 0.85
    burst({ t: j, type: 'highpass', f: 2200, q: 0.5, a: 0.0006, d: 0.04, gain: 0.35 })
    burst({ t: j, noise: 'pink', f: 600, f2: 3600, q: 0.6, a: 0.25, hold: 0.4, d: 0.6, gain: 0.32, verb: 0.3 })
    burst({ t: j, noise: 'brown', type: 'lowpass', f: 350, a: 0.1, hold: 0.4, d: 0.7, gain: 0.5 })
    tone({ t: j, type: 'sawtooth', f: 500, f2: 1900, glide: 0.6, a: 0.2, hold: 0.4, d: 0.4, gain: 0.04, lp: 4000 })
    // QUACK through the robot voice box
    quack(t + 1.55, 0, 0.8, 95, 0.32)
    quack(t + 1.78, 0, 0.84, 95, 0.28)
    buzz([60, 40, 100])
  },
  skyWhale(t) {
    call({ t, type: 'triangle', f: 110, f2: 240, f3: 150, a: 0.5, hold: 0.7, d: 0.8, vib: 4, vibDepth: 30, lp: 900, gain: 0.3, verb: 0.8 })
    call({ t: t + 1.0, type: 'triangle', f: 210, f2: 120, f3: 95, a: 0.4, hold: 0.5, d: 0.9, vib: 3, vibDepth: 40, lp: 800, gain: 0.26, verb: 0.8 })
    call({ t: t + 0.1, type: 'sine', f: 330, f2: 720, f3: 450, a: 0.5, hold: 0.6, d: 0.7, vib: 5, vibDepth: 25, gain: 0.05, verb: 0.9 })
    burst({ t, noise: 'brown', type: 'lowpass', f: 140, a: 0.8, hold: 0.5, d: 1.0, gain: 0.3 })
    for (let i = 0; i < Math.round(14 * lite); i++) modal({ t: t + rnd(0.2, 2), f: rnd(2400, 6400), modes: GLASS, gain: 0.025, decay: 0.8, pan: rnd(-0.7, 0.7), verb: 0.5 })
    buzz([80, 60, 80])
  },
}
export function bossIntro(id) {
  if (!limit('bossIntro', 1500) || !voice(2.6, 6)) return
  const t = now()
  const fn = INTRO[id]
  if (fn) fn(t)
  else {
    danger(8)
  }
}

const WINDUP = {
  kingDragon(t) {
    burst({ t, noise: 'pink', f: 300, f2: 1600, q: 1.2, a: 0.45, d: 0.08, gain: 0.2 }) // the big inhale
    call({ t: t + 0.1, f: 55, f2: 80, a: 0.35, d: 0.1, am: 24, amDepth: 0.9, formants: [[260, 2, 3]], drive: 2.5, gain: 0.25 })
  },
  mechaDuck(t) {
    for (let i = 0; i < 3; i++) tone({ t: t + Math.pow(i / 3, 0.8) * 0.4, type: 'square', f: 880 * semi(i * 4), d: 0.07, gain: 0.05, lp: 3500 })
    tone({ t, type: 'sawtooth', f: 200, f2: 1200, glide: 0.5, a: 0.4, d: 0.08, gain: 0.04, lp: 2500 })
  },
  skyWhale(t) {
    call({ t, type: 'triangle', f: 90, f2: 180, a: 0.35, hold: 0.1, d: 0.15, vib: 5, vibDepth: 30, lp: 700, gain: 0.25, verb: 0.6 })
    burst({ t, noise: 'pink', f: 300, f2: 1400, q: 1, a: 0.45, d: 0.1, gain: 0.12 })
  },
}
export function bossWindup(id) {
  if (!limit('bossWindup', 300) || !voice(0.8, 4)) return
  const t = now()
  const fn = WINDUP[id]
  if (fn) fn(t)
  else alertRise(t, 0)
}

// Survived the boss: a trophy struck like a bell, coins, a fanfare run and a brass chord.
export function bossEscaped() {
  if (!limit('bossEscaped', 1500) || !voice(2.6, 6)) return
  const t = now()
  modal({ t, f: 1320, modes: TROPHY, gain: 0.18, beat: 7, strike: 0.3, verb: 0.25 })
  glock(t + 0.05, [0, 4, 7, 12, 16, 19, 24], 0.06, 0.12, 0.4)
  const top = t + 0.5
  for (const s of [0, 4, 7, 12]) tone({ t: top, type: 'sawtooth', f: C5 * semi(s), a: 0.03, hold: 0.45, d: 0.7, gain: 0.035, lp: 2600, detune: rnd(-7, 7), verb: 0.2 })
  burst({ t: top, type: 'highpass', f: 5000, q: 0.4, a: 0.003, d: 1.1, gain: 0.1, verb: 0.3 })
  tone({ t: top, f: 65, f2: 40, d: 0.5, gain: 0.35 })
  const coins = Math.round(12 * lite)
  for (let i = 0; i < coins; i++) {
    const at = t + 0.1 + Math.pow(i / coins, 1.3) * 0.8 + rnd(0, 0.02)
    modal({ t: at, f: rnd(2500, 4400), modes: COIN, gain: 0.06 * (1 - (i / coins) * 0.6), beat: 7, strike: 0.25, decay: rnd(0.5, 1), pan: rnd(-0.5, 0.5), verb: 0.08 })
  }
  glock(top + 0.1, [24, 28, 31, 36], 0.05, 0.07, 0.45)
  buzz([40, 40, 60, 40, 90])
}

// Entering a tougher region (level 1..8): a taiko hit (two or three for higher
// levels) and a tension swell rising under it, darker and louder with level.
export function danger(level = 1) {
  if (!limit('danger', 800) || !voice(2, 5)) return
  const t = now()
  const lv = Math.max(1, Math.min(8, Math.round(Number(level) || 1)))
  const k = lv / 8
  const hits = lv >= 6 ? 3 : lv >= 3 ? 2 : 1
  for (let i = 0; i < hits; i++) {
    const at = t + i * 0.24
    const last = i === hits - 1
    const g = last ? 1 : 0.65
    tone({ t: at, f: vary(74, 0.04), f2: 42, d: last ? 0.8 : 0.4, gain: 0.55 * g })
    burst({ t: at, noise: 'brown', type: 'lowpass', f: 420, f2: 150, q: 0.7, a: 0.003, d: last ? 0.6 : 0.3, gain: 0.4 * g, verb: 0.45 })
    burst({ t: at, noise: 'pink', f: 900, q: 0.9, a: 0.001, d: 0.05, gain: 0.25 * g, verb: 0.3 }) // the drum skin
  }
  const s = t + (hits - 1) * 0.24
  const root = 55 * semi(lv)
  for (const r of [1, 1.06, 1.5]) tone({ t: s, type: 'sawtooth', f: root * r, f2: root * r * (1.4 + 0.2 * k), glide: 1.2, a: 1.0, d: 0.3, gain: 0.025 + 0.025 * k, lp: 500 + 250 * lv, detune: rnd(-8, 8) })
  burst({ t: s, noise: 'pink', f: 300, f2: 1600 + 1600 * k, q: 1, a: 1.05, d: 0.2, gain: 0.08 + 0.12 * k, verb: 0.2 })
  buzz(lv >= 6 ? [80, 40, 80, 40, 120] : [70, 40, 90])
}

// Beginner bonus: a small cheerful jingle.
export function beginnerBonus() {
  if (!limit('beginnerBonus', 1000) || !voice(1.2, 3)) return
  const t = now()
  glock(t, [0, 4, 7, 12], 0.07, 0.1)
  glock(t + 0.32, [16, 12, 19], 0.08, 0.08)
  modal({ t: t + 0.3, f: vary(3000, 0.03), modes: COIN, gain: 0.06, beat: 7, strike: 0.25, decay: 0.8 })
  bubble({ t, f: 420, d: 0.08, gain: 0.12, rise: 1.2, bus: A.ui })
}

// A random animal telegraph, handy for a sound test page.
export const randomWarn = () => warn(pick(ANIMAL_IDS))
