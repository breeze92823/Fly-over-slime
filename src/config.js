// Every tunable constant lives here; the rest of src/ holds no theme values.

// --- Identity -------------------------------------------------------------
export const GAME_SLUG = 'fly-over-slime' // slug registered on bloxity.io
export const GAME_TITLE = 'Fly Over Slime'

// Forces the Bloxity SDK and avatar CDN to be treated as unavailable (see .env.example).
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// --- World (metres: +X east, +Z south, +Y up) -------------------------------
export const GROUND_Y = 0
// The lobby (world.js): a lego-stud plaza ringed by terraced checkered cliffs.
// North (-Z) is the Flying Zone strip and the long slime channel beyond it.
export const STUD = 0.75 // m per lego stud
export const CHECKER = 3 // m per green checker square (4 studs)
export const PLAZA = { minX: -48, maxX: 48, minZ: -46, maxZ: 54 }
export const FLY_ZONE = { minX: -30, maxX: 30, minZ: -46, maxZ: -38 } // walk in here = launch
export const CHANNEL = { halfWidth: 30, slimeY: -2.2, length: 3200 } // slime river, from z = PLAZA.minZ north
export const SPAWN = { x: 0, y: 0.05, z: 8 }
export const SPAWN_FACING = Math.PI // yaw the character faces on spawn (PI = toward -Z)

// --- Player modes (modes.js) -------------------------------------------------
// 'character' = third-person chase cam with the avatar on screen.
// 'player' = first-person, the camera is the player's eyes and the avatar is hidden.
export const MODES = ['character', 'player']
export const START_MODE = 'character'

// --- Physics (physics.js, player.js) ------------------------------------------
export const PHYSICS = {
  gravity: -22, // m/s^2 for dynamic bodies and the player
  fixedStep: 1 / 60, // s per physics tick; rendering interpolates between ticks
  maxSubSteps: 5, // a long frame never runs more ticks than this
  walkSpeed: 8, // m/s
  sprintSpeed: 14, // m/s with Shift held
  accel: 70, // m/s^2 toward the target velocity on the ground
  airAccel: 22, // m/s^2 steering while airborne
  decel: 60, // m/s^2 when no key is held
  turnSpeed: 12, // rad/s the body turns toward its heading
  jumpSpeed: 8.5, // m/s
  coyoteTime: 0.1, // s after leaving a ledge a jump still counts
  jumpBuffer: 0.12, // s a jump pressed before landing is remembered
  stepHeight: 0.8, // m autostep (one lego terrace step is 0.75)
  maxSlope: 50, // degrees the player can walk up
  snapToGround: 0.4, // m the controller stays glued to downward steps and slopes
  pushMass: 80, // kg the character weighs when shoving crates
  killY: -6, // sank this far: respawn
}
export const PLAYER_DIMS = { radius: 0.75, height: 1.8 } // capsule the character controller moves

// --- Look ------------------------------------------------------------------
export const RENDER = { exposure: 1.0 }
export const FOG = { near: 160, far: 900 }
// The two lighting moods lighting.js blends between (key N toggles).
export const TIME_OF_DAY = {
  transition: 2.5, // s to blend day <-> night
  day: {
    zenith: '#0f8cf5',
    horizon: '#cfeeff',
    sunColor: '#fff6e6',
    // Bright toy-like daylight: saturated lime and grey plastic, soft shadows.
    sunIntensity: 2.6,
    sunElevation: 58, // degrees above the horizon
    sunAzimuth: 25, // degrees, 0 = from +Z
    hemiSky: '#eaf6ff',
    hemiGround: '#9adf7a',
    hemiIntensity: 1.0,
    envIntensity: 0.5,
    lampIntensity: 0,
    stars: 0,
    exposure: 1.0,
  },
  night: {
    zenith: '#050b22',
    horizon: '#24345e',
    sunColor: '#9fb4ff', // the moon
    sunIntensity: 0.55,
    sunElevation: 38,
    sunAzimuth: -60,
    hemiSky: '#3a4c80',
    hemiGround: '#1a1a22',
    hemiIntensity: 0.35,
    envIntensity: 0.25,
    lampIntensity: 30,
    stars: 1,
    exposure: 1.15,
  },
}
export const LIGHT = {
  shadowRange: 40, // half-width of the sun's shadow box around the player
  lampColor: '#ffb35c',
  lampDistance: 22,
}

// Default (fallback) character look, used only when player.glb cannot load.
export const CHARACTER_COLORS = { skin: '#f2c79a', suit: '#2f6fd0', hair: '#4a2f1c' }

export const MATERIAL_PBR = {
  PLAYER: { roughness: 0.7, metalness: 0 },
  GROUND: { roughness: 0.95, metalness: 0 },
}

// --- Graphics presets, picked by the Bloxity graphics_quality setting ----------
export const GRAPHICS_PRESETS = {
  Low: { shadows: false, shadowMap: 512, antialias: false, dpr: 1, bloom: false, particles: 0.35 },
  Medium: { shadows: true, shadowMap: 1024, antialias: false, dpr: 1.25, bloom: false, particles: 0.6 },
  High: { shadows: true, shadowMap: 2048, antialias: true, dpr: 2, bloom: true, particles: 1 },
  Ultra: { shadows: true, shadowMap: 4096, antialias: true, dpr: 2, bloom: true, particles: 1 },
}

// Bloom (postfx.js): only HDR-bright pixels (above threshold, linear, before
// tone mapping) glow: neon rails, waterfall, VIP gate, particles. Sunlit sand
// stays under the threshold.
export const BLOOM = { strength: 0.6, radius: 0.35, threshold: 2.0 }
// Neon materials (propkit.js): k = HDR colour multiplier with bloom on; with
// bloom off they are capped at plainMax so they stay coloured, not white.
export const NEON = { k: 3.5, plainMax: 1.2 }

// Phones and tablets default to a lighter preset when the portal sends no value,
// and any preset is capped there (a phone at DPR 3 renders 9x the pixels; bloom
// is a full-screen multi-pass blur, so it stays off on phones).
export const COARSE_POINTER = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
export const DEFAULT_GRAPHICS = COARSE_POINTER ? 'Medium' : 'High'
export const MOBILE_GRAPHICS_CAP = { dpr: 1.5, shadowMap: 1024, particles: 0.6 }

// The preset to render with on this device.
export function graphicsPreset(name) {
  const p = GRAPHICS_PRESETS[name] ?? GRAPHICS_PRESETS[DEFAULT_GRAPHICS]
  if (!COARSE_POINTER) return p
  const cap = MOBILE_GRAPHICS_CAP
  return { ...p, dpr: Math.min(p.dpr, cap.dpr), shadowMap: Math.min(p.shadowMap, cap.shadowMap), bloom: false, particles: Math.min(p.particles, cap.particles) }
}

// --- Touch controls (touch.js) --------------------------------------------------
export const TOUCH = {
  deadZone: 0.12, // fraction of the joystick radius that does nothing
  lookScale: 1.5, // touch drag pixels -> look, relative to a mouse pixel
  pinchPixelsPerNotch: 30, // finger spread change that equals one wheel notch
}

