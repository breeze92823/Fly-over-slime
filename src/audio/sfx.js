// Every one-shot sound in the game, synthesised from physical recipes (synth.js).
// Nothing here throws or plays before the first gesture: each export returns
// quietly when audio isn't running or the voice budget is spent.
//
// Materials are mode tables [ratio, amplitude, decay s]: a coin is a thin
// metal plate, the glockenspiel a free bar (2.756 is the real bar overtone),
// the bell a church/hand-bell partial set, wood and plastic die in tens of ms.
import { COARSE_POINTER } from '../config.js'
import { A, isMuted, now, voice } from './core.js'
import { bubble, bubbles, burst, crinkle, modal, pick, rnd, route, saturation, tone, vary } from './synth.js'

const COIN = [[1, 1, 0.5], [1.504, 0.6, 0.36], [2.24, 0.45, 0.26], [2.71, 0.3, 0.18], [3.47, 0.22, 0.12], [4.03, 0.12, 0.08]]
const TROPHY = [[1, 1, 0.7], [2.05, 0.5, 0.5], [3.1, 0.34, 0.32], [4.33, 0.2, 0.2], [5.6, 0.1, 0.12]]
const GLOCK = [[1, 1, 1.4], [2.756, 0.32, 0.45], [5.404, 0.1, 0.18], [8.933, 0.04, 0.08]]
const BELL = [[0.5, 0.3, 1.5], [1, 1, 1.3], [1.19, 0.45, 1], [1.5, 0.3, 0.85], [2, 0.42, 0.75], [2.5, 0.18, 0.5], [2.66, 0.22, 0.45], [3.01, 0.1, 0.35], [4.1, 0.06, 0.25]]
const WOOD = [[1, 1, 0.07], [2.57, 0.45, 0.035], [4.2, 0.22, 0.016], [6.1, 0.08, 0.01]]
const PLASTIC = [[1, 1, 0.026], [2.31, 0.5, 0.016], [3.93, 0.28, 0.01]]
const GLASS = [[1, 1, 0.45], [2.32, 0.5, 0.28], [4.25, 0.28, 0.16], [6.63, 0.14, 0.1]]

const semi = (n) => Math.pow(2, n / 12)
const C6 = 1046.5

// --- Bookkeeping -----------------------------------------------------------------------------
const lastAt = new Map()
// false if `name` played less than `ms` ago (keeps rapid repeats from stacking).
function limit(name, ms) {
  const t = performance.now()
  if (t - (lastAt.get(name) ?? -1e9) < ms) return false
  lastAt.set(name, t)
  return true
}
// A specific sound claims the moment, so the generic feedback sounds (uiWindow's
// replay, hud's spend detection) that fire in the same handler stay quiet.
let claimed = -1e9
const claim = () => (claimed = performance.now())
export const claimedRecently = (ms = 80) => performance.now() - claimed < ms

// Phone haptics for the big moments (Android; iOS ignores it).
function buzz(pattern) {
  if (!COARSE_POINTER || isMuted()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Not allowed in this frame.
  }
}

// --- UI ------------------------------------------------------------------------------------------
// HUD button: a short plastic press with a felt-y body thump.
export function click(pan = 0) {
  if (!limit('click', 30) || !voice(0.1, 2)) return
  const t = now()
  const bus = A.ui
  burst({ t, f: vary(4200, 0.1), q: 1.2, d: 0.006, gain: 0.2, bus, pan })
  modal({ t, f: vary(1250, 0.06), modes: PLASTIC, gain: 0.16, bus, pan })
  tone({ t, f: vary(170, 0.05), f2: 85, d: 0.04, gain: 0.22, bus, pan })
}

// Big chunky menu button: deeper, a rubbery squish under the click.
export function press(pan = 0) {
  if (!limit('click', 30) || !voice(0.12, 2)) return
  const t = now()
  const bus = A.ui
  burst({ t, f: vary(3000, 0.1), q: 1, d: 0.008, gain: 0.2, bus, pan })
  modal({ t, f: vary(820, 0.05), modes: PLASTIC, gain: 0.18, bus, pan })
  tone({ t, f: vary(140, 0.05), f2: 68, d: 0.06, gain: 0.3, bus, pan })
  burst({ t, type: 'lowpass', f: 900, q: 0.6, a: 0.004, d: 0.045, gain: 0.08, bus, pan })
}

