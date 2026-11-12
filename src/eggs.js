import './eggs.css'
import { Vector3 } from 'three'
import { EGGS, EGG_HATCH, PET_TIERS, RARITY_COLORS } from './config.js'
import { iconURL } from './icons.js'
import { buildEgg, fmtShort } from './props.js'
import { buildPet } from './petModels.js'
import { thumb } from './thumbs.js'
import { sfx } from './audio/index.js'
import { player } from './player.js'
import { addPet, changed, indexKey, luckMult, petById, petLook, petStorage, state, tierById } from './state.js'

// The egg system: standing at an egg opens its panel above it (price, every pet with
// its luck-adjusted chance, undiscovered ones as black silhouettes, Open 1 / Open Max /
// Auto), the +3 / +8 / +16 hatch upgrades beside it (bought with Wins), the rolls
// (pet by chance x luck, then a Golden / Diamond tier), the hatch overlay (eggs wobble,
// crack, the pets pop out) and Auto (keeps opening the max while you stand there).
// Keys while at an egg: E = Open 1, R = Open Max, T = Auto.
// game.js creates it and calls update() every frame; actions.hatch goes through hatch().

const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Secret']
const rarityRank = (r) => Math.max(0, RARITY_ORDER.indexOf(r))
const fmt = (n) => Math.round(n).toLocaleString('en-US')
// 44.9979 -> "45", 7 -> "7", 2.5 -> "2.5", 0.0021 -> "0.0021"
export function fmtPct(n) {
  if (n >= 10) return String(Math.round(n))
  if (n >= 1) return String(+n.toFixed(1))
  return String(+n.toPrecision(2))
}
const el = (tag, cls, html) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  return e
}
const ico = (name, size = 64) => `<img src="${iconURL(name, size)}" alt="">`
const petImg = (id, tier = '') => thumb(`pet:${indexKey(id, tier)}`, () => buildPet(petLook(id, tier)), 0.5)
const eggImg = (look) => thumb(`egg:${look}`, () => buildEgg(look), 0.4)
const safe = (fn) => {
  try {
    fn()
  } catch {
    /* audio is optional */
  }
}

// Chances (%) with luck: every pet but the most common one gets x luck, the most
// common one takes what is left (never below 0), then everything is renormalised.
export function eggOdds(egg, luck = luckMult()) {
  let rest = 0
  const w = egg.pets.map((p, i) => {
    if (i === 0) return 0
    const c = p.chance * luck
    rest += c
    return c
  })
  w[0] = Math.max(0, 100 - rest)
  const total = w[0] + rest
  return w.map((c) => (c / total) * 100)
}
export function rollPet(egg, luck = luckMult()) {
  const odds = eggOdds(egg, luck)
  let r = Math.random() * 100
  for (let i = 0; i < odds.length; i++) {
    r -= odds[i]
    if (r < 0) return egg.pets[i].id
  }
  return egg.pets[0].id
}
// Golden / Diamond: the rarest tier is checked first, chances x luck.
export function rollTier(luck = luckMult()) {
  const r = Math.random() * 100
  let acc = 0
  for (const t of [...PET_TIERS].reverse()) {
    if (!t.chance) continue
    acc += t.chance * luck
    if (r < acc) return t.id
  }
  return ''
}
const eggCurrency = (egg) => (egg.currency === 'tokens' ? 'tokens' : 'wins')
const balance = (egg) => (eggCurrency(egg) === 'tokens' ? state.tokens : state.wins)