// --- Camera (camera.js) -------------------------------------------------------
export const CAMERA = {
  fov: 70,
  near: 0.1,
  far: 1200,
  startPitch: 0.14, // radians above the horizon (low chase cam)
  minPitch: -0.35,
  maxPitch: 1.25,
  firstPersonPitch: 1.45, // |pitch| limit looking up/down in player mode
  eyeHeight: 0.92, // eye height as a fraction of player height (player mode)
  distance: 12.4, // resting boom length, m
  minDistance: 2.5, // wheel in past this enters player mode
  maxDistance: 26,
  followLerp: 14, // 1/s: the one smoothing stage, on the point the camera follows
  targetHeight: 1.2, // look-at point as a fraction of player height
  lookSensitivity: 0.0026, // rad per pixel of mouse movement
  zoomStep: 0.9, // m per wheel notch
  zoomEase: 12, // 1/s the zoom glides to its target
  speedFov: 6, // degrees the FOV widens at sprint speed
  speedEase: 3, // 1/s the speed framing eases in and out
  clearEase: 6, // 1/s the boom eases back out once a wall stops blocking it
  // While flying (flight.js drives the phase): boom length, pitch (+ = looking down),
  // follow rate, ease rate and FOV added at full speed. aim = sitting in the slingshot.
  flight: {
    aim: { distance: 9.5, pitch: 0.16, follow: 10 },
    air: { distance: 13, pitch: -0.1, follow: 22 },
    skip: { distance: 15, pitch: 0.26, follow: 12 },
    rest: { distance: 13, pitch: 0.34, follow: 8 },
    ease: 3,
    fov: 16,
    fovSpeed: 90, // m/s that reads as full speed
  },
}

// --- Bloxity (bloxity.js, avatar/) -------------------------------------------------
// SDK setting keys this game listens for; registering a listener makes the control
// appear in the portal's settings menu.
export const SETTINGS = {
  graphics_quality: { def: DEFAULT_GRAPHICS, type: 'enum', values: ['Low', 'Medium', 'High', 'Ultra'] },
  camera_sensitivity: { def: '1', type: 'number', min: 0.1, max: 5 },
  show_fps: { def: 'false', type: 'bool' },
  fullscreen: { def: 'false', type: 'bool' },
  master_volume: { def: '80', type: 'number', min: 0, max: 100 },
  music_volume: { def: '80', type: 'number', min: 0, max: 100 },
}

// The base rig, measured from player.glb: origin at the feet, 6.4 units tall at bind pose.
export const RIG_HEIGHT = 6.4
// Bind-pose values of the rig nodes the SDK proportions drive.
export const RIG = { armOffsetX: 2, legOffsetX: 0.6, neckOffsetY: 0.6 }
// getProportions() ranges, straight from the SDK spec; clamped before they reach the scene graph.
export const PROPORTIONS = {
  height: { def: 1, min: 0.5, max: 1.6 },
  shoulderWidth: { def: 1, min: 0.5, max: 1.5 },
  armLength: { def: 1, min: 0.05, max: 3 },
  legOffsetX: { def: 1, min: -0.7, max: 5 },
  torsoScaleX: { def: 1, min: 0.3, max: 2 },
  neckHeight: { def: 1, min: 0.94, max: 1.2 },
  headScale: { def: 1, min: 0.3, max: 2.6 },
}

// Procedural animation (avatar/animator.js), ported from Clean Leaves for Loot.
// Rotations are radians in CHARACTER space: +X swings a limb backward, +Y yaws, +Z rolls.
const deg = (d) => (d * Math.PI) / 180
export const ANIM = {
  airborneDelay: 0.07, // s off the ground before the air pose (ignores a step down a ledge)
  // Walk -> run is one cycle at two depths; phase advances with distance travelled.
  locomotion: {
    minFrequency: 0.7,
    maxFrequency: 3.6,
    strideDistance: 3.8, // m per cycle
    idleSpeed: 0.6,
    walkSpeed: 2.5,
    runSpeed: 8,
    sprintSpeed: 13,
    hipSwing: { walk: deg(22), run: deg(42), sprint: deg(56) },
    kneeBend: { walk: deg(30), run: deg(58), sprint: deg(72) },
    armSwing: { walk: deg(18), run: deg(36), sprint: deg(52) },
    elbowBend: { walk: deg(14), run: deg(44), sprint: deg(70) },
    torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(9) },
    torsoLean: { walk: deg(3), run: deg(10), sprint: deg(18) },
    headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(5) },
    torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(3) },
    bob: { walk: 0.03, run: 0.07, sprint: 0.09 }, // m, on the avatar root
    bankAngle: deg(9),
    bankRate: 8,
  },
  idle: {
    breathFrequency: 0.35,
    breathAmount: deg(1.8),
    breathBob: 0.007,
    basePose: {
      ArmL1: { x: deg(-4), z: deg(8) },
      ArmL2: { x: deg(12) },
      ArmR1: { x: deg(-4), z: deg(-8) },
      ArmR2: { x: deg(12) },
      LegL1: { x: deg(-4) },
      LegR1: { x: deg(4) },
    },
  },
  airborne: {
    rise: {
      LegL1: { x: deg(-38) }, LegR1: { x: deg(8) }, LegL2: { x: deg(62) }, LegR2: { x: deg(40) },
      ArmL1: { x: deg(-40), z: deg(34) }, ArmR1: { x: deg(-30), z: deg(-34) },
      ArmL2: { x: deg(30) }, ArmR2: { x: deg(30) }, Spine1: { x: deg(6) },
    },
    fall: {
      LegL1: { x: deg(-14) }, LegR1: { x: deg(10) }, LegL2: { x: deg(22) }, LegR2: { x: deg(18) },
      ArmL1: { x: deg(-70), z: deg(40) }, ArmR1: { x: deg(-60), z: deg(-40) },
      ArmL2: { x: deg(20) }, ArmR2: { x: deg(20) }, Spine1: { x: deg(-4) },
    },
    velocityReference: 8, // m/s vertical speed that reads as fully rising / falling
  },
  landing: {
    duration: 0.16,
    pose: {
      LegL1: { x: deg(-34) }, LegR1: { x: deg(-34) }, LegL2: { x: deg(58) }, LegR2: { x: deg(58) },
      ArmL1: { x: deg(-18), z: deg(20) }, ArmR1: { x: deg(-18), z: deg(-20) }, Spine1: { x: deg(14) },
    },
    bobY: -0.2,
  },
  transitions: { toLocomotion: 0.14, toAirborne: 0.12, toLanding: 0.06 }, // s to blend a pose change
}

// --- Audio (src/audio/) ---------------------------------------------------------------
// Everything is synthesised at runtime (no sound files). Sound Effects / Music are
// switched in the in-game Settings window (state.settings).
export const AUDIO = {
  volume: 0.8,
  storageKey: 'fly-over-slime.sound',
  buses: { ui: 0.8, sfx: 0.9, amb: 0.55, engine: 0.5, music: 0.55 }, // per-bus levels before the master
  duck: 0.45, // world (music) level while a window is open
  maxVoices: 48,
  maxVoicesTouch: 24,
  latency: 0.04,
  latencyTouch: 0.07,
  lead: 0.02,
  reverb: { seconds: 1.8, preDelay: 0.012, early: [[19, 0.5], [31, 0.35], [47, 0.28], [73, 0.2], [97, 0.12]], decay: 1.4, tail: 0.18, darken: 1.6, send: 0.9 },
  music: { bpm: 104 },
}

export const FONT_FAMILY = 'Fredoka'

export function clamp(n, min, max) {
  return n < min ? min : n > max ? max : n
}

// Coerce one raw SDK string against its SETTINGS entry.
export function coerceSetting(key, raw) {
  const spec = SETTINGS[key]
  if (!spec) return raw
  const value = raw === '' || raw == null ? spec.def : raw
  if (spec.type === 'bool') return value === 'true' || value === true
  if (spec.type === 'enum') return spec.values.includes(value) ? value : spec.def
  const n = Number(value)
  return clamp(Number.isFinite(n) ? n : Number(spec.def), spec.min, spec.max)
}

