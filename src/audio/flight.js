// Sounds of the fly sequence (flight.js), all synthesised on the shared audio
// core (core.js / synth.js). Everything returns quietly before the first gesture
// or when the voice budget is spent.
//  - the FLY button appearing, hopping into the giant slingshot
//  - the rubber straps creaking as they are drawn back, the snap + boom + band wobble
//  - a wind bed while airborne (pitch and level follow the speed), somersault swishes
//  - region gates, distance milestones, a new personal best
//  - stone-skip bloops on the slime that climb a pentatonic scale skip by skip
//  - the slushy slide, the big gloopy sink, the trophy reward and the trip back
import { COARSE_POINTER } from '../config.js'
import { A, now, onStart, ready, voice } from './core.js'
import { bubble, bubbles, burst, crinkle, env, modal, rnd, route, tone, vary } from './synth.js'

const GLOCK = [[1, 1, 1.4], [2.756, 0.32, 0.45], [5.404, 0.1, 0.18], [8.933, 0.04, 0.08]]
const COIN = [[1, 1, 0.5], [1.504, 0.6, 0.36], [2.24, 0.45, 0.26], [2.71, 0.3, 0.18], [3.47, 0.22, 0.12], [4.03, 0.12, 0.08]]
const TROPHY = [[1, 1, 0.7], [2.05, 0.5, 0.5], [3.1, 0.34, 0.32], [4.33, 0.2, 0.2], [5.6, 0.1, 0.12]]
const GLASS = [[1, 1, 0.45], [2.32, 0.5, 0.28], [4.25, 0.28, 0.16], [6.63, 0.14, 0.1]]
const WOOD = [[1, 1, 0.07], [2.57, 0.45, 0.035], [4.2, 0.22, 0.016], [6.1, 0.08, 0.01]]
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]
const semi = (n) => Math.pow(2, n / 12)
const C5 = 523.25
const C6 = 1046.5
const lite = COARSE_POINTER ? 0.6 : 1

const lastAt = new Map()
function limit(name, ms) {
  const t = performance.now()
  if (t - (lastAt.get(name) ?? -1e9) < ms) return false
  lastAt.set(name, t)
  return true
}
function buzz(pattern) {
  if (!COARSE_POINTER) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // not allowed in this frame
  }
}
function glock(t, notes, gap, gain = 0.12, verb = 0.3) {
  notes.forEach((n, i) => modal({ t: t + i * gap, f: C6 * semi(n), modes: GLOCK, gain: gain * rnd(0.85, 1), strike: 0.1, pan: (i / Math.max(1, notes.length - 1) - 0.5) * 0.5, verb }))
}

// --- Launch ----------------------------------------------------------------------------------
// The FLY button pops up: a soft rising bubble and two sparkles.
export function flyReady() {
  if (!limit('flyReady', 600) || !voice(0.6, 2)) return
  const t = now()
  bubble({ t, f: 380, d: 0.09, gain: 0.2, rise: 1.4, bus: A.ui })
  glock(t + 0.06, [12, 19], 0.07, 0.06)
}

// FLY pressed: the slingshot is summoned. A magic swell rising, a shimmer of
// glass sparkles and a run up the glockenspiel as it spins out of the ground.
export function summon() {
  if (!voice(1.2, 3)) return
  const t = now()
  burst({ t, noise: 'pink', f: 300, f2: 3200, q: 1.1, a: 0.55, d: 0.12, gain: 0.2 })
  tone({ t, type: 'triangle', f: 196, f2: 392, glide: 0.6, a: 0.4, d: 0.25, gain: 0.06, lp: 2000 })
  for (let i = 0; i < Math.round(10 * lite); i++) modal({ t: t + rnd(0, 0.55), f: rnd(2600, 5600), modes: GLASS, gain: 0.025, decay: 0.5, pan: rnd(-0.6, 0.6) })
  glock(t + 0.12, [0, 4, 7, 12, 16], 0.09, 0.09, 0.35)
}

