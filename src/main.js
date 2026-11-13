import { ACESFilmicToneMapping, Clock, Group, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three'
import { CAMERA, graphicsPreset, RENDER } from './config.js'
import * as bloxity from './bloxity.js'
import { install as installInput, onKey } from './input.js'
import { installTouch } from './touch.js'
import { createPlayerBody, interpolate as interpolatePlayer, player, resetPlayer, respawn } from './player.js'
import { setCameraSensitivity, syncYawToPlayer, update as updateCamera } from './camera.js'
import { onModeChanged, toggleMode } from './modes.js'
import { bodyCount, initPhysics, stepPhysics } from './physics.js'
import { createLighting } from './lighting.js'
import { buildGround, createWorld } from './world.js'
import { createPostFx } from './postfx.js'
import { setNeonBloom } from './propkit.js'
import { createFx } from './fx.js'
import { buildProps } from './props.js'
import { createHud } from './hud.js'
import { createGame } from './game.js'
import { installAudio, setAdMuted, setMusicLevel, setVolume } from './audio/index.js'
import { onChange, state } from './state.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'
import { initNet, net, onNet, sendEmote, sendPose } from './net.js'
import { EmotePlayer, captureBind } from './avatar/emotes.js'
import { speechBubble } from './bubble.js'
import { createRemotePlayers } from './remotePlayers.js'

// Boot order: Bloxity SDK -> renderer -> Rapier (async wasm) -> ground + sky + lighting,
// player body -> avatar (async, swaps in when ready) -> loop. The SDK is optional at every step.
let lighting = null
let renderer = null
let postfx = null
let fx = null
let game = null

// Settings come from the portal's settings menu (or their defaults offline).
function applySetting(key, value) {
  if (key === 'camera_sensitivity') setCameraSensitivity(value)
  else if (key === 'fullscreen') bloxity.requestFullscreen(value)
  else if (key === 'master_volume') setVolume(value / 100)
  else if (key === 'music_volume') setMusicLevel(value / 100)
  else if (key === 'graphics_quality' && renderer) {
    const next = graphicsPreset(value)
    renderer.shadowMap.enabled = next.shadows
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr))
    lighting?.setShadows(next)
    postfx?.configure(next)
    setNeonBloom(next.bloom)
    fx?.setQuality(next.particles)
    postfx?.setSize(window.innerWidth, window.innerHeight)
  }
}
bloxity.onSetting(applySetting)
bloxity.init()
installAudio() // synthesised sfx + music; starts on the first gesture

// --- Renderer ---------------------------------------------------------------
const preset = graphicsPreset(bloxity.settings.graphics_quality)
renderer = new WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' })
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = RENDER.exposure
renderer.shadowMap.enabled = preset.shadows
renderer.shadowMap.type = PCFSoftShadowMap
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.dpr))
document.body.appendChild(renderer.domElement)
installInput(() => bloxity.showMenu(), renderer.domElement) // Esc opens the portal menu

const scene = new Scene()
const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
postfx = createPostFx(renderer, scene, camera)
postfx.configure(preset)

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  postfx.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
}
window.addEventListener('resize', resize)
resize()

for (const key of Object.keys(bloxity.settings)) applySetting(key, bloxity.settings[key])

// --- Physics + ground + sky --------------------------------------------------
bloxity.loadingStep('Starting physics')
await initPhysics()

lighting = createLighting(scene, renderer, preset)
bloxity.loadingStep('Building the lobby')
fx = createFx(scene)
fx.setQuality(preset.particles)
const world = createWorld(scene) // slime river, clouds, distance signs
buildGround(scene) // plaza, terraces, cliffs, trees + colliders
const props = buildProps(scene, fx)
createPlayerBody()
syncYawToPlayer()

// HUD first (it needs the action table), then the game that fills it in.
const hud = createHud(new Proxy({}, { get: (_, key) => game?.actions[key] }))

// --- Player avatar ----------------------------------------------------------
// The Bloxity base rig (player.glb; procedural fallback if it fails), dressed
// with the signed-in player's equipped cosmetics and body proportions. It
// rebuilds on customizer edits and sign-in/out.
const playerGroup = new Group()
scene.add(playerGroup)
let avatar = null
let animator = null
let generation = 0
let avatarReady = false

const emote = new EmotePlayer() // the Bloxity emote we are playing (portal emote wheel)
let emoting = false // we told the room an emote is running

function setAvatar(next) {
  if (avatar) playerGroup.remove(avatar)
  disposeAnimator(animator)
  captureBind(next) // emotes pose bones as deltas over the bind pose
  emote.stop()
  avatar = next
  playerGroup.add(avatar)
  animator = makeAnimator(avatar)
  game?.setAvatar(playerGroup, avatar, animator)
}

setAvatar(buildDefaultCharacter()) // visible immediately; replaced once the rig loads
game = createGame({ scene, camera, fx, props, hud })
game.setAvatar(playerGroup, avatar, animator)
hud.update()
onChange(() => hud.update())