// =============================================================================
// GAME DATA. Every price is in Wins (or Race Tokens): nothing is ever sold for
// premium currency (project rule, see CLAUDE.md).
// =============================================================================
export const SAVE_KEY = 'fly-over-slime-save-v1'

// Game server (../Fly-over-slime-backend, Colyseus room "world"): progress save + other players.
// `npm run dev` defaults to ws://localhost:2567; `npm run build` uses _MAIN. Leave a URL empty to let
// the Bloxity SDK resolve that channel's endpoint at runtime; with neither the game runs solo (net.js).
const SERVER_URL_DEV = import.meta.env.VITE_SERVER_URL_DEV || (import.meta.env.DEV ? 'ws://localhost:2567' : '')
const SERVER_URL_MAIN = import.meta.env.VITE_SERVER_URL_MAIN || ''
export const SERVER_URL = import.meta.env.MODE === 'production' ? SERVER_URL_MAIN : SERVER_URL_DEV
export const NET = {
  saveDebounce: 3, // s of quiet after a change before saving
  saveMaxWait: 10, // s: a stream of changes (training clicks) still saves this often
  saveEvery: 20, // s: periodic save, so playtime and boost timers persist too
  retry: 8, // s between connection attempts while the server is unreachable
  poseEvery: 0.1, // s between `pose` messages
  snap: 40, // m: a remote that jumps further than this is teleported, not eased
  follow: 12, // 1/s: how fast a remote eases toward its (extrapolated) pose
}

// Slingshots on the west terrace. skill = Skill gained per training click.
// row 0 = lower front row (south -> north), row 1 = upper back row.
export const SLINGSHOTS = [
  { id: 'twig', name: 'Twig Slingshot', skill: 1, price: 0, style: 'twig', row: 0 },
  { id: 'wrap', name: 'Wrapped Slingshot', skill: 3, price: 2, style: 'wrap', row: 0 },
  { id: 'ember', name: 'Ember Slingshot', skill: 5, price: 10, style: 'ember', row: 0 },
  { id: 'steel', name: 'Steel Slingshot', skill: 12, price: 40, style: 'steel', row: 0 },
  { id: 'royal', name: 'Royal Slingshot', skill: 30, price: 150, style: 'royal', row: 0 },
  { id: 'vine', name: 'Vine Slingshot', skill: 75, price: 500, style: 'vine', row: 1 },
  { id: 'frost', name: 'Frost Slingshot', skill: 200, price: 1500, style: 'frost', row: 1 },
  { id: 'shadow', name: 'Shadow Slingshot', skill: 500, price: 4500, style: 'shadow', row: 1 },
  { id: 'sun', name: 'Sunwing Slingshot', skill: 1250, price: 14000, style: 'sun', row: 1 },
  { id: 'blaster', name: 'Slime Blaster', skill: 3500, price: 40000, style: 'blaster', row: 1 },
]

// Training tables on the east terrace. Standing on an unlocked one multiplies training.
// rebirths = needed to unlock for free; price = Wins to unlock (the "All Worlds" ones).
export const PLATFORMS = [
  { id: 'target', mult: 1, rebirths: 0, style: 'target', x: 25.5, z: -21, step: 0 },
  { id: 'cloud', mult: 4, rebirths: 2, style: 'cloud', x: 25.5, z: -6, step: 0 },
  { id: 'leaf', mult: 10, rebirths: 4, style: 'leaf', x: 25.5, z: 9, step: 0 },
  { id: 'frost', mult: 20, rebirths: 6, style: 'frost', x: 40.5, z: -27, step: 2 },
  { id: 'lava', mult: 3, price: 2500, style: 'lava', x: 40.5, z: -14.5, step: 2 },
  { id: 'void', mult: 15, price: 90000, style: 'void', x: 40.5, z: -2, step: 2 },
  { id: 'gold', mult: 50, price: 750000, style: 'gold', x: 40.5, z: 10.5, step: 2 },
]

// Rebirth: needs Skill, resets Skill, multiplier x(rebirths + 1).
export const REBIRTH = { base: 1000, growth: 2.5 }
export const rebirthCost = (rebirths) => Math.round(REBIRTH.base * Math.pow(REBIRTH.growth, rebirths))
// Skip Rebirth (the Rebirth window): rebirth without reaching the level, for Wins.
export const SKIP_REBIRTH = { base: 25000, growth: 5 }
export const skipRebirthPrice = (rebirths) => Math.round(SKIP_REBIRTH.base * Math.pow(SKIP_REBIRTH.growth, rebirths))

// Level from total Skill: level L -> L+1 costs (a + b L) Skill.
export const LEVEL = { a: 4, b: 1.6 }

// Flight over the slime (flight.js). Press FLY in the Flying Zone -> hop into the
// nearest giant slingshot -> it pulls back and fires -> one big arc -> the player
// skips across the slime like a stone a few times -> slides -> sinks -> reward.
// The total distance D comes from Skill (same curve as before, so the economy is
// unchanged); airShare of it is the launch arc, the rest is skips and the slide.
export const FLIGHT = {
  baseDistance: 14, // m with zero skill
  scale: 15, // distance = base + scale * skill^exponent
  exponent: 0.3,
  maxDistance: 3000,
  metresPerWin: 8,
  steer: 14, // m/s sideways with A/D / joystick
  raceTokensPerFlight: 1,
  // launch
  hopIn: 0.38, // s jumping into the pouch
  pull: 1.05, // s the pouch is drawn back
  pullBack: 3.4, // m the pouch travels back (+Z) at full draw
  pullDown: 0.7, // m it sags at full draw
  // the launch arc
  airShare: 0.5,
  airPeak: [4, 60], // m apex above the pouch: clamp(air * airPeakPerMetre, ...)
  airPeakPerMetre: 0.3,
  airGravity: [30, 9], // m/s^2, short lobs are snappy, the longest flights float
  flips: [1, 3], // forward somersaults during the arc (more on longer flights)
  // skipping on the slime (hop i is hopDecay^i of the first one)
  skips: { base: 2, per: 40, min: 2, max: 9 }, // count = base + log2(1 + D / per)
  hopDecay: 0.6,
  hopHeightPerMetre: 0.2, // hop apex = length * this (clamped)
  hopHeight: [0.5, 30],
  hopGravity: 40,
  skipSkill: 1, // Skill per skip = skip number x this x Skill per click
  slide: [1.5, 12], // m slid on the surface after the last skip: clamp(D * 0.05, ...)
  slideTime: [0.5, 2.2],
  sinkTime: 1.5, // s sinking into the slime before the reward
  rewardTime: 1.7, // s the reward shows before going back
  milestone: 100, // m between counter chimes
}
// The launcher (launcher.js): pressing FLY summons a giant copy of the player's equipped
// slingshot (or blaster) in front of them, which they shoot from, then it vanishes.
// scale = x the hand-held model; summon/linger/vanish in s; ahead = m in front of the player.
export const LAUNCHERS = { scale: 3.4, cannonScale: 3.3, summon: 0.75, linger: 1.3, vanish: 0.4, ahead: 3.4 }