// The summoned launcher lands: a heavy wooden thunk (a metal clank for the cannon).
export function plant(cannon = false) {
  if (!voice(0.8, 3)) return
  const t = now()
  tone({ t, f: 95, f2: 45, d: 0.25, gain: 0.45 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 600, q: 0.6, a: 0.003, d: 0.22, gain: 0.4, verb: 0.15 })
  if (cannon) modal({ t, f: 420, modes: COIN, gain: 0.12, beat: 5, strike: 0.3, decay: 1.2 })
  else modal({ t, f: vary(140, 0.05), modes: WOOD, gain: 0.35, strike: 0.15, decay: 2 })
  crinkle({ t: t + 0.02, n: 10, dur: 0.25, gain: 0.03, f0: 2500, f1: 7000 })
  buzz(35)
}

// Cannon charging for `dur` s: a hum winding up with ratchet clicks.
export function charge(dur = 1) {
  if (!voice(dur + 0.3, 3)) return
  const t = now()
  tone({ t, type: 'sawtooth', f: 60, f2: 240, glide: dur, a: dur * 0.5, hold: dur * 0.45, d: 0.1, gain: 0.06, lp: 900 })
  tone({ t, f: 120, f2: 520, glide: dur, a: dur * 0.6, hold: dur * 0.35, d: 0.1, gain: 0.04 })
  const n = Math.round(9 * lite)
  for (let i = 0; i < n; i++) modal({ t: t + Math.pow(i / n, 0.85) * dur, f: 900 + i * 90, modes: WOOD, gain: 0.12, strike: 0.2 })
}

// Cannon fires: a deep boom, a crack, smoke rushing out, a bright chord.
export function boom(k = 0.5) {
  if (!voice(2, 5)) return
  const t = now()
  burst({ t, type: 'highpass', f: 1800, q: 0.6, a: 0.0006, d: 0.04, gain: 0.5 })
  tone({ t, f: 58, f2: 26, d: 0.8, gain: 0.7 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 700, f2: 180, q: 0.6, a: 0.003, d: 0.9, gain: 0.55, verb: 0.35 })
  burst({ t: t + 0.02, noise: 'pink', f: 500, f2: 4200 + 2000 * k, q: 0.7, a: 0.05, d: 0.8 + 0.5 * k, gain: 0.28 })
  glock(t + 0.1, [0, 7, 12, 19], 0.05, 0.07)
  buzz([60, 30, 80])
}

// The launcher vanishes: a soft cartoon poof and a sparkle.
export function poof() {
  if (!voice(0.7, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 900, f2: 300, q: 0.7, a: 0.01, d: 0.3, gain: 0.25 })
  bubble({ t, f: 520, d: 0.08, gain: 0.18, rise: -0.5 })
  modal({ t: t + 0.05, f: C6 * semi(19), modes: GLOCK, gain: 0.05, verb: 0.4 })
}

// Jumping into the pouch: a lift of air, then the body landing in thick rubber.
export function hopIn() {
  if (!voice(0.7, 3)) return
  const t = now()
  burst({ t, noise: 'pink', f: 500, f2: 1600, q: 0.8, a: 0.08, d: 0.18, gain: 0.16 })
  const land = t + 0.34
  tone({ t: land, f: 120, f2: 62, d: 0.16, gain: 0.32 })
  burst({ t: land, noise: 'brown', type: 'lowpass', f: 700, q: 0.7, a: 0.003, d: 0.12, gain: 0.3 })
  // rubber squeak as the straps take the weight
  tone({ t: land + 0.02, type: 'triangle', f: 420, f2: 300, glide: 0.12, d: 0.14, gain: 0.05, lp: 1400 })
  modal({ t: land, f: 160, modes: WOOD, gain: 0.2, strike: 0.1 })
}

