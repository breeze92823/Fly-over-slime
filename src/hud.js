import './hud.css'
import { BOOSTS, EGGS, GEAR, PASSES, RARITY_COLORS, SKILL_PACKS, STAND_PETS } from './config.js'
import { iconURL, studURL } from './icons.js'
import { makeWindows, clock, setInvTab } from './windows.js'
import { gearIcon, gearWindow } from './gear.js'
import { sfx } from './audio/index.js'
import { fmtShort, buildEgg, buildSlingshot } from './props.js'
import { buildPet } from './petModels.js'
import { thumb } from './thumbs.js'
import {
  ALL_PETS,
  dailyClaimable,
  hasPass,
  levelInfo,
  petById,
  petLook,
  rebirthMult,
  rebirthProgress,
  state,
} from './state.js'

// All 2D UI: the always-on HUD (menu buttons, toggles, Skill/Level bar, Wins,
// skill packs, passes), toasts and number pops, the flight meter, the egg
// prompt, the windows (Shop, Rebirth, Inventory, Index, Trails, Rewards,
// Update Log) and the hatch overlay. Game logic lives in game.js and is
// reached through `actions`.

const fmt = (n) => Math.round(n).toLocaleString('en-US')
const h = (tag, cls, html) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  return e
}
const ico = (name, size = 128) => `<img src="${iconURL(name, size)}" alt="">`
export const petThumb = (id, tier = '') => thumb(`pet:${id}:${tier}`, () => buildPet(petLook(id, tier)), 0.5)
export const eggThumb = (look) => thumb(`egg:${look}`, () => buildEgg(look), 0.4)
export const slingThumb = (style) => thumb(`sling:${style}`, () => buildSlingshot(style), 0.9)