// --- Lane animals (lane/hazards.js, models in lane/animals*.js, sounds in audio/lane.js) ---
// While flying, animals appear ahead and try to cut the flight short; the player
// dodges by steering (A/D, joystick) and the Air Dash. Easy at first, then the
// encounter rate DOUBLES every `doubleEvery` metres, warnings get shorter and hits
// cost more, while far flights also pay much more (LANE.wins) to keep it worth it.
//   kind  grab    caught for `hold` s, then dropped (Slime-Proof Suit softens it)
//         knock   knocked down / back            carry  dragged back `carry` m
//         trap    stuck until you tap free       freeze no steering for `freeze` s
//         ink     screen splattered              clip   glide clipped (knock)
//         drain   bee swarm area                 sticky snail trail (on the slime)
//         pull    magnet drags you toward it     wall   lane blocked except a gap
//   zone  low = only where the flight passes within `reach` m of the slime; any = anywhere
//   r = hit radius (m), penalty = share of the REMAINING distance lost, weight = spawn odds
export const LANE = {
  tutorialFlights: 2, // the first flights are animal free
  grace: 40, // m from the zone with no animals
  startDelay: 0.7, // s after release before the first animal
  rate: 0.3, // encounters per second at the zone line ...
  doubleEvery: 650, // ... doubling every this many metres
  maxRate: 3, // per s cap
  tell: [1.6, 0.75], // s of warning: near -> far (lerp over tellAt metres), + Animal Radar
  tellAt: 2600,
  penaltyAt: 1800, // penalty x(1 + d / penaltyAt) ...
  penaltyMax: 0.8, // ... capped
  nearMiss: 3, // m outside the hit radius that still counts as a CLOSE CALL
  minAfter: 10, // m the flight must go past an encounter for it to spawn
  maxAlive: 9,
  aimJitter: 4, // m an animal aims off the player's line
  hitStop: 0.09, // s of slow motion on a hit
  slowMo: 0.18, // time scale during the hit stop
  dash: { dist: 9, time: 0.18 }, // Air Dash
  trap: { taps: 9, timeout: 2.6, perSecond: 0.1 }, // tap-free traps: taps (-Quick Escape), extra penalty per s
  pullRange: 70, // m ahead where a Magnet Mole starts pulling
  helperEvery: [4.5, 8], // s between friendly helpers
  boostFrac: 0.12, // a helper adds this x the planned flight (+ boostMin m)
  boostMin: 12,
  // Wins: distance Wins x(1 + (d / at)^exp): long flights pay far more per metre
  wins: { at: 1000, exp: 1.3 },
  dodgeBonus: 0.03, // +3% Wins per dodge this flight
  nearBonus: 0.06, // +6% per close call
  bonusMax: 1.5, // dodge bonus cap (x2.5)
  beginnerFlights: 10, // the first flights pay x beginnerMult
  beginnerMult: 2,
  streakEvery: 5, // combo fanfare every N dodges in a row
}
export const LANE_ANIMALS = [
  { id: 'frog', name: 'Sticky Frog', at: 0, kind: 'grab', zone: 'low', reach: 16, r: 3, penalty: 0.15, weight: 3, attack: 0.35, hold: 0.7, color: '#7dff5a' },
  { id: 'duck', name: 'Robo-Duck', at: 0, kind: 'knock', zone: 'any', r: 3.4, penalty: 0.18, weight: 3, attack: 0.55, boots: true, color: '#ffd23a' },
  { id: 'dragon', name: 'Slime Dragon', at: 90, kind: 'grab', zone: 'low', reach: 22, r: 4, penalty: 0.25, weight: 2, attack: 0.6, hold: 1, color: '#3fe23a' },
  { id: 'penguin', name: 'Freeze Penguin', at: 200, kind: 'freeze', zone: 'low', reach: 30, r: 3.2, penalty: 0.12, weight: 2, attack: 0.3, freeze: 1.5, color: '#9fe3ff' },
  { id: 'owl', name: 'Dive-Bomb Owl', at: 200, kind: 'knock', zone: 'any', r: 3.6, penalty: 0.22, weight: 2, attack: 0.6, boots: true, color: '#d8a46a' },
  { id: 'goat', name: 'Ram Goat', at: 200, kind: 'knock', zone: 'low', reach: 14, r: 3.4, penalty: 0.2, weight: 2, attack: 0.55, color: '#ffffff' },
  { id: 'bat', name: 'Bat Squad', at: 450, kind: 'knock', zone: 'any', r: 2.2, penalty: 0.07, weight: 2, attack: 0.4, group: 3, gap: 0.32, color: '#b45cff' },
  { id: 'chameleon', name: 'Chameleon', at: 450, kind: 'grab', zone: 'low', reach: 16, r: 3, penalty: 0.2, weight: 1.5, attack: 0.35, hold: 0.7, stealth: true, color: '#22d3a8' },
  { id: 'octopus', name: 'Slime Octopus', at: 750, kind: 'grab', wall: 12, zone: 'any', penalty: 0.28, weight: 1.5, attack: 0.45, hold: 1, color: '#ff6ad5' },
  { id: 'croc', name: 'Snap-Croc', at: 750, kind: 'grab', zone: 'low', reach: 8, r: 3, penalty: 0.2, weight: 1.5, attack: 0.3, hold: 0.7, group: 3, gap: 0.42, color: '#3fbf6a' },
  { id: 'puffer', name: 'Bubble Puffer', at: 750, kind: 'trap', zone: 'any', r: 3.4, penalty: 0.1, weight: 1.5, attack: 0.5, color: '#8fe3ff' },
  { id: 'squid', name: 'Ink Squid', at: 750, kind: 'ink', zone: 'any', r: 3.4, penalty: 0.08, weight: 1.5, attack: 0.45, ink: 2.4, color: '#5a4a8a' },
  { id: 'crab', name: 'Claw Crab', at: 750, kind: 'clip', zone: 'low', reach: 12, r: 3.2, penalty: 0.22, weight: 1.5, attack: 0.35, color: '#ff4a3a' },
  { id: 'hippo', name: 'Belly-Flop Hippo', at: 1150, kind: 'knock', wall: 12, zone: 'low', reach: 20, penalty: 0.22, weight: 1.5, attack: 0.5, color: '#b08cff' },
  { id: 'turtle', name: 'Spinning Turtle', at: 1150, kind: 'knock', zone: 'low', reach: 5, r: 3, penalty: 0.18, weight: 1.5, attack: 0.7, color: '#5dbb3a' },
  { id: 'mole', name: 'Magnet Mole', at: 1150, kind: 'pull', zone: 'low', reach: 30, r: 3.6, penalty: 0.25, weight: 1.5, attack: 0.35, pull: 10, color: '#ff4a4a' },
  { id: 'bees', name: 'Bee Swarm', at: 1150, kind: 'drain', zone: 'any', r: 7, length: 40, penalty: 0.5, weight: 1.5, attack: 0.4, color: '#ffe03a' },
  { id: 'spider', name: 'Web Spider', at: 1650, kind: 'trap', wall: 11, zone: 'any', penalty: 0.12, weight: 1.5, attack: 0.35, color: '#e8e8ff' },
  { id: 'snail', name: 'Mega Snail', at: 1650, kind: 'sticky', zone: 'low', reach: 3, r: 4, length: 60, penalty: 0.3, weight: 1.2, attack: 0.5, color: '#ff8fd0' },
  { id: 'gorilla', name: 'Clap Gorilla', at: 1650, kind: 'knock', wall: 10, zone: 'any', penalty: 0.32, weight: 1.2, attack: 0.45, color: '#5a5a6a' },
  { id: 'pelican', name: 'Pelican Scooper', at: 2250, kind: 'carry', zone: 'any', r: 3.6, penalty: 0.1, weight: 2, attack: 0.55, hold: 1.2, carry: 60, color: '#ff9a3a' },
]
// Boss shots and their attack stats (spawned by LANE_BOSSES, never at random).
export const LANE_SHOTS = {
  slimeball: { id: 'slimeball', name: 'Slime Ball', kind: 'knock', zone: 'any', r: 3.4, penalty: 0.16, attack: 0.5, color: '#3fe23a' },
  missile: { id: 'missile', name: 'Missile', kind: 'knock', zone: 'any', r: 3.6, penalty: 0.18, attack: 0.4, color: '#ff6a3a' },
  tailslam: { id: 'tailslam', name: 'Tail Slam', kind: 'knock', wall: 12, zone: 'any', penalty: 0.22, attack: 0.5, color: '#5a8cff' },
  geyser: { id: 'geyser', name: 'Geyser', helper: true, zone: 'any', r: 4, attack: 0.5, apex: 16, color: '#7ff6ff' },
}
// Friendly helpers: fly through them for a boost (+boostFrac of the flight).
export const LANE_HELPERS = [
  { id: 'mushroom', name: 'Bouncy Mushroom', zone: 'low', reach: 4, r: 3.6, apex: 14, attack: 0.5, color: '#ff4a4a' },
  { id: 'seagull', name: 'Friendly Seagull', zone: 'any', r: 3.4, apex: 6, attack: 0.5, color: '#ffffff' },
  { id: 'fan', name: 'Wind Fan', zone: 'any', r: 3.8, apex: 8, attack: 0.5, color: '#7ff6ff' },
]
// Bosses chase you once you pass `at` m (if the flight goes at least `after` m further).
// Survive all `shots` for the bonus: x`bonus` the distance Wins of `at` (x3 the first time).
export const LANE_BOSSES = [
  { id: 'kingDragon', name: 'King Slime Dragon', at: 1000, after: 150, shots: 6, every: 0.95, windup: 0.45, intro: 1.4, shot: ['slimeball'], bonus: 1, color: '#3fe23a' },
  { id: 'mechaDuck', name: 'Mecha-Duck Mk II', at: 2000, after: 150, shots: 8, every: 0.8, windup: 0.4, intro: 1.4, shot: ['missile'], bonus: 1.5, color: '#5fe0ff' },
  { id: 'skyWhale', name: 'Sky Whale', at: 2800, after: 120, shots: 6, every: 1, windup: 0.5, intro: 1.6, shot: ['tailslam', 'geyser'], bonus: 2, color: '#6a5cff' },
]
// Flight Gear (the Gear window): levels bought with Wins. per = effect per level.
export const GEAR = [
  { id: 'dash', name: 'Air Dash', icon: 'dash', desc: 'Unlocks the DASH button (Space): a quick sideways burst. Levels cut the cooldown.', prices: [250, 6000, 90000, 1.5e6], cooldown: [3.2, 2.4, 1.8, 1.3] },
  { id: 'shield', name: 'Shield Bubble', icon: 'shield', desc: 'A bubble that blocks one hit. +1 bubble per flight per level.', prices: [1200, 35000, 500000] },
  { id: 'suit', name: 'Slime-Proof Suit', icon: 'suit', desc: 'Grabs, traps and drags hold you shorter and cost less.', per: 0.12, prices: [600, 8000, 70000, 500000, 4e6] },
  { id: 'wings', name: 'Glide Wings', icon: 'wings', desc: 'Lose less distance from every hit.', per: 0.08, prices: [900, 12000, 120000, 900000, 7e6] },
  { id: 'boots', name: 'Anti-Magnet Boots', icon: 'boots', desc: 'Weaker Magnet Mole pull, owl dives and Robo-Duck kicks.', per: 0.2, prices: [2000, 25000, 250000, 2.5e6] },
  { id: 'escape', name: 'Quick Escape', icon: 'escape', desc: 'Fewer taps to break out of bubbles and webs.', per: 1.5, prices: [700, 9000, 100000, 1e6] },
  { id: 'radar', name: 'Animal Radar', icon: 'radar', desc: 'Warnings show up earlier.', per: 0.14, prices: [1500, 20000, 200000, 2e6] },
]

