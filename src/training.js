import './training.css'
import { AdditiveBlending, CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, RingGeometry, SRGBColorSpace, Vector3 } from 'three'
import { PHYSICS, TRAIN } from './config.js'
import { iconURL } from './icons.js'
import { fmtShort } from './props.js'
import { setBouncer } from './player.js'
import { canRebirth, levelInfo, platformUnlocked } from './state.js'
import * as tsfx from './audio/training.js'

// Training feedback: everything that makes a Skill click feel good.
//  - "+48 ⚡" numbers popping out above the player's head (world-anchored, pooled)
//  - the Skill counter punches, the level bar glints, "Level Up!" bursts out
//  - a click streak: the ding climbs a scale, milestones every TRAIN.streakEvery
//  - on a training table: a glowing ring on its top, a shockwave + bounce per
//    click, energy sparks rising off the rim, a sound when you step on (or a
//    knock when it is locked)
//  - the Rebirth button glows and chimes the moment a rebirth becomes possible
//  - the arm's pull-back is a spring (draw, snap past rest, settle)
//  - unlocked tables are trampolines: landing on one bounces the player up
//    again (higher if jump is held), and walking into one's side hops the
//    player on; every bounce squashes the table with a boing
// game.js calls shot() per click and update() per frame; nothing here changes
// the economy.

const T = TRAIN
const tmp = new Vector3()