// Picking a card in a grid: a light tap on a plastic tile.
export function tick(pan = 0) {
  if (!limit('click', 30) || !voice(0.06, 2)) return
  const t = now()
  const bus = A.ui
  burst({ t, f: vary(6000, 0.1), q: 1.4, d: 0.004, gain: 0.12, bus, pan })
  modal({ t, f: vary(2300, 0.06), modes: PLASTIC, gain: 0.1, bus, pan })
}

// Toggle switch (AUTO TRAIN / RACE): two clicks a few ms apart and a tiny spring ring.
export function toggle(on) {
  if (!voice(0.2, 2)) return
  const t = now()
  const bus = A.ui
  modal({ t, f: on ? 1500 : 1700, modes: PLASTIC, gain: 0.14, bus, strike: 0.12 })
  modal({ t: t + 0.016, f: on ? 2100 : 1250, modes: PLASTIC, gain: 0.16, bus, strike: 0.1 })
  modal({ t: t + 0.016, f: on ? 3400 : 2900, modes: COIN, gain: 0.025, decay: 0.3, bus })
  tone({ t, f: 180, f2: 90, d: 0.04, gain: 0.15, bus })
}

// Window opens: air pushed aside, then the card lands on felt.
export function windowOpen() {
  if (!limit('win', 90) || !voice(0.35, 2)) return
  const t = now()
  const bus = A.ui
  burst({ t, noise: 'pink', f: 320, f2: 2400, q: 0.9, a: 0.09, d: 0.17, gain: 0.32, bus })
  tone({ t: t + 0.11, f: 125, f2: 70, d: 0.09, gain: 0.22, bus })
  burst({ t: t + 0.11, type: 'lowpass', f: 1500, q: 0.5, d: 0.05, gain: 0.1, bus })
}

export function windowClose() {
  if (!limit('win', 90) || !voice(0.2, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 2100, f2: 300, q: 0.9, a: 0.02, d: 0.14, gain: 0.38, bus: A.ui })
}

// No: two dull knocks on wood. Firm but never a harsh buzzer.
export function deny() {
  if (!limit('deny', 140) || !voice(0.2, 2)) return
  const t = now()
  const bus = A.ui
  modal({ t, f: vary(215, 0.03), modes: WOOD, gain: 0.42, strike: 0.15, bus })
  modal({ t: t + 0.09, f: vary(168, 0.03), modes: WOOD, gain: 0.36, strike: 0.12, bus })
  buzz(30)
}

// Coins tumbling onto a counter: n clinks of random small coins, fading out.
function coins(t, n, spread, gain, pan = 0) {
  for (let i = 0; i < n; i++) {
    const at = t + Math.pow(i / n, 1.3) * spread + rnd(0, 0.02)
    modal({ t: at, f: rnd(2500, 4400), modes: COIN, gain: gain * (1 - (i / n) * 0.7), beat: 7, strike: 0.25, decay: rnd(0.5, 1), pan: pan + rnd(-0.3, 0.3), bus: A.sfx, verb: 0.08 })
  }
  // The rattle of them settling.
  crinkle({ t: t + spread * 0.4, n: COARSE_POINTER ? 6 : 12, dur: spread, gain: 0.03, f0: 4000, f1: 9000 })
}

// Spending Wins: the till drawer clunks, the bell rings, coins pour out.
export function purchase() {
  if (!limit('buy', 200) || !voice(1.4, 3)) return
  claim()
  const t = now()
  burst({ t, type: 'lowpass', f: 700, q: 0.7, d: 0.1, gain: 0.32 })
  tone({ t, f: 95, f2: 52, d: 0.1, gain: 0.32 })
  modal({ t: t + 0.04, f: 1046, modes: BELL, gain: 0.2, beat: 4, strike: 0.2, verb: 0.15 })
  coins(t + 0.06, COARSE_POINTER ? 6 : 10, 0.45, 0.09)
  buzz([20, 40, 30])
}

// Equip: a latch clicking home, a small metal clack, a lift of air.
export function equip() {
  if (!limit('equip', 120) || !voice(0.4, 2)) return
  claim()
  const t = now()
  modal({ t, f: vary(1800, 0.04), modes: PLASTIC, gain: 0.16, strike: 0.15, bus: A.ui })
  modal({ t: t + 0.045, f: vary(2400, 0.04), modes: COIN, gain: 0.07, decay: 0.45, strike: 0.3, bus: A.ui })
  tone({ t: t + 0.045, f: 210, f2: 120, d: 0.035, gain: 0.2, bus: A.ui })
  burst({ t, noise: 'pink', f: 600, f2: 1900, q: 0.8, a: 0.03, d: 0.1, gain: 0.08, bus: A.ui })
}

