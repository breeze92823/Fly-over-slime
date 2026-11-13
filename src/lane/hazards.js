import {
  AdditiveBlending,
  CircleGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three'
import { CHANNEL, FLIGHT, GEAR, LANE, LANE_ANIMALS, LANE_BOSSES, LANE_HELPERS, LANE_SHOTS, PLAZA, RIVER_REGIONS } from '../config.js'
import { BOSS_BUILDERS, BUILDERS } from './animals.js'
import * as snd from '../audio/lane.js'
import { gearLevel, state } from '../state.js'

// The lane animals (see LANE in config.js). Driven by flight.js while the player is
// in the 'fly' phase; flight.js owns the planned path and hands us `ops`:
//   timeTo(z)   s until the player reaches z on the current plan (Infinity = never)
//   zAfter(s)   z the player is at after s more seconds (null = the flight ends first)
//   yAt(z)      planned feet height at z;  endZ() z where the plan ends
//   dist()      the flight's distance so far;  planD() the planned flight distance
//   getX()/setX(x) lateral position;  lockSteer(s)
//   knock({ factor, apex, airShare, flips })  re-plan from here with remaining x factor
//   hold(getPoint)  pause the path, the player's feet follow getPoint(out)
//   release({ factor, apex, airShare, flips, resetDist })  re-plan from the held spot
//   boost({ add, apex, airShare, flips })  extend the flight by `add` m
//   slowMo(s)   short hit stop;  shake(m);  renderPos  the player's drawn feet position
// Every encounter: spawn ahead with a warning -> 'tell' -> 'attack' (strike exactly when the
// player crosses its z) -> resolve (dodge / close call / hit / blocked) -> 'hold'? -> 'recover'.

const surface = CHANNEL.slimeY
const halfW = CHANNEL.halfWidth
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const lerp = (a, b, k) => a + (b - a) * k
const rnd = (lo, hi) => lo + Math.random() * (hi - lo)
const distOf = (z) => Math.max(0, PLAZA.minZ - z)
const ALL = Object.fromEntries([...LANE_ANIMALS, ...Object.values(LANE_SHOTS), ...LANE_HELPERS.map((h) => ({ ...h, helper: true }))].map((d) => [d.id, d]))

export const regionIndex = (d) => {
  let i = 0
  while (i + 1 < RIVER_REGIONS.length && d >= RIVER_REGIONS[i + 1].at) i++
  return i
}
// Distance Wins: x(1 + (d / at)^exp), so the far end of the river pays far more per metre.
export const distanceWins = (d) => Math.floor((Math.max(0, d) / FLIGHT.metresPerWin) * (1 + Math.pow(Math.max(0, d) / LANE.wins.at, LANE.wins.exp)))
export const encounterRate = (d) => Math.min(LANE.maxRate, LANE.rate * Math.pow(2, d / LANE.doubleEvery))
export const tellTime = (d) => lerp(LANE.tell[0], LANE.tell[1], Math.min(1, d / LANE.tellAt)) + gearLevel('radar') * gearPer('radar')
const gearPer = (id) => GEAR.find((g) => g.id === id)?.per ?? 0
const dashCooldown = (lv) => { const c = GEAR.find((g) => g.id === 'dash').cooldown; return c[Math.min(c.length, Math.max(1, lv)) - 1] }
export function penaltyOf(def, d) {
  let p = def.penalty * Math.min(1 + d / LANE.penaltyAt, 3)
  p *= 1 - gearLevel('wings') * gearPer('wings')
  if (def.kind === 'grab' || def.kind === 'trap' || def.kind === 'carry') p *= 1 - gearLevel('suit') * gearPer('suit')
  if (def.boots || def.kind === 'pull') p *= 1 - gearLevel('boots') * gearPer('boots')
  return clamp(p, 0.02, LANE.penaltyMax)
}

// --- Warning markers (pooled): a lock-on reticle at the strike point + a patch on the slime ---
function createMarkers(scene) {
  const ringGeo = new RingGeometry(0.82, 1, 40)
  const thinGeo = new RingGeometry(0.93, 1, 40)
  const discGeo = new CircleGeometry(1, 36)
  const planeGeo = new PlaneGeometry(1, 1)
  const pool = []
  const mk = (geo, color, opacity) => new Mesh(geo, new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }))
  for (let i = 0; i < 16; i++) {
    const g = new Group()
    const outer = mk(ringGeo, '#ff3a3a', 0.9)
    const inner = mk(thinGeo, '#ffffff', 0.9)
    const floor = mk(discGeo, '#ff3a3a', 0.35)
    floor.rotation.x = -Math.PI / 2
    const left = mk(planeGeo, '#ff3a3a', 0.3)
    const right = mk(planeGeo, '#ff3a3a', 0.3)
    const gapL = mk(planeGeo, '#7dff5a', 0.8)
    const gapR = mk(planeGeo, '#7dff5a', 0.8)
    for (const p of [left, right]) p.rotation.x = -Math.PI / 2
    g.add(outer, inner, floor, left, right, gapL, gapR)
    g.visible = false
    scene.add(g)
    pool.push({ g, outer, inner, floor, left, right, gapL, gapR, used: false })
  }
  return {
    get() {
      const m = pool.find((p) => !p.used)
      if (!m) return null
      m.used = true
      m.g.visible = true
      return m
    },
    free(m) {
      if (!m) return
      m.used = false
      m.g.visible = false
    },
    // k = 0..1 toward the strike; enc = the encounter.
    draw(m, enc, k, time) {
      const helper = !!enc.def.helper
      const col = helper ? '#ffd23a' : k > 0.75 ? '#ff2020' : '#ff5a3a'
      const stealth = enc.def.stealth && enc.phase === 'tell' ? 0.25 : 1
      const blink = 0.75 + 0.25 * Math.sin(time * (10 + 20 * k))
      const t = enc.s.target
      const wall = enc.gap
      m.outer.visible = m.inner.visible = !wall && !enc.area
      m.floor.visible = !wall && !enc.area
      m.left.visible = m.right.visible = !!wall || !!enc.area
      m.gapL.visible = m.gapR.visible = !!wall
      if (wall) {
        // the blocked lane in red on the slime, two green posts marking the gap
        const y = surface + 0.06
        const lw = wall.x0 + halfW
        const rw = halfW - wall.x1
        m.left.position.set(-halfW + lw / 2, y, t.z)
        m.left.scale.set(Math.max(0.01, lw), 6, 1)
        m.right.position.set(wall.x1 + rw / 2, y, t.z)
        m.right.scale.set(Math.max(0.01, rw), 6, 1)
        for (const [p, x] of [[m.gapL, wall.x0], [m.gapR, wall.x1]]) {
          const hgt = Math.max(4, t.y - surface + 5)
          p.position.set(x, surface + hgt / 2, t.z)
          p.scale.set(0.5, hgt, 1)
          p.material.opacity = 0.55 + 0.35 * blink
        }
        m.left.material.color.set(col)
        m.right.material.color.set(col)
        m.left.material.opacity = m.right.material.opacity = (0.22 + 0.25 * k) * blink
        return
      }
      if (enc.area) {
        const len = enc.area
        m.left.position.set(enc.x, surface + 0.06, t.z)
        m.left.scale.set(enc.r * 2, len, 1)
        m.left.material.color.set(enc.def.color)
        m.left.material.opacity = 0.3 * blink
        m.right.visible = false
        return
      }
      const r = enc.r
      m.outer.position.copy(t)
      m.outer.scale.setScalar(r)
      m.outer.material.color.set(col)
      m.outer.material.opacity = 0.85 * blink * stealth
      m.inner.position.copy(t)
      m.inner.scale.setScalar(r * lerp(3.2, 1, k))
      m.inner.rotation.z = time * 2
      m.inner.material.color.set(helper ? '#fff6c0' : '#ffffff')
      m.inner.material.opacity = 0.9 * stealth
      m.floor.position.set(enc.x, surface + 0.06, t.z)
      m.floor.scale.setScalar(r * (helper ? 1 : 1.15))
      m.floor.material.color.set(col)
      m.floor.material.opacity = (helper ? 0.3 : 0.2 + 0.3 * k) * blink * stealth
    },
  }
}