export function createHud(actions) {
  const root = h('div')
  root.id = 'hud'
  document.body.appendChild(root)
  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch')
  window.addEventListener('pointerdown', (e) => document.body.classList.toggle('touch', e.pointerType === 'touch'), { capture: true })

  // --- Left menu ---
  const left = h('div', 'hud-left')
  const grid = h('div', 'menu-grid')
  const menu = [
    ['shop', 'Shop', 'shop'],
    ['rebirth', 'Rebirth', 'rebirth'],
    ['inventory', 'Inventory', 'bag'],
    ['index', 'Index', 'book'],
    ['trails', 'Trails', 'trail'],
    ['playtime', 'Rewards', 'gift'],
  ]
  const btn = {}
  for (const [id, label, icon] of menu) {
    const b = h('button', `mbtn ${id}`, `${ico(icon)}<span class="lbl ol">${label}</span>`)
    b.addEventListener('click', () => openWindow(id))
    grid.appendChild(b)
    btn[id] = b
  }
  const pct = h('span', 'pct ol', '0%')
  btn.rebirth.appendChild(pct)
  const badge = h('span', 'badge ol-thin', '0')
  btn.playtime.appendChild(badge)
  left.appendChild(grid)
  // Day (Daily Rewards) + Time Play (Playtime Rewards) icon buttons beside the menu
  const sideCol = h('div', 'hud-side')
  const sideBtn = {}
  for (const [id, label, icon] of [['daily', 'Day', 'gift'], ['playtime', 'Time Play', 'alarm'], ['gear', 'Gear', null]]) {
    const img = icon ? ico(icon, 160) : `<img src="${gearIcon('shield')}" alt="">`
    const b = h('button', 'side-btn', `${img}<span class="lbl ol">${label}</span><span class="dot ol-thin">!</span>`)
    b.addEventListener('click', () => openWindow(id))
    sideCol.appendChild(b)
    sideBtn[id] = b
  }
  root.appendChild(sideCol)
  const toggles = {}
  for (const [key, label] of [['autoRebirth', 'Auto Rebirth'], ['autoFly', 'Auto Fly']]) {
    const t = h('button', 'toggle', `<span class="ol-thin">${label}</span><span class="box"></span>`)
    t.addEventListener('click', () => actions.toggle(key))
    left.appendChild(t)
    toggles[key] = t
  }
  root.appendChild(left)

  // --- Bottom-left stats ---
  const stats = h('div', 'hud-stats')
  const rbStat = h('div', 'stat rb', `${ico('rebirth')}<span class="ol">0</span>`)
  const winStat = h('div', 'stat wins', `${ico('trophy')}<span class="ol">0</span>`)
  const friend = h('div', 'friend ol-thin', `Friend Boost: 0% ${ico('plus', 48)}`)
  stats.append(rbStat, winStat, friend)
  root.appendChild(stats)

  // --- Bottom centre ---
  const bottom = h('div', 'hud-bottom')
  const skillrow = h('div', 'skillrow')
  const skillEl = h('div', 'skill ol', `${ico('bolt')}<span>0 SKILL</span>`)
  const multEl = h('div', 'mult ol', 'x1 Multiplier')
  skillrow.append(skillEl, multEl)
  const bar = h('div', 'levelbar', '<div class="fill"></div><div class="txt ol">Level 1</div>')
  const packs = h('div', 'packs')
  for (const p of SKILL_PACKS) {
    const b = h('button', `pack ${p.style}`, `<img class="crys" src="${iconURL('crystal')}" alt=""><span class="amt ol">+${fmt(p.amount)}</span><span class="price ol-thin">${ico('trophy', 48)}${fmtShort(p.price)}</span>`)
    b.addEventListener('click', () => actions.buyPack(p.id))
    packs.appendChild(b)
  }
  bottom.append(skillrow, bar, packs)
  root.appendChild(bottom)

  // --- Right side ---
  const right = h('div', 'hud-right')
  const starter = h('button', 'starter', `${ico('starter', 192)}<span class="lbl ol-thin">STARTER PACK</span>`)
  starter.addEventListener('click', () => openWindow('shop'))
  const passSkill = h('button', 'pass skill', `<img class="ic" src="${iconURL('crystal')}" alt=""><span class="t ol">+2x Skill</span><span class="p ol-thin">ONLY ${ico('trophy', 48)}${fmtShort(PASSES[0].price)}</span>`)
  const passWins = h('button', 'pass wins', `<img class="ic" src="${iconURL('trophy')}" alt=""><span class="t ol">2x Wins</span><span class="p ol-thin">ONLY ${ico('trophy', 48)}${fmtShort(PASSES[1].price)}</span>`)
  passSkill.addEventListener('click', () => actions.buyPass('skill2x'))
  passWins.addEventListener('click', () => actions.buyPass('wins2x'))
  right.append(starter, passSkill, passWins)
  root.appendChild(right)

  const topright = h('div', 'topright')
  const gearBtn = h('button', 'gear', ico('gear', 96))
  gearBtn.setAttribute('aria-label', 'Settings')
  gearBtn.addEventListener('click', () => openWindow('settings'))
  topright.appendChild(gearBtn)
  const logBtn = h('button', 'pill', 'Update Log')
  logBtn.addEventListener('click', () => openWindow('log'))
  topright.appendChild(logBtn)
  root.appendChild(topright)

  // --- Overlays ---
  const toasts = h('div', 'toasts')
  const meter = h('div', 'flightmeter', `<div class="d ol">0m</div><div class="w ol-thin">${ico('trophy', 48)}<span>+0</span></div>`)
  const prompt = h('div', 'prompt')
  const trainBtn = h('button', 'trainbtn', `${ico('bolt')}<span class="ol-thin">TRAIN</span>`)
  trainBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    actions.trainHold(true)
  })
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) trainBtn.addEventListener(ev, () => actions.trainHold(false))
  const boostRow = h('div', 'boost-row')
  root.append(toasts, meter, prompt, trainBtn, boostRow)

  // --- Windows ---
  // Lego-style frame (windows.css): studded blue title bar + red X over a dark
  // see-through body. The new windows render from windows.js; Shop and Update Log
  // keep their card layouts inside the same frame.
  document.documentElement.style.setProperty('--stud', `url(${studURL()})`)
  const back = h('div', 'win-back')
  back.addEventListener('pointerdown', (e) => {
    if (e.target === back) closeWindow()
  })
  // a tap anywhere else in a window closes an open tooltip
  back.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' && !e.target.closest('[data-tip="1"]')) back.querySelector('.rw-tip')?.remove()
  }, true)
  document.body.appendChild(back)
  let openId = null
  let tickers = []
  const NEW = makeWindows({ actions, petThumb, eggThumb, slingThumb })
  const WINDOWS = {
    ...NEW,
    gear: gearWindow({ toast: (text, color) => toast(text, color) }),
    shop: { title: 'Shop', size: 'lg', render: (api) => renderShop(legacy(api)) },
    log: { title: 'Update Log', size: 'md', render: (api) => renderLog(legacy(api)) },
  }
  function legacy(api) {
    const b = h('div', 'rw-legacy')
    b.dataset.keep = 'y'
    api.body.appendChild(b)
    return b
  }
  let frame = null // { wrap, body, side, below, count }
  function api() {
    return {
      wrap: frame.wrap,
      body: frame.body,
      side: frame.side,
      below: frame.below,
      setCount: (t) => (frame.count.textContent = t),
      onTick: (fn) => tickers.push(fn),
      refresh: refreshWindow,
    }
  }
  function build(id, still = false) {
    const w = WINDOWS[id]
    back.innerHTML = ''
    tickers = []
    const wrap = h('div', `rw-wrap w-${id} ${w.size ?? 'md'} ${w.side ? 'side' : ''} ${still ? 'still' : ''}`)
    const win = h('div', 'rw')
    const head = h('div', 'rw-head', `<span class="rw-title o">${w.title}</span>`)
    const count = h('span', 'rw-count o')
    const close = h('button', 'rw-x', '<span class="o">X</span>')
    close.addEventListener('click', closeWindow)
    head.append(count, close)
    const body = h('div', 'rw-body')
    win.append(head, body)
    const side = h('div', 'rw-side')
    const below = h('div', 'rw-below')
    wrap.append(win, side, below)
    back.appendChild(wrap)
    frame = { wrap, body, side, below, count }
    w.render(api())
  }
  function openWindow(id) {
    if (!WINDOWS[id]) return
    if (openId === id) return closeWindow()
    const was = openId
    openId = id
    build(id)
    back.classList.add('on')
    document.body.classList.add('win-open')
    if (!was) sfx.windowOpen()
    else sfx.tab()
    actions.windowOpened?.(true)
  }
  function closeWindow() {
    if (!openId) return
    openId = null
    tickers = []
    document.body.classList.remove('win-open')
    sfx.windowClose()
    const wrap = back.querySelector('.rw-wrap')
    wrap?.classList.add('closing')
    setTimeout(() => {
      if (openId) return
      back.classList.remove('on')
      back.innerHTML = ''
    }, 130)
    actions.windowOpened?.(false)
  }
  // Re-render the open window, keeping the scroll positions of its [data-keep] areas.
  function refreshWindow() {
    if (!openId || !frame) return
    const keep = [...back.querySelectorAll('[data-keep]')].map((el) => [el.className, el.scrollTop, el.scrollLeft])
    build(openId, true)
    for (const [cls, top, left] of keep) {
      const el = [...back.querySelectorAll('[data-keep]')].find((e) => e.className === cls)
      if (el) {
        el.scrollTop = top
        el.scrollLeft = left
      }
    }
  }
  function tickWindow() {
    for (const fn of tickers) fn()
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && openId) closeWindow()
  })

  function card({ img, name, meta, metaIcon, tag, tagColor, button, cls = '' }) {
    const c = h('div', `card ${cls}`)
    c.innerHTML = `${img ? `<img class="thumb" src="${img}" alt="">` : ''}<div class="name">${name}</div>${meta ? `<div class="meta">${metaIcon ? ico(metaIcon, 48) : ''}${meta}</div>` : ''}`
    if (tag) {
      const t = h('span', 'tag', tag)
      t.style.background = tagColor
      c.appendChild(t)
    }
    if (button) c.appendChild(button)
    return c
  }
  function button(text, color, fn, disabled = false) {
    const b = h('button', `btn ${color} ol-thin`, text)
    b.style.color = '#fff'
    b.disabled = disabled
    b.addEventListener('click', fn)
    return b
  }

  function renderShop(body) {
    body.appendChild(h('div', 'sub', 'Passes'))
    const g1 = h('div', 'grid')
    for (const p of PASSES) {
      const owned = hasPass(p.id)
      g1.appendChild(
        card({
          img: iconURL(p.id === 'skill2x' ? 'crystal' : p.id === 'wins2x' ? 'trophy' : p.id === 'petslot' ? 'bag' : 'starter', 192),
          name: p.name,
          meta: p.desc,
          button: owned ? button('Owned', 'grey', () => {}, true) : button(`${ico('trophy', 48)} ${fmtShort(p.price)}`, 'green', () => actions.buyPass(p.id)),
        }),
      )
    }
    body.appendChild(g1)
    body.appendChild(h('div', 'sub', 'Skill Packs'))
    const g2 = h('div', 'grid')
    for (const p of SKILL_PACKS) {
      g2.appendChild(card({ img: iconURL('crystal', 192), name: `+${fmt(p.amount)} Skill`, meta: 'Instant Skill boost', button: button(`${ico('trophy', 48)} ${fmtShort(p.price)}`, 'blue', () => actions.buyPack(p.id)) }))
    }
    body.appendChild(g2)
    body.appendChild(h('div', 'sub', 'Limited Pets'))
    const g3 = h('div', 'grid')
    for (const sp of STAND_PETS) {
      const owned = state.pets.some((p) => p.id === sp.id)
      g3.appendChild(card({ img: petThumb(sp.id), name: sp.name, meta: `x${fmt(sp.boost + 1)} Skill`, tag: sp.rarity, tagColor: '#ff4f8b', button: button(owned ? 'Buy again' : `${ico('trophy', 48)} ${fmtShort(sp.price)}`, 'gold', () => actions.buyStand(sp.id)) }))
    }
    body.appendChild(g3)
  }

  function renderLog(body) {
    body.innerHTML = `<div class="sub">Launch Update</div><ul class="loglist">
      <li>Train with slingshots to build Skill: click or tap to swing.</li>
      <li>Walk onto the yellow <b>FLYING ZONE</b> to launch over the slime. More Skill = longer flights = more Wins.</li>
      <li>Ten slingshots on the west terrace, step on a pad to buy or equip one.</li>
      <li>Training tables on the east terrace multiply your training: unlock them with Rebirths or Wins.</li>
      <li>Six eggs with ${ALL_PETS.length} pets to collect (Golden and Diamond ones too), plus limited pets.</li>
      <li>Daily Rewards (a limited Galaxy Cannon on day 7) and Playtime Rewards with free eggs and boosts.</li>
      <li>22 Titles with bonuses, 11 Trails, Skill / Win / Luck Boost potions and the Index Luck bonus.</li>
      <li>Trails, passes, skill packs and the Starter Pack: everything is bought with Wins.</li>
      <li><b>Lane animals!</b> Frogs, Robo-Ducks, Slime Dragons and 18 more try to cut your flight short. Steer to dodge, chain dodges for bonus Wins, grab Mushrooms, Seagulls and Fans for boosts.</li>
      <li>Bosses: the King Slime Dragon (1,000 m), Mecha-Duck Mk II (2,000 m) and the Sky Whale (2,800 m). Survive them for huge Wins.</li>
      <li>Flight Gear (the Gear button): Air Dash, Shield Bubble, Slime-Proof Suit, Glide Wings, Anti-Magnet Boots, Quick Escape and Animal Radar, all for Wins.</li>
      <li>Coming next: World 2 (needs 600M Skill).</li></ul>
      <div class="sub">Controls</div><ul class="loglist">
      <li>WASD / joystick to move, Space to jump, Shift to sprint.</li>
      <li>Click or E (desktop) / TRAIN button (touch) to train.</li>
      <li>While flying: A/D or the joystick steers, Space / DASH dashes (with Air Dash), tap fast to break free when trapped.</li>
      <li>E / F: hatch 1 or 3 eggs when standing at an egg. Esc closes a window.</li></ul>`
  }

  // --- Live HUD values ---
  let lastLevel = -1
  function update() {
    const lv = levelInfo()
    skillEl.lastChild.textContent = `${fmtShort(state.skill)} SKILL`
    multEl.textContent = `x${fmt(rebirthMult())} Multiplier`
    bar.firstChild.style.width = `${lv.progress * 100}%`
    bar.lastChild.textContent = `Level ${fmt(lv.level)}`
    rbStat.lastChild.textContent = fmt(state.rebirths)
    winStat.lastChild.textContent = fmtShort(state.wins)
    pct.textContent = `${Math.floor(rebirthProgress() * 100)}%`
    toggles.autoRebirth.classList.toggle('on', state.autoRebirth)
    toggles.autoFly.classList.toggle('on', state.autoFly)
    toggles.autoRebirth.lastChild.textContent = state.autoRebirth ? '✔' : ''
    toggles.autoFly.lastChild.textContent = state.autoFly ? '✔' : ''
    passSkill.classList.toggle('owned', hasPass('skill2x'))
    passWins.classList.toggle('owned', hasPass('wins2x'))
    passSkill.querySelector('.p').innerHTML = hasPass('skill2x') ? 'OWNED' : `ONLY ${ico('trophy', 48)}${fmtShort(PASSES[0].price)}`
    passWins.querySelector('.p').innerHTML = hasPass('wins2x') ? 'OWNED' : `ONLY ${ico('trophy', 48)}${fmtShort(PASSES[1].price)}`
    starter.style.display = hasPass('starter') ? 'none' : ''
    if (openId === 'rebirth' && lv.level !== lastLevel) refreshWindow()
    lastLevel = lv.level
    sideBtn.daily.classList.toggle('alert', dailyClaimable().length > 0)
    sideBtn.gear.classList.toggle('alert', GEAR.some((g) => (g.prices[state.gear?.[g.id] ?? 0] ?? Infinity) <= state.wins))
    document.body.classList.toggle('hide-hud', !!state.settings.hideHud)
    renderBoosts()
  }
  function setBadge(n) {
    badge.textContent = String(n)
    badge.style.display = n > 0 ? '' : 'none'
    sideBtn.playtime.classList.toggle('alert', n > 0)
  }
  // Active boost potions: chips at the top with the time left (tap = open Items).
  let boostKey = ''
  function renderBoosts() {
    const active = Object.keys(BOOSTS).filter((k) => state.boostLeft[k] > 0)
    const key = active.join(',')
    if (key !== boostKey) {
      boostKey = key
      boostRow.innerHTML = ''
      for (const k of active) {
        const c = h('button', 'boost-chip', `${ico(BOOSTS[k].icon, 96)}<span class="ol-thin">x${BOOSTS[k].mult}</span><span class="t ol-thin"></span>`)
        c.dataset.k = k
        c.style.setProperty('--c', BOOSTS[k].color)
        c.addEventListener('click', () => actions.openItems?.())
        boostRow.appendChild(c)
      }
    }
    for (const c of boostRow.children) c.querySelector('.t').textContent = clock(state.boostLeft[c.dataset.k])
  }
  // Once a second from game.js: window timers + boost chips.
  function tick() {
    tickWindow()
    renderBoosts()
  }

  function toast(text, color = '#ffffff') {
    const t = h('div', 'toast ol', text)
    t.style.color = color
    toasts.appendChild(t)
    setTimeout(() => t.remove(), 2400)
    while (toasts.children.length > 4) toasts.firstChild.remove()
  }
  function pop(text, color = '#5fe0ff', x = 50, y = 46) {
    const p = h('div', 'pop ol', text)
    p.style.color = color
    p.style.left = `${x + (Math.random() - 0.5) * 8}%`
    p.style.top = `${y + (Math.random() - 0.5) * 6}%`
    root.appendChild(p)
    setTimeout(() => p.remove(), 1000)
  }
  function flight(on, dist = 0, wins = 0) {
    meter.classList.toggle('on', on)
    if (on) {
      meter.firstChild.textContent = `${fmt(dist)}m`
      meter.lastChild.lastChild.textContent = `+${fmtShort(wins)}`
    }
  }
  function result(dist, wins, tokens) {
    const r = h('div', 'result', `<div class="big ol">${ico('trophy')}+${fmtShort(wins)}</div><div class="small ol">${fmt(dist)}m flight${tokens ? ` · +${tokens} Race Token` : ''}</div>`)
    root.appendChild(r)
    setTimeout(() => r.remove(), 1800)
  }

  // Egg prompt: shown while standing at an egg.
  let promptKey = null
  function showEggPrompt(egg) {
    const key = egg ? egg.id : null
    if (key === promptKey) return
    promptKey = key
    prompt.classList.toggle('on', !!egg)
    if (!egg) return
    prompt.innerHTML = ''
    const c = h('div', 'pcard')
    for (const p of egg.pets) {
      const seen = state.discovered.includes(p.id)
      const el = h('div', `pet ${seen ? '' : 'locked'}`, `<img src="${petThumb(p.id)}" alt=""><div class="ol-thin" style="color:${RARITY_COLORS[p.rarity]}">${p.chance}%</div>`)
      c.appendChild(el)
    }
    const row = h('div', 'row')
    const priceTxt = egg.currency === 'tokens' ? `${egg.price} ${ico('token', 48)}` : `${ico('trophy', 48)} ${fmtShort(egg.price)}`
    row.appendChild(button(`Hatch 1<small>${priceTxt} · E</small>`, 'green', () => actions.hatch(egg.id, 1)))
    row.appendChild(button(`Hatch 3<small>${egg.currency === 'tokens' ? `${egg.price * 3} ${ico('token', 48)}` : `${ico('trophy', 48)} ${fmtShort(egg.price * 3)}`} · F</small>`, 'blue', () => actions.hatch(egg.id, 3)))
    prompt.append(h('div', 'ol', `<span style="font-size:clamp(16px,3vmin,28px)">${egg.name}</span>`), c, row)
  }
  function refreshPrompt() {
    const k = promptKey
    promptKey = null
    showEggPrompt(EGGS.find((e) => e.id === k) ?? null)
  }
  // Generic buy prompt (locked tables, limited pets): { key, title, text, img, price, onBuy } or null.
  function showBuy(info) {
    const key = info ? `buy:${info.key}` : null
    if (key === promptKey) return
    if (!info && promptKey && !promptKey.startsWith('buy:')) return
    promptKey = key
    prompt.classList.toggle('on', !!info)
    if (!info) return
    prompt.innerHTML = ''
    prompt.appendChild(h('div', 'ol', `<span style="font-size:clamp(16px,3vmin,28px)">${info.title}</span>`))
    if (info.img || info.text) {
      const c = h('div', 'pcard', `${info.img ? `<div class="pet"><img src="${info.img}" alt=""></div>` : ''}<div class="hint" style="max-width:40vmin;align-self:center">${info.text ?? ''}</div>`)
      prompt.appendChild(c)
    }
    if (info.onBuy) {
      const row = h('div', 'row')
      row.appendChild(button(`Buy<small>${ico('trophy', 48)} ${fmtShort(info.price)} · E</small>`, 'gold', info.onBuy))
      prompt.appendChild(row)
    }
    // A rewarded ad (Free Rewards Chest): { onAd, adText }.
    if (info.onAd) {
      const row = h('div', 'row')
      row.appendChild(button(`Watch Ad<small>▶ ${info.adText} · E</small>`, 'gold', info.onAd))
      prompt.appendChild(row)
    }
  }

  // Hatch overlay: eggs shake, flash, then the pets pop out.
  const hatchEl = h('div', 'hatch')
  document.body.appendChild(hatchEl)
  let hatchBusy = false
  function hatchAnim(egg, petIds, done) {
    hatchBusy = true
    hatchEl.innerHTML = ''
    const stage = h('div', 'stage')
    const slots = petIds.map(() => {
      const s = h('div', 'slot', `<img class="egg" src="${eggThumb(egg.look)}" alt="">`)
      stage.appendChild(s)
      return s
    })
    hatchEl.appendChild(stage)
    hatchEl.classList.add('on')
    setTimeout(() => {
      hatchEl.appendChild(h('div', 'flash'))
      slots.forEach((s, i) => {
        const p = petById(petIds[i])
        s.innerHTML = `<img class="pet" src="${petThumb(p.id)}" alt=""><div class="nm ol">${p.name}</div><div class="rr ol-thin" style="color:${RARITY_COLORS[p.rarity]}">${p.rarity} · +${fmt(p.boost * 100)}%</div>`
      })
      done?.()
    }, 1300)
    setTimeout(() => {
      hatchEl.classList.remove('on')
      hatchBusy = false
    }, 3300)
  }
  hatchEl.addEventListener('pointerdown', () => {
    if (hatchEl.querySelector('.pet')) {
      hatchEl.classList.remove('on')
      hatchBusy = false
    }
  })

  return {
    update,
    tick,
    setBadge,
    toast,
    pop,
    flight,
    result,
    showEggPrompt,
    showBuy,
    refreshPrompt,
    hatchAnim,
    isHatching: () => hatchBusy,
    openWindow,
    openInventoryTab(tab) {
      setInvTab(tab)
      if (openId === 'inventory') refreshWindow()
      else openWindow('inventory')
    },
    closeWindow,
    refreshWindow,
    isWindowOpen: () => !!openId,
    get openId() {
      return openId
    },
  }
}