// A soft cork-like pop (pets hopping in or out of the team).
export function pop(up = true) {
  if (!limit('pop', 50) || !voice(0.15, 2)) return
  claim()
  const t = now()
  bubble({ t, f: up ? vary(480, 0.08) : vary(720, 0.08), d: 0.06, gain: 0.28, rise: up ? 1.1 : -0.45, bus: A.ui })
  burst({ t, f: 2600, q: 1, d: 0.008, gain: 0.1, bus: A.ui })
}

// Padlock shackle snapping shut / open.
export function lock() {
  if (!voice(0.3, 2)) return
  claim()
  const t = now()
  modal({ t, f: vary(1900, 0.03), modes: COIN, gain: 0.12, decay: 0.35, strike: 0.4, beat: 9, bus: A.ui })
  modal({ t: t + 0.03, f: 1100, modes: PLASTIC, gain: 0.12, bus: A.ui })
}

// Hotbar slot: pulling a tool off the belt.
export function holster() {
  if (!voice(0.15, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 1500, q: 1.2, a: 0.02, d: 0.08, gain: 0.12, bus: A.ui })
  modal({ t: t + 0.05, f: 1600, modes: PLASTIC, gain: 0.1, bus: A.ui })
}

// Glockenspiel notes (semitones above C6), `gap` s apart.
function glock(t, notes, gap, gain = 0.14, verb = 0.25, bus = A.sfx) {
  notes.forEach((n, i) => modal({ t: t + i * gap, f: C6 * semi(n), modes: GLOCK, gain: gain * rnd(0.85, 1), strike: 0.12, pan: (i / Math.max(1, notes.length - 1) - 0.5) * 0.5, verb, bus }))
}

// --- World + race --------------------------------------------------------------------------------
// Water splash: the impact thud, white spray, then a cloud of bubbles and the drops coming back down.
export function splash(size = 1, pan = 0, bus = A.sfx) {
  if (!voice(1.2, 2)) return
  const t = now()
  const k = COARSE_POINTER ? 0.6 : 1
  burst({ t, noise: 'pink', type: 'lowpass', f: 650, f2: 200, q: 0.7, a: 0.004, d: 0.2 * size, gain: 0.4 * Math.min(1.4, size), pan, bus })
  tone({ t, f: 90, f2: 45, d: 0.13, gain: 0.28 * Math.min(1.4, size), pan, bus })
  burst({ t, type: 'highpass', f: 2400, q: 0.5, a: 0.012, d: 0.5 * size, gain: 0.16 * size, pan, bus, verb: 0.12 })
  bubbles({ t, n: Math.round(26 * size * k), dur: 0.35 * size, f0: 330, f1: 2200, gain: 0.08, bus, verb: 0.12 })
  bubbles({ t: t + 0.22 * size, n: Math.round(14 * size * k), dur: 0.5 * size, f0: 1200, f1: 4200, gain: 0.035, d: [0.008, 0.02], bus })
}

// Every boost tap: a slap of spray off the bow (the engine blips itself, engine.js).
export function tapSpray() {
  if (!limit('tap', 45) || !voice(0.2, 1)) return
  const t = now()
  const pan = rnd(-0.25, 0.25)
  burst({ t, f: vary(3200, 0.15), f2: 1700, q: 0.7, a: 0.006, d: 0.09, gain: 0.07, pan })
  bubbles({ t, n: 3, dur: 0.06, f0: 700, f1: 2400, gain: 0.03 })
}

// Stadium air horn: two reeds a major third apart, a breath of air, and the
// beach throwing it back. len s of blast.
export function airHorn(len = 0.7, t = now(), gain = 0.17) {
  const ctx = A.ctx
  const out = ctx.createGain()
  out.gain.value = gain
  route(out, { verb: 0.45 })
  const shape = ctx.createWaveShaper()
  shape.curve = saturation(2.5)
  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 1300
  bp.Q.value = 0.6
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 4200
  const amp = ctx.createGain()
  amp.gain.setValueAtTime(0.0001, t)
  amp.gain.linearRampToValueAtTime(1, t + 0.04)
  amp.gain.setValueAtTime(1, t + len)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + len + 0.16)
  shape.connect(bp).connect(lp).connect(amp).connect(out)
  for (const f of [370, 371.5, 466]) {
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(f * 0.94, t) // reeds start flat and snap up to pitch
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06)
    const g = ctx.createGain()
    g.gain.value = 0.33
    o.connect(g).connect(shape)
    o.start(t)
    o.stop(t + len + 0.2)
  }
  burst({ t, f: 2200, q: 0.6, a: 0.03, hold: len, d: 0.12, gain: 0.025 })
  return t + len + 0.16
}