// --- Multiplayer + saving (net.js, remotePlayers.js) -------------------------
// The other players in the room, and this player's pose for them: position, heading, animation state
// (speed / vertical speed / grounded), the flight tilt and whether they are pulling the slingshot.
const remotes = createRemotePlayers({ scene })
function currentPose() {
  const p = player.renderPosition
  const flying = game.isFlying()
  const tilt = flying ? game.flight.pose() : null
  return {
    x: p.x,
    y: p.y,
    z: p.z,
    yaw: player.facing + (tilt?.spin ?? 0),
    speed: flying ? 0 : Math.hypot(player.velocity.x, player.velocity.z),
    vy: player.velocity.y,
    grounded: player.grounded,
    flying,
    pitch: tilt?.pitch ?? 0,
    roll: tilt?.roll ?? 0,
    training: game.isTraining(),
  }
}
onNet('hydrated', () => game.resync()) // the server's save replaced the local one
onNet('leaderboard', (msg) => game.setBoards(msg))
initNet({ pose: currentPose })

async function loadAvatar() {
  // The SDK fires twice per change (optimistic + confirmed); only the newest load may land.
  const mine = ++generation
  try {
    const group = await loadBaseCharacter()
    if (mine !== generation) return
    const equipped = bloxity.authState.user ? bloxity.getEquippedAvatar() : null
    await attachEquippedAccessories(group, equipped, { skinTextureUrl: bloxity.getSkinTextureUrl() })
    if (mine !== generation) return
    applyProportions(group, bloxity.authState.user ? bloxity.getProportions() : null)
    setAvatar(group)
  } finally {
    if (mine === generation) avatarReady = true
  }
}

let signedIn = null
bloxity.subscribeAuth((s) => {
  const now = !!s.user
  if (now !== signedIn) {
    signedIn = now
    loadAvatar() // also runs once at start to swap in the real rig
  }
})
bloxity.onAvatarChanged(loadAvatar)
bloxity.onProportionsChanged(() => applyProportions(avatar, bloxity.getProportions()))
bloxity.onRespawnRequest(respawn)

// Emotes from the portal's emote wheel: played on our avatar (standing still, not flying) and relayed.
bloxity.onEmote(async (id) => {
  if (game.isFlying()) return
  const clip = (await bloxity.emoteClips()).get(id)
  if (!clip) return // unknown ids are ignored quietly
  emote.play(id, clip)
  emoting = true
  sendEmote(id)
})
// Chat: our own message as a bubble over our head (the others' in remotePlayers.js).
let myBubble = null
bloxity.onChat((m) => {
  if (!m.isLocalPlayer) return
  myBubble?.remove?.()
  myBubble = speechBubble(playerGroup, m.text, 2.9)
})

// --- Modes + keys --------------------------------------------------------------
onModeChanged((mode) => {
  playerGroup.visible = mode !== 'player' // first person: you are the camera
})
onKey('KeyV', toggleMode)
onKey('KeyN', () => lighting.toggleDayNight())
onKey('KeyR', () => {
  if (!game?.eggs.near()) respawn() // at an egg, R is Open Max (eggs.js)
})
installTouch({ mode: toggleMode, day: () => lighting.toggleDayNight(), respawn })

// --- Loop -------------------------------------------------------------------
const clock = new Clock()
let shownLoading = true
let readySince = 0

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1) // clamp huge frames (tab switch, breakpoint)
  const elapsed = clock.elapsedTime

  game.update(dt, elapsed)
  stepPhysics(dt) // runs the player controller (or the flight) at the fixed rate, interpolates bodies
  interpolatePlayer()

  const p = player.renderPosition
  playerGroup.position.set(p.x, p.y, p.z)
  playerGroup.rotation.y = player.facing
  const flying = game.isFlying()
  animator?.update(dt, {
    grounded: player.grounded,
    speed: flying ? 0 : Math.hypot(player.velocity.x, player.velocity.z),
    verticalVelocity: flying ? 6 : player.velocity.y,
    turn: 0,
  })
  game.afterAnimator()
  // An emote plays over the idle pose and stops as soon as we move, jump or fly.
  if (emoting) {
    if (flying || !player.grounded || Math.hypot(player.velocity.x, player.velocity.z) > 0.6) emote.stop()
    if (!emote.active || emote.stopping) {
      emoting = false
      sendEmote('')
    }
  }
  emote.update(avatar, dt)
  sendPose(currentPose())
  remotes.update(dt, elapsed)

  updateCamera(camera, dt)
  world.update(dt, elapsed, camera)
  props.update(dt, elapsed)
  fx.update(dt, camera, renderer.domElement.clientHeight * renderer.getPixelRatio())
  lighting.update(dt, playerGroup.position)
  postfx.render()

  // Loading ends once the scene has drawn and the avatar has had its chance (max ~5 s).
  if (shownLoading) {
    readySince += dt
    if (avatarReady || readySince > 5) {
      shownLoading = false
      bloxity.notifyFirstFrame()
    }
  }
}
renderer.setAnimationLoop(frame)

// Ad breaks: the loop stops and the sound mutes until the break ends (Bloxity rule).
bloxity.onAdBreak((on) => {
  setAdMuted(on)
  if (on) renderer.setAnimationLoop(null)
  else {
    clock.getDelta() // don't count the break as one huge frame
    renderer.setAnimationLoop(frame)
  }
})

window.addEventListener('beforeunload', bloxity.teardown)

// Dev-only console hook, e.g. __game.teleport(-24, 0, 6, Math.PI / 2)
if (import.meta.env.DEV) {
  const teleport = (x, y, z, facing = player.facing) => {
    resetPlayer({ x, y, z }, facing)
    syncYawToPlayer()
  }
  window.__game = { player, scene, renderer, camera, postfx, bodies: bodyCount, toggleMode, teleport, state, game, hud, net, remotes }
}