// Regions of the slime river (distance from the zone, m). Each gets its own bank
// colours and trees, a floating name sign over the river, and its name shows above
// the flight counter once passed. cliff = [face A, face B], top = checker colours.
export const RIVER_REGIONS = [
  { at: 0, name: 'Meadow', color: '#7dff7d', cliff: ['#9a6431', '#7a4a22'], top: ['#63e22f', '#4ccf22'], grass: '#5bd62b', trunk: '#6b3f1d', leaves: '#3cc21f', icon: 'leaf' },
  { at: 200, name: 'Snow', color: '#9fe3ff', cliff: ['#d4e9f7', '#b6d6ee'], top: ['#ffffff', '#eaf6ff'], grass: '#ffffff', trunk: '#5a3a22', leaves: '#f1fbff', icon: 'snow', deco: 'snowman' },
  { at: 450, name: 'Cosmic', color: '#6a5cff', cliff: ['#e8782a', '#f6efe6'], top: ['#c9ecff', '#b1e0ff'], grass: '#ffffff', trunk: '#3a2430', leaves: '#8a2a3a', icon: 'comet', deco: 'crystal' },
  { at: 750, name: 'Abyss Ocean', color: '#2f8cff', cliff: ['#1f4fa8', '#173c85'], top: ['#3fd0e0', '#2fb8cc'], grass: '#7ff0ff', trunk: '#2a3a5a', leaves: '#ff7a9a', icon: 'bubble' },
  { at: 1150, name: 'Lava Lands', color: '#ff6a1f', cliff: ['#3a2a2a', '#2a1c1c'], top: ['#ff6a1f', '#e8501a'], grass: '#ffb21f', trunk: '#1a1010', leaves: '#ffb21f', icon: 'flame', deco: 'crystal' },
  { at: 1650, name: 'Candy Cove', color: '#ff7ad8', cliff: ['#ff8fd0', '#ffffff'], top: ['#fff07a', '#ffe04a'], grass: '#ff5fa8', trunk: '#ffffff', leaves: '#ff5fa8', icon: 'candy' },
  { at: 2250, name: 'Sky Temple', color: '#ffd23a', cliff: ['#e8d8a8', '#d4c28a'], top: ['#ffffff', '#f2f2f2'], grass: '#ffd23a', trunk: '#c9a14a', leaves: '#ffe46a', icon: 'sun' },
  { at: 2800, name: 'Galaxy', color: '#c98cff', cliff: ['#2a1a5a', '#1a0f3a'], top: ['#b45cff', '#9a3cff'], grass: '#6ff0ff', trunk: '#0f0a2a', leaves: '#6ff0ff', icon: 'planet', deco: 'crystal' },
]