export function raceStart() {
  if (!voice(1.2, 3)) return
  claim()
  airHorn(0.75)
  buzz(60)
}

// Through a checkpoint wall: a doppler-ish whoosh past the ears.
function whooshPast(t) {
  burst({ t, noise: 'pink', f: 2600, f2: 380, q: 1.1, a: 0.06, d: 0.3, gain: 0.38 })
  tone({ t: t + 0.04, f: 110, f2: 58, d: 0.24, gain: 0.16 })
}

// Party popper: the crack, the cardboard body, paper fluttering down.
function popper(t, pan) {
  burst({ t, type: 'highpass', f: 2800, q: 0.6, a: 0.0005, d: 0.012, gain: 0.5, pan, verb: 0.2 })
  burst({ t, f: 900, q: 0.9, a: 0.001, d: 0.05, gain: 0.26, pan })
  tone({ t, f: 170, f2: 60, d: 0.06, gain: 0.2, pan })
  crinkle({ t: t + 0.05, n: COARSE_POINTER ? 14 : 28, dur: 0.9, gain: 0.05, f0: 2500, f1: 8000, width: 0.9 })
}

// A checkpoint paid out: whoosh, the "+N" pops, confetti poppers either side;
// lucky ones add a glockenspiel run. The trophies' landings are clink(i).
export function checkpoint(lucky = false) {
  if (!voice(1.4, 3)) return
  claim()
  const t = now()
  whooshPast(t)
  // Cork-ish pop of the "+N".
  tone({ t: t + 0.06, f: 900, f2: 210, glide: 0.035, d: 0.06, gain: 0.3 })
  burst({ t: t + 0.06, f: 2500, q: 1, d: 0.01, gain: 0.2 })
  popper(t + 0.1, -0.55)
  popper(t + 0.15, 0.55)
  if (lucky) glock(t + 0.2, [0, 4, 7, 12, 16, 19, 24], 0.06, 0.15, 0.3)
  buzz(lucky ? [30, 50, 30, 50, 60] : 25)
}

// A trophy landing in the counter (top right): metal cup clinks rising up a pentatonic scale.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19]
export function clink(i = 0) {
  if (!voice(0.8, 2)) return
  const t = now()
  const f = 1320 * semi(PENTA[Math.min(i, PENTA.length - 1)])
  modal({ t, f: vary(f, 0.006), modes: TROPHY, gain: 0.17, beat: 7, strike: 0.3, pan: rnd(0.35, 0.65), verb: 0.12 })
}

// Applause + cheering crowd: dozens of random claps (that is what applause is)
// over a roar of vowel-filtered noise voices and a couple of two-finger whistles.
export function applause(dur = 2.4, amount = 1, t = now()) {
  const claps = Math.round(dur * (COARSE_POINTER ? 30 : 55) * amount)
  for (let i = 0; i < claps; i++) {
    // Swells in fast, holds, thins out.
    const x = Math.random()
    const at = t + (x < 0.15 ? Math.sqrt(x / 0.15) * 0.15 : 0.15 + Math.pow((x - 0.15) / 0.85, 1.6) * 0.85) * dur
    burst({ t: at, f: rnd(900, 2600), q: rnd(1.4, 3), a: 0.0008, d: rnd(0.02, 0.05), gain: rnd(0.04, 0.12) * amount, pan: rnd(-0.85, 0.85), verb: 0.3 })
  }
  const voices = COARSE_POINTER ? 3 : 6
  for (let i = 0; i < voices; i++) {
    burst({ t: t + rnd(0, 0.2), noise: 'pink', f: rnd(450, 1100), f2: rnd(700, 1800), q: rnd(2, 4.5), a: 0.25, hold: dur * 0.35, d: dur * 0.6, gain: 0.07 * amount, pan: rnd(-0.7, 0.7), verb: 0.35 })
  }
  for (let i = 0; i < 2; i++) {
    const at = t + rnd(0.2, dur * 0.5)
    const f = rnd(2200, 2700)
    tone({ t: at, f, f2: f * 1.28, glide: 0.18, a: 0.03, hold: 0.22, d: 0.12, gain: 0.04 * amount, pan: rnd(-0.6, 0.6), verb: 0.3 })
    burst({ t: at, f: f * 1.1, q: 3, a: 0.03, hold: 0.22, d: 0.1, gain: 0.012 * amount, pan: 0, verb: 0.3 })
  }
}