// The straps drawn back over `dur` s: creak grains getting denser and higher, a
// tension tone rising underneath and the wooden fork groaning once.
export function stretch(dur = 1) {
  if (!voice(dur + 0.3, 3)) return
  const t = now()
  const n = Math.round(26 * lite)
  for (let i = 0; i < n; i++) {
    const k = Math.pow(i / n, 0.8)
    const at = t + k * dur + rnd(0, 0.02)
    burst({ t: at, f: 700 + 1600 * k + rnd(-150, 150), q: rnd(4, 9), a: 0.001, d: rnd(0.012, 0.03), gain: 0.05 + 0.08 * k, pan: rnd(-0.3, 0.3) })
  }
  tone({ t, type: 'sawtooth', f: 70, f2: 190, glide: dur, a: dur * 0.6, hold: dur * 0.35, d: 0.12, gain: 0.05, lp: 700 })
  tone({ t, f: 140, f2: 360, glide: dur, a: dur * 0.7, hold: dur * 0.25, d: 0.1, gain: 0.03 })
  modal({ t: t + dur * 0.45, f: vary(110, 0.05), modes: WOOD, gain: 0.25, decay: 3, strike: 0.05 })
}

// Release: the rubber snaps, a deep thump, air rips past, the straps keep wobbling.
export function fire(k = 0.5) {
  if (!voice(2, 5)) return
  const t = now()
  burst({ t, type: 'highpass', f: 2200, q: 0.6, a: 0.0006, d: 0.03, gain: 0.45 })
  tone({ t, type: 'triangle', f: 220, f2: 70, glide: 0.12, d: 0.18, gain: 0.32, lp: 1600 })
  tone({ t, f: 66, f2: 32, d: 0.5, gain: 0.55 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 520, q: 0.6, a: 0.004, d: 0.4, gain: 0.4, verb: 0.25 })
  burst({ t: t + 0.02, noise: 'pink', f: 400, f2: 3800 + 2400 * k, q: 0.7, a: 0.08, d: 0.7 + 0.5 * k, gain: 0.3 })
  // band wobble: a low "wub" whose tremolo slows as it dies
  const ctx = A.ctx
  const o = ctx.createOscillator()
  o.type = 'triangle'
  o.frequency.setValueAtTime(95, t)
  o.frequency.exponentialRampToValueAtTime(60, t + 0.9)
  const trem = ctx.createGain()
  trem.gain.value = 0
  const lfo = ctx.createOscillator()
  lfo.frequency.setValueAtTime(14, t)
  lfo.frequency.exponentialRampToValueAtTime(5, t + 0.9)
  const depth = ctx.createGain()
  depth.gain.value = 0.5
  lfo.connect(depth).connect(trem.gain)
  const g = ctx.createGain()
  env(g.gain, t + 0.05, 0.01, 0.14, 0.9)
  o.connect(trem).connect(g)
  route(g, {})
  for (const n of [o, lfo]) {
    n.start(t)
    n.stop(t + 1.1)
  }
  glock(t + 0.08, [0, 7, 12], 0.05, 0.07)
  buzz([40, 30, 70])
}

// One somersault: a swish past the ears.
export function flip() {
  if (!limit('flip', 250) || !voice(0.4, 1)) return
  const t = now()
  burst({ t, noise: 'pink', f: 700, f2: 2600, q: 1.1, a: 0.1, d: 0.16, gain: 0.12, pan: rnd(-0.4, 0.4) })
}