// Eggs: price in Wins (or race tokens). chance in %, boost = + skill multiplier.
// The last pet of each egg is its Secret: a tiny chance, shown as a black silhouette
// on the egg panel until it has been hatched once (eggs.js).
export const EGGS = [
  { id: 'common', name: 'Common Egg', price: 50, x: 10, z: 29, look: 'common', pets: [
    { id: 'pup', name: 'Puddle Pup', rarity: 'Common', chance: 44.9979, boost: 0.1, look: { kind: 'dog', body: '#c98a4b', accent: '#f2dcc0' } },
    { id: 'kitty', name: 'Tabby Kit', rarity: 'Common', chance: 30, boost: 0.15, look: { kind: 'cat', body: '#f0a640', accent: '#fff1d6' } },
    { id: 'bunny', name: 'Hop Bunny', rarity: 'Uncommon', chance: 18, boost: 0.25, look: { kind: 'bunny', body: '#f4f4f4', accent: '#ffb6c8' } },
    { id: 'fox', name: 'Ember Fox', rarity: 'Rare', chance: 7, boost: 0.4, look: { kind: 'fox', body: '#ff6a1f', accent: '#ffffff' } },
    { id: 'sunhound', name: 'Sunbeam Hound', rarity: 'Secret', chance: 0.0021, boost: 25, look: { kind: 'dog', body: '#fff3b0', accent: '#ffd23a', glow: '#ffe066', wings: true } },
  ] },
  { id: 'uncommon', name: 'Uncommon Egg', price: 500, x: 5, z: 25.5, look: 'uncommon', pets: [
    { id: 'penguin', name: 'Puffin Pal', rarity: 'Common', chance: 39.9985, boost: 0.5, look: { kind: 'penguin', body: '#24324a', accent: '#ffffff' } },
    { id: 'owl', name: 'Frost Owl', rarity: 'Uncommon', chance: 30, boost: 0.8, look: { kind: 'owl', body: '#b8dcff', accent: '#ffffff', wings: true } },
    { id: 'polar', name: 'Polar Cub', rarity: 'Rare', chance: 20, boost: 1.2, look: { kind: 'bear', body: '#f2f8ff', accent: '#9cc8ff' } },
    { id: 'yeti', name: 'Tiny Yeti', rarity: 'Epic', chance: 10, boost: 2, look: { kind: 'bear', body: '#d9f0ff', accent: '#4aa3ff', horn: true } },
    { id: 'glacier', name: 'Glacier Wyrm', rarity: 'Secret', chance: 0.0015, boost: 60, look: { kind: 'dragon', body: '#e6f8ff', accent: '#5fd0ff', wings: true, glow: '#9fe8ff', spiky: true } },
  ] },
  { id: 'rare', name: 'Rare Egg', price: 4000, x: -5, z: 25.5, look: 'rare', pets: [
    { id: 'turtle', name: 'Moss Turtle', rarity: 'Uncommon', chance: 39.999, boost: 2.5, look: { kind: 'turtle', body: '#5dbb3a', accent: '#8a5a2b' } },
    { id: 'frog', name: 'Bloom Frog', rarity: 'Rare', chance: 30, boost: 3.5, look: { kind: 'frog', body: '#3fd46a', accent: '#ff7ab8' } },
    { id: 'parrot', name: 'Jungle Parrot', rarity: 'Epic', chance: 20, boost: 5, look: { kind: 'bird', body: '#ff3b3b', accent: '#2f8cff', wings: true } },
    { id: 'chameleon', name: 'Prism Chameleon', rarity: 'Legendary', chance: 10, boost: 8, look: { kind: 'lizard', body: '#22d3a8', accent: '#ffd23a' } },
    { id: 'jadewyrm', name: 'Jade Leviathan', rarity: 'Secret', chance: 0.001, boost: 150, look: { kind: 'lizard', body: '#1fbf6a', accent: '#ffe46a', glow: '#5fffa0', spiky: true } },
  ] },
  { id: 'rainbow', name: 'Rainbow Egg', price: 25000, x: -10, z: 29, look: 'rainbow', pets: [
    { id: 'unicorn', name: 'Candy Unicorn', rarity: 'Rare', chance: 44.9992, boost: 12, look: { kind: 'horse', body: '#ffffff', accent: '#ff8fd8', horn: true } },
    { id: 'rcat', name: 'Spectrum Cat', rarity: 'Epic', chance: 30, boost: 18, look: { kind: 'cat', body: '#b07bff', accent: '#6ff0ff', glow: '#ff9cf5' } },
    { id: 'pdragon', name: 'Prism Drake', rarity: 'Legendary', chance: 20, boost: 30, look: { kind: 'dragon', body: '#5ad8ff', accent: '#ff6bd5', wings: true, glow: '#88ffff' } },
    { id: 'phoenix', name: 'Aurora Phoenix', rarity: 'Mythic', chance: 5, boost: 50, look: { kind: 'bird', body: '#ff9a1f', accent: '#ffe14a', wings: true, glow: '#ffb347' } },
    { id: 'starmane', name: 'Starmane Pegasus', rarity: 'Secret', chance: 0.0008, boost: 400, look: { kind: 'horse', body: '#fdf6ff', accent: '#b45cff', horn: true, wings: true, glow: '#e6a8ff' } },
  ] },
  { id: 'exclusive', name: 'Exclusive Egg', price: 250000, x: -13, z: -31, look: 'exclusive', pets: [
    { id: 'gryphon', name: 'Ruby Gryphon', rarity: 'Legendary', chance: 49.9995, boost: 80, look: { kind: 'bird', body: '#e8303a', accent: '#ffd23a', wings: true, glow: '#ff5050' } },
    { id: 'sdragon', name: 'Sapphire Wyrm', rarity: 'Mythic', chance: 35, boost: 120, look: { kind: 'dragon', body: '#2a6bff', accent: '#9ff3ff', wings: true, glow: '#44aaff' } },
    { id: 'lion', name: 'Crown Lion', rarity: 'Mythic', chance: 15, boost: 200, look: { kind: 'cat', body: '#ffc93a', accent: '#ff7a1a', mane: true, glow: '#ffd700' } },
    { id: 'voidking', name: 'Void Monarch', rarity: 'Secret', chance: 0.0005, boost: 1500, look: { kind: 'dragon', body: '#2a1450', accent: '#c98cff', wings: true, glow: '#9a5cff', spiky: true } },
  ] },
  { id: 'race', name: 'Race Egg', price: 10, currency: 'tokens', x: 13, z: -31, look: 'race', pets: [
    { id: 'snail', name: 'Turbo Snail', rarity: 'Rare', chance: 49.998, boost: 3, look: { kind: 'snail', body: '#ffcf5a', accent: '#a05ad8' } },
    { id: 'rabbit', name: 'Rocket Rabbit', rarity: 'Epic', chance: 35, boost: 6, look: { kind: 'bunny', body: '#d8c2ff', accent: '#7a3cff' } },
    { id: 'cheetah', name: 'Nitro Cheetah', rarity: 'Legendary', chance: 15, boost: 12, look: { kind: 'cat', body: '#ffd34a', accent: '#3a2a12', glow: '#ffef7a' } },
    { id: 'boltHare', name: 'Lightning Hare', rarity: 'Secret', chance: 0.002, boost: 60, look: { kind: 'bunny', body: '#fff7a8', accent: '#3fa2ff', glow: '#ffef3a', wings: true } },
  ] },
]
// Single pets sold on stands (the stock line is flavour text).
export const STAND_PETS = [
  { id: 'captain', name: 'Captain Quackers', rarity: 'Mythic', boost: 300, price: 750000, stock: 1000, better: '200%', x: -20.5, z: -21.5, look: { kind: 'duck', body: '#ffd83a', accent: '#ff8a1a', hat: true } },
  { id: 'seraph', name: 'Radiant Seraph', rarity: 'Secret', boost: 1200, price: 5000000, stock: 10000, better: '1200%', x: 0, z: 31, look: { kind: 'dragon', body: '#fff6dc', accent: '#ffd23a', wings: true, glow: '#ffe066', spiky: true } },
]
export const RARITY_COLORS = { Common: '#c9d3df', Uncommon: '#5ee35e', Rare: '#3fa2ff', Epic: '#b45cff', Legendary: '#ffb21f', Mythic: '#ff4f8b', Secret: '#ffffff' }
export const PET_SLOTS = 3 // equipped at once (+1 with the Extra Slot pass)
// Egg panel (eggs.js): E = Open 1, R = Open Max, T = Auto. Open Max hatches `hatchMax`
// eggs at once: 1 until one of the upgrades below is bought (the +3 / +8 / +16 bubbles
// beside the panel; premium items in the reference, here they cost Wins).
export const EGG_HATCH = {
  range: 4.2, // m from the egg's centre where its panel opens
  upgrades: [
    // Priced against the egg ladder (Rainbow 25k, Exclusive 250k): +3 ~ 2.5 Rainbow eggs,
    // +16 ~ 6 Exclusive eggs. They were 9k / 45k / 150k, less than one Exclusive egg.
    { n: 3, price: 60000, color: '#ffd23a' },
    { n: 8, price: 400000, color: '#3fa2ff' },
    { n: 16, price: 1500000, color: '#ff6ad5' },
  ],
  anim: 2.4, // s of the hatch animation (wobble, crack, reveal)
  autoAnim: 1.5, // s per batch while Auto is on
  autoGap: 0.25, // s between auto batches
}