// Passing the personal best mid-race.
export function record() {
  if (!voice(3, 4)) return
  claim()
  const t = now()
  airHorn(0.35, t, 0.13)
  glock(t + 0.1, [0, 4, 7, 12, 7, 12, 16], 0.07, 0.13, 0.35)
  applause(2.6, 0.9, t + 0.15)
  buzz([40, 60, 40, 60, 80])
}

// Top speed went up: a turbo spooling up, then the blow-off valve.
export function speedUp() {
  if (!voice(1.4, 3)) return
  claim()
  const t = now()
  tone({ t, f: 1500, f2: 6200, glide: 0.55, a: 0.18, hold: 0.25, d: 0.25, gain: 0.03 })
  burst({ t, f: 1400, f2: 5200, q: 2, a: 0.18, hold: 0.25, d: 0.2, sweep: 0.55, gain: 0.07 })
  burst({ t: t + 0.66, f: 3600, f2: 1600, q: 0.6, a: 0.004, d: 0.4, gain: 0.22, verb: 0.1 })
  glock(t + 0.7, [7, 12], 0.08, 0.1)
}

// Race over: two short horn blasts, the result card slaps down; a new best gets the crowd.
export function finish(best = false) {
  if (!voice(3, 4)) return
  claim()
  const t = now()
  airHorn(0.2, t, 0.15)
  airHorn(0.42, t + 0.32, 0.15)
  burst({ t: t + 0.8, noise: 'pink', f: 400, f2: 2200, q: 0.8, a: 0.07, d: 0.12, gain: 0.25 })
  tone({ t: t + 0.92, f: 120, f2: 65, d: 0.1, gain: 0.25 })
  if (best) {
    glock(t + 0.95, [0, 4, 7, 12, 16], 0.08, 0.14, 0.35)
    applause(2.8, 1, t + 0.95)
  }
}

// Lightning gained (training tick): a little electric crackle plus a glassy tick.
export function zap(n = 1) {
  if (!limit('zap', 250) || !voice(0.25, 1)) return
  const t = now()
  const k = Math.min(1, 0.55 + Math.log10(n + 1) * 0.15)
  const sparks = 4 + Math.floor(Math.random() * 4)
  for (let i = 0; i < sparks; i++) {
    burst({ t: t + Math.random() * 0.06, type: 'highpass', f: rnd(2500, 4500), q: 0.7, a: 0.0004, d: rnd(0.002, 0.008), gain: rnd(0.06, 0.12) * k, pan: rnd(-0.2, 0.2) })
  }
  tone({ t, type: 'sawtooth', f: 118, d: 0.08, gain: 0.025 * k, lp: 900 })
  modal({ t: t + 0.04, f: vary(3100, 0.05), modes: GLASS, gain: 0.03 * k, decay: 0.4, pan: 0.3 })
}

// Rebirth: a swell rushing in, a deep boom, a bright chord ringing out, the crowd.
export function rebirth() {
  if (!voice(3.5, 5)) return
  claim()
  const t = now()
  burst({ t, noise: 'pink', f: 200, f2: 3800, q: 0.8, a: 0.7, d: 0.06, gain: 0.32 })
  burst({ t, type: 'highpass', f: 5000, q: 0.5, a: 0.7, d: 0.05, gain: 0.08 })
  const hit = t + 0.74
  tone({ t: hit, f: 72, f2: 30, glide: 1.2, d: 1.6, gain: 0.6 })
  burst({ t: hit, noise: 'brown', type: 'lowpass', f: 420, q: 0.6, a: 0.005, d: 1.3, gain: 0.5, verb: 0.3 })
  burst({ t: hit, type: 'highpass', f: 4000, q: 0.5, a: 0.003, d: 0.7, gain: 0.12, verb: 0.3 })
  ;[0, 4, 7, 12, 16].forEach((n) => modal({ t: hit + 0.03, f: C6 * semi(n), modes: GLOCK, gain: 0.1, decay: 1.6, strike: 0.1, pan: rnd(-0.5, 0.5), verb: 0.4 }))
  applause(2.3, 0.8, hit + 0.1)
  buzz([0, 740, 120, 60, 80])
}

