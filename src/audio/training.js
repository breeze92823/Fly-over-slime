// Training sounds (training.js): every Skill click, the combo climbing a scale,
// level ups, standing on a training table, rebirth becoming ready and the
// slingshot pads. All synthesised on the shared core (core.js / synth.js) and
// silent before the first gesture, when the voice budget is spent, or when the
// Sound Effects switch has muted the sfx/ui buses.
//
// The click is built to be heard hundreds of times without wearing out:
//  - a short rubber-band snap (pitch varies every shot)
//  - a soft crystal "ding" that climbs a major-pentatonic scale while the
//    streak goes on, so holding the button plays a rising little tune that
//    resets when you let go
//  - on a multiplier table an extra shimmer on top, brighter for bigger tables
import { COARSE_POINTER } from '../config.js'
import { A, isMuted, now, voice } from './core.js'
import { bubble, burst, crinkle, modal, rnd, tone, vary } from './synth.js'

const GLOCK = [[1, 1, 1.4], [2.756, 0.32, 0.45], [5.404, 0.1, 0.18], [8.933, 0.04, 0.08]]
const GLASS = [[1, 1, 0.45], [2.32, 0.5, 0.28], [4.25, 0.28, 0.16], [6.63, 0.14, 0.1]]
const COIN = [[1, 1, 0.5], [1.504, 0.6, 0.36], [2.24, 0.45, 0.26], [2.71, 0.3, 0.18], [3.47, 0.22, 0.12], [4.03, 0.12, 0.08]]
const BELL = [[0.5, 0.3, 1.5], [1, 1, 1.3], [1.19, 0.45, 1], [1.5, 0.3, 0.85], [2, 0.42, 0.75], [2.5, 0.18, 0.5], [3.01, 0.1, 0.35]]
const PLASTIC = [[1, 1, 0.026], [2.31, 0.5, 0.016], [3.93, 0.28, 0.01]]
// Major pentatonic, two octaves: any run of it sounds pleasant.
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
  if (!COARSE_POINTER || isMuted()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // not allowed in this frame
  }
}
function glock(t, notes, gap, gain = 0.12, verb = 0.3, bus = A.sfx) {
  notes.forEach((n, i) => modal({ t: t + i * gap, f: C6 * semi(n), modes: GLOCK, gain: gain * rnd(0.85, 1), strike: 0.1, pan: (i / Math.max(1, notes.length - 1) - 0.5) * 0.5, verb, bus }))
}

// One training click. streak = clicks in a row (0 = first), mult = table multiplier.
// bounce = a trampoline landing (the boing replaces the band snap).
export function shot(streak = 0, mult = 1, bounce = false) {
  if (!limit('trainShot', 70) || !voice(0.5, 1)) return
  const t = now()
  // rubber band snapping forward
  if (!bounce) {
    tone({ t, type: 'triangle', f: vary(300, 0.1), f2: 130, glide: 0.07, d: 0.09, gain: 0.1, lp: 2000 })
    burst({ t, noise: 'pink', f: 1400, f2: 4200, q: 1.1, a: 0.003, d: 0.05, gain: 0.07 })
  }
  // the ding: climbs the scale with the streak, wraps back an octave down past the top
  const step = streak % (PENTA.length * 2 - 2)
  const idx = step < PENTA.length ? step : PENTA.length * 2 - 2 - step // up then back down
  const f = C5 * semi(PENTA[idx] + 12)
  modal({ t: t + 0.012, f, modes: GLASS, gain: 0.055, decay: 0.55, strike: 0.04, pan: rnd(-0.15, 0.15), verb: 0.18 })
  // a little energy crackle (the Skill going in)
  for (let i = 0; i < 2; i++) burst({ t: t + 0.02 + Math.random() * 0.04, type: 'highpass', f: rnd(3000, 5000), q: 0.7, a: 0.0004, d: rnd(0.002, 0.006), gain: rnd(0.03, 0.06), pan: rnd(-0.3, 0.3) })
  if (mult > 1) {
    // table bonus: a bright shimmer an octave and a fifth above the ding
    const k = Math.min(1, 0.4 + Math.log10(mult) * 0.4)
    modal({ t: t + 0.03, f: f * 3, modes: GLOCK, gain: 0.03 * k, decay: 0.5, pan: rnd(-0.5, 0.5), verb: 0.35 })
  }
}

