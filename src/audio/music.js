// Background music: a small procedural loop (no files). A look-ahead scheduler
// queues one bar at a time on the music bus: a soft bass, a warm two-voice pad
// and a plucky arpeggio over I - V - vi - IV in C major. Cheap: ~10 voices a bar.
import { AUDIO } from '../config.js'
import { A, musicEnabled, onStart } from './core.js'
import { tone } from './synth.js'

const M = AUDIO.music
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12)
// [root, third, fifth] MIDI notes per bar of the progression.
const CHORDS = [
  [60, 64, 67],
  [55, 59, 62],
  [57, 60, 64],
  [53, 57, 60],
]
const ARP = [0, 1, 2, 1, 0, 2, 1, 2] // chord-tone index per eighth note
let nextBar = 0
let bar = 0
let timer = 0

function scheduleBar(t) {
  const beat = 60 / M.bpm
  const chord = CHORDS[bar % CHORDS.length]
  const bus = A.music
  // bass: root on 1 and 3
  for (const b of [0, 2]) tone({ t: t + b * beat, type: 'triangle', f: midi(chord[0] - 24), d: beat * 1.6, a: 0.01, gain: 0.22, bus, lp: 600 })
  // pad: third + fifth held for the bar
  for (const n of [chord[1], chord[2]]) tone({ t, type: 'sine', f: midi(n), a: 0.3, hold: beat * 2.6, d: beat * 1.2, gain: 0.05, bus })
  // pluck arpeggio an octave up, a sparkle on the last bar of the loop
  ARP.forEach((i, k) => {
    if (bar % 8 === 7 && k > 5) return
    tone({ t: t + (k * beat) / 2, type: 'triangle', f: midi(chord[i] + 12), d: beat * 0.45, a: 0.004, gain: 0.07, bus, lp: 3200 })
  })
  if (bar % 8 === 7) for (let k = 0; k < 4; k++) tone({ t: t + beat * 3 + k * beat * 0.12, type: 'sine', f: midi(chord[k % 3] + 24), d: 0.3, gain: 0.04, bus })
  bar++
}

function tick() {
  if (!A.ctx || A.ctx.state !== 'running' || !musicEnabled()) {
    if (A.ctx) nextBar = A.ctx.currentTime + 0.2
    return
  }
  const barLen = (60 / M.bpm) * 4
  if (nextBar < A.ctx.currentTime) nextBar = A.ctx.currentTime + 0.1
  while (nextBar < A.ctx.currentTime + barLen * 1.5) {
    scheduleBar(nextBar)
    nextBar += barLen
  }
}

export function startMusic() {
  onStart(() => {
    if (timer) return
    nextBar = A.ctx.currentTime + 0.6
    timer = setInterval(tick, 400)
  })
}