// Craft All: rising magic, glass shimmer, a pop, then a run up the glockenspiel.
export function craft() {
  if (!voice(1.5, 3)) return
  claim()
  const t = now()
  burst({ t, noise: 'pink', f: 300, f2: 3000, q: 1.4, a: 0.42, d: 0.05, gain: 0.22 })
  for (let i = 0; i < (COARSE_POINTER ? 8 : 16); i++) modal({ t: t + Math.random() * 0.42, f: rnd(2800, 6000), modes: GLASS, gain: 0.025, decay: 0.5, pan: rnd(-0.7, 0.7) })
  bubble({ t: t + 0.45, f: 420, d: 0.07, gain: 0.3, rise: 1.4 })
  glock(t + 0.5, [0, 4, 7, 12, 16, 19], 0.055, 0.13)
  buzz([30, 30, 50])
}

// Pets deleted: paper crumpled, swept off, a soft thud in the bin.
export function trash() {
  if (!voice(0.6, 2)) return
  claim()
  const t = now()
  crinkle({ t, n: COARSE_POINTER ? 22 : 40, dur: 0.32, gain: 0.12, f0: 1200, f1: 6000 })
  burst({ t: t + 0.25, noise: 'pink', f: 1800, f2: 300, q: 0.9, a: 0.02, d: 0.15, gain: 0.2 })
  tone({ t: t + 0.4, f: 110, f2: 60, d: 0.1, gain: 0.25 })
}

// Online gift claimed: wrapping paper torn, the lid pops, then what was inside.
export function gift(type) {
  if (!voice(1.6, 3)) return
  claim()
  const t = now()
  crinkle({ t, n: COARSE_POINTER ? 18 : 34, dur: 0.28, gain: 0.12 })
  tone({ t: t + 0.22, f: 230, f2: 120, d: 0.06, gain: 0.2 })
  burst({ t: t + 0.22, type: 'lowpass', f: 1100, q: 0.6, d: 0.05, gain: 0.12 })
  const r = t + 0.3
  if (type === 'trophy') {
    coins(r, COARSE_POINTER ? 6 : 10, 0.4, 0.09)
    modal({ t: r, f: 1320, modes: TROPHY, gain: 0.15, beat: 7, strike: 0.3, verb: 0.15 })
  } else if (type === 'bolt') {
    for (let i = 0; i < 10; i++) burst({ t: r + Math.random() * 0.18, type: 'highpass', f: rnd(2500, 5000), q: 0.7, a: 0.0004, d: rnd(0.003, 0.01), gain: rnd(0.08, 0.16), pan: rnd(-0.4, 0.4) })
    tone({ t: r, type: 'sawtooth', f: 110, f2: 160, d: 0.25, gain: 0.04, lp: 1200 })
    glock(r + 0.12, [7, 12, 19], 0.06, 0.11)
  } else if (type === 'potion') {
    modal({ t: r, f: 2100, modes: GLASS, gain: 0.14, beat: 3, strike: 0.3 })
    modal({ t: r + 0.12, f: 2350, modes: GLASS, gain: 0.1, beat: 3, strike: 0.2 })
    // Glug: big low bubbles through the neck.
    for (let i = 0; i < 5; i++) bubble({ t: r + 0.25 + i * 0.09 + rnd(0, 0.03), f: rnd(180, 380), d: 0.07, gain: 0.16, rise: 0.7 })
  } else {
    bubble({ t: r, f: 450, d: 0.07, gain: 0.28, rise: 1.2 })
    glock(r + 0.05, [0, 4, 7, 12, 16], 0.06, 0.13)
  }
  buzz([20, 40, 40])
}

// Driving onto a hub pad: a low energy hum swelling under a few sparkles.
export function padEnter() {
  if (!limit('pad', 600) || !voice(0.7, 2)) return
  const t = now()
  tone({ t, f: 82, a: 0.12, d: 0.45, gain: 0.12 })
  tone({ t, f: 164, a: 0.12, d: 0.35, gain: 0.04 })
  burst({ t, noise: 'pink', f: 500, f2: 2200, q: 1, a: 0.14, d: 0.25, gain: 0.08 })
  for (let i = 0; i < 4; i++) modal({ t: t + 0.05 + Math.random() * 0.3, f: C6 * semi(pick([12, 16, 19, 24])), modes: GLOCK, gain: 0.035, decay: 0.6, pan: rnd(-0.6, 0.6), verb: 0.3 })
}

// A training lane unlocked.
export function unlock() {
  if (!voice(1.2, 3)) return
  claim()
  const t = now()
  lock()
  burst({ t, noise: 'pink', f: 400, f2: 2600, q: 0.9, a: 0.12, d: 0.2, gain: 0.15 })
  glock(t + 0.12, [0, 7, 12, 16, 19], 0.07, 0.13)
}

