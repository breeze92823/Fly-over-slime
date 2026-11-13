// Bloxity emotes on a character (ours and the remote players'). A clip from the platform catalogue
// (bloxity.js emoteClips) is { len (s), loop, tracks: { boneName: [[t, xDeg, yDeg, zDeg], ...] } }:
// degree deltas over the bind pose, smoothstep-eased between keys, clamped outside them, looping
// clips wrap. Unknown bones are ignored. Applied AFTER the locomotion animator each frame, so it
// overrides only the bones the clip names, blended in over BLEND_IN s and out on stop.
import { Euler, Quaternion } from 'three'
import { BONE_INDEX } from './rig.js'

const BLEND_IN = 0.1
const BLEND_OUT = 0.15
const DEG = Math.PI / 180
const euler = new Euler(0, 0, 0, 'XYZ')
const delta = new Quaternion()
const target = new Quaternion()

// Remembers every named node's bind rotation (call on a freshly built character, before it animates).
export function captureBind(root) {
  if (!root) return
  root.traverse((o) => {
    if (o.name && !o.userData.bindQ) o.userData.bindQ = o.quaternion.clone()
  })
}

const ease = (s) => s * s * (3 - 2 * s)

// The clip's [x, y, z] degrees for one track at time t.
function sample(keys, t, out) {
  const n = keys.length
  if (!n) return false
  if (t <= keys[0][0] || n === 1) {
    out[0] = keys[0][1]
    out[1] = keys[0][2]
    out[2] = keys[0][3]
    return true
  }
  const last = keys[n - 1]
  if (t >= last[0]) {
    out[0] = last[1]
    out[1] = last[2]
    out[2] = last[3]
    return true
  }
  let i = 1
  while (i < n - 1 && keys[i][0] < t) i++
  const a = keys[i - 1]
  const b = keys[i]
  const s = ease((t - a[0]) / (b[0] - a[0] || 1))
  out[0] = a[1] + (b[1] - a[1]) * s
  out[1] = a[2] + (b[2] - a[2]) * s
  out[2] = a[3] + (b[3] - a[3]) * s
  return true
}

const xyz = [0, 0, 0]

export class EmotePlayer {
  constructor() {
    this.id = ''
    this.clip = null
    this.time = 0
    this.weight = 0
    this.stopping = false
  }

  get active() {
    return !!this.clip
  }

  // Starts `clip` (id kept for de-duplication), `elapsed` s in (a late joiner's catch-up).
  play(id, clip, elapsed = 0) {
    if (!clip?.tracks) return
    this.id = id
    this.clip = clip
    this.time = Math.max(0, elapsed)
    this.weight = elapsed > BLEND_IN ? 1 : 0
    this.stopping = false
  }

  stop() {
    if (this.clip) this.stopping = true
  }

  // Poses `root` (a character with `nodes` and captured bind rotations). Call after the animator.
  update(root, dt) {
    const clip = this.clip
    if (!clip || !root?.nodes) return
    this.time += dt
    const len = Math.max(0.01, Number(clip.len) || 0.01)
    if (!clip.loop && this.time >= len) this.stopping = true
    this.weight = this.stopping ? this.weight - dt / BLEND_OUT : Math.min(1, this.weight + dt / BLEND_IN)
    if (this.weight <= 0) {
      // Bones the locomotion animator never writes go back to their bind rotation.
      for (const bone in clip.tracks) {
        const node = root.nodes[bone]
        if (node?.userData.bindQ && !(bone in BONE_INDEX)) node.quaternion.copy(node.userData.bindQ)
      }
      this.clip = null
      this.id = ''
      return
    }
    const t = clip.loop ? this.time % len : Math.min(this.time, len)
    const w = ease(Math.min(1, this.weight))
    for (const bone in clip.tracks) {
      const node = root.nodes[bone]
      const bind = node?.userData.bindQ
      if (!bind || !sample(clip.tracks[bone], t, xyz)) continue
      euler.set(xyz[0] * DEG, xyz[1] * DEG, xyz[2] * DEG, 'XYZ')
      delta.setFromEuler(euler)
      target.copy(bind).multiply(delta)
      // Animator bones blend from this frame's locomotion pose; the rest from their bind pose.
      if (!(bone in BONE_INDEX)) node.quaternion.copy(bind)
      node.quaternion.slerp(target, w)
    }
  }
}