// --- Airborne --------------------------------------------------------------------------------
// Wind bed: stereo pink noise through a band that opens with speed, plus a low rumble.
const wind = { ok: false, gain: null, band: null, low: null, lowGain: null, flutter: null, level: 0 }
onStart((ctx) => {
  const src = ctx.createBufferSource()
  src.buffer = A.noise.pinkStereo ?? A.noise.pink
  src.loop = true
  const band = ctx.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 600
  band.Q.value = 0.7
  const gain = ctx.createGain()
  gain.gain.value = 0
  // slow flutter so it breathes instead of hissing flat
  const flutter = ctx.createGain()
  flutter.gain.value = 1
  const lfo = ctx.createOscillator()
  lfo.frequency.value = 0.7
  const lfoDepth = ctx.createGain()
  lfoDepth.gain.value = 0.25
  lfo.connect(lfoDepth).connect(flutter.gain)
  src.connect(band).connect(flutter).connect(gain)
  const lowSrc = ctx.createBufferSource()
  lowSrc.buffer = A.noise.brown
  lowSrc.loop = true
  const low = ctx.createBiquadFilter()
  low.type = 'lowpass'
  low.frequency.value = 160
  const lowGain = ctx.createGain()
  lowGain.gain.value = 0
  lowSrc.connect(low).connect(lowGain)
  gain.connect(A.sfx)
  lowGain.connect(A.sfx)
  src.start()
  lowSrc.start()
  lfo.start()
  Object.assign(wind, { ok: true, gain, band, low, lowGain, flutter })
})
// k 0..1 = how fast (0 = silent); called every frame by flight.js.
export function setWind(k) {
  if (!wind.ok || !ready()) return
  const t = A.ctx.currentTime
  const c = Math.max(0, Math.min(1, k))
  wind.gain.gain.setTargetAtTime(c * 0.32, t, 0.12)
  wind.band.frequency.setTargetAtTime(380 + 2200 * c, t, 0.15)
  wind.lowGain.gain.setTargetAtTime(c * 0.5, t, 0.15)
}

// Through a region gate: whoosh, then a bright three-note chord.
export function gate(index = 1) {
  if (!voice(1.4, 3)) return
  const t = now()
  burst({ t, noise: 'pink', f: 2600, f2: 380, q: 1.1, a: 0.06, d: 0.32, gain: 0.3 })
  tone({ t: t + 0.04, f: 110, f2: 58, d: 0.24, gain: 0.14 })
  const root = PENTA[index % 5]
  glock(t + 0.12, [root, root + 4, root + 7, root + 12], 0.06, 0.12, 0.4)
}

// Every FLIGHT.milestone metres: a soft glass note climbing with the distance.
export function milestone(n = 1) {
  if (!limit('milestone', 120) || !voice(0.8, 1)) return
  const t = now()
  const note = PENTA[Math.min(PENTA.length - 1, n - 1)]
  modal({ t, f: C5 * semi(note), modes: GLOCK, gain: 0.09, strike: 0.08, verb: 0.3 })
}

// Passed the personal best mid-flight.
export function best() {
  if (!limit('best', 2000) || !voice(1.5, 4)) return
  const t = now()
  glock(t, [0, 4, 7, 12, 16, 19, 24], 0.055, 0.12, 0.35)
  burst({ t, noise: 'pink', f: 400, f2: 3000, q: 0.8, a: 0.2, d: 0.3, gain: 0.12 })
  buzz([30, 40, 30])
}

// --- On the slime ----------------------------------------------------------------------------
// One skip (i = 1, 2, 3...; k 0..1 = how hard): a wet slap, a fat bloop whose pitch
// rises as it pops, droplets, and a plink that climbs the scale skip after skip.
export function skip(i = 1, k = 0.6) {
  if (!voice(1, 3)) return
  const t = now()
  const s = Math.max(0.3, Math.min(1, k))
  burst({ t, noise: 'pink', type: 'lowpass', f: 1400, f2: 260, q: 0.8, a: 0.002, d: 0.12 + 0.1 * s, gain: 0.35 * s })
  tone({ t, f: 140, f2: 70, d: 0.1, gain: 0.25 * s })
  bubble({ t: t + 0.01, f: vary(260 + i * 18, 0.06), d: 0.12, gain: 0.32 * s, rise: 1.6 })
  bubbles({ t: t + 0.04, n: Math.round(10 * s * lite), dur: 0.3, f0: 600, f1: 2600, gain: 0.05, verb: 0.1 })
  burst({ t: t + 0.03, type: 'highpass', f: 3200, q: 0.5, a: 0.01, d: 0.25 * s, gain: 0.08 * s })
  const note = PENTA[Math.min(PENTA.length - 1, i - 1)]
  modal({ t: t + 0.05, f: C5 * semi(note + 12), modes: GLOCK, gain: 0.1, strike: 0.12, verb: 0.3, pan: rnd(-0.2, 0.2) })
  buzz(20 + i * 4)
}