// Trampoline bounce (a training table): the canvas thump under the feet, then
// the springs: two triangles sweeping up a hair apart so they beat into a
// wobble, and a faint ring of the metal coils. Plays every ~second while
// bouncing, so it is soft and varies every time. big = jump-boosted bounce.
export function boing(big = false) {
  if (!limit('boing', 150) || !voice(0.5, 1)) return
  const t = now()
  const f0 = vary(big ? 95 : 125, 0.07)
  const k = big ? 1.25 : 1
  tone({ t, f: f0, f2: f0 * 0.55, d: 0.11, gain: 0.2 * k })
  burst({ t, noise: 'brown', type: 'lowpass', f: 520, q: 0.6, a: 0.002, d: 0.08, gain: 0.16 * k })
  tone({ t: t + 0.008, type: 'triangle', f: f0 * 1.7, f2: f0 * 4.4, glide: 0.17, d: 0.24, gain: 0.06 * k, lp: 1900 })
  tone({ t: t + 0.008, type: 'triangle', f: f0 * 1.7, f2: f0 * 4.4, glide: 0.17, d: 0.24, gain: 0.05 * k, lp: 1900, detune: 38 })
  tone({ t: t + 0.01, f: f0 * 3.4, f2: f0 * 8.5, glide: 0.12, d: 0.14, gain: 0.02 * k })
  modal({ t, f: vary(1750, 0.05), modes: COIN, gain: 0.01 * k, decay: 0.35, beat: 9 })
  // air rushing past on the way up
  burst({ t: t + 0.02, noise: 'pink', f: 350, f2: big ? 2600 : 1900, q: 0.8, a: 0.08, d: big ? 0.5 : 0.4, gain: big ? 0.11 : 0.07, sweep: 0.5 })
}

// Top of a high bounce: one soft glockenspiel twinkle (a fifth up when boosted).
export function apex(big = false) {
  if (!limit('apex', 400) || !voice(0.8, 1)) return
  const t = now()
  modal({ t, f: C6 * semi(big ? 19 : 12) * rnd(0.995, 1.005), modes: GLOCK, gain: 0.045, decay: 0.7, strike: 0.05, pan: rnd(-0.3, 0.3), verb: 0.4 })
  if (big) modal({ t: t + 0.06, f: C6 * semi(24), modes: GLOCK, gain: 0.035, decay: 0.7, pan: rnd(-0.3, 0.3), verb: 0.4 })
}

// Hopping up onto a table from the side: a quick lift of air and a little spring.
export function hopOn() {
  if (!limit('hopOn', 300) || !voice(0.4, 1)) return
  const t = now()
  burst({ t, noise: 'pink', f: 450, f2: 1700, q: 0.9, a: 0.03, d: 0.14, gain: 0.12 })
  tone({ t, type: 'triangle', f: 180, f2: 420, glide: 0.12, d: 0.14, gain: 0.05, lp: 1600 })
}

// Every 25 clicks in a row: a quick happy run so a long hold has payoffs.
export function streak(n = 25) {
  if (!voice(1, 2)) return
  const t = now()
  const top = Math.min(4, Math.floor(n / 25))
  glock(t, [0, 4, 7, 12, 16, 19, 24].slice(0, 3 + top), 0.045, 0.07, 0.3)
  bubble({ t, f: 500, d: 0.06, gain: 0.12, rise: 1.2 })
}

// Level up: a rising swell, a bright pop, then a fanfare run with a sparkle tail.
export function levelUp(levels = 1) {
  if (!limit('levelUp', 350) || !voice(2, 4)) return
  const t = now()
  burst({ t, noise: 'pink', f: 350, f2: 3600, q: 0.9, a: 0.22, d: 0.08, gain: 0.16 })
  const hit = t + 0.22
  bubble({ t: hit, f: 480, d: 0.08, gain: 0.26, rise: 1.4 })
  tone({ t: hit, f: 110, f2: 70, d: 0.25, gain: 0.25 })
  glock(hit + 0.02, [0, 4, 7, 12, 16, 19, 24], 0.055, 0.12, 0.35)
  modal({ t: hit + 0.4, f: C6 * semi(24), modes: BELL, gain: 0.07, decay: 0.8, verb: 0.45 })
  crinkle({ t: hit + 0.1, n: Math.round(14 * lite), dur: 0.5, gain: 0.03, f0: 5000, f1: 10000, width: 0.8, verb: 0.3 })
  if (levels >= 5) burst({ t: hit, type: 'highpass', f: 4000, q: 0.5, a: 0.003, d: 0.6, gain: 0.08, verb: 0.3 })
  buzz([20, 40, 30])
}