// Trails behind the player while flying. mult = Wins multiplier while equipped.
// card = the Trails window card gradient (top, bottom); colors = the flight ribbon + card swoosh.
// The first two were premium items in the reference: here they cost Wins like everything else.
export const TRAILS = [
  { id: 'rainbow', name: 'Rainbow Trail', mult: 2, price: 4e6, card: ['#ff7a8a', '#ffd25a', '#7dff9a', '#6ad0ff', '#c98cff'], colors: ['#ff3b3b', '#ffb21f', '#ffef3a', '#3cff6a', '#3fa2ff', '#b45cff'], premium: true },
  { id: 'void', name: 'Void Trail', mult: 3, price: 10e6, card: ['#a46aff', '#4a1a8a'], colors: ['#14062a', '#5a1fc8', '#b07bff', '#2a0a5a'], premium: true },
  { id: 'white', name: 'White Trail', mult: 1.2, price: 300, card: ['#f4f6f8', '#b9c2cc'], colors: ['#ffffff', '#e4ebf2', '#c9d3df'] },
  { id: 'red', name: 'Red Trail', mult: 1.3, price: 1500, card: ['#ff8a8a', '#d23a3a'], colors: ['#ffffff', '#ff4a4a', '#b0121a'] },
  { id: 'blue', name: 'Blue Trail', mult: 1.4, price: 6000, card: ['#7fe0ff', '#2a7fe8'], colors: ['#ffffff', '#3fb4ff', '#1a4fd8'] },
  { id: 'green', name: 'Green Trail', mult: 1.45, price: 20000, card: ['#9cff7a', '#2fae3a'], colors: ['#ffffff', '#5aff4a', '#1a9a2a'] },
  { id: 'yellow', name: 'Yellow Trail', mult: 1.5, price: 60000, card: ['#fff27a', '#d8b01a'], colors: ['#ffffff', '#ffe03a', '#ff9a12'] },
  { id: 'purple', name: 'Purple Trail', mult: 1.6, price: 150000, card: ['#d9a8ff', '#7a46d8'], colors: ['#ffffff', '#d05aff', '#7a1ad8'] },
  { id: 'inferno', name: 'Inferno Trail', mult: 1.7, price: 400000, card: ['#ffc65a', '#d8461a'], colors: ['#fff27a', '#ff8a1a', '#e8221a', '#5a0a0a'] },
  { id: 'diamond', name: 'Diamond Trail', mult: 1.8, price: 1e6, card: ['#a8f6ff', '#ff8fd8'], colors: ['#ffffff', '#5ae8ff', '#ff4fc8', '#1a2a6a'] },
  { id: 'celestial', name: 'Celestial Trail', mult: 1.9, price: 2.5e6, card: ['#6a9cff', '#16245a'], colors: ['#ffffff', '#3f8cff', '#0a1a6a', '#5ad8ff'] },
]
export const DEFAULT_TRAIL_COLORS = ['#ffffff', '#cfe9ff'] // flight ribbon with no trail equipped

// Shop: passes and packs, all for Wins.
export const PASSES = [
  { id: 'skill2x', name: '+2x Skill', desc: 'Double Skill from every training click, forever.', price: 2000 },
  { id: 'wins2x', name: '2x Wins', desc: 'Double Wins from every flight, forever.', price: 15000 },
  { id: 'petslot', name: '+1 Pet Slot', desc: 'Equip one more pet at a time.', price: 8000 },
  { id: 'starter', name: 'Starter Pack', desc: '+2,500 Skill, 10 Race Tokens and an Ember Fox.', price: 5000 },
]
export const SKILL_PACKS = [
  { id: 'p1', amount: 1800, price: 150, style: 'gold' },
  { id: 'p2', amount: 18000, price: 1200, style: 'blue' },
  { id: 'p3', amount: 180000, price: 9000, style: 'rainbow' },
]

// Boost potions: using one adds `minutes` of x`mult` (stacks time). icon = icons.js painter.
export const BOOSTS = {
  skill: { name: 'Skill Boost', mult: 2, minutes: 10, icon: 'potionSkill', color: '#5fe0ff' },
  wins: { name: 'Win Boost', mult: 2, minutes: 10, icon: 'potionWins', color: '#ffd23a' },
  luck: { name: 'Luck Boost', mult: 2, minutes: 10, icon: 'potionLuck', color: '#7dff5a' },
}

// Daily Rewards: one more day unlocks every new local calendar day (capped at 7);
// once all 7 are claimed the next day starts the cycle again at day 1. Day 7 gives
// the limited Galaxy Cannon (or `again` if it is already owned).
export const DAILY = [
  { boost: 'skill', n: 1 },
  { pet: 'samurai' },
  { boost: 'wins', n: 1 },
  { boost: 'luck', n: 2 },
  { boost: 'skill', n: 3 },
  { boost: 'wins', n: 3 },
  { sling: 'galaxy', again: [{ boost: 'skill', n: 3 }, { boost: 'wins', n: 3 }, { boost: 'luck', n: 3 }] },
]

// Playtime Rewards: minutes played this session. skill / wins are x(rebirths + 1).
// egg = a free hatch of that egg; boost = one potion.
export const PLAYTIME = [
  { at: 1, skill: 750 },
  { at: 3, wins: 25 },
  { at: 5, egg: 'common' },
  { at: 7, boost: 'skill' },
  { at: 10, wins: 75 },
  { at: 12, skill: 1500 },
  { at: 15, boost: 'wins' },
  { at: 30, egg: 'uncommon' },
  { at: 45, boost: 'luck' },
  { at: 65, wins: 200 },
  { at: 85, skill: 3000 },
  { at: 105, egg: 'rare' },
]
export const CHEST = { cooldown: 10 * 60, wins: 25 } // s; Wins x (rebirths + 1)
// Friend Boost: every friend who joins the game from this player's invite (link or direct Bloxity invite;
// the server credits each account once, backend invite.ts) adds +per Skill gain for good, up to max friends.
export const FRIEND_BOOST = { per: 0.1, max: 10 }

// Limited items that never sit on a pad or an egg (daily rewards).
export const LIMITED_SLINGSHOTS = [{ id: 'galaxy', name: 'Galaxy Cannon', skill: 2500, style: 'galaxy' }]
export const LIMITED_PETS = [
  { id: 'samurai', name: 'Samurai Cat', rarity: 'Legendary', boost: 10, source: 'Daily Reward', look: { kind: 'cat', body: '#ffffff', accent: '#ff8a3a', samurai: true } },
]

