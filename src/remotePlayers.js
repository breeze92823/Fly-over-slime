// Everyone else in the room, drawn in the world from the room state net.js keeps (net.players, backend
// PlayerState): the game's character in their Bloxity look (equipped items, proportions, skin), the
// same procedural animator as the local player (run / jump / land from `speed`, `vy`, `grounded`), the
// slingshot they hold (with the arm pull while they train), their flight tilt + trail, their equipped
// pets following them and their title + name over their head. Poses arrive ~10/s, so each remote is
// extrapolated along its last motion and eased toward that. Nothing here collides; with no server
// (or disconnected) the set is empty.
import { Group, Matrix4, Quaternion, Vector3 } from 'three'
import { NET } from './config.js'
import * as bloxity from './bloxity.js'
import { net, serverNow } from './net.js'
import { EmotePlayer, captureBind } from './avatar/emotes.js'
import { speechBubble } from './bubble.js'
import { petById, petLook, slingById, state, titleById, trailById } from './state.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'
import { animatePet, buildPet } from './petModels.js'
import { buildSlingshot, makeSign } from './props.js'
import { createTrail } from './trail.js'

const LABEL_Y = 2.75 // m over the feet
const PIVOT = new Vector3(0, 0.95, 0) // flight tilts about the waist (flight.js applyPose)
const MAX_EXTRAPOLATE = 0.3 // s of dead reckoning past the last pose
const HOLD_ARM = -1.25 // rad: right arm raised to hold the slingshot (game.js afterAnimator)

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const ease = (k, dt) => 1 - Math.exp(-k * dt)

function parseLook(json) {
  try {
    const look = json ? JSON.parse(json) : null
    return look && typeof look === 'object' && look.equipped && typeof look.equipped === 'object' ? look : null
  } catch {
    return null
  }
}

