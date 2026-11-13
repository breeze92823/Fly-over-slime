import { Quaternion, Vector3 } from 'three'
import * as CFG from './config.js'
import { CHANNEL, FLIGHT, FLY_ZONE, LANE, LAUNCHERS, PLAZA, RIVER_REGIONS, SPAWN } from './config.js'
import { inputState } from './input.js'
import { player, resetPlayer, setPlayerOverride } from './player.js'
import { setFlightView, shake, syncYawToPlayer } from './camera.js'
import { createLauncher } from './launcher.js'
import { buildRiver } from './river.js'
import { createFlightHud } from './flightHud.js'
import { createTrail } from './trail.js'
import * as snd from './audio/flight.js'
import * as laneSnd from './audio/lane.js'
import { addSkill, changed, skillPerClick, state, trailById, winsMult } from './state.js'
import { createLane, distanceWins } from './lane/hazards.js'
import { createLaneHud } from './laneHud.js'

// The fly sequence. Standing in the yellow Flying Zone shows a FLY button (E on
// desktop). Pressing it:
//   summon a giant copy of the equipped slingshot spins up out of the ground ahead
//   hop    the player jumps into its pouch (or onto the muzzle of a blaster)
//   pull   the pouch is drawn back, the straps creak
//   air    release: one big arc with forward somersaults, the counter climbing
//   hop i  touchdown -> skip across the slime like a stone (each skip pays Skill)
//   slide  the last touchdown slides to a stop
//   sink   gloop: the reward card (+Wins x multiplier), then a fade back to spawn
// The path is planned at release so the total distance is exactly the Skill-based
// flight distance (FLIGHT in config.js); A/D or the joystick steers sideways.
// Auto Fly skips the button and launches straight away.

const easeOut = (s) => 1 - (1 - s) * (1 - s)
const easeOutCubic = (s) => 1 - Math.pow(1 - s, 3)
const easeInOut = (s) => 0.5 - 0.5 * Math.cos(Math.PI * s)
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const lerp = (a, b, k) => a + (b - a) * k
const TAU = Math.PI * 2

export function flightDistance() {
  return Math.min(FLIGHT.maxDistance, FLIGHT.baseDistance + FLIGHT.scale * Math.pow(Math.max(0, state.skill), FLIGHT.exponent))
}