export function createLane({ scene, fx, hud, ops }) {
  const markers = createMarkers(scene)
  const encs = []
  let run = null
  let boss = null
  const P = new Vector3() // scratch: the player's feet
  const holdPoint = new Vector3()

  // The shield bubble around the player.
  const shield = new Mesh(
    new SphereGeometry(1.6, 28, 20),
    new MeshStandardMaterial({ color: '#8fe8ff', emissive: '#5fd0ff', emissiveIntensity: 0.35, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.2, depthWrite: false }),
  )
  shield.visible = false
  scene.add(shield)

  const enabled = () => state.flights >= LANE.tutorialFlights

  // --- Flight lifecycle ------------------------------------------------------------------
  function begin() {
    clearAll()
    const dashLv = gearLevel('dash')
    run = {
      on: enabled(),
      time: 0,
      nextSpawn: LANE.startDelay,
      nextHelper: rnd(LANE.helperEvery[0], LANE.helperEvery[1]) * 0.6,
      shields: gearLevel('shield'),
      dashLv,
      dashCd: 0,
      dashT: 0,
      dashDir: 1,
      streak: 0,
      bestStreak: 0,
      dodges: 0,
      near: 0,
      hits: 0,
      blocked: 0,
      boosts: 0,
      bonusWins: 0, // distance-Wins units, x winsMult at the end
      bossesBeaten: [],
      bossesTried: new Set(),
      held: null, // the encounter holding the player
      trap: null, // { taps, need, t }
      drainBuzz: 0,
      hum: 0,
      region: -1,
      lastAlert: '',
      lastAlertAt: -9,
      aura: 0,
    }
    hud.start({ shields: run.shields, dash: dashLv > 0, on: run.on })
    if (run.shields > 0) snd.shieldUp()
    if (run.on && state.flights === LANE.tutorialFlights) hud.tip('Animals ahead! Steer with A / D or the joystick to dodge.')
  }
  function end() {
    if (!run) return
    if (boss) bossOutro(false)
    for (const e of encs) if (!e.resolved) toRecover(e, false)
    run.trap = null
    hud.trap(false)
    snd.setBuzz(0)
    snd.setHum(0)
    hud.stop()
    shield.visible = false
  }
  function clearAll() {
    for (const e of encs) dispose(e)
    encs.length = 0
    if (boss) {
      scene.remove(boss.model.root)
      boss = null
    }
    hud.boss(null)
  }
  function dispose(e) {
    scene.remove(e.model.root)
    e.model.dispose?.()
    markers.free(e.marker)
    e.marker = null
  }

  // --- Spawning ------------------------------------------------------------------------------
  function zoneOk(def, y) {
    if (def.zone === 'low') return y - surface <= (def.reach ?? 8)
    return true
  }
  function pickWeighted(list) {
    let sum = 0
    for (const d of list) sum += d.weight ?? 1
    let r = Math.random() * sum
    for (const d of list) if ((r -= d.weight ?? 1) <= 0) return d
    return list[list.length - 1]
  }
  function homeFor(def, t, side, x) {
    const h = new Vector3(x, surface, t.z)
    const sx = (o) => clamp(x + side * o, -halfW + 2, halfW - 2)
    switch (def.id) {
      case 'frog': case 'chameleon': case 'penguin': case 'squid': case 'puffer': case 'crab':
        h.set(sx(rnd(8, 12)), surface, t.z + rnd(-2, 4))
        break
      case 'duck':
        h.set(side * (halfW + 6), t.y + 9, t.z - 35)
        break
      case 'goat':
        h.set(side * (halfW - 1), surface + 1, t.z)
        break
      case 'turtle':
        h.set(side * (halfW - 1), surface, t.z + 6)
        break
      case 'owl':
        h.set(x, t.y + 28, t.z - 30)
        break
      case 'bat':
        h.set(sx(10), t.y + 8, t.z - 30)
        break
      case 'pelican':
        h.set(x, t.y + 16, t.z - 55)
        break
      case 'bees':
        h.set(side * halfW, t.y + 6, t.z - 25)
        break
      case 'snail':
        h.set(x, surface, t.z - (def.length ?? 60) * 0.6)
        break
      case 'seagull':
        h.set(sx(15), t.y + 6, t.z - 30)
        break
      default:
        break
    }
    return h
  }
  // lead = s from now to the strike; x = strike lane position; opts: { home, gap, boss }
  function spawn(def, lead, x, opts = {}) {
    if (encs.length >= LANE.maxAlive + 4) return null
    const z = ops.zAfter(lead)
    if (z == null) return null
    const builder = BUILDERS[def.id]
    if (!builder) return null
    const y = ops.yAt(z)
    const side = opts.side ?? (x > 0 ? -1 : 1) * (Math.random() < 0.8 ? 1 : -1)
    const target = new Vector3(clamp(x, -halfW + 2, halfW - 2), y + 0.9, z)
    let gap = null
    if (def.wall) {
      const w = def.wall
      const c = clamp(opts.gapCenter ?? x, -halfW + w / 2 + 1, halfW - w / 2 - 1)
      gap = { x0: c - w / 2, x1: c + w / 2 }
      target.x = c
    }
    const area = def.length ?? 0
    const model = builder({ scale: 1, region: regionIndex(distOf(z)), fx })
    scene.add(model.root)
    const e = {
      def,
      id: def.id,
      model,
      z: area ? z + area / 2 : z, // areas start at their near edge
      x: target.x,
      r: def.r ?? 3,
      gap,
      area,
      attack: def.attack ?? 0.5,
      tell0: Math.max(0.2, lead - (def.attack ?? 0.5)),
      phase: 'tell',
      resolved: false,
      hit: false,
      holdDur: 0,
      recoverDur: def.helper ? 1 : 1.2,
      phaseT: 0,
      drained: 0,
      boss: !!opts.boss,
      marker: markers.get(),
      s: {
        phase: 'tell',
        k: 0,
        phaseT: 0,
        phaseDur: 1,
        t: 0,
        dt: 0,
        time: 0,
        hit: false,
        home: opts.home ? opts.home.clone() : homeFor(def, target, side, target.x),
        target,
        player: P,
        surface,
        halfWidth: halfW,
        side,
        gap,
        length: area,
        carry: def.carry ?? 0,
        fx,
      },
    }
    encs.push(e)
    snd.warn(def.id)
    if (!def.helper && !opts.boss && (run.lastAlert !== def.id || run.time - run.lastAlertAt > 1.2)) {
      run.lastAlert = def.id
      run.lastAlertAt = run.time
      hud.alert(def.name, def.color, x < ops.getX() - 2 ? -1 : x > ops.getX() + 2 ? 1 : 0)
    }
    if (def.helper) hud.alert(def.name, def.color, 0, true)
    // first update so the model is placed before it renders
    e.model.update(e.s)
    return e
  }
  function trySpawnAnimal() {
    const d = ops.dist()
    const tell = tellTime(d)
    const probe = ops.zAfter(tell + 0.5)
    if (probe == null) return false
    const dS = distOf(probe)
    if (dS < LANE.grace) return false
    const endD = distOf(ops.endZ())
    if (endD - dS < LANE.minAfter) return false
    const yS = ops.yAt(probe)
    const pool = LANE_ANIMALS.filter((a) => dS >= a.at && zoneOk(a, yS))
    if (!pool.length) return false
    const def = pickWeighted(pool)
    const px = ops.getX()
    const reach = Math.max(6, FLIGHT.steer * (tell + def.attack) * 0.6)
    const n = def.group ?? 1
    for (let i = 0; i < n; i++) {
      const jitter = def.group ? (i % 2 ? -1 : 1) * rnd(2, 5) : rnd(-LANE.aimJitter, LANE.aimJitter)
      spawn(def, tell + def.attack + i * (def.gap ?? 0), px + jitter, { gapCenter: px + rnd(-reach, reach) })
    }
    return true
  }
  function trySpawnHelper() {
    const lead = 1.5
    const z = ops.zAfter(lead + 0.5)
    if (z == null) return
    if (distOf(ops.endZ()) - distOf(z) < LANE.minAfter) return
    const y = ops.yAt(z)
    const pool = LANE_HELPERS.filter((h) => zoneOk(h, y)).map((h) => ALL[h.id])
    if (!pool.length) return
    const def = pool[Math.floor(Math.random() * pool.length)]
    spawn(def, lead + def.attack, ops.getX() + rnd(-11, 11))
  }

  // --- Resolution ------------------------------------------------------------------------------
  function toRecover(e, hit) {
    e.resolved = true
    e.hit = hit
    e.phase = 'recover'
    e.phaseT = 0
    markers.free(e.marker)
    e.marker = null
  }
  function playerX() {
    return ops.getX()
  }
  function resolve(e) {
    const px = playerX()
    const py = ops.renderPos().y
    let hit
    let near = false
    if (e.gap) {
      hit = px < e.gap.x0 - 0.3 || px > e.gap.x1 + 0.3
      near = !hit && (px - e.gap.x0 < 1.5 || e.gap.x1 - px < 1.5)
    } else {
      const dx = Math.abs(px - e.x)
      hit = dx < e.r
      near = !hit && dx < e.r + LANE.nearMiss
      if (e.def.zone === 'low' && py - surface > (e.def.reach ?? 8) + 3) {
        hit = false
        near = false
      }
    }
    if (e.def.helper) {
      if (e.boss && boss) boss.dodged++ // boss geysers are optional
      if (hit) collect(e)
      else toRecover(e, false)
      return
    }
    if (hit) strike(e)
    else {
      toRecover(e, false)
      snd.miss(e.id)
      dodged(near, e)
    }
  }
  function dodged(near, e) {
    run.streak++
    run.dodges++
    if (run.streak > run.bestStreak) run.bestStreak = run.streak
    if (near) {
      run.near++
      snd.nearMiss(run.streak)
      hud.pop('CLOSE CALL!', '#7dff5a', 'near')
      const p = ops.renderPos()
      fx.burst(18, { x: p.x, y: p.y + 1, z: p.z, spread: 1.2, speed: 6, life: 0.6, size: 0.5, color: ['#7dff5a', '#ffffff', '#ffd23a'], shape: 'star' })
    } else snd.dodge(run.streak)
    if (run.streak % LANE.streakEvery === 0) {
      snd.combo(run.streak)
      hud.pop(`${run.streak} DODGE STREAK!`, '#ffd23a', 'combo')
    }
    hud.dodge(run.streak, dodgeMult())
    if (e?.boss && boss) boss.dodged++
  }
  function dodgeMult() {
    return 1 + Math.min(LANE.bonusMax, run.dodges * LANE.dodgeBonus + run.near * LANE.nearBonus)
  }
  function remaining() {
    return Math.max(0, distOf(ops.endZ()) - ops.dist())
  }
  function impact(e, color = '#ffffff') {
    const p = ops.renderPos()
    fx.burst(28, { x: p.x, y: p.y + 1, z: p.z, spread: 0.8, speed: 11, life: 0.55, size: 0.7, color: ['#ffffff', '#fff3a0', color], shape: 'star' })
    fx.burst(14, { x: p.x, y: p.y + 1, z: p.z, spread: 1.2, speed: 3, life: 0.45, size: 2.2, sizeEnd: 3.4, color: '#ffffff', alpha: 0.5 })
    ops.shake(0.45)
    ops.slowMo(LANE.hitStop)
    hud.flash(e.def.color)
  }
  function strike(e) {
    if (run.shields > 0 && e.def.kind !== 'drain') {
      run.shields--
      run.blocked++
      toRecover(e, false)
      snd.shieldBlock()
      hud.shields(run.shields)
      hud.pop('BLOCKED!', '#8fe8ff', 'block')
      const p = ops.renderPos()
      fx.burst(40, { x: p.x, y: p.y + 1, z: p.z, spread: 2.6, speed: 8, life: 0.7, size: 0.6, color: ['#bff6ff', '#ffffff', '#5fd0ff'], shape: 'star' })
      ops.shake(0.2)
      return
    }
    const d = ops.dist()
    const pen = penaltyOf(e.def, d)
    const rem = remaining()
    run.hits++
    run.streak = 0
    hud.dodge(0, dodgeMult())
    snd.hit(e.id)
    impact(e, e.def.color)
    const kind = e.def.kind
    const lost = Math.round(rem * pen)
    if (kind === 'grab' || kind === 'carry') {
      e.resolved = true
      e.hit = true
      e.phase = 'hold'
      e.phaseT = 0
      e.holdDur = (e.def.hold ?? 0.8) * (1 - gearLevel('suit') * gearPer('suit') * 0.7)
      e.pen = pen
      markers.free(e.marker)
      e.marker = null
      run.held = e
      ops.hold((out) => (e.model.grabPoint ? e.model.grabPoint(out) : out.copy(e.s.target)))
      hud.ouch(kind === 'carry' ? `${e.def.name}!` : 'GRABBED!', lost + (kind === 'carry' ? e.def.carry : 0))
      return
    }
    if (kind === 'trap') {
      e.resolved = true
      e.hit = true
      e.phase = 'hold'
      e.phaseT = 0
      e.holdDur = LANE.trap.timeout
      e.pen = pen
      markers.free(e.marker)
      e.marker = null
      run.held = e
      run.trap = { taps: 0, need: Math.max(3, Math.round(LANE.trap.taps - gearLevel('escape') * gearPer('escape'))), t: 0 }
      ops.hold((out) => (e.model.grabPoint ? e.model.grabPoint(out) : out.copy(e.s.target)))
      snd.trapped(e.id)
      hud.trap(true, 0, run.trap.need)
      hud.ouch('TRAPPED!', lost)
      return
    }
    toRecover(e, true)
    hud.ouch(kind === 'freeze' ? 'FROZEN!' : kind === 'ink' ? 'INKED!' : kind === 'clip' ? 'SNIPPED!' : kind === 'sticky' ? 'STUCK!' : 'OUCH!', lost)
    if (kind === 'freeze') {
      ops.knock({ factor: 1 - pen, apex: 0.4, airShare: 0.35, flips: 0 })
      ops.lockSteer(e.def.freeze ?? 1.5)
      snd.freeze()
      hud.frost(e.def.freeze ?? 1.5)
      setTimeout(() => snd.thaw(), (e.def.freeze ?? 1.5) * 1000)
    } else if (kind === 'ink') {
      ops.knock({ factor: 1 - pen, apex: 1.2, airShare: 0.45, flips: -1 })
      snd.inked()
      hud.ink(e.def.ink ?? 2.2)
    } else if (kind === 'sticky') {
      ops.knock({ factor: 1 - pen, apex: 0, airShare: 0.02, flips: 0 })
    } else {
      ops.knock({ factor: 1 - pen, apex: e.def.boots ? 0.3 : 1.4, airShare: 0.3, flips: -1 })
    }
  }
  function releaseHeld(escaped) {
    const e = run.held
    if (!e) return
    run.held = null
    const extra = run.trap ? run.trap.t * LANE.trap.perSecond : 0
    run.trap = null
    hud.trap(false)
    const factor = Math.max(0.05, 1 - Math.min(LANE.penaltyMax, (e.pen ?? 0.2) + extra))
    e.phase = 'recover'
    e.phaseT = 0
    if (escaped) {
      snd.escape()
      hud.pop('ESCAPED!', '#7dff5a', 'near')
    }
    ops.release({ factor, apex: e.def.kind === 'carry' ? 3 : 2.2, airShare: 0.35, flips: -1, resetDist: e.def.kind === 'carry' })
  }
  function collect(e) {
    toRecover(e, true)
    run.boosts++
    const add = Math.max(LANE.boostMin, ops.planD() * LANE.boostFrac)
    const got = ops.boost({ add, apex: e.def.apex ?? 8, airShare: 0.55, flips: 1 })
    snd.boost(e.id)
    hud.pop(`+${Math.round(got)} m BOOST!`, '#ffd23a', 'boost')
    const p = ops.renderPos()
    fx.burst(46, { x: p.x, y: p.y + 1, z: p.z, spread: 1.5, speed: 10, up: 1.4, life: 0.9, size: 0.6, color: ['#ffd23a', '#ffffff', e.def.color], shape: 'star' })
    ops.shake(0.15)
  }

  // --- Player actions ----------------------------------------------------------------------------
  function dash(dir) {
    if (!run || run.dashLv <= 0 || run.dashCd > 0 || run.held) return false
    run.dashCd = dashCooldown(run.dashLv)
    run.dashT = LANE.dash.time
    run.dashDir = dir || (ops.getX() > 0 ? -1 : 1)
    snd.dash()
    const p = ops.renderPos()
    fx.burst(26, { x: p.x, y: p.y + 1, z: p.z, spread: 0.6, speed: 7, dir: [-run.dashDir, 0, 0.3], jitter: 2, life: 0.45, size: 0.9, sizeEnd: 0.2, color: ['#bff6ff', '#ffffff', '#5fe0ff'] })
    return true
  }
  function mash() {
    if (!run?.trap) return false
    run.trap.taps++
    snd.mashTap(run.trap.taps, run.trap.need)
    hud.trap(true, run.trap.taps, run.trap.need)
    const p = ops.renderPos()
    fx.burst(6, { x: p.x, y: p.y + 1, z: p.z, spread: 1.5, speed: 4, life: 0.4, size: 0.4, color: ['#ffffff', '#bff2ff'], shape: 'star' })
    ops.shake(0.06)
    if (run.trap.taps >= run.trap.need) releaseHeld(true)
    return true
  }

  // --- Bosses ------------------------------------------------------------------------------------
  function maybeBoss() {
    if (boss || run.held) return
    const d = ops.dist()
    const endD = distOf(ops.endZ())
    for (const B of LANE_BOSSES) {
      if (run.bossesTried.has(B.id) || d < B.at) continue
      run.bossesTried.add(B.id)
      if (endD - B.at < B.after || d > B.at + 200) continue
      const build = BOSS_BUILDERS[B.id]
      if (!build) continue
      const model = build({ scale: 1, region: regionIndex(d), fx })
      scene.add(model.root)
      boss = {
        def: B,
        model,
        phase: 'intro',
        t: 0,
        phaseT: 0,
        fired: 0,
        dodged: 0,
        nextShot: B.intro,
        side: Math.random() < 0.5 ? -1 : 1,
        b: { phase: 'intro', k: 0, player: P, vel: new Vector3(), side: 1, surface, halfWidth: halfW, t: 0, dt: 0, time: 0, aim: new Vector3(), fx, escaped: false },
        shots: [],
      }
      boss.b.side = boss.side
      snd.bossIntro(B.id)
      hud.boss(B, 0)
      ops.shake(0.3)
      return
    }
  }
  function bossFire() {
    const B = boss.def
    const id = B.shot[boss.fired % B.shot.length]
    const def = ALL[id]
    const muzzle = boss.model.muzzle ? boss.model.muzzle(new Vector3()) : ops.renderPos().clone()
    const lead = 1.05 + def.attack
    const e = spawn(def, lead, ops.getX() + rnd(-LANE.aimJitter, LANE.aimJitter), { home: muzzle, boss: true, gapCenter: ops.getX() + rnd(-12, 12) })
    if (e) boss.shots.push(e)
    boss.fired++
  }
  function bossOutro(escaped) {
    if (!boss || boss.phase === 'outro') return
    boss.phase = 'outro'
    boss.phaseT = 0
    boss.b.escaped = escaped
    hud.boss(null)
    if (escaped) {
      const key = `boss_${boss.def.id}`
      const first = !(state.stats?.[key] > 0)
      if (state.stats) state.stats[key] = (state.stats[key] ?? 0) + 1
      // more for a clean escape: half the bonus for surviving, the rest by shots dodged
      const clean = boss.def.shots ? Math.min(1, boss.dodged / boss.def.shots) : 1
      const bonus = Math.round(distanceWins(boss.def.at) * boss.def.bonus * (first ? 3 : 1) * (0.5 + 0.5 * clean))
      run.bonusWins += bonus
      run.bossesBeaten.push(boss.def.name)
      snd.bossEscaped(boss.def.id)
      hud.bossWin(boss.def, bonus, first)
      const p = ops.renderPos()
      fx.burst(70, { x: p.x, y: p.y + 2, z: p.z - 4, spread: 4, speed: 12, up: 1.3, gravity: -6, life: 1.4, size: 0.7, color: ['#ffd23a', '#ffffff', boss.def.color], shape: 'star' })
    }
  }
  function updateBoss(dt) {
    if (!boss) return
    boss.t += dt
    boss.phaseT += dt
    const B = boss.def
    const b = boss.b
    b.t = boss.t
    b.dt = dt
    b.time = run.time
    b.vel.copy(ops.velocity())
    if (boss.phase === 'intro') {
      b.k = Math.min(1, boss.phaseT / B.intro)
      if (boss.phaseT >= B.intro) {
        boss.phase = 'fight'
        boss.phaseT = 0
      }
    } else if (boss.phase === 'fight' || boss.phase === 'windup') {
      if (!run.held) boss.nextShot -= dt
      if (boss.fired < B.shots) {
        if (boss.phase === 'fight' && boss.nextShot <= B.windup) {
          boss.phase = 'windup'
          boss.phaseT = 0
          snd.bossWindup(B.id)
          b.aim.set(ops.getX(), P.y + 1, P.z - 30)
        }
        if (boss.phase === 'windup') {
          b.k = Math.min(1, boss.phaseT / B.windup)
          if (boss.nextShot <= 0) {
            bossFire()
            boss.phase = 'fight'
            boss.phaseT = 0
            boss.nextShot = B.every
            hud.boss(B, boss.fired)
          }
        } else b.k = (boss.phaseT % 1) / 1
      } else {
        b.k = (boss.phaseT % 1) / 1
        if (!run.held && boss.shots.every((e) => e.resolved && e.phase !== 'hold')) bossOutro(true)
      }
    } else if (boss.phase === 'outro') {
      b.k = Math.min(1, boss.phaseT / 1.6)
      if (boss.phaseT >= 1.6) {
        scene.remove(boss.model.root)
        boss.model.dispose?.()
        boss = null
        return
      }
    }
    b.phase = boss.phase
    boss.model.update(b)
  }

  // --- Frame -------------------------------------------------------------------------------------
  function update(dt, flying) {
    if (!run) {
      if (encs.length || boss) tickEncounters(dt, false)
      return
    }
    run.time += dt
    P.copy(ops.renderPos())
    const d = ops.dist()

    // region / danger level
    const reg = regionIndex(d)
    if (reg !== run.region) {
      if (run.region >= 0 && run.on && reg > run.region) snd.danger(reg + 1)
      run.region = reg
      hud.danger(reg + 1, RIVER_REGIONS[reg].name, encounterRate(d))
    }

    if (flying && run.on && !run.held) {
      run.nextSpawn -= dt
      if (run.nextSpawn <= 0) {
        const alive = encs.filter((e) => !e.resolved && !e.def.helper).length
        if (!boss && alive < LANE.maxAlive) trySpawnAnimal()
        run.nextSpawn = Math.max(0.3, (1 / encounterRate(d)) * rnd(0.75, 1.25))
      }
      run.nextHelper -= dt
      if (run.nextHelper <= 0) {
        if (!boss) trySpawnHelper()
        run.nextHelper = rnd(LANE.helperEvery[0], LANE.helperEvery[1])
      }
      maybeBoss()
    }
    if (boss && !flying && boss.phase !== 'outro') bossOutro(false)
    updateBoss(dt)

    // Air Dash
    if (run.dashCd > 0) run.dashCd = Math.max(0, run.dashCd - dt)
    if (run.dashT > 0 && !run.held) {
      const step = Math.min(dt, run.dashT)
      run.dashT -= step
      ops.setX(clamp(ops.getX() + run.dashDir * (LANE.dash.dist / LANE.dash.time) * step, -halfW + 3, halfW - 3))
      if (Math.random() < 0.8) fx.burst(3, { x: P.x, y: P.y + 1, z: P.z + 0.5, spread: 0.6, speed: 2, life: 0.35, size: 1.1, sizeEnd: 0.2, color: ['#bff6ff', '#ffffff'], alpha: 0.7 })
    }
    if (run.dashLv > 0) hud.dashState(1 - run.dashCd / dashCooldown(run.dashLv))

    // trapped: mash to escape, time costs distance
    if (run.trap) {
      run.trap.t += dt
      hud.trapTime(1 - run.trap.t / LANE.trap.timeout)
    }

    tickEncounters(dt, flying)

    // shield bubble + streak aura on the player
    shield.visible = run.shields > 0 && flying
    if (shield.visible) {
      shield.position.set(P.x, P.y + 0.95, P.z)
      const w = 1 + 0.05 * Math.sin(run.time * 6)
      shield.scale.set(w, 2 - w, w)
      shield.material.opacity = 0.22 + 0.06 * Math.sin(run.time * 3)
    }
    if (flying && run.streak >= 3 && state.settings?.effects !== false) {
      run.aura += dt * (run.streak >= 8 ? 40 : 18)
      while (run.aura >= 1) {
        run.aura -= 1
        const hot = run.streak >= 8
        fx.burst(1, { x: P.x + rnd(-0.7, 0.7), y: P.y + rnd(0.2, 1.8), z: P.z + rnd(-0.4, 0.8), speed: 1.2, up: 1, life: hot ? 0.55 : 0.7, size: hot ? 0.75 : 0.4, sizeEnd: 0.1, color: hot ? ['#ffdf5a', '#ff8a1a', '#ff3a1a'] : ['#fff3a0', '#ffffff', '#ffd23a'], shape: hot ? 'dot' : 'star' })
      }
    }
    snd.setBuzz(run.drainBuzz)
    snd.setHum(run.hum)
  }

  function tickEncounters(dt, flying) {
    const time = run ? run.time : 0
    let buzz = 0
    let hum = 0
    for (let i = encs.length - 1; i >= 0; i--) {
      const e = encs[i]
      e.phaseT += dt
      const s = e.s
      s.t += dt
      s.dt = dt
      s.time = time
      if (!e.resolved && run) {
        // keep aiming at where the player will be (the plan may have changed)
        const left = ops.timeTo(e.z)
        if (!isFinite(left)) {
          toRecover(e, false)
        } else {
          if (!e.area) s.target.y = ops.yAt(e.gap ? e.z : e.z) + 0.9
          if (left > e.attack) {
            e.phase = 'tell'
            s.phaseDur = e.tell0
            s.k = clamp(1 - (left - e.attack) / e.tell0, 0, 1)
          } else {
            if (e.phase === 'tell') snd.attack(e.id)
            e.phase = 'attack'
            s.phaseDur = e.attack
            s.k = clamp(1 - left / e.attack, 0, 1)
          }
          s.phaseT = e.phase === 'tell' ? s.k * e.tell0 : s.k * e.attack
          // Magnet Mole pull
          if (e.def.kind === 'pull' && left < 1.8 && flying && !run.held) {
            const dx = e.x - ops.getX()
            if (Math.abs(dx) < 25) {
              const pull = (e.def.pull ?? 10) * (1 - gearLevel('boots') * gearPer('boots'))
              ops.setX(ops.getX() + Math.sign(dx) * Math.min(Math.abs(dx), pull * dt))
              hum = Math.max(hum, 1 - left / 1.8)
            }
          }
          if (e.marker) markers.draw(e.marker, e, s.k * (e.phase === 'attack' ? 1 : 0.75), time)
          if (e.area) {
            // inside the area: bees drain, the snail trail sticks
            const pz = P.z
            const inZ = pz <= e.z && pz >= e.z - e.area
            if (left <= 0 || inZ) {
              e.phase = 'attack'
              s.k = clamp((e.z - pz) / e.area, 0, 1)
              const inX = Math.abs(ops.getX() - e.x) < e.r
              if (e.def.kind === 'drain') {
                buzz = Math.max(buzz, inX ? 1 : 0.4)
                if (inX && flying && !run.held) {
                  e.drained = Math.min(0.7, e.drained + penaltyOf(e.def, ops.dist()) * dt)
                  if (Math.random() < 0.5) fx.burst(2, { x: P.x, y: P.y + 1, z: P.z, spread: 1.4, speed: 3, life: 0.3, size: 0.35, color: ['#ffe03a', '#ff3a3a'], shape: 'star' })
                }
              } else if (e.def.kind === 'sticky' && inX && P.y < surface + 0.8 && flying && !run.held) {
                strike(e)
                continue
              }
              if (pz < e.z - e.area) {
                if (e.drained > 0.01) {
                  const pen = e.drained
                  toRecover(e, true)
                  run.hits++
                  run.streak = 0
                  hud.dodge(0, dodgeMult())
                  snd.hit(e.id)
                  impact(e, e.def.color)
                  hud.ouch('STUNG!', Math.round(remaining() * pen))
                  ops.knock({ factor: 1 - pen, apex: 0.8, airShare: 0.3, flips: -1 })
                } else {
                  toRecover(e, false)
                  dodged(false, e)
                }
              }
            } else if (e.def.kind === 'drain') buzz = Math.max(buzz, clamp(1 - left / 2, 0, 0.5))
          } else if (left <= 0 && flying && !run.held) {
            // deliver the exact strike pose (attack k = 1) before resolving
            s.phase = 'attack'
            s.k = 1
            e.model.update(s)
            resolve(e)
            s.k = 0
            s.phaseT = 0
          }
        }
      } else if (e.phase === 'hold') {
        s.k = clamp(e.phaseT / e.holdDur, 0, 1)
        s.phaseDur = e.holdDur
        s.phaseT = e.phaseT
        if (e.phaseT >= e.holdDur && run?.held === e) releaseHeld(false)
      } else if (e.phase === 'recover') {
        s.k = clamp(e.phaseT / e.recoverDur, 0, 1)
        s.phaseDur = e.recoverDur
        s.phaseT = e.phaseT
        if (e.phaseT >= e.recoverDur) {
          dispose(e)
          encs.splice(i, 1)
          continue
        }
      }
      s.phase = e.phase
      s.hit = e.hit
      e.model.update(s)
    }
    if (run) {
      run.drainBuzz = buzz
      run.hum = hum
    }
  }

  // Wins summary for the reward card (flight.js finishFlight).
  function summary() {
    if (!run) return { mult: 1, bonusWins: 0, dodges: 0, near: 0, hits: 0, blocked: 0, boosts: 0, bestStreak: 0, bosses: [] }
    return {
      mult: dodgeMult(),
      bonusWins: run.bonusWins,
      dodges: run.dodges,
      near: run.near,
      hits: run.hits,
      blocked: run.blocked,
      boosts: run.boosts,
      bestStreak: run.bestStreak,
      bosses: run.bossesBeaten,
      on: run.on,
    }
  }
  function finish() {
    run = null
    if (boss) {
      scene.remove(boss.model.root)
      boss.model.dispose?.()
      boss = null
    }
  }

  return {
    begin,
    end,
    finish,
    update,
    dash,
    mash,
    summary,
    held: () => !!run?.held,
    trapped: () => !!run?.trap,
    holdPoint,
    active: () => !!run,
    clear: clearAll,
    debug: () => ({ run, encs: encs.map((e) => ({ id: e.id, phase: e.phase, z: e.z, x: e.x })), boss: boss?.def.id }),
  }
}