// The boat hops: air lifts it, a little sand kicks up.
export function jump() {
  if (!limit('jump', 150) || !voice(0.25, 1)) return
  const t = now()
  burst({ t, noise: 'pink', f: 450, f2: 1400, q: 0.9, a: 0.03, d: 0.12, gain: 0.12 })
  crinkle({ t, n: 7, dur: 0.12, gain: 0.04, f0: 2500, f1: 7000 })
}

// Landing on sand (k 0..1 = how hard): a thud, sand spraying out, grains settling.
export function land(k = 0.5) {
  if (!limit('land', 120) || !voice(0.4, 1)) return
  const t = now()
  k = Math.max(0.25, Math.min(1, k))
  tone({ t, f: vary(85, 0.06), f2: 48, d: 0.11, gain: 0.4 * k })
  burst({ t, noise: 'brown', type: 'lowpass', f: 520, q: 0.6, a: 0.003, d: 0.13, gain: 0.4 * k })
  burst({ t, type: 'highpass', f: 3400, q: 0.5, a: 0.006, d: 0.2, gain: 0.07 * k })
  crinkle({ t: t + 0.03, n: Math.round(6 + 8 * k), dur: 0.25, gain: 0.035 * k, f0: 3000, f1: 9000 })
}

// Respawn: a whoosh in and a small splash as the boat drops back.
export function respawnFx() {
  if (!limit('respawn', 400) || !voice(0.9, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 3000, f2: 400, q: 1, a: 0.05, d: 0.3, gain: 0.25 })
  modal({ t: t + 0.05, f: C6 * semi(12), modes: GLOCK, gain: 0.06, verb: 0.4 })
}

// Day <-> night: a long soft swell of air.
export function dayNight() {
  if (!voice(1.2, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 250, f2: 1200, q: 0.6, a: 0.5, d: 0.6, gain: 0.12 })
}

// Trails scene in/out: a big sweep of air and sea.
export function sceneIn() {
  if (!limit('scene', 300) || !voice(1, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 280, f2: 2600, q: 0.7, a: 0.16, d: 0.35, gain: 0.3, bus: A.ui })
  bubbles({ t: t + 0.12, n: COARSE_POINTER ? 8 : 16, dur: 0.4, f0: 500, f1: 2600, gain: 0.04, bus: A.ui })
}
export function sceneOut() {
  if (!limit('scene', 300) || !voice(0.5, 2)) return
  burst({ t: now(), noise: 'pink', f: 2400, f2: 260, q: 0.7, a: 0.03, d: 0.25, gain: 0.25, bus: A.ui })
}

// Previewing a trail: a swish of water past the hull.
export function swish() {
  if (!limit('swish', 60) || !voice(0.3, 1)) return
  const t = now()
  burst({ t, noise: 'pink', f: 900, f2: 2600, q: 0.9, a: 0.04, d: 0.16, gain: 0.3, bus: A.ui })
  bubbles({ t: t + 0.04, n: 5, dur: 0.15, f0: 800, f1: 3000, gain: 0.03, bus: A.ui })
}

// Egg hatch: shell cracks (sharp, brittle snaps), then the reveal (bigger for rarer pets: 0..5).
export function eggCrack() {
  if (!voice(0.3, 2)) return
  const t = now()
  for (let i = 0; i < 3; i++) {
    const at = t + i * rnd(0.03, 0.06)
    burst({ t: at, f: rnd(2500, 5000), q: 2, a: 0.0005, d: 0.01, gain: 0.25 })
    modal({ t: at, f: rnd(900, 1500), modes: WOOD, gain: 0.14, decay: 0.6 })
  }
  crinkle({ t, n: 10, dur: 0.15, gain: 0.06, f0: 3000, f1: 8000 })
}
export function reveal(rarity = 0) {
  if (!voice(2.5, 4)) return
  claim()
  const t = now()
  bubble({ t, f: 420, d: 0.08, gain: 0.3, rise: 1.3 })
  const runs = [[0, 7, 12], [0, 4, 7, 12], [0, 4, 7, 12, 16], [0, 4, 7, 12, 16, 19], [0, 4, 7, 12, 16, 19, 24], [0, 4, 7, 12, 16, 19, 24, 28]]
  glock(t + 0.05, runs[Math.max(0, Math.min(5, rarity))], 0.065, 0.14, 0.35)
  if (rarity >= 3) applause(1.6 + rarity * 0.3, 0.6 + rarity * 0.08, t + 0.3)
  if (rarity >= 4) airHorn(0.3, t + 0.1, 0.1)
  buzz(rarity >= 3 ? [40, 50, 40, 50, 80] : 30)
}