// Sliding to a stop on the surface for `dur` s: a slushy hiss that slows, a few bubbles.
export function slide(dur = 1) {
  if (!voice(dur + 0.2, 2)) return
  const t = now()
  burst({ t, noise: 'pink', type: 'bandpass', f: 1500, f2: 300, sweep: dur, q: 0.6, a: 0.02, d: dur, gain: 0.22 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 400, f2: 120, sweep: dur, q: 0.5, a: 0.02, d: dur * 0.8, gain: 0.25 })
  bubbles({ t, n: Math.round(14 * lite), dur, f0: 400, f1: 1800, gain: 0.05 })
}

// Sinking into the slime: a heavy gloop, then big slow bubbles gurgling up.
export function sink() {
  if (!voice(2.2, 3)) return
  const t = now()
  burst({ t, noise: 'brown', type: 'lowpass', f: 600, f2: 160, q: 0.8, a: 0.01, d: 0.45, gain: 0.45 })
  bubble({ t, f: 150, d: 0.22, gain: 0.4, rise: 1.8 })
  bubble({ t: t + 0.12, f: 210, d: 0.16, gain: 0.3, rise: 1.5 })
  for (let i = 0; i < 7; i++) bubble({ t: t + 0.35 + i * rnd(0.12, 0.22), f: rnd(170, 420), d: rnd(0.06, 0.12), gain: rnd(0.12, 0.22) * (1 - i / 9), rise: rnd(0.8, 1.4), pan: rnd(-0.3, 0.3) })
  crinkle({ t: t + 0.05, n: 8, dur: 0.4, gain: 0.03, f0: 2500, f1: 6000 })
}

// The reward card: a trophy struck like a bell, coins pouring in, a little run up.
export function reward(n = 1) {
  if (!voice(2, 4)) return
  const t = now()
  modal({ t, f: 1320, modes: TROPHY, gain: 0.16, beat: 7, strike: 0.3, verb: 0.2 })
  const coins = Math.min(14, 4 + Math.round(Math.log10(n + 1) * 3))
  for (let i = 0; i < coins * lite; i++) {
    const at = t + 0.08 + Math.pow(i / coins, 1.3) * 0.55 + rnd(0, 0.02)
    modal({ t: at, f: rnd(2500, 4400), modes: COIN, gain: 0.07 * (1 - (i / coins) * 0.6), beat: 7, strike: 0.25, decay: rnd(0.5, 1), pan: rnd(-0.4, 0.4), verb: 0.08 })
  }
  glock(t + 0.1, [0, 4, 7, 12], 0.07, 0.11)
  buzz([30, 40, 50])
}

// Counter ticking up on the reward card.
export function count() {
  if (!limit('count', 45) || !voice(0.15, 1)) return
  modal({ t: now(), f: vary(3000, 0.04), modes: COIN, gain: 0.03, decay: 0.3 })
}

// Back to the lobby.
export function whooshBack() {
  if (!voice(0.8, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 300, f2: 2800, q: 0.8, a: 0.15, d: 0.3, gain: 0.25, bus: A.ui })
  modal({ t: t + 0.3, f: C6 * semi(12), modes: GLOCK, gain: 0.05, verb: 0.4, bus: A.ui })
}