export function createRemotePlayers({ scene, onAvatar = () => {} }) {
  const group = new Group()
  scene.add(group)
  const remotes = new Map() // sessionId -> remote
  const goal = new Vector3()
  const tmp = new Vector3()
  const q = new Quaternion()
  const holdQ = new Quaternion()

  function add(id, p) {
    const root = new Group()
    root.rotation.order = 'YXZ' // yaw, then the flight somersault / bank (flight.js applyPose)
    const r = {
      id, root, avatar: null, animator: null, label: null, labelKey: '', look: null, gen: 0,
      held: null, heldStyle: '', armBinding: null, pull: 0,
      emote: new EmotePlayer(), emoteKey: '', bubble: null, uid: '',
      pets: [], petKey: '', petRoot: new Group(),
      trail: null, trailOn: false,
      pos: new Vector3(p.x, p.y, p.z), vel: new Vector3(), at: performance.now(), last: new Vector3(p.x, p.y, p.z),
      yaw: p.yaw, pitch: 0, roll: 0, speed: 0, state: p,
    }
    setAvatar(r, buildDefaultCharacter())
    group.add(root)
    scene.add(r.petRoot)
    remotes.set(id, r)
    return r
  }

  function remove(r) {
    r.gen++ // drop a look still loading
    group.remove(r.root)
    scene.remove(r.petRoot)
    disposeAnimator(r.animator)
    r.trail?.dispose()
    r.bubble?.remove?.()
    setLabel(r, null)
    remotes.delete(r.id)
  }

  function setAvatar(r, avatar) {
    if (r.avatar) r.root.remove(r.avatar)
    disposeAnimator(r.animator)
    captureBind(avatar) // emotes pose bones as deltas over the bind pose
    r.emote.stop()
    r.avatar = avatar
    r.root.add(avatar)
    r.animator = makeAnimator(avatar)
    r.held = null // the slingshot rides on the old rig's arm: rebuild it
    r.heldStyle = ''
    if (r.label) r.root.add(r.label)
  }

  // The player's look: the shared base rig dressed in their equipped Bloxity items ('' = default).
  async function loadLook(r, json) {
    const mine = ++r.gen
    const look = parseLook(json)
    const avatar = await loadBaseCharacter()
    if (mine !== r.gen) return
    if (look) {
      await attachEquippedAccessories(avatar, look.equipped, { skinTextureUrl: typeof look.skin === 'string' ? look.skin : null })
      if (mine !== r.gen) return
      applyProportions(avatar, look.proportions ?? null)
    }
    setAvatar(r, avatar)
    onAvatar()
  }

  function setLabel(r, lines) {
    if (r.label) {
      r.root.remove(r.label)
      r.label.material.map?.dispose()
      r.label.material.dispose()
      r.label = null
    }
    if (!lines) return
    r.label = makeSign(0.42)
    r.label.set(lines)
    r.label.position.set(0, LABEL_Y, 0)
    r.root.add(r.label)
  }

  // The held slingshot, solved once in the hold pose so it then follows the arm (same maths as
  // game.js attachSling, for this remote's rig).
  function attachSling(r, style) {
    if (r.held) r.held.parent?.remove(r.held)
    r.heldStyle = style
    r.held = buildSlingshot(style)
    const arm1 = r.avatar?.nodes?.ArmR1
    const arm2 = r.avatar?.nodes?.ArmR2
    r.armBinding = r.animator?.rig?.bindings?.find((b) => b.bone === arm1) ?? null
    if (arm1 && arm2 && r.armBinding) {
      r.animator.rig.resetToBindPose()
      r.armBinding.bone.quaternion.premultiply(holdQ.setFromAxisAngle(r.armBinding.axisX, HOLD_ARM))
      r.root.updateMatrixWorld(true)
      const inv = new Matrix4().copy(r.root.matrixWorld).invert()
      const m1 = new Matrix4().multiplyMatrices(inv, arm1.matrixWorld)
      const m2 = new Matrix4().multiplyMatrices(inv, arm2.matrixWorld)
      const p1 = new Vector3().setFromMatrixPosition(m1)
      const p2 = new Vector3().setFromMatrixPosition(m2)
      const hand = p2.clone().add(p2.clone().sub(p1).multiplyScalar(0.95))
      const desired = new Matrix4().compose(hand.add(new Vector3(0, -0.25, 0.05)), new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.25), new Vector3(0.48, 0.48, 0.48))
      r.held.matrixAutoUpdate = false
      r.held.matrix.copy(m2).invert().multiply(desired)
      arm2.add(r.held)
    } else {
      r.held.position.set(0.45, 0.75, 0.45)
      r.held.scale.setScalar(0.48)
      r.root.add(r.held)
    }
  }

  // "id,id:g,id:d" -> pet models following the player.
  function syncPets(r, key) {
    if (key === r.petKey) return
    r.petKey = key
    for (const pm of r.pets) r.petRoot.remove(pm.mesh)
    r.pets = key
      .split(',')
      .filter(Boolean)
      .map((entry) => {
        const [id, tier = ''] = entry.split(':')
        if (!petById(id)) return null
        const mesh = buildPet(petLook(id, tier))
        mesh.scale.setScalar(1.05)
        mesh.position.copy(r.pos)
        r.petRoot.add(mesh)
        return { mesh, pos: r.pos.clone(), wings: !!petById(id)?.look?.wings }
      })
      .filter(Boolean)
  }

  // A new emote id / start time from the roster: start it where it should be by now.
  async function syncEmote(r, id, at) {
    const key = `${id}@${at}`
    if (key === r.emoteKey) return
    r.emoteKey = key
    if (!id) return r.emote.stop()
    const clip = (await bloxity.emoteClips()).get(id)
    if (!clip || r.emoteKey !== key) return // an id this client can't play: ignore quietly
    r.emote.play(id, clip, Math.max(0, (serverNow() - at) / 1000))
  }

  // Bloxity chat: a bubble over the remote player who said it (ours is main.js's).
  bloxity.onChat((m) => {
    if (m.isLocalPlayer || !m.userId) return
    const uid = m.userId.split('#')[0]
    for (const r of remotes.values()) {
      if (!r.uid || r.uid !== uid) continue
      r.bubble?.remove?.()
      r.bubble = speechBubble(r.root, m.text, LABEL_Y + 0.15)
      return
    }
  })

  let synced = false // the first roster read only lists who was already here
  function sync() {
    const players = net.connected ? net.players : null
    for (const r of [...remotes.values()]) if (!players?.has(r.id) || r.id === net.sessionId) remove(r)
    players?.forEach((p, id) => {
      if (id === net.sessionId) return
      let r = remotes.get(id)
      if (!r) {
        r = add(id, p)
        if (synced) bloxity.playerJoined(p.username) // someone arrived after us
      }
      r.state = p
      r.uid = p.uid
      const title = p.title ? titleById(p.title) : null
      const name = p.username || 'Player'
      const key = `${title?.id ?? ''}|${name}`
      if (key !== r.labelKey) {
        r.labelKey = key
        setLabel(r, title ? [{ text: title.name, color: title.color, size: 1 }, { text: name, size: 0.75 }] : [{ text: name, size: 0.75 }])
      }
      if (p.avatar !== r.look) {
        r.look = p.avatar
        loadLook(r, p.avatar).catch((err) => console.warn('[remotePlayers] look failed', err))
      }
      syncPets(r, p.pets)
      syncEmote(r, p.emote, p.emoteAt)
    })
    if (players) synced = true
  }

  function update(dt, t) {
    sync()
    const now = performance.now()
    for (const r of remotes.values()) {
      const p = r.state
      // New pose since the last frame? Learn its velocity (for dead reckoning).
      goal.set(p.x, p.y, p.z)
      if (goal.distanceToSquared(r.last) > 1e-6) {
        const since = Math.max(0.03, (now - r.at) / 1000)
        r.vel.copy(goal).sub(r.last).divideScalar(since)
        if (r.vel.length() > 400) r.vel.set(0, 0, 0) // a teleport, not a speed
        r.last.copy(goal)
        r.at = now
      }
      const age = Math.min(MAX_EXTRAPOLATE, (now - r.at) / 1000)
      if (age > 0.2) r.vel.multiplyScalar(Math.exp(-6 * dt)) // standing still: stop extrapolating
      goal.addScaledVector(r.vel, age)
      if (r.pos.distanceTo(goal) > NET.snap) r.pos.copy(goal)
      else r.pos.lerp(goal, ease(NET.follow, dt))
      const k = ease(NET.follow, dt)
      r.yaw += wrap(p.yaw - r.yaw) * k
      r.pitch += (p.pitch - r.pitch) * k
      r.roll += (p.roll - r.roll) * k

      const flying = p.flying
      r.speed += (p.speed - r.speed) * ease(8, dt)
      r.animator?.update(dt, { grounded: flying ? false : p.grounded, speed: flying ? 0 : r.speed, verticalVelocity: flying ? 6 : p.vy, turn: 0 })

      // Emotes stop on movement, like our own.
      if (r.emote.active && (p.speed > 0.6 || flying || !p.grounded)) r.emote.stop()

      // The held slingshot, and the arm that holds it (raised, pulled back while they train).
      const style = slingById(p.sling)?.style ?? ''
      if (style && style !== r.heldStyle && r.avatar) attachSling(r, style)
      else if (!style && r.held) {
        r.held.parent?.remove(r.held)
        r.held = null
        r.heldStyle = ''
      }
      if (r.held) r.held.visible = !flying
      r.pull += ((p.training ? 0.5 + 0.5 * Math.sin(t * 14) : 0) - r.pull) * ease(18, dt)
      if (r.armBinding && !flying) r.armBinding.bone.quaternion.premultiply(holdQ.setFromAxisAngle(r.armBinding.axisX, HOLD_ARM + r.pull * 0.5))

      r.emote.update(r.avatar, dt)

      // Place the body: yaw, then the flight tilt about the waist.
      r.root.position.copy(r.pos)
      r.root.rotation.set(flying ? r.pitch : 0, r.yaw, flying ? r.roll : 0)
      if (flying) {
        q.setFromEuler(r.root.rotation)
        tmp.copy(PIVOT).applyQuaternion(q)
        r.root.position.add(PIVOT).sub(tmp)
      }

      // The flight trail follows a flying player who has one equipped.
      const trail = flying && p.trail ? trailById(p.trail) : null
      if (trail && !r.trailOn) {
        r.trail ??= createTrail(scene)
        r.trail.setColors(trail.colors)
        r.trail.start(tmp.set(r.pos.x, r.pos.y + 1, r.pos.z))
        r.trailOn = true
      } else if (!trail && r.trailOn) {
        r.trail?.stop()
        r.trailOn = false
      }
      r.trail?.update(dt, tmp.set(r.pos.x, r.pos.y + 0.9, r.pos.z), 0.26, t)

      // Pets follow behind (like the local player's, game.js updatePets); Settings > Hide All Pets hides them.
      r.petRoot.visible = !state.settings.hidePets
      const n = r.pets.length
      r.pets.forEach((pm, i) => {
        const spread = (i - (n - 1) / 2) * 1.8
        const back = 2.4 + Math.abs(spread) * 0.3
        const bx = r.pos.x - Math.sin(r.yaw) * back + Math.cos(r.yaw) * spread
        const bz = r.pos.z - Math.cos(r.yaw) * back - Math.sin(r.yaw) * spread
        const by = r.pos.y + (pm.wings ? 1.2 : 0) + Math.abs(Math.sin(t * 6 + i)) * (flying ? 0 : 0.25)
        tmp.set(bx, by, bz)
        if (pm.pos.distanceToSquared(tmp) > 60 * 60) pm.pos.copy(tmp)
        pm.pos.lerp(tmp, ease(flying ? 14 : 7, dt))
        pm.mesh.position.copy(pm.pos)
        pm.mesh.rotation.y = r.yaw
        animatePet(pm.mesh, t + i, true)
      })
    }
  }

  return {
    group,
    update,
    get count() {
      return remotes.size
    },
  }
}