// Eggs rocking on the counter for `dur` s before they hatch: knocks coming faster, a creak of shell.
export function eggWobble(dur = 1.6) {
  if (!voice(dur, 2)) return
  const t = now()
  let at = t + 0.05
  let gap = 0.28
  while (at < t + dur - 0.05) {
    modal({ t: at, f: rnd(330, 420), modes: WOOD, gain: 0.16 + (at - t) / dur * 0.12, strike: 0.06, pan: rnd(-0.2, 0.2) })
    at += gap * rnd(0.85, 1.15)
    gap = Math.max(0.09, gap * 0.82)
  }
  crinkle({ t: t + dur * 0.6, n: 6, dur: dur * 0.35, gain: 0.03, f0: 3000, f1: 7000 })
}

// --- Fly Over Slime -----------------------------------------------------------------------------
// Training shot: the slingshot band snapping forward (a rubbery twang) plus a little sparkle.
export function twang(n = 1) {
  if (!limit('twang', 90) || !voice(0.3, 1)) return
  const t = now()
  const k = Math.min(1, 0.6 + Math.log10(n + 1) * 0.08)
  tone({ t, type: 'triangle', f: vary(260, 0.08), f2: 120, glide: 0.09, d: 0.11, gain: 0.12 * k, lp: 1800 })
  burst({ t, noise: 'pink', f: 1500, f2: 3800, q: 1.2, a: 0.004, d: 0.06, gain: 0.08 * k })
  modal({ t: t + 0.02, f: vary(2600, 0.05), modes: GLASS, gain: 0.025 * k, decay: 0.35, pan: rnd(-0.3, 0.3) })
}

// Launch from the Flying Zone: a big band snap, a boom and air ripping past.
export function launch() {
  if (!voice(1.6, 4)) return
  claim()
  const t = now()
  tone({ t, type: 'triangle', f: 180, f2: 70, glide: 0.18, d: 0.22, gain: 0.3, lp: 1500 })
  tone({ t, f: 70, f2: 34, d: 0.45, gain: 0.45 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 600, q: 0.6, a: 0.004, d: 0.35, gain: 0.35, verb: 0.2 })
  burst({ t: t + 0.03, noise: 'pink', f: 500, f2: 4200, q: 0.7, a: 0.12, d: 0.9, gain: 0.28 })
  glock(t + 0.05, [0, 7, 12, 19], 0.05, 0.08, 0.3)
  buzz([30, 30, 60])
}

// Wind while flying (k 0..1 = how fast): one short gust, called a few times a second.
export function gust(k = 0.5) {
  if (!limit('gust', 220) || !voice(0.5, 1)) return
  const t = now()
  burst({ t, noise: 'pink', f: rnd(500, 900), f2: rnd(1200, 2400), q: 0.6, a: 0.15, d: 0.3, gain: 0.05 + 0.07 * k, pan: rnd(-0.5, 0.5) })
}

// Drinking a boost potion: glass clink, glug glug, then a sparkly fizz rising.
export function drink() {
  if (!voice(1.4, 3)) return
  claim()
  const t = now()
  modal({ t, f: 2100, modes: GLASS, gain: 0.14, beat: 3, strike: 0.3, bus: A.ui })
  for (let i = 0; i < 4; i++) bubble({ t: t + 0.1 + i * 0.1 + rnd(0, 0.03), f: rnd(180, 360), d: 0.07, gain: 0.16, rise: 0.7, bus: A.ui })
  bubbles({ t: t + 0.5, n: COARSE_POINTER ? 10 : 20, dur: 0.6, f0: 1500, f1: 5200, gain: 0.03, bus: A.ui })
  glock(t + 0.55, [0, 4, 7, 12], 0.06, 0.1, 0.3, A.ui)
}

// Tab switch inside a window: a quick paper flick.
export function tab() {
  if (!limit('tab', 60) || !voice(0.15, 2)) return
  const t = now()
  burst({ t, noise: 'pink', f: 1800, f2: 3600, q: 1, a: 0.008, d: 0.05, gain: 0.14, bus: A.ui })
  modal({ t, f: vary(1500, 0.05), modes: PLASTIC, gain: 0.1, bus: A.ui })
}

// A title equipped: a little fanfare on the glockenspiel.
export function fanfare() {
  if (!voice(1, 3)) return
  claim()
  const t = now()
  glock(t, [0, 4, 7, 12, 7, 12], 0.07, 0.13, 0.3, A.ui)
}