export function createFlight({ scene, fx, ringPulse, blocked = () => false, onDone }) {
  const launcher = createLauncher(scene)
  const vanishAt = new Vector3()
  buildRiver(scene)
  const hud = createFlightHud()
  const trail = createTrail(scene)
  const surface = CHANNEL.slimeY
  const trailPos = new Vector3()
  const holdTmp = new Vector3()
  let slowLeft = 0 // s of hit-stop slow motion left (real time)

  // Lane animals (lane/hazards.js): they read the planned path and re-plan it on hits.
  const laneHud = createLaneHud()
  const lane = createLane({
    scene,
    fx,
    hud: laneHud,
    ops: {
      timeTo: (z) => timeTo(z),
      zAfter: (s) => zAfter(s),
      yAt: (z) => yAt(z),
      endZ: () => endZ(),
      dist: () => f?.dist ?? 0,
      planD: () => f?.plan?.D ?? 0,
      getX: () => f?.x ?? player.position.x,
      setX: (x) => {
        if (f) f.x = clamp(x, -CHANNEL.halfWidth + 3, CHANNEL.halfWidth - 3)
      },
      lockSteer: (s) => {
        if (f) f.steerLock = Math.max(f.steerLock, s)
      },
      knock(o) {
        if (f?.phase === 'fly' && !f.held) replan(remainingL() * o.factor, o)
      },
      hold(get) {
        if (!f) return
        f.holdRem = remainingL()
        f.held = get
        setFlightView('skip')
      },
      release(o) {
        if (!f || !f.held) return
        f.held = null
        if (o.resetDist) f.dist = distOf(player.position.z) // carried back: that distance is lost
        if (f.phase === 'fly') replan(f.holdRem * o.factor, o)
      },
      boost(o) {
        if (f?.phase !== 'fly' || f.held) return 0
        const before = remainingL()
        replan(before + o.add, o)
        return Math.max(0, remainingL() - before)
      },
      slowMo: (s) => {
        slowLeft = Math.max(slowLeft, s)
      },
      shake: (m) => {
        if (state.settings?.shake !== false) shake(m)
      },
      renderPos: () => player.renderPosition,
      velocity: () => player.velocity,
    },
  })
  laneHud.onDash(() => f?.phase === 'fly' && lane.dash(Math.sign(inputState.move.x)))
  laneHud.onMash(() => lane.mash())

  let f = null // the flight in progress (see start)
  let autoDelay = 0

  const regionAt = (d) => {
    let i = 0
    while (i + 1 < RIVER_REGIONS.length && d >= RIVER_REGIONS[i + 1].at) i++
    return i
  }
  const distOf = (z) => Math.max(0, PLAZA.minZ - z)

  // --- Planning -----------------------------------------------------------------------
  // Segments: the launch arc, n ballistic hops on the slime, then a decelerating slide.
  function plan(p0) {
    const D = flightDistance()
    const k = Math.min(1, D / FLIGHT.maxDistance)
    const segs = buildSegs(p0, D, k, { extraAir: p0.z - PLAZA.minZ, launch: true })
    return { D, k, segs, flips: Math.round(lerp(FLIGHT.flips[0], FLIGHT.flips[1], Math.sqrt(k))) }
  }
  // The path from p0 covering L metres (+ extraAir): an arc to the slime, skips, a slide.
  // Used for the launch and to re-plan after a lane animal hits / a helper boosts.
  //   apex      m the arc climbs above p0 (default from its length); airShare of L in the arc
  //   flips     somersaults during a re-planned arc (-1 = a backward tumble)
  function buildSegs(p0, L, k, o = {}) {
    const share = o.airShare ?? FLIGHT.airShare
    const slide = clamp(L * 0.05, Math.min(FLIGHT.slide[0], L * 0.3), FLIGHT.slide[1])
    const air = Math.max(0.3, L * share + (o.extraAir ?? 0))
    const hops = Math.max(0, L * (1 - share) - slide)
    const segs = []
    {
      const H = Math.max(0, o.apex ?? clamp(air * FLIGHT.airPeakPerMetre, FLIGHT.airPeak[0], FLIGHT.airPeak[1]))
      const g = lerp(FLIGHT.airGravity[0], FLIGHT.airGravity[1], Math.sqrt(k))
      const vy = Math.sqrt(2 * g * H)
      const T = Math.max(0.18, (vy + Math.sqrt(vy * vy + 2 * g * Math.max(0, p0.y - surface))) / g)
      segs.push({ kind: 'air', z0: p0.z, L: air, T, y0: p0.y, vy, g, launch: !!o.launch, flips: o.flips ?? 0 })
    }
    let z = p0.z - air
    if (hops > 1) {
      const n = clamp(Math.round(FLIGHT.skips.base + Math.log2(1 + L / FLIGHT.skips.per)), o.launch ? FLIGHT.skips.min : 1, FLIGHT.skips.max)
      const r = FLIGHT.hopDecay
      const h1 = (hops * (1 - r)) / (1 - Math.pow(r, n))
      for (let i = 0; i < n; i++) {
        const Lh = h1 * Math.pow(r, i)
        const H = clamp(Lh * FLIGHT.hopHeightPerMetre, FLIGHT.hopHeight[0], FLIGHT.hopHeight[1])
        const g = FLIGHT.hopGravity
        const vy = Math.sqrt(2 * g * H)
        segs.push({ kind: 'hop', z0: z, L: Lh, T: (2 * vy) / g, y0: surface, vy, g, n: i + 1 })
        z -= Lh
      }
    }
    const last = segs[segs.length - 1]
    const vLast = Math.max(2, last.L / last.T)
    segs.push({ kind: 'slide', z0: z, L: slide, T: clamp((2 * slide) / vLast, FLIGHT.slideTime[0], FLIGHT.slideTime[1]) })
    return segs
  }
  // --- Path queries for the lane animals (lane/hazards.js) -----------------------------------
  const segZ = (s, t) => (s.kind === 'slide' ? s.z0 - s.L * easeOut(clamp(t / s.T, 0, 1)) : s.z0 - s.L * clamp(t / s.T, 0, 1))
  const segY = (s, t) => (s.kind === 'slide' ? surface - 0.25 : Math.max(surface, s.y0 + s.vy * t - 0.5 * s.g * t * t))
  function zAfter(sec) {
    if (!f?.plan) return null
    const segs = f.plan.segs
    let t = f.segT + sec
    for (let i = f.seg; i < segs.length; i++) {
      if (t <= segs[i].T) return segZ(segs[i], t)
      t -= segs[i].T
    }
    return null
  }
  // where on the plan z is: [segment, t within it, s before it from now]
  function locate(z) {
    const segs = f.plan.segs
    let acc = -f.segT
    for (let i = f.seg; i < segs.length; i++) {
      const s = segs[i]
      if (z >= s.z0 - s.L) {
        const u = clamp((s.z0 - z) / Math.max(1e-6, s.L), 0, 1)
        const t = s.kind === 'slide' ? s.T * (1 - Math.sqrt(1 - u)) : s.T * u
        return [s, t, acc]
      }
      acc += s.T
    }
    return null
  }
  function timeTo(z) {
    if (!f?.plan) return Infinity
    const at = locate(z)
    return at ? Math.max(0, at[2] + at[1]) : Infinity
  }
  function yAt(z) {
    if (!f?.plan) return surface
    const at = locate(z)
    return at ? segY(at[0], at[1]) : surface
  }
  function endZ() {
    if (!f?.plan) return 0
    const last = f.plan.segs[f.plan.segs.length - 1]
    return last.z0 - last.L
  }
  // Re-plan from where the player is now, covering L more metres.
  function replan(L, o) {
    const p = player.position
    const maxL = Math.max(0, CHANNEL.length - 60 - distOf(p.z))
    f.plan.segs = buildSegs(new Vector3(p.x, p.y, p.z), clamp(L, 0.5, maxL), f.plan.k, o)
    f.seg = 0
    f.segT = 0
    f.flipsDone = 0
    f.airS = 0
    f.pitch0 = ((pitch % TAU) + TAU) % TAU
    setFlightView('air')
  }
  const remainingL = () => Math.max(0, distOf(endZ()) - distOf(player.position.z))

  // --- Start ----------------------------------------------------------------------------
  function start() {
    if (f) return
    const p = player.position
    const x = clamp(p.x, -CHANNEL.halfWidth + 4, CHANNEL.halfWidth - 4)
    const z = clamp(p.z - LAUNCHERS.ahead, FLY_ZONE.minZ + 1.6, FLY_ZONE.maxZ - 3)
    launcher.summon(state.equippedSling || 'twig', x, z)
    f = {
      phase: 'summon',
      t: 0,
      from: new Vector3(p.x, p.y, p.z),
      x,
      plan: null,
      seg: 0,
      segT: 0,
      dist: 0,
      region: 0,
      milestone: 0,
      bestShown: state.bestDistance < 25,
      skips: 0,
      skillGained: 0,
      spin: 0,
      spinRate: 0,
      flipsDone: 0,
      airS: 0,
      squash: 0,
      rewarded: false,
      steerLock: 0, // s of no steering left (frozen)
      held: null, // fn(out) while an animal holds the player (lane/hazards.js)
      holdRem: 0,
      pitch0: 0, // body pitch when the path was last re-planned
    }
    hud.showFly(false)
    hud.setFlying(true)
    setFlightView('aim')
    player.facing = Math.PI
    setPlayerOverride(step)
    snd.summon()
    // sparkles fly from the player's hand to the spot, a glow ring where it rises
    const dx = x - p.x
    const dz = z - p.z
    const dl = Math.hypot(dx, 0.6, dz)
    fx.burst(26, { x: p.x, y: p.y + 1.3, z: p.z, dir: [dx / dl, 0.6 / dl, dz / dl], speed: dl / 0.45, jitter: 1.2, life: 0.5, size: 0.5, color: ['#ffffff', '#ffe46a', '#7fe7ff'], shape: 'star' })
    fx.burst(30, { x, y: 0.2, z, spread: 1.6, speed: 4, up: 1.6, gravity: -4, life: 1, size: 0.55, color: ['#ffe46a', '#ffffff', '#b98cff'], shape: 'star' })
    ringPulse(x, 0.12, z, '#ffe46a', 4)
  }
  hud.showFly(false, () => {
    if (!blocked()) start()
  })
  // E launches while the button shows (capture phase: game.js's E = train must not also fire).
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code !== 'KeyE' || e.repeat || !hud.flyVisible()) return
      e.stopImmediatePropagation()
      if (!blocked()) start()
    },
    true,
  )
  // While flying: Space / Shift = Air Dash; when trapped, Space / E / A / D / arrows mash free.
  const MASH_KEYS = ['Space', 'KeyE', 'Enter', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
  window.addEventListener(
    'keydown',
    (e) => {
      if (!f || f.phase !== 'fly' || e.repeat) return
      if (lane.trapped()) {
        if (MASH_KEYS.includes(e.code)) {
          lane.mash()
          e.preventDefault()
        }
        return
      }
      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        lane.dash(Math.sign(inputState.move.x))
        e.preventDefault()
      }
    },
    true,
  )

  function release() {
    const L = launcher
    const p0 = L.seat(new Vector3())
    f.plan = plan(p0)
    f.phase = 'fly'
    f.seg = 0
    f.segT = 0
    const cannon = L.cannon
    L.release()
    const k = f.plan.k
    if (cannon) snd.boom(Math.sqrt(k))
    else snd.fire(Math.sqrt(k))
    if (state.settings?.shake !== false) shake(0.35)
    setFlightView('air')
    fx.burst(40, { x: p0.x, y: p0.y + 0.5, z: p0.z, spread: 1.2, speed: 9, up: 0.6, gravity: -12, drag: 1.5, life: 0.9, size: 0.5, color: ['#ffd23a', '#ffffff', '#5fe0ff'], shape: 'star' })
    const lp = L.position
    fx.burst(24, { x: lp.x, y: 0.3, z: lp.z, spread: 2.5, speed: 5, up: 0.4, gravity: -8, drag: 2, life: 0.8, size: 0.9, color: ['#fff3c0', '#ffffff'], alpha: 0.6 })
    if (cannon) {
      fx.burst(30, { x: p0.x, y: p0.y + 0.4, z: p0.z, spread: 0.8, speed: 7, dir: [0, 0.6, -1], jitter: 0.6, drag: 2.5, life: 1.2, size: 1.6, sizeEnd: 2.6, color: ['#d8dde6', '#ffffff', '#a8b0bc'], alpha: 0.7, additive: false })
      fx.burst(20, { x: p0.x, y: p0.y + 0.4, z: p0.z, spread: 0.5, speed: 10, life: 0.35, size: 1.1, color: ['#fff3a0', '#ff9a3a'] })
    }
    ringPulse(lp.x, 0.15, lp.z, '#ffd23a')
    trail.setColors(trailById(state.trail)?.colors ?? CFG.DEFAULT_TRAIL_COLORS ?? ['#ffffff', '#cfe9ff'])
    trail.start(trailPos.set(p0.x, p0.y + 1, p0.z))
    lane.begin()
  }

  // --- Events on the slime ----------------------------------------------------------------
  function splash(x, z, k, color = ['#3fe23a', '#a6ff7a', '#2fbf2a']) {
    const y = surface + 0.15
    const s = clamp(k, 0.3, 1.4)
    fx.burst(Math.round(50 * s), { x, y, z, spread: 1.2 * s, speed: 9 * s, up: 1.8, gravity: -24, drag: 0.6, life: 1.1, size: 0.65 * s, sizeEnd: 0.25, color, additive: false, shape: 'square' })
    fx.burst(Math.round(16 * s), { x, y: y + 0.3, z, spread: 2.2 * s, speed: 2.5, life: 0.7, size: 1.4 * s, color: '#c9ff9f', alpha: 0.8 })
    // the pale-blue bubbles of the reference
    fx.burst(Math.round(12 * s), { x, y: y + 0.4, z, spread: 1.6 * s, speed: 3, up: 1.4, gravity: -3, drag: 1.2, life: 1.3, size: 0.55, color: ['#bff2ff', '#8fe3ff'], alpha: 0.9 })
    ringPulse(x, surface + 0.08, z, '#a6ff7a', 5 + 5 * s)
  }
  function onSkip(seg) {
    f.skips++ // counts across re-plans (a hit starts new skips)
    const n = f.skips
    const pos = player.position
    const k = Math.min(1.3, 0.5 + seg.L / 60)
    splash(pos.x, pos.z, k)
    snd.skip(n, k)
    if (state.settings?.shake !== false) shake(0.08 + 0.1 * Math.min(1, k))
    const gain = Math.round(n * FLIGHT.skipSkill * skillPerClick())
    if (gain > 0) {
      addSkill(gain)
      f.skillGained += gain
      changed()
    }
    hud.skip(n, gain)
    f.squash = 1
    f.spinRate = TAU / seg.T // one flat spin per hop, like a skipping stone
  }
  function onSlide(seg) {
    const pos = player.position
    splash(pos.x, pos.z, 0.8)
    snd.slide(seg.T)
    setFlightView('skip')
  }
  function finishFlight() {
    const dist = f.dist
    // Wins: distance Wins (curving up with distance) x dodge bonus + boss bonuses,
    // x the usual Wins multiplier, x2 for the first LANE.beginnerFlights flights.
    const ls = lane.summary()
    const beginner = state.flights < LANE.beginnerFlights ? LANE.beginnerMult : 1
    const mult = winsMult() * ls.mult * beginner
    const wins = Math.round((distanceWins(dist) * ls.mult + ls.bonusWins) * winsMult() * beginner)
    state.wins += wins
    state.tokens += FLIGHT.raceTokensPerFlight
    state.flights++
    if (dist > state.bestDistance) state.bestDistance = dist
    if (state.stats) {
      if (dist >= 1000) state.stats.longFlights = (state.stats.longFlights ?? 0) + 1
      state.stats.dodges = (state.stats.dodges ?? 0) + ls.dodges
      state.stats.closeCalls = (state.stats.closeCalls ?? 0) + ls.near
      state.stats.laneHits = (state.stats.laneHits ?? 0) + ls.hits
      state.stats.boosts = (state.stats.boosts ?? 0) + ls.boosts
    }
    changed()
    if (state.settings?.flightAlerts !== false) {
      const sub = `${Math.floor(dist).toLocaleString('en-US')} m · ${f.skips} skips${ls.on ? ` · ${ls.dodges} dodges` : ''}${FLIGHT.raceTokensPerFlight ? ` · +${FLIGHT.raceTokensPerFlight} Race Token` : ''}`
      hud.reward(wins, mult, sub, snd.count)
      laneHud.summary(ls, beginner)
      if (beginner > 1) laneSnd.beginnerBonus()
    }
    snd.reward(wins)
    f.rewarded = true
  }

  // --- Physics tick (replaces the character controller while flying) -------------------------
  function steer(dt, pl) {
    if (f.steerLock > 0) {
      f.steerLock = Math.max(0, f.steerLock - dt) // frozen: no steering
      return
    }
    f.x = clamp(f.x + inputState.move.x * FLIGHT.steer * dt, -CHANNEL.halfWidth + 3, CHANNEL.halfWidth - 3)
    pl.facing = Math.PI - inputState.move.x * 0.35
  }
  const prevPos = new Vector3()
  function step(rawDt, pl) {
    if (!f) return
    prevPos.set(pl.position.x, pl.position.y, pl.position.z)
    const dt = f.phase === 'fly' && slowLeft > 0 ? rawDt * LANE.slowMo : rawDt // hit stop
    f.t += dt
    if (f.phase === 'summon') {
      pl.position.x = f.from.x
      pl.position.y = f.from.y
      pl.position.z = f.from.z
      pl.facing = Math.PI
      pl.grounded = true
      if (launcher.summoned()) {
        f.phase = 'hop'
        f.t = 0
        snd.hopIn()
      }
    } else if (f.phase === 'hop') {
      const s = Math.min(1, f.t / FLIGHT.hopIn)
      const seat = launcher.seat(new Vector3())
      const e = easeOut(s)
      pl.position.x = lerp(f.from.x, seat.x, e)
      pl.position.z = lerp(f.from.z, seat.z, e)
      pl.position.y = lerp(f.from.y, seat.y, e) + 4 * 1.6 * s * (1 - s)
      pl.facing = Math.PI
      pl.grounded = false
      if (s >= 1) {
        f.phase = 'pull'
        f.t = 0
        if (launcher.cannon) snd.charge(FLIGHT.pull)
        else snd.stretch(FLIGHT.pull)
      }
    } else if (f.phase === 'pull') {
      const p = easeInOut(Math.min(1, f.t / FLIGHT.pull))
      launcher.setPull(p)
      const seat = launcher.seat(new Vector3())
      pl.position.x = seat.x
      pl.position.y = seat.y
      pl.position.z = seat.z
      pl.grounded = false
      if (f.t >= FLIGHT.pull + 0.12) release()
    } else if (f.phase === 'fly' && f.held) {
      // an animal holds the player: the path waits, the feet follow its grab point
      f.held(holdTmp)
      pl.position.x = holdTmp.x
      pl.position.y = holdTmp.y
      pl.position.z = holdTmp.z
      f.x = clamp(holdTmp.x, -CHANNEL.halfWidth + 3, CHANNEL.halfWidth - 3)
      pl.grounded = false
      f.dist = Math.max(f.dist, distOf(pl.position.z))
    } else if (f.phase === 'fly') {
      steer(dt, pl)
      f.segT += dt
      let seg = f.plan.segs[f.seg]
      while (f.segT >= seg.T && f.seg < f.plan.segs.length - 1) {
        f.segT -= seg.T
        f.seg++
        seg = f.plan.segs[f.seg]
        pl.position.z = seg.z0 // land exactly where the next segment starts
        if (seg.kind === 'hop') {
          pl.position.y = surface
          onSkip(seg)
          setFlightView('skip')
        } else if (seg.kind === 'slide') onSlide(seg)
      }
      const t = Math.min(f.segT, seg.T)
      if (seg.kind === 'slide') {
        const s = t / seg.T
        pl.position.z = seg.z0 - seg.L * easeOut(s)
        pl.position.y = surface - 0.25
        pl.grounded = true
        if (f.segT >= seg.T) {
          f.dist = Math.max(f.dist, distOf(pl.position.z))
          f.phase = 'sink'
          f.t = 0
          trail.stop()
          snd.sink()
          setFlightView('rest')
          lane.end()
          finishFlight()
        }
      } else {
        if (seg.kind === 'air') f.airS = t / seg.T
        pl.position.z = seg.z0 - seg.L * (t / seg.T)
        pl.position.y = Math.max(surface, seg.y0 + seg.vy * t - 0.5 * seg.g * t * t)
        pl.grounded = false
      }
      pl.position.x = f.x
      if (f) f.dist = Math.max(f.dist, distOf(pl.position.z))
    } else if (f.phase === 'sink') {
      const s = Math.min(1, f.t / FLIGHT.sinkTime)
      pl.position.y = surface - 0.25 - 1.3 * easeInOut(s) + Math.sin(f.t * 5) * 0.06 * (1 - s)
      pl.grounded = true
      if (f.t >= Math.max(FLIGHT.sinkTime, FLIGHT.rewardTime)) {
        f.phase = 'return'
        f.t = 0
        hud.hideReward()
        laneHud.hideSummary()
        hud.fade(true)
        snd.whooshBack()
      }
    } else if (f.phase === 'return') {
      if (f.t >= 0.32) {
        end()
        return
      }
    }
    if (rawDt > 0 && f) {
      pl.velocity.x = (pl.position.x - prevPos.x) / rawDt
      pl.velocity.y = (pl.position.y - prevPos.y) / rawDt
      pl.velocity.z = (pl.position.z - prevPos.z) / rawDt
    }
  }

  function teleportToZone() {
    resetPlayer({ x: clamp(player.position.x, -20, 20), y: 0.05, z: FLY_ZONE.maxZ - 1 }, Math.PI)
    syncYawToPlayer()
  }
  function end() {
    f = null
    lane.finish()
    laneHud.hideSummary()
    launcher.remove()
    setPlayerOverride(null)
    setFlightView(null)
    hud.counter(false)
    hud.region(null)
    hud.setFlying(false)
    snd.setWind(0)
    if (state.autoFly) {
      teleportToZone()
      autoDelay = 0.6
    } else {
      resetPlayer(SPAWN, Math.PI)
      syncYawToPlayer()
    }
    setTimeout(() => hud.fade(false), 60)
    onDone?.()
  }

  // --- Frame ---------------------------------------------------------------------------------
  function inZone() {
    const p = player.position
    return p.x > FLY_ZONE.minX && p.x < FLY_ZONE.maxX && p.z > FLY_ZONE.minZ && p.z < FLY_ZONE.maxZ && p.y < 1.2
  }
  function update(dt, t) {
    const ev = launcher.update(dt, t)
    if (ev === 'landed') {
      const lp = launcher.position
      snd.plant(launcher.cannon)
      fx.burst(22, { x: lp.x, y: 0.25, z: lp.z, spread: 2.2, speed: 4, up: 0.5, gravity: -9, drag: 2, life: 0.7, size: 0.8, color: ['#fff3c0', '#ffffff'], alpha: 0.6 })
      if (state.settings?.shake !== false) shake(0.12)
    } else if (ev === 'vanishing') {
      vanishAt.copy(launcher.position)
    } else if (ev === 'gone') {
      snd.poof()
      fx.burst(30, { x: vanishAt.x, y: 2.5, z: vanishAt.z, spread: 1.8, speed: 4, up: 0.8, drag: 2.5, life: 0.8, size: 1.3, sizeEnd: 2, color: ['#ffffff', '#e9f2ff'], alpha: 0.75, additive: false })
      fx.burst(18, { x: vanishAt.x, y: 3, z: vanishAt.z, spread: 1.5, speed: 6, life: 0.7, size: 0.5, color: ['#ffe46a', '#ffffff'], shape: 'star' })
    }
    const rp = player.renderPosition
    trail.update(dt, trailPos.set(rp.x, rp.y + 0.9, rp.z), 0.26, t)
    // lane animals (slowed with the flight during a hit stop)
    const laneDt = f?.phase === 'fly' && slowLeft > 0 ? dt * LANE.slowMo : dt
    slowLeft = Math.max(0, slowLeft - dt)
    lane.update(laneDt, f?.phase === 'fly')
    if (!f) {
      const zone = inZone()
      const canFly = zone && !blocked()
      if (state.autoFly) {
        hud.showFly(false)
        if (!zone && player.position.z > FLY_ZONE.maxZ + 0.5 && autoDelay <= 0 && !blocked()) {
          teleportToZone() // walk-free auto fly: hop straight to the zone
          autoDelay = 0.4
        }
        autoDelay -= dt
        if (autoDelay <= 0 && zone && !blocked()) start()
      } else {
        if (canFly && !hud.flyVisible()) snd.flyReady()
        hud.showFly(canFly)
      }
      return
    }
    const p = player.renderPosition
    // counter, regions, milestones, personal best
    if (f.phase === 'fly' || f.phase === 'sink') {
      hud.counter(true, f.dist)
      const r = regionAt(f.dist)
      if (r !== f.region) {
        f.region = r
        hud.region(r > 0 ? RIVER_REGIONS[r] : null)
        if (r > 0 && f.phase === 'fly') {
          snd.gate(r)
          fx.burst(30, { x: p.x, y: p.y + 1, z: p.z - 6, spread: 4, speed: 6, life: 0.9, size: 0.6, color: [RIVER_REGIONS[r].color, '#ffffff'], shape: 'star' })
        }
      }
      const m = Math.floor(f.dist / FLIGHT.milestone)
      if (m > f.milestone && f.phase === 'fly') {
        f.milestone = m
        snd.milestone(m)
      }
      if (!f.bestShown && f.dist > state.bestDistance && f.phase === 'fly') {
        f.bestShown = true
        hud.best()
        snd.best()
      }
    }
    // wind: rushing air and streaks while in the air, quieter on the slime
    const speed = Math.hypot(player.velocity.x, player.velocity.y, player.velocity.z)
    const seg = f.plan?.segs[f.seg]
    const airborne = f.phase === 'fly' && seg?.kind !== 'slide'
    snd.setWind(airborne ? clamp(speed / 70, 0.15, 1) : f.phase === 'fly' ? 0.12 : 0)
    if (airborne && Math.random() < 0.9) {
      const ahead = 12 + speed * 0.12
      fx.burst(2, { x: p.x + (Math.random() - 0.5) * 16, y: p.y + (Math.random() - 0.5) * 9, z: p.z - ahead, dir: [0, 0, 1], speed: 40 + speed * 0.6, jitter: 0, life: 0.35, size: 0.25, color: '#ffffff', alpha: 0.7 })
    }
    if (f.phase === 'fly' && seg?.kind === 'slide' && Math.random() < 0.6) {
      fx.burst(3, { x: p.x + (Math.random() - 0.5) * 1.2, y: surface + 0.15, z: p.z + 0.8, spread: 0.6, speed: 3, up: 1.2, gravity: -16, life: 0.6, size: 0.35, color: ['#3fe23a', '#a6ff7a'], additive: false, shape: 'square' })
    }
    if (f.phase === 'sink' && Math.random() < 0.35) {
      fx.burst(1, { x: p.x + (Math.random() - 0.5) * 1.6, y: surface + 0.1, z: p.z + (Math.random() - 0.5) * 1.6, speed: 0.6, up: 2, gravity: 1.5, life: 0.9, size: 0.45, color: '#bff2ff', alpha: 0.85 })
    }
  }

  // --- Avatar pose (after the animator; main.js has just placed the group) ----------------
  const pivot = new Vector3(0, 0.95, 0)
  const tmp = new Vector3()
  const q = new Quaternion()
  let pitch = 0
  let roll = 0
  let spinYaw = 0
  function applyPose(group, dt) {
    group.rotation.order = 'YXZ' // spin about the world vertical, tilt in the body frame (+x = head forward)
    let targetPitch = 0
    let targetRoll = 0
    let snap = false
    if (f) {
      const seg = f.plan?.segs[f.seg]
      if (f.phase === 'pull') targetPitch = -0.3 * easeInOut(Math.min(1, f.t / FLIGHT.pull)) // leaning back into the draw
      else if (f.phase === 'fly' && f.held) {
        // caught: flailing
        targetPitch = 0.6 + Math.sin(f.t * 9) * 0.45
        targetRoll = Math.sin(f.t * 7.3) * 0.5
        f.spinRate *= Math.exp(-4 * dt)
        f.spin += f.spinRate * dt
      } else if (f.phase === 'fly' && seg?.kind === 'air' && !seg.launch) {
        // a re-planned arc (knocked / boosted): from the pose at the hit into a dive,
        // tumbling backward after a hit, a forward flip after a boost
        targetPitch = lerp(f.pitch0, 1.45 + TAU * (seg.flips ?? 0), easeOutCubic(f.airS))
        targetRoll = -inputState.move.x * 0.45
        f.spinRate *= Math.exp(-3 * dt)
        f.spin += f.spinRate * dt
        snap = true
      } else if (f.phase === 'fly' && seg?.kind === 'air') {
        // forward somersaults that settle into a superman dive
        const total = TAU * f.plan.flips + 1.3
        targetPitch = total * easeOutCubic(f.airS)
        const done = Math.floor(targetPitch / TAU)
        if (done > f.flipsDone) {
          f.flipsDone = done
          snd.flip()
        }
        targetRoll = -inputState.move.x * 0.45
        snap = true
      } else if (f.phase === 'fly') {
        targetPitch = 1.45 - f.squash * 0.25
        targetRoll = -inputState.move.x * 0.3
        if (seg?.kind === 'slide') f.spinRate *= Math.exp(-2.2 * dt)
        f.spin += f.spinRate * dt
        f.squash = Math.max(0, f.squash - dt * 5)
      } else if (f.phase === 'sink' || f.phase === 'return') {
        targetPitch = lerp(1.45, 0.25, easeInOut(Math.min(1, f.t / 0.8)))
        f.spinRate *= Math.exp(-3 * dt)
        f.spin += f.spinRate * dt
      }
      spinYaw = f.spin
    } else spinYaw = 0
    if (snap) pitch = targetPitch
    else pitch += (targetPitch - pitch) * Math.min(1, dt * 10)
    roll += (targetRoll - roll) * Math.min(1, dt * 8)
    if (!f && Math.abs(pitch) < 1e-3) pitch = 0
    group.rotation.x = pitch
    group.rotation.z = roll
    group.rotation.y += spinYaw
    // rotate about the waist instead of the feet
    q.setFromEuler(group.rotation)
    tmp.copy(pivot).applyQuaternion(q)
    group.position.x += pivot.x - tmp.x
    group.position.y += pivot.y - tmp.y
    group.position.z += pivot.z - tmp.z
  }

  return {
    update,
    applyPose,
    teleportToZone,
    active: () => !!f,
    // Body tilt for the other players' copy of this flight (net.js `pose`): somersault, bank, spin.
    pose: () => ({ pitch, roll, spin: f ? spinYaw : 0 }),
    debug: () => f, // dev console: __game.game.flight.debug()
    lane, // dev console: __game.game.flight.lane.debug()
  }
}