// deps: { camera, fx, props, hud, spend(price) -> bool, celebrate(colors), onPets() }
export function createEggs({ camera, fx, props, hud, spend, celebrate, onPets }) {
  // ---------------------------------------------------------------------------
  // Panel above the egg
  // ---------------------------------------------------------------------------
  const panel = el('div', 'eggp')
  const ups = el('div', 'eggp-ups')
  const main = el('div', 'eggp-main')
  const tip = el('div', 'eggp-tip')
  panel.append(ups, main, tip)
  document.body.appendChild(panel)
  const warn = el('div', 'egg-warn ol')
  document.body.appendChild(warn)

  let near = null // the props.eggs entry the player stands at
  let shown = null // the entry whose panel is open
  let renderKey = ''
  let tipFor = 0 // upgrade n whose tooltip is open (0 = none)
  let auto = null // egg id auto-hatching
  let autoWait = 0
  let size = { w: 0, h: 0 }
  const pos = { x: -9999, y: -9999, init: false }
  const v = new Vector3()

  function upgradeOwned(n) {
    return (state.hatchMax ?? 1) >= n
  }
  function maxCount() {
    return Math.max(1, state.hatchMax ?? 1)
  }
  function render() {
    const egg = shown.data
    const luck = luckMult()
    const odds = eggOdds(egg, luck)
    const tokens = eggCurrency(egg) === 'tokens'
    // upgrade bubbles
    ups.innerHTML = ''
    for (const u of EGG_HATCH.upgrades) {
      const owned = upgradeOwned(u.n)
      const b = el('button', `eggp-up${owned ? ' owned' : ''}${tipFor === u.n ? ' sel' : ''}`, `<img src="${eggImg(egg.look)}" alt=""><span class="n ol">+${u.n}</span>${owned ? '<span class="ck ol-thin">✔</span>' : ''}`)
      b.style.setProperty('--c', u.color)
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        tipFor = tipFor === u.n ? 0 : u.n
        renderKey = ''
      })
      ups.appendChild(b)
    }
    // tooltip
    const u = EGG_HATCH.upgrades.find((x) => x.n === tipFor)
    tip.classList.toggle('on', !!u)
    tip.innerHTML = ''
    if (u) {
      const owned = upgradeOwned(u.n)
      tip.innerHTML = `<div class="t ol">Hatch +${u.n} Eggs</div><div class="s">Open ${u.n} eggs at once with Open Max</div>`
      const buy = el('button', `eggp-buy ol-thin${owned ? ' owned' : ''}`, owned ? 'Owned ✔' : `Price: ${ico('trophy', 48)}${fmtShort(u.price)}`)
      buy.disabled = owned
      buy.addEventListener('click', (e) => {
        e.stopPropagation()
        buyUpgrade(u)
      })
      tip.appendChild(buy)
    }
    // main card
    main.innerHTML = ''
    const head = el('div', 'eggp-head', `${ico(tokens ? 'token' : 'trophy', 96)}<span class="ol">${tokens ? fmt(egg.price) : fmtShort(egg.price)}</span>`)
    if (luck > 1.001) head.appendChild(el('span', 'luck ol-thin', `${ico('clover', 48)}x${+luck.toFixed(2)}`))
    main.appendChild(head)
    main.appendChild(el('div', 'eggp-name ol-thin', egg.name))
    const grid = el('div', 'eggp-grid')
    egg.pets.forEach((p, i) => {
      const seen = state.discovered.includes(p.id)
      const pct = fmtPct(odds[i])
      const c = el('div', `eggp-pet${seen ? '' : ' unknown'}`, `<img src="${petImg(p.id)}" alt=""><span class="pc ol-thin${pct.length > 4 ? ' long' : ''}">${pct}%</span>`)
      c.dataset.r = p.rarity
      c.title = seen ? `${p.name} · ${p.rarity} · +${fmt(p.boost * 100)}% Skill` : `??? · ${p.rarity}`
      grid.appendChild(c)
    })
    main.appendChild(grid)
    const btns = el('div', 'eggp-btns')
    const mk = (key, label, cls, fn) => {
      const b = el('button', `eggp-btn ${cls}`, `<span class="k ol">${key}</span><span class="l ol-thin">${label}</span>`)
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        fn()
      })
      btns.appendChild(b)
      return b
    }
    mk('E', 'Open 1', 'one', () => open(1))
    mk('R', `Open ${maxCount() > 1 ? maxCount() : 'Max'}`, 'max', () => openMax())
    mk('T', auto ? 'Stop' : 'Auto', `auto${auto ? ' on' : ''}`, () => toggleAuto())
    main.appendChild(btns)
    measure()
  }
  function measure() {
    size = { w: panel.offsetWidth, h: panel.offsetHeight }
  }
  function layoutClass() {
    panel.classList.toggle('short', innerHeight < 540)
    panel.classList.toggle('narrow', innerWidth < 600 && innerHeight >= 540)
  }
  layoutClass()
  window.addEventListener('resize', () => {
    layoutClass()
    if (shown) measure()
  })
  // close an open tooltip when tapping elsewhere
  window.addEventListener('pointerdown', (e) => {
    if (tipFor && !panel.contains(e.target)) {
      tipFor = 0
      renderKey = ''
    }
  })

  let hudAge = 0
  const hudEdges = { bottom: innerHeight, left: 0 }
  function place(dt) {
    const e = shown
    v.set(e.x, e.topY + 2.3, e.z).project(camera)
    const W = innerWidth
    const H = innerHeight
    let x
    let y
    if (v.z > 1 || v.z < -1) {
      x = W / 2
      y = H * 0.55
    } else {
      x = ((v.x + 1) / 2) * W
      y = ((1 - v.y) / 2) * H
    }
    // keep it on screen, above the bottom HUD (skill bar + packs) and right of the
    // left menu when the screen is wide enough for both (HUD edges re-read twice a second)
    const m = 8
    hudAge -= dt
    if (hudAge <= 0) {
      hudAge = 0.5
      hudEdges.bottom = document.querySelector('#hud .hud-bottom')?.getBoundingClientRect().top ?? H
      hudEdges.left = document.querySelector('#hud .hud-left')?.getBoundingClientRect().right ?? 0
    }
    const maxBottom = Math.max(size.h + m, hudEdges.bottom - 6)
    let left = x - size.w / 2
    let top = y - size.h
    const minLeft = hudEdges.left + m
    left = Math.max(W - size.w - m >= minLeft ? minLeft : m, Math.min(W - size.w - m, left))
    top = Math.max(m, Math.min(maxBottom - size.h, top))
    if (!pos.init) {
      pos.x = left
      pos.y = top
      pos.init = true
    }
    const k = 1 - Math.exp(-14 * dt)
    pos.x += (left - pos.x) * k
    pos.y += (top - pos.y) * k
    panel.style.transform = `translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0)`
  }

  function show(entry) {
    if (shown === entry) return
    if (shown) shown.sign.visible = true
    shown = entry
    tipFor = 0
    renderKey = ''
    pos.init = false
    panel.classList.toggle('on', !!entry)
    if (entry) entry.sign.visible = false
  }

  // ---------------------------------------------------------------------------
  // "You need N more Wins!"
  // ---------------------------------------------------------------------------
  let warnText = ''
  let warnCount = 0
  let warnTimer = 0
  function needMore(egg, n) {
    const missing = egg.price * n - balance(egg)
    const what = eggCurrency(egg) === 'tokens' ? 'Race Tokens' : 'Wins'
    say(`You need ${fmtShort(Math.ceil(missing))} more ${what}!`)
  }
  function say(text) {
    warnCount = text === warnText && warnTimer > 0 ? warnCount + 1 : 1
    warnText = text
    warn.innerHTML = `${text}${warnCount > 1 ? ` <span class="x">x${warnCount}</span>` : ''}`
    warn.classList.remove('on')
    void warn.offsetWidth // restart the animation
    warn.classList.add('on')
    warnTimer = 1.8
    safe(() => sfx.deny?.())
  }

  // ---------------------------------------------------------------------------
  // Hatching
  // ---------------------------------------------------------------------------
  let busy = 0 // s left of the hatch overlay
  function affordable(egg) {
    return Math.floor(balance(egg) / egg.price)
  }
  // Returns true if eggs were opened. opts.free skips the price (Playtime Rewards).
  function hatch(eggId, n = 1, opts = {}) {
    const egg = EGGS.find((e) => e.id === eggId)
    if (!egg || busy > 0) return false
    n = Math.max(1, Math.min(n, 64))
    const room = petStorage() - state.pets.length
    if (room < n) {
      if (room <= 0) {
        say('Inventory full! Delete some pets.')
        stopAuto()
        return false
      }
      n = room
    }
    if (!opts.free) {
      if (balance(egg) < egg.price * n) {
        needMore(egg, n)
        stopAuto()
        return false
      }
      const total = egg.price * n
      if (eggCurrency(egg) === 'tokens') state.tokens -= total
      else if (!spend(total)) return false
    }
    const luck = luckMult()
    const results = []
    for (let i = 0; i < n; i++) {
      const id = rollPet(egg, luck)
      const tier = rollTier(luck)
      const isNew = !state.discovered.includes(indexKey(id, tier))
      addPet(id, tier)
      const d = petById(id)
      if (d.rarity === 'Mythic') state.stats.mythics = (state.stats.mythics ?? 0) + 1
      results.push({ id, tier, isNew, pet: d })
    }
    state.stats.hatched = (state.stats.hatched ?? 0) + n
    changed()
    renderKey = ''

    const entry = props.eggs.find((x) => x.data.id === eggId)
    const anim = state.settings?.hatchAnim !== false
    const best = results.reduce((a, b) => (rarityRank(b.pet.rarity) * 10 + tierRank(b.tier) > rarityRank(a.pet.rarity) * 10 + tierRank(a.tier) ? b : a))
    if (!anim) {
      // no overlay: pets join right away, one toast
      onPets?.()
      crackFx(entry, best)
      safe(() => sfx.reveal(Math.min(5, rarityRank(best.pet.rarity))))
      hud.toast(n === 1 ? `Hatched ${tierName(best.tier)}${best.pet.name}!` : `Hatched ${n} pets! Best: ${tierName(best.tier)}${best.pet.name}`, RARITY_COLORS[best.pet.rarity] === '#ffffff' ? '#ffd23a' : RARITY_COLORS[best.pet.rarity])
      busy = 0.35
      return true
    }
    playOverlay(egg, entry, results, best, auto ? EGG_HATCH.autoAnim : EGG_HATCH.anim)
    return true
  }
  const tierRank = (t) => PET_TIERS.findIndex((x) => x.id === (t ?? ''))
  const tierName = (t) => (t ? `${tierById(t).name} ` : '')
  function open(n) {
    if (!near) return
    hatch(near.data.id, n)
  }
  function openMax() {
    if (!near) return
    const egg = near.data
    const n = Math.min(maxCount(), affordable(egg))
    if (n <= 0) return needMore(egg, 1)
    hatch(egg.id, n)
  }
  function toggleAuto() {
    if (auto) return stopAuto()
    if (!near) return
    auto = near.data.id
    autoWait = 0
    renderKey = ''
  }
  function stopAuto() {
    if (!auto) return
    auto = null
    renderKey = ''
  }
  function buyUpgrade(u) {
    if (upgradeOwned(u.n)) return
    if (state.wins < u.price) return say(`You need ${fmtShort(Math.ceil(u.price - state.wins))} more Wins!`)
    if (!spend(u.price)) return
    state.hatchMax = u.n
    hud.toast(`Hatch +${u.n} Eggs unlocked! Open Max now opens ${u.n}`, '#7dff7d')
    celebrate?.(['#ffd23a', '#ffffff', u.color])
    tipFor = 0
    renderKey = ''
    changed()
  }

  // --- The overlay ---
  const ov = el('div', 'egghatch')
  document.body.appendChild(ov)
  let ovTimers = []
  let wobbleEntry = null
  let wobbleT = 0
  let wobbleDur = 0
  function playOverlay(egg, entry, results, best, T) {
    for (const t of ovTimers) clearTimeout(t)
    ovTimers = []
    const n = results.length
    const portrait = innerHeight > innerWidth
    const cols = n <= 3 ? n : n <= 4 ? (portrait ? 2 : 4) : n <= 8 ? (portrait ? 2 : 4) : portrait ? 4 : 8
    const rows = Math.ceil(n / cols)
    const s = Math.floor(Math.min((innerWidth * 0.9) / cols, (innerHeight * (n > 3 ? 0.66 : 0.5)) / rows, 260))
    ov.innerHTML = ''
    ov.className = `egghatch on${n > 3 ? ' many' : ''}${n > 8 ? ' lots' : ''}`
    ov.style.setProperty('--s', `${s}px`)
    ov.style.setProperty('--cols', cols)
    const stage = el('div', 'stage')
    const crackAt = T * 0.46
    const slots = results.map((r, i) => {
      const slot = el('div', 'slot', `<div class="eggwrap" style="animation-delay:${(i % cols) * 0.04}s"><img class="egg" src="${eggImg(egg.look)}" alt=""></div>`)
      slot.style.setProperty('--wob', `${Math.max(0.12, crackAt / 6)}s`)
      stage.appendChild(slot)
      return slot
    })
    ov.appendChild(stage)
    wobbleEntry = entry
    wobbleT = 0
    wobbleDur = crackAt
    busy = T
    safe(() => sfx.eggWobble(crackAt))
    ovTimers.push(
      setTimeout(() => ov.classList.add('hard'), crackAt * 600),
      setTimeout(() => {
        ov.appendChild(el('div', 'flash'))
        safe(() => sfx.eggCrack())
        crackFx(entry, best)
        slots.forEach((slot, i) => {
          const r = results[i]
          const rank = rarityRank(r.pet.rarity)
          const col = RARITY_COLORS[r.pet.rarity]
          slot.dataset.r = r.pet.rarity
          slot.innerHTML = `${rank >= 3 || r.tier ? '<div class="rays"></div>' : ''}
            <div class="shell l"><img src="${eggImg(egg.look)}" alt=""></div><div class="shell r"><img src="${eggImg(egg.look)}" alt=""></div>
            <img class="pet" src="${petImg(r.id, r.tier)}" alt="">
            ${r.isNew ? '<span class="new ol-thin">NEW!</span>' : ''}
            ${r.tier ? `<span class="tier t-${r.tier} ol-thin">${tierById(r.tier).name}</span>` : ''}
            <div class="nm ol">${r.pet.name}</div>
            <div class="rr ol-thin" style="color:${col}">${r.pet.rarity}${n <= 3 ? ` · +${fmt(r.pet.boost * tierById(r.tier).mult * 100)}%` : ''}</div>`
        })
        safe(() => sfx.reveal(Math.min(5, rarityRank(best.pet.rarity))))
        if (rarityRank(best.pet.rarity) >= 4) hud.toast(`${tierName(best.tier)}${best.pet.name}! (${best.pet.rarity})`, RARITY_COLORS[best.pet.rarity] === '#ffffff' ? '#ffd23a' : RARITY_COLORS[best.pet.rarity])
        onPets?.()
      }, crackAt * 1000),
      setTimeout(() => ov.classList.add('out'), (T - 0.25) * 1000),
      setTimeout(() => {
        ov.className = 'egghatch'
        ov.innerHTML = ''
      }, T * 1000),
    )
  }
  function crackFx(entry, best) {
    if (!entry) return
    const col = RARITY_COLORS[best.pet.rarity]
    fx.burst(36, { x: entry.x, y: entry.topY + 1, z: entry.z, spread: 1, speed: 6, up: 1.2, gravity: -12, drag: 1, life: 1, size: 0.45, color: ['#ffffff', '#ffd23a', col], shape: 'star' })
    fx.burst(16, { x: entry.x, y: entry.topY + 0.9, z: entry.z, spread: 0.6, speed: 4, up: 1, gravity: -16, life: 0.8, size: 0.4, color: ['#fff6e0', '#e8d2b0'], additive: false, shape: 'square' })
  }

  // ---------------------------------------------------------------------------
  // Keys (desktop). Touch uses the panel buttons.
  // ---------------------------------------------------------------------------
  let blocked = false
  window.addEventListener('keydown', (e) => {
    if (e.repeat || !near || blocked) return
    const tag = e.target?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    if (e.code === 'KeyE') open(1)
    else if (e.code === 'KeyR') openMax()
    else if (e.code === 'KeyT') toggleAuto()
  })

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------
  function update(dt, t, opts = {}) {
    blocked = !!opts.blocked
    busy = Math.max(0, busy - dt)
    if (warnTimer > 0) {
      warnTimer -= dt
      if (warnTimer <= 0) warn.classList.remove('on')
    }
    // nearest egg in range
    const p = player.position
    let best = null
    let bd = EGG_HATCH.range
    if (!blocked) {
      for (const e of props.eggs) {
        const d = Math.hypot(p.x - e.x, p.z - e.z)
        if (d < bd && p.y < e.topY + 3) {
          bd = d
          best = e
        }
      }
    }
    near = best
    if (auto && (!near || near.data.id !== auto)) stopAuto()
    show(near)
    if (shown) {
      const key = `${shown.data.id}|${state.discovered.length}|${state.hatchMax}|${luckMult().toFixed(3)}|${auto}|${tipFor}`
      if (key !== renderKey) {
        renderKey = key
        render()
      }
      place(dt)
    }
    // auto hatch
    if (auto && busy <= 0) {
      autoWait -= dt
      if (autoWait <= 0) {
        const egg = near.data
        const n = Math.min(maxCount(), affordable(egg))
        if (n <= 0) {
          needMore(egg, 1)
          stopAuto()
        } else hatch(egg.id, n)
        autoWait = EGG_HATCH.autoGap
      }
    }
    // the world egg wobbles while its overlay eggs do
    if (wobbleEntry) {
      wobbleT += dt
      const k = Math.min(1, wobbleT / Math.max(0.01, wobbleDur))
      const o = wobbleEntry.egg
      if (wobbleT < wobbleDur) {
        o.rotation.z = Math.sin(wobbleT * (14 + k * 26)) * (0.08 + k * 0.18)
        o.scale.setScalar(1 + k * 0.12)
      } else {
        o.rotation.z = 0
        o.scale.setScalar(1)
        wobbleEntry = null
      }
    }
  }

  return {
    update,
    hatch,
    near: () => near,
    busy: () => busy > 0,
    isAuto: () => !!auto,
    stopAuto,
  }
}