// Pet tiers: every hatch has a small chance (%, x luck) to come out Golden or Diamond.
export const PET_TIERS = [
  { id: '', name: 'Basic', mult: 1 },
  { id: 'g', name: 'Golden', mult: 2, chance: 4, look: { body: '#ffcf3a', accent: '#fff2a0', glow: '#ffd700' } },
  { id: 'd', name: 'Diamond', mult: 4, chance: 0.8, look: { body: '#a8f4ff', accent: '#ffffff', glow: '#7fe8ff' } },
]
// Inventory capacity: the "+" buttons under the Inventory window buy more (Wins).
export const PET_STORAGE = { base: 100, step: 50, prices: [2000, 8000, 30000, 100000, 400000] }
export const EXTRA_SLOT_PRICES = [15000, 60000, 250000]
// Index Luck: every `every` discoveries (any tier) can be claimed for +pct luck.
export const INDEX_LUCK = { every: 5, pct: 0.01 }

// Titles (Inventory > Titles). bonus = { skill | wins | luck: fraction } while equipped.
// req = { stat, n }: stat is a key of titleStat() in state.js; null = always owned;
// special = never unlocked in game (staff / creator titles).
export const TITLES = [
  { id: 'newbie', name: 'Newbie', color: '#ffffff', desc: 'Join the game!', bonus: { skill: 0.02 }, req: null },
  { id: 'first', name: 'First Launch', color: '#fff3c0', desc: 'Make your first flight!', bonus: { wins: 0.05 }, req: { stat: 'flights', n: 1 } },
  { id: 'pirate', name: 'Pirate Captain', color: '#8fb8ff', desc: 'Fly 250m in one flight!', bonus: { skill: 0.1 }, req: { stat: 'bestDistance', n: 250 } },
  { id: 'voyager', name: 'Star Voyager', color: '#a98cff', desc: 'Fly 500m in one flight!', bonus: { skill: 0.2 }, req: { stat: 'bestDistance', n: 500 } },
  { id: 'frost', name: 'Frost Engineer', color: '#ffd27a', desc: 'Fly 1,000m in one flight!', bonus: { skill: 0.3 }, req: { stat: 'bestDistance', n: 1000 } },
  { id: 'shogun', name: 'Shogun', color: '#ff5a5a', desc: 'Fly 1,500m in one flight!', bonus: { skill: 0.45 }, req: { stat: 'bestDistance', n: 1500 } },
  { id: 'colonist', name: 'Star Colonist', color: '#ff7a6a', desc: 'Fly 2,000m in one flight!', bonus: { skill: 0.6 }, req: { stat: 'bestDistance', n: 2000 } },
  { id: 'fairy', name: 'Fairy Monarch', color: '#ff8fd8', desc: 'Reach the Snow at the end of the river!', bonus: { skill: 0.75 }, req: { stat: 'bestDistance', n: 3000 } },
  { id: 'hopper', name: 'Sky Hopper', color: '#ff6a9a', desc: 'Make 3,000 flights!', req: { stat: 'flights', n: 3000 } },
  { id: 'slimelegend', name: 'Slime Legend', color: '#ff4a4a', desc: 'Fly over 1,000m 1,500 times!', req: { stat: 'longFlights', n: 1500 } },
  { id: 'thunder', name: 'Thunderstruck', color: '#b45cff', desc: 'Hatch 6 Mythic pets!', req: { stat: 'mythics', n: 6 } },
  { id: 'royal', name: 'Rebirth Royal', color: '#ffc83a', desc: 'Rebirth 10 times!', req: { stat: 'rebirths', n: 10 } },
  { id: 'ascendant', name: 'Ascendant', color: '#ff5a4a', desc: 'Rebirth 25 times!', req: { stat: 'rebirths', n: 25 } },
  { id: 'eggfan', name: 'Egg Fan', color: '#5fd0ff', desc: 'Hatch 1,000 eggs!', req: { stat: 'hatched', n: 1000 } },
  { id: 'indexmaster', name: 'Index Master', color: '#ff4a6a', desc: 'Discover every Basic pet in the Index!', bonus: { luck: 0.15 }, req: { stat: 'indexBasic', n: -1 } },
  { id: 'grinder', name: 'Time Grinder', color: '#ffc83a', desc: 'Play for 10 hours!', req: { stat: 'playTime', n: 36000 } },
  { id: 'dailyhero', name: 'Daily Hero', color: '#ffb21f', desc: 'Claim 30 Daily Rewards!', req: { stat: 'dailyClaims', n: 30 } },
  { id: 'supporter', name: 'Supporter', color: '#5fe0ff', desc: 'Open the Free Rewards chest 100 times!', req: { stat: 'chests', n: 100 } },
  { id: 'spender', name: 'Big Spender', color: '#ffd23a', desc: 'Spend 1,000,000 Wins!', req: { stat: 'spent', n: 1e6 } },
  { id: 'creator', name: 'Content Creator', color: '#ff4a4a', desc: 'Make videos about Fly Over Slime!', special: true },
  { id: 'tester', name: 'Tester', color: '#5fe0ff', desc: 'Helped test the game!', special: true },
  { id: 'developer', name: 'Developer', color: '#ff4a4a', desc: 'Made this game!', special: true },
]

// In-game Settings window (saved with the progress).
export const GAME_SETTINGS = [
  { key: 'sfx', label: 'Sound Effects', def: true },
  { key: 'music', label: 'Music', def: true },
  { key: 'shake', label: 'Camera Shake', def: true },
  { key: 'effects', label: 'Effects', def: true },
  { key: 'hideHud', label: 'Hide HUD', def: false },
  { key: 'hidePets', label: 'Hide All Pets', def: false },
  { key: 'flightAlerts', label: 'Flight Alerts', def: true },
  { key: 'hatchAnim', label: 'Hatch Animation', def: true },
]

export const WORLD2_SKILL = 600e6
// Training (game.js train(), feedback in training.js + audio/training.js).
export const TRAIN = {
  interval: 0.16, // s between training clicks while held
  cooldown: 1, // s: minimum time between Skill gains (clicks and bounces)
  streakGap: 0.45, // s: a click within this of the last one continues the streak
  streakEvery: 25, // a "N Streak!" milestone every this many clicks in a row
  popLife: 0.9, // s a "+N" number stays up
  popHeight: 2.7, // m above the feet the numbers start
  popRise: 14, // vmin they float up over their life
  popSpreadX: 9, // vmin random sideways scatter
  popSpreadY: 3,
  maxPops: 16, // pooled DOM elements
  waveSize: 5, // shockwave reach on a table, m
  armSpring: 260, // arm pull spring stiffness (draw back, snap past rest, settle)
  armDamp: 13,
  // unlocked training tables are trampolines (training.js bouncer, player.js setBouncer)
  bounceHeight: 6.5, // m each bounce rises above a 1x table top
  bounceTier: 0.3, // bigger tables bounce higher: x(1 + log10(mult) * this), 50x = ~1.5x
  bounceBoost: 1.5, // x height when jump is held on landing
  hopReach: 1.2, // m past the rim where walking into a table hops you on
  hopClear: 0.9, // m the hop clears the table top by
  hopSpeed: 4, // m/s inward on the hop so you land on the table
  // glow / sparks colour per training table style
  tableColors: { target: '#ffd23a', cloud: '#7ff6ff', leaf: '#7dff7d', frost: '#bff4ff', lava: '#ff7a1a', void: '#c46aff', gold: '#fff2a0' },
}