export function createTraining({ scene, camera, fx, player, tables = [], onBounce = null }) {
  // --- Screen layer for the number pops ---
  const layer = document.createElement('div')
  layer.className = 'train-layer'
  document.body.appendChild(layer)
  const boltImg = iconURL('bolt', 96)
  const pool = []
  const live = []
  function getPop() {
    let el = pool.pop()
    if (!el) {
      el = document.createElement('div')
      el.innerHTML = `<img src="${boltImg}" alt=""><span></span>`
      layer.appendChild(el)
    }
    el.style.display = ''
    return el
  }
  // kind: 'gain' | 'gold' | 'level' | 'streak' | 'ready'
  function spawnPop(text, kind, { life = T.popLife, dx = 0, dy = 0, height = T.popHeight, rise = 1 } = {}) {
    if (live.length >= T.maxPops) {
      const old = live.shift()
      old.el.style.display = 'none'
      pool.push(old.el)
    }
    const el = getPop()
    el.className = `tpop ol ${kind}`
    el.lastChild.textContent = text
    el.firstChild.style.display = kind === 'gain' || kind === 'gold' ? '' : 'none'
    live.push({ el, t: 0, life, dx, dy, height, rise })
  }
  function updatePops(dt) {
    const vmin = Math.min(innerWidth, innerHeight) / 100
    const p = player.renderPosition
    for (let i = live.length - 1; i >= 0; i--) {
      const q = live[i]
      q.t += dt
      const k = q.t / q.life
      if (k >= 1) {
        q.el.style.display = 'none'
        pool.push(q.el)
        live.splice(i, 1)
        continue
      }
      tmp.set(p.x, p.y + q.height, p.z).project(camera)
      if (tmp.z > 1) {
        q.el.style.opacity = '0'
        continue
      }
      const x = (tmp.x * 0.5 + 0.5) * innerWidth + q.dx * vmin
      const ease = 1 - Math.pow(1 - k, 3)
      const y = (-tmp.y * 0.5 + 0.5) * innerHeight + q.dy * vmin - ease * T.popRise * vmin * q.rise
      // pop in big, settle, then shrink + fade on the way out
      const s = k < 0.08 ? 0.3 + (k / 0.08) * 1.05 : k < 0.2 ? 1.35 - ((k - 0.08) / 0.12) * 0.35 : 1 - Math.max(0, k - 0.7) * 0.6
      q.el.style.opacity = String(k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35)
      q.el.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%) scale(${s})`
    }
  }

  // --- HUD hooks (found by class; hud.js owns the elements) ---
  const hudEl = (sel) => document.querySelector(sel)
  let glint = null
  function levelbar() {
    const bar = hudEl('#hud .levelbar')
    if (bar && (!glint || glint.parentNode !== bar)) {
      glint = document.createElement('div')
      glint.className = 'train-glint'
      // between .fill (firstChild) and .txt (lastChild): hud.js writes both by position
      bar.insertBefore(glint, bar.lastChild)
    }
    return bar
  }
  const punchFrames = [{ transform: 'scale(1)' }, { transform: 'scale(1.18)', filter: 'brightness(1.35)' }, { transform: 'scale(1)' }]
  function punch(el, frames = punchFrames, ms = 180) {
    if (!el?.animate) return
    try {
      el.animate(frames, { duration: ms, easing: 'cubic-bezier(.2,.9,.3,1.3)' })
    } catch {
      // older engine: no punch
    }
  }

  // --- Table effects (ring, shockwaves, bounce) ---
  const ringTex = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 256
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(128, 128, 60, 128, 128, 128)
    grad.addColorStop(0, 'rgba(255,255,255,0)')
    grad.addColorStop(0.7, 'rgba(255,255,255,0.35)')
    grad.addColorStop(0.9, 'rgba(255,255,255,1)')
    grad.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 256, 256)
    // dashes around the edge so the spin reads
    g.globalCompositeOperation = 'destination-out'
    for (let i = 0; i < 24; i++) {
      g.save()
      g.translate(128, 128)
      g.rotate((i / 24) * Math.PI * 2)
      g.fillRect(100, -4, 28, 8)
      g.restore()
    }
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    return t
  })()
  const glowMat = new MeshBasicMaterial({ map: ringTex, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })
  const glow = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), glowMat)
  glow.renderOrder = 2
  glow.visible = false
  scene.add(glow)

  const waveGeo = new RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2)
  const waves = []
  function wave(x, y, z, color, size, life = 0.5) {
    let w = waves.find((q) => !q.m.visible)
    if (!w) {
      if (waves.length >= 8) w = waves[0]
      else {
        w = { m: new Mesh(waveGeo, new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })) }
        w.m.renderOrder = 3
        scene.add(w.m)
        waves.push(w)
      }
    }
    w.m.material.color.set(color)
    w.m.position.set(x, y, z)
    w.m.visible = true
    w.t = 0
    w.life = life
    w.size = size
  }
  function updateWaves(dt) {
    for (const w of waves) {
      if (!w.m.visible) continue
      w.t += dt
      const k = w.t / w.life
      if (k >= 1) {
        w.m.visible = false
        continue
      }
      w.m.scale.setScalar(0.4 + (1 - Math.pow(1 - k, 2)) * w.size)
      w.m.material.opacity = 0.85 * (1 - k)
    }
  }
  const tableColor = (t) => T.tableColors[t.data.style] ?? '#ffd23a'

  // per-table squash-and-wobble (keyed by the table handle); amp 1 = a click
  const bounces = new Map()
  function bounce(t, amp = 1) {
    if (!t.root) return
    bounces.set(t, { age: 0, amp: Math.max(amp, bounces.get(t)?.amp ?? 0) })
  }
  function updateBounces(dt) {
    for (const [t, b] of bounces) {
      b.age += dt
      const s = Math.exp(-9 * b.age) * Math.cos(30 * b.age) * b.amp
      t.root.scale.set(1 + 0.02 * s, 1 - 0.045 * s, 1 + 0.02 * s)
      if (b.age > 0.6) {
        t.root.scale.set(1, 1, 1)
        bounces.delete(t)
      }
    }
  }

  // --- Trampolines ---
  // Runs inside the physics tick (player.js); only records the event, the
  // frame update plays the sound and effects.
  const G = -PHYSICS.gravity
  const launchSpeed = (h) => Math.sqrt(2 * G * Math.max(0.1, h))
  let landing = null // { table, hop, big }
  let airborne = null // { color, apex, big } from a bounce until the next landing
  let trailAcc = 0
  function updateAirborne(dt) {
    if (!airborne) return
    const v = player.velocity.y
    const p = player.renderPosition
    if (player.grounded) {
      airborne = null
      return
    }
    // sparkle trail on the way up
    if (v > 3) {
      trailAcc += dt * (airborne.big ? 45 : 30)
      while (trailAcc >= 1) {
        trailAcc--
        fx.burst(1, { x: p.x + (Math.random() - 0.5) * 0.6, y: p.y + Math.random() * 0.8, z: p.z + (Math.random() - 0.5) * 0.6, spread: 0.1, speed: 0.4, gravity: -2, life: 0.7, size: 0.38, color: [airborne.color, '#ffffff'], shape: 'star' })
      }
    }
    // the top of the arc: a little star pop and a twinkle
    if (!airborne.apex && v <= 0) {
      airborne.apex = true
      tsfx.apex(airborne.big)
      fx.burst(airborne.big ? 16 : 9, { x: p.x, y: p.y + 1.2, z: p.z, spread: 0.3, speed: 3.5, life: 0.6, size: 0.4, color: [airborne.color, '#ffffff', '#ffd23a'], shape: 'star' })
    }
  }
  setBouncer((pl, jumpHeld) => {
    if (!pl.grounded) return null
    const p = pl.position
    for (const t of tables) {
      if (!platformUnlocked(t.data)) continue
      const dx = t.x - p.x
      const dz = t.z - p.z
      const d = Math.hypot(dx, dz)
      if (d > t.radius + T.hopReach) continue
      // landed on the top: boing
      if (d < t.radius + 0.15 && Math.abs(p.y - t.topY) < 0.45) {
        landing = { table: t, hop: false, big: jumpHeld }
        const tier = 1 + Math.log10(Math.max(1, t.data.mult)) * T.bounceTier
        return { vy: launchSpeed(T.bounceHeight * tier * (jumpHeld ? T.bounceBoost : 1)) }
      }
      // walking into its side: hop up and onto it
      const below = t.topY - p.y
      const v = pl.velocity
      const sp = Math.hypot(v.x, v.z)
      if (below > 0.45 && below < 3 && sp > 1 && (v.x * dx + v.z * dz) / (sp * d) > 0.5) {
        landing = { table: t, hop: true, big: false }
        return { vy: launchSpeed(below + T.hopClear), vx: (dx / d) * T.hopSpeed, vz: (dz / d) * T.hopSpeed }
      }
    }
    return null
  })
  function onLanding({ table, hop, big }) {
    const c = tableColor(table)
    const p = player.position
    if (hop) {
      tsfx.hopOn()
      fx.burst(8, { x: p.x, y: p.y + 0.2, z: p.z, spread: 0.5, speed: 2, up: 0.6, life: 0.5, size: 0.4, color: '#ffffff', shape: 'star' })
      return
    }
    tsfx.boing(big)
    onBounce?.({ table, big }) // each landing trains once (game.js)
    airborne = { color: c, apex: false, big }
    bounce(table, big ? 2.2 : 1.6)
    wave(p.x, table.topY + 0.06, p.z, c, big ? 4 : 2.6, 0.4)
    fx.burst(big ? 14 : 7, { x: p.x, y: table.topY + 0.15, z: p.z, spread: 0.6, speed: big ? 5 : 3, up: 0.4, gravity: -10, life: 0.5, size: 0.35, color: [c, '#ffffff'], shape: 'star' })
  }

  // --- Arm spring (draw back, snap past rest, settle) ---
  let armP = 0
  let armV = 0
  function updateArm(dt) {
    const h = Math.min(dt, 1 / 30)
    armV += (-T.armSpring * armP - T.armDamp * armV) * h
    armP += armV * h
  }

  // --- Streak + level + rebirth tracking ---
  let streak = 0
  let lastShot = -1e9
  let lastLevel = levelInfo().level
  let wasReady = canRebirth()
  let readyCheck = 0

  // bounce = the click came from a trampoline landing (onLanding plays the boing,
  // shockwave and squash itself, so only the number, ding and HUD answer here)
  function shot({ gain, mult = 1, table = null, from = null, bounce: fromBounce = false }) {
    const now = performance.now()
    streak = now - lastShot < T.streakGap * 1000 ? streak + 1 : 0
    lastShot = now
    const gold = mult > 1
    const vminRand = (r) => (Math.random() * 2 - 1) * r
    spawnPop(`+${fmtShort(gain)}`, gold ? 'gold' : 'gain', { dx: vminRand(T.popSpreadX), dy: vminRand(T.popSpreadY) })
    tsfx.shot(streak, mult, fromBounce)
    if (!fromBounce) {
      armP = 1
      armV = 0
    }

    // HUD: skill counter punch, level bar glint
    punch(hudEl('#hud .skillrow .skill'))
    const bar = levelbar()
    if (glint) {
      glint.classList.remove('go')
      void glint.offsetWidth
      glint.classList.add('go')
    }
    if (bar && gold) punch(bar, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.3)' }, { filter: 'brightness(1)' }], 200)

    // sparks off the slingshot, flying forward
    if (from) fx.burst(gold ? 7 : 5, { x: from.x, y: from.y + 0.5, z: from.z, spread: 0.25, speed: 3, up: 0.8, life: 0.45, size: 0.32, color: gold ? ['#ffd23a', '#ffffff'] : ['#5fe0ff', '#ffffff'], shape: 'star' })

    // the table answers: shockwave from the player, bounce, energy off the rim
    if (table && platformUnlocked(table.data)) {
      const c = tableColor(table)
      const p = player.position
      if (!fromBounce) {
        wave(p.x, table.topY + 0.06, p.z, c, T.waveSize, 0.45)
        bounce(table)
      }
      const n = Math.min(6, 2 + Math.floor(Math.log10(mult + 1) * 3))
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2
        const r = table.radius * 0.95
        fx.burst(1, { x: table.x + Math.cos(a) * r, y: table.topY + 0.3, z: table.z + Math.sin(a) * r, spread: 0.1, speed: 0.6, lift: 4, life: 0.7, size: 0.4, color: [c, '#ffffff'], shape: 'star' })
      }
    }

    // streak milestones
    if (streak > 0 && streak % T.streakEvery === 0) {
      tsfx.streak(streak)
      spawnPop(`${streak} Streak!`, 'streak', { life: 1.1, height: T.popHeight + 0.9, rise: 0.6 })
      const p = player.position
      fx.burst(14, { x: p.x, y: p.y + 2.2, z: p.z, spread: 0.6, speed: 4, up: 1, gravity: -8, life: 0.8, size: 0.4, color: ['#5fe0ff', '#ffd23a', '#ffffff'], shape: 'star' })
    }
  }

  function levelUp(levels) {
    tsfx.levelUp(levels)
    spawnPop(levels > 1 ? `Level Up! x${levels}` : 'Level Up!', 'level', { life: 1.5, height: T.popHeight + 0.5, rise: 0.5 })
    const p = player.position
    fx.burst(36, { x: p.x, y: p.y + 1.2, z: p.z, spread: 0.4, speed: 7, up: 0.5, gravity: -6, drag: 1.5, life: 1.1, size: 0.5, color: ['#4fe0ff', '#1f8cff', '#ffffff', '#ffd23a'], shape: 'star' })
    fx.burst(24, { x: p.x, y: p.y + 2.5, z: p.z, spread: 1.2, speed: 6, up: 1.4, gravity: -16, drag: 0.8, life: 1.3, size: 0.32, color: ['#ffd23a', '#5fe0ff', '#ff6ad5', '#7dff7d'], additive: false, shape: 'square' })
    wave(p.x, p.y + 0.08, p.z, '#4fe0ff', 7, 0.7)
    const bar = levelbar()
    if (bar) {
      bar.classList.remove('train-lvl')
      void bar.offsetWidth
      bar.classList.add('train-lvl')
    }
    punch(bar?.lastChild, [{ transform: 'translateY(-50%) scale(1)' }, { transform: 'translateY(-50%) scale(1.35)' }, { transform: 'translateY(-50%) scale(1)' }], 420)
  }

  // Stepping on a table (or off: table = null).
  function enterTable(table) {
    if (!table) return
    const open = platformUnlocked(table.data)
    if (open) {
      tsfx.tableEnter(table.data.mult)
      const c = tableColor(table)
      wave(table.x, table.topY + 0.06, table.z, c, table.radius * 1.1, 0.6)
      bounce(table)
      fx.burst(20, { x: table.x, y: table.topY + 0.4, z: table.z, spread: table.radius * 0.8, speed: 1.5, lift: 5, life: 0.9, size: 0.45, color: [c, '#ffffff'], shape: 'star' })
      spawnPop(`${table.data.mult}x Skill!`, 'ready', { life: 1.2, height: T.popHeight + 0.6, rise: 0.5 })
    } else tsfx.tableLocked()
  }

  // Per frame. table = the table under the player (or null), active = not flying.
  let ringSpin = 0
  let glowFade = 0
  let glowTable = null
  function update(dt, { table = null, active = true } = {}) {
    if (landing) {
      const l = landing
      landing = null
      if (active) onLanding(l)
    }
    if (active) updateAirborne(dt)
    else airborne = null
    updatePops(dt)
    updateWaves(dt)
    updateBounces(dt)
    updateArm(dt)

    // glowing ring on the table you're training on
    const on = active && table && platformUnlocked(table.data)
    glowFade = on ? Math.min(1, glowFade + dt * 3) : Math.max(0, glowFade - dt * 3)
    if (on && glowTable !== table) {
      glowTable = table
      glowMat.color.set(tableColor(table))
    }
    glow.visible = glowFade > 0 && !!glowTable
    if (glow.visible) {
      ringSpin += dt * 0.6
      glow.position.set(glowTable.x, glowTable.topY + 0.04, glowTable.z)
      glow.rotation.y = ringSpin
      const kick = Math.max(0, 1 - (performance.now() - lastShot) / 250)
      glow.scale.setScalar(glowTable.radius * 2 * (1 + kick * 0.05))
      glowMat.opacity = glowFade * (0.55 + 0.15 * Math.sin(ringSpin * 5) + kick * 0.3)
    }

    // level ups (from training, packs, gifts: anything that adds Skill)
    const lv = levelInfo().level
    if (lv > lastLevel && active) levelUp(lv - lastLevel)
    lastLevel = lv

    // rebirth readiness: chime once, keep the button glowing
    readyCheck -= dt
    if (readyCheck <= 0) {
      readyCheck = 0.25
      const ready = canRebirth()
      if (ready && !wasReady) {
        tsfx.rebirthReady()
        spawnPop('Rebirth Ready!', 'ready', { life: 1.6, height: T.popHeight + 1.1, rise: 0.4 })
      }
      wasReady = ready
      hudEl('#hud .mbtn.rebirth')?.classList.toggle('train-ready', ready)
    }
  }

  return {
    shot,
    update,
    enterTable,
    // arm pull-back for game.js afterAnimator: + = drawn back, - = snapped forward
    armPull: () => armP,
    streak: () => streak,
    buySling() {
      tsfx.buySling()
      const p = player.position
      wave(p.x, p.y + 0.08, p.z, '#7dff7d', 5, 0.6)
    },
    equipSling: () => tsfx.equipSling(),
    cantAfford: () => tsfx.cantAfford(),
  }
}