// Stepping onto an unlocked training table: a hum swells, a chord blooms
// (more notes for bigger multipliers).
export function tableEnter(mult = 1) {
  if (!limit('tableEnter', 500) || !voice(1.4, 2)) return
  const t = now()
  tone({ t, f: 98, a: 0.1, d: 0.6, gain: 0.14 })
  tone({ t, f: 196, a: 0.1, d: 0.45, gain: 0.05 })
  burst({ t, noise: 'pink', f: 400, f2: 2600, q: 1, a: 0.16, d: 0.3, gain: 0.1 })
  const run = mult >= 20 ? [0, 4, 7, 12, 16, 19, 24] : mult >= 10 ? [0, 4, 7, 12, 16, 19] : mult >= 3 ? [0, 4, 7, 12, 16] : [0, 7, 12]
  glock(t + 0.12, run, 0.05, 0.08, 0.35)
}

// Locked table: a dull plastic knock twice and a falling tone.
export function tableLocked() {
  if (!limit('tableLocked', 600) || !voice(0.5, 2)) return
  const t = now()
  modal({ t, f: 420, modes: PLASTIC, gain: 0.2 })
  modal({ t: t + 0.09, f: 360, modes: PLASTIC, gain: 0.18 })
  tone({ t: t + 0.05, type: 'triangle', f: 330, f2: 200, d: 0.22, gain: 0.08, lp: 1400 })
}

// Rebirth just became possible: two bell strikes, a sparkle.
export function rebirthReady() {
  if (!limit('rebirthReady', 3000) || !voice(2, 3)) return
  const t = now()
  modal({ t, f: 784, modes: BELL, gain: 0.12, beat: 4, strike: 0.15, verb: 0.4 })
  modal({ t: t + 0.18, f: 1046.5, modes: BELL, gain: 0.12, beat: 4, strike: 0.15, verb: 0.4 })
  glock(t + 0.36, [12, 16, 19, 24], 0.05, 0.06, 0.4)
  buzz([30, 60, 30])
}

// Bought a slingshot on a pad: coins drop, a register clunk, a happy run.
export function buySling() {
  if (!voice(1.4, 3)) return
  const t = now()
  for (let i = 0; i < (COARSE_POINTER ? 5 : 9); i++) modal({ t: t + i * rnd(0.025, 0.05), f: rnd(2600, 3600), modes: COIN, gain: 0.05, decay: 0.5, beat: 6, pan: rnd(-0.5, 0.5) })
  tone({ t: t + 0.18, f: 160, f2: 90, d: 0.08, gain: 0.25 })
  modal({ t: t + 0.18, f: 900, modes: PLASTIC, gain: 0.16 })
  glock(t + 0.25, [0, 4, 7, 12, 16], 0.06, 0.12, 0.3)
  buzz([20, 30, 40])
}

// Equipped an owned slingshot: the straps stretched and let go, a click.
export function equipSling() {
  if (!limit('equipSling', 300) || !voice(0.6, 2)) return
  const t = now()
  tone({ t, type: 'triangle', f: 140, f2: 260, glide: 0.18, d: 0.2, gain: 0.07, lp: 1600 })
  tone({ t: t + 0.2, type: 'triangle', f: 320, f2: 140, glide: 0.06, d: 0.1, gain: 0.1, lp: 2000 })
  modal({ t: t + 0.2, f: 1300, modes: PLASTIC, gain: 0.14 })
  glock(t + 0.24, [7, 12], 0.06, 0.07, 0.25)
}

// Can't afford a slingshot.
export function cantAfford() {
  if (!limit('cantAfford', 500) || !voice(0.4, 2)) return
  const t = now()
  tone({ t, type: 'square', f: 220, d: 0.08, gain: 0.04, lp: 900 })
  tone({ t: t + 0.1, type: 'square', f: 165, d: 0.14, gain: 0.04, lp: 900 })
  modal({ t, f: 380, modes: PLASTIC, gain: 0.14 })
}
