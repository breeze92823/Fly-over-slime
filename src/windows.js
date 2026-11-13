import './windows.css'
import { BOOSTS, DAILY, EGGS, FRIEND_BOOST, GAME_SETTINGS, INDEX_LUCK, PET_TIERS, PLAYTIME, RARITY_COLORS, STAND_PETS, LIMITED_PETS, TITLES, TRAILS, skipRebirthPrice } from './config.js'
import { iconURL, studURL, trailArtURL } from './icons.js'
import { fmtShort } from './props.js'
import * as bloxity from './bloxity.js'
import { refreshInvites, sendInvited } from './net.js'
import {
  ALL_PETS,
  ALL_SLINGSHOTS,
  dailyClaimable,
  friendBoost,
  friends,
  indexKey,
  indexLuck,
  levelInfo,
  msToNextDay,
  nextSlotPrice,
  nextStoragePrice,
  petById,
  petPower,
  petSlots,
  petStorage,
  rebirthLevel,
  rebirthMult,
  slingById,
  state,
  tierById,
  titleById,
  titleOwned,
  titleStat,
  titleTarget,
} from './state.js'

// The game's menu windows in the chunky lego style: a blue studded title bar with
// a big outlined title and a red X, a dark see-through body. Daily Rewards,
// Playtime Rewards, Trails, Inventory (Pets / Items / Titles), Settings, Rebirth
// and Index. hud.js owns the frame (open / close / refresh); each window here
// renders into it through `api`:
//   api.body, api.side (tabs left of the window), api.below (bar under it),
//   api.setCount(text) (right side of the title bar), api.onTick(fn) (every second),
//   api.wrap (the positioned window wrapper, for tooltips).
// Game logic lives in game.js and is reached through `actions`.

const fmt = (n) => Math.round(n).toLocaleString('en-US')
const pct = (f) => `${Math.round(f * 100)}%`
export const h = (tag, cls, html) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  return e
}
const ico = (name, size = 128, cls = '') => `<img class="${cls}" src="${iconURL(name, size)}" alt="" draggable="false">`
const img = (src, cls = '') => `<img class="${cls}" src="${src}" alt="" draggable="false">`
export function clock(s) {
  s = Math.max(0, Math.ceil(s))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}
const BONUS_ICON = { skill: 'bolt', wins: 'trophy', luck: 'clover' }
const BONUS_NAME = { skill: 'Skill', wins: 'Wins', luck: 'Luck' }
function bonusText(bonus) {
  const [k, v] = Object.entries(bonus)[0]
  return `${ico(BONUS_ICON[k], 64, 'bi')}<span>• +${Math.round(v * 100)}% ${BONUS_NAME[k]}</span>`
}
function rbtn(text, color, fn, { disabled = false, cls = '' } = {}) {
  const b = h('button', `rb ${color} ${cls}`, `<span class="o">${text}</span>`)
  b.disabled = disabled
  b.addEventListener('click', (e) => {
    e.stopPropagation()
    fn?.()
  })
  return b
}
// Hover (mouse) or tap (touch) tooltip anchored over an element of the window.
function tooltip(api, el, build) {
  const show = () => {
    api.wrap.querySelector('.rw-tip')?.remove()
    const tip = h('div', 'rw-tip')
    build(tip)
    api.wrap.appendChild(tip)
    const w = api.wrap.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const tw = tip.offsetWidth
    const x = Math.max(0, Math.min(w.width - tw, r.left - w.left + r.width / 2 - tw / 2))
    tip.style.left = `${x}px`
    tip.style.top = `${Math.max(0, r.top - w.top + r.height * 0.42)}px`
  }
  const hide = () => api.wrap.querySelector('.rw-tip')?.remove()
  el.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && show())
  el.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && hide())
  el.addEventListener('click', () => (api.wrap.querySelector('.rw-tip') && el.dataset.tip === '1' ? (hide(), (el.dataset.tip = '')) : (show(), api.wrap.querySelectorAll('[data-tip]').forEach((n) => (n.dataset.tip = '')), (el.dataset.tip = '1'))))
}

// UI state that survives a refresh (tabs, selection, modes).
const ui = { invTab: 'pets', indexTab: '', title: null, deleting: false }
export const setInvTab = (t) => (ui.invTab = t)

export function makeWindows({ actions, petThumb, eggThumb, slingThumb }) {
  // --- Daily Rewards -------------------------------------------------------------------------
  function rewardLook(r) {
    if (r.boost) return { img: iconURL(BOOSTS[r.boost].icon, 192), label: `${r.n} ${BOOSTS[r.boost].name}${r.n > 1 ? 's' : ''}` }
    if (r.pet) return { img: petThumb(r.pet), label: `${petById(r.pet).name}!` }
    if (r.sling) return { img: slingThumb(slingById(r.sling).style), label: `${slingById(r.sling).name}!` }
    return { img: '', label: '' }
  }
  function renderDaily(api) {
    const panel = h('div', 'rw-panel daily')
    const unlocked = state.daily.unlocked
    DAILY.forEach((r, i) => {
      const claimed = state.daily.claimed.includes(i)
      const ready = i < unlocked && !claimed
      const look = rewardLook(r)
      const big = i === DAILY.length - 1
      const c = h('button', `dcard ${big ? 'd7' : ''} ${ready ? 'ready' : ''} ${claimed ? 'done' : ''}`)
      c.innerHTML = big
        ? `<div class="dday o">DAY ${i + 1}</div><div class="lim">Limited!</div>${img(look.img, 'dimg')}<div class="dlbl o">${look.label}</div>`
        : `<div class="dday o">DAY ${i + 1}</div>${img(look.img, 'dimg')}<div class="dlbl o">${look.label}</div>`
      const label = claimed ? 'Claimed' : ready ? 'Claim!' : 'Locked'
      const b = rbtn(label, ready ? 'lime' : 'grey', () => ready && actions.claimDaily(i), { disabled: !ready, cls: 'dbtn' })
      c.appendChild(b)
      if (claimed) c.insertAdjacentHTML('beforeend', ico('check', 96, 'dcheck'))
      c.addEventListener('click', () => ready && actions.claimDaily(i))
      panel.appendChild(c)
    })
    api.body.appendChild(panel)
    const next = h('div', 'rw-foot o')
    const tick = () => (next.textContent = dailyClaimable().length ? 'Rewards ready to claim!' : `Next reward in ${clock(msToNextDay() / 1000)}`)
    tick()
    api.onTick(tick)
    api.below.appendChild(next)
  }

  // --- Playtime Rewards ----------------------------------------------------------------------
  function playLook(p) {
    if (p.skill) return { title: 'Skill', img: iconURL('bolt', 192), label: `+${fmt(p.skill * rebirthMult())} Skill` }
    if (p.wins) return { title: 'Wins', img: iconURL('trophy', 192), label: `+${fmt(p.wins * rebirthMult())} Wins` }
    if (p.egg) {
      const egg = EGGS.find((e) => e.id === p.egg)
      return { title: 'Free Egg', img: eggThumb(egg.look), label: egg.name }
    }
    const b = BOOSTS[p.boost]
    return { title: b.name, img: iconURL(b.icon, 192), label: `1 ${b.name}` }
  }
  function renderPlaytime(api) {
    const panel = h('div', 'rw-panel play')
    const mins = actions.sessionMinutes()
    PLAYTIME.forEach((p, i) => {
      const claimed = state.claimedGifts.includes(i)
      const look = playLook(p)
      const row = i === PLAYTIME.length - 1 ? 'rainbow' : ['blue', 'purple', 'orange'][Math.floor(i / 4)] ?? 'orange'
      const t = h('button', `ptile ${row} ${claimed ? 'done' : ''}`)
      t.innerHTML = `<div class="pt o">${look.title}</div>${img(look.img, 'pimg')}<div class="pl o">${look.label}</div>`
      const b = rbtn('', 'grey', () => actions.claimPlaytime(i), { cls: 'pbtn' })
      t.appendChild(b)
      const set = () => {
        const left = p.at * 60 - actions.sessionMinutes() * 60
        const ready = left <= 0 && !claimed
        b.className = `rb ${claimed ? 'grey' : ready ? 'lime' : 'grey'} pbtn`
        b.disabled = claimed || !ready
        b.firstChild.textContent = claimed ? 'Claimed' : ready ? 'Claim!' : clock(left)
        t.classList.toggle('ready', ready)
      }
      set()
      if (!claimed && mins < p.at) api.onTick(set)
      t.addEventListener('click', () => !b.disabled && actions.claimPlaytime(i))
      panel.appendChild(t)
    })
    api.body.appendChild(panel)
  }

  // --- Trails --------------------------------------------------------------------------------
  function renderTrails(api) {
    const row = h('div', 'trails-row')
    row.dataset.keep = 'x'
    for (const t of TRAILS) {
      const owned = state.trails.includes(t.id)
      const on = state.trail === t.id
      const c = h('div', `tcard ${on ? 'on' : ''}`)
      const grad = t.card.length > 2 ? `linear-gradient(135deg, ${t.card.join(',')})` : `linear-gradient(${t.card[0]}, ${t.card[1]})`
      c.style.background = `radial-gradient(ellipse at 55% 42%, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.25) 32%, transparent 60%), ${grad}`
      c.innerHTML = `<div class="tname o">${t.name}</div>${img(trailArtURL(t.id, t.colors), 'tart')}<div class="tmult">${ico('trophy', 64, 'ti')}<span class="o">x${t.mult} Wins</span></div>`
      let b
      if (on) b = rbtn(`${ico('check', 64, 'bi')}Equipped`, 'grey', () => actions.equipTrail(''), { cls: 'tbtn' })
      else if (owned) b = rbtn('Equip', 'blue', () => actions.equipTrail(t.id), { cls: 'tbtn' })
      else b = rbtn(`${ico('trophy', 64, 'bi')}${fmtShort(t.price)}`, t.premium ? 'purple' : 'green', () => actions.buyTrail(t.id), { cls: 'tbtn' })
      c.appendChild(b)
      tooltip(api, c, (tip) => {
        tip.innerHTML = `<div class="tip-h o">${t.name}</div><div class="tip-b"><div class="tip-m">${ico('trophy', 64, 'ti')}<span class="o">x${t.mult} Wins</span></div><div class="tip-p o">${owned ? (on ? 'Equipped' : 'Owned') : `Price: ${ico('trophy', 48, 'pi')}${fmtShort(t.price)}`}</div></div>`
      })
      row.appendChild(c)
    }
    // mouse wheel scrolls the row sideways
    row.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        row.scrollLeft += e.deltaY
        e.preventDefault()
      }
    }, { passive: false })
    api.body.appendChild(row)
  }

  // --- Inventory -----------------------------------------------------------------------------
  function sideTabs(api, tabs, current, pick, cls = '') {
    for (const [id, label, icon] of tabs) {
      const b = h('button', `rw-tab ${cls} ${id === current ? 'on' : ''}`, icon ? `${ico(icon, 160)}<span class="o">${label}</span>` : `<span class="o">${label}</span>`)
      b.dataset.tab = id
      b.addEventListener('click', () => pick(id))
      api.side.appendChild(b)
    }
  }
  function renderInventory(api) {
    sideTabs(api, [['pets', 'Pets', 'paw'], ['items', 'Items', 'backpack'], ['titles', 'Titles', 'titles']], ui.invTab, (id) => {
      ui.invTab = id
      ui.deleting = false
      api.refresh()
    })
    if (ui.invTab === 'pets') renderPets(api)
    else if (ui.invTab === 'items') renderItems(api)
    else renderTitles(api)
  }
  function renderPets(api) {
    const wrap = h('div', `pets ${ui.deleting ? 'deleting' : ''}`)
    const grid = h('div', 'rw-grid pet-grid')
    grid.dataset.keep = 'y'
    const sorted = [...state.pets].sort((a, b) => b.equipped - a.equipped || petPower(b) - petPower(a))
    for (const p of sorted) {
      const d = petById(p.id)
      const tier = tierById(p.tier)
      const t = h('button', `rw-tile pet t-${p.tier || 'b'} ${p.equipped ? 'eq' : ''}`)
      t.innerHTML = `${img(petThumb(p.id, p.tier), 'pthumb')}<div class="pb o">+${fmtShort(petPower(p) * 100)}%</div>${p.equipped ? ico('check', 64, 'pchk') : ''}${ui.deleting && !p.equipped ? ico('trash', 64, 'ptrash') : ''}`
      t.style.setProperty('--rar', RARITY_COLORS[d.rarity])
      t.title = `${tier.id ? tier.name + ' ' : ''}${d.name} (${d.rarity})`
      t.addEventListener('click', () => (ui.deleting ? actions.deletePet(p.uid) : actions.togglePet(p.uid)))
      tooltip(api, t, (tip) => {
        tip.innerHTML = `<div class="tip-h o">${tier.id ? tier.name + ' ' : ''}${d.name}</div><div class="tip-b"><div class="tip-r o" style="color:${RARITY_COLORS[d.rarity]}">${d.rarity}</div><div class="tip-m">${ico('bolt', 64, 'ti')}<span class="o">+${fmt(petPower(p) * 100)}% Skill</span></div></div>`
      })
      grid.appendChild(t)
    }
    if (!state.pets.length) grid.appendChild(h('div', 'rw-empty o', 'No pets yet! Hatch eggs in the egg court south of spawn.'))
    const bar = h('div', 'rw-actions')
    bar.append(
      rbtn('Equip Best', 'lemon', () => actions.equipBest()),
      rbtn(ui.deleting ? 'Done' : 'Delete', 'pink', () => {
        ui.deleting = !ui.deleting
        api.refresh()
      }),
      rbtn('Unequip All', 'orange', () => actions.unequipAll()),
    )
    wrap.append(grid, bar)
    api.body.appendChild(wrap)
    if (ui.deleting) wrap.appendChild(h('div', 'rw-hint o', 'Tap pets to delete them (equipped pets are kept)'))
    // capacity bar under the window: equipped slots + storage, each with a "+"
    const cap = h('div', 'capbar')
    const eq = state.pets.filter((p) => p.equipped).length
    const slotP = nextSlotPrice()
    const storP = nextStoragePrice()
    const plus = (fn, price, what) => {
      const b = h('button', 'capplus', ico('plus', 64))
      b.disabled = price == null
      b.title = price == null ? 'Maxed' : `${what}: ${fmt(price)} Wins`
      b.addEventListener('click', fn)
      return b
    }
    const c1 = h('div', 'cap', `${ico('paw', 64, 'ci')}<span class="o">(${eq}/${petSlots()})</span>`)
    c1.appendChild(plus(() => actions.buySlot(), slotP, '+1 Pet Slot'))
    const c2 = h('div', 'cap', `${ico('box', 64, 'ci')}<span class="o">(${state.pets.length}/${petStorage()})</span>`)
    c2.appendChild(plus(() => actions.buyStorage(), storP, '+50 Storage'))
    cap.append(c1, c2)
    api.below.appendChild(cap)
  }
  function section(title, icon) {
    return h('div', 'rw-sec', `${ico(icon, 128, 'si')}<span class="o">${title}</span>`)
  }
  function renderItems(api) {
    const wrap = h('div', 'items')
    wrap.dataset.keep = 'y'
    wrap.appendChild(section('Launchers', 'gift'))
    const g1 = h('div', 'rw-grid item-grid')
    for (const s of ALL_SLINGSHOTS.filter((x) => state.slingshots.includes(x.id))) {
      const t = h('button', `rw-tile item ${state.equippedSling === s.id ? 'eq' : ''}`, `${img(slingThumb(s.style), 'ithumb')}<div class="il o">+${fmtShort(s.skill)} Skill</div>${state.equippedSling === s.id ? ico('check', 64, 'pchk') : ''}`)
      t.addEventListener('click', () => actions.equipSling(s.id))
      tooltip(api, t, (tip) => (tip.innerHTML = `<div class="tip-h o">${s.name}</div><div class="tip-b"><div class="tip-m">${ico('bolt', 64, 'ti')}<span class="o">+${fmtShort(s.skill)} Skill</span></div></div>`))
      g1.appendChild(t)
    }
    wrap.appendChild(g1)
    wrap.appendChild(section('Boosts', 'potionSkill'))
    const g2 = h('div', 'rw-grid item-grid')
    for (const [k, b] of Object.entries(BOOSTS)) {
      const n = state.potions[k]
      const t = h('button', `rw-tile item boost ${n ? '' : 'none'}`)
      t.innerHTML = `${ico(b.icon, 160, 'ithumb')}<div class="icount o">x${n}</div><div class="il o">${b.name}</div><div class="itime o"></div>`
      const time = t.querySelector('.itime')
      const set = () => {
        const left = state.boostLeft[k]
        time.textContent = left > 0 ? clock(left) : ''
      }
      set()
      api.onTick(set)
      t.addEventListener('click', () => actions.useBoost(k))
      tooltip(api, t, (tip) => (tip.innerHTML = `<div class="tip-h o">${b.name}</div><div class="tip-b"><div class="tip-m"><span class="o">x${b.mult} ${BONUS_NAME[k]}</span></div><div class="tip-p o">${b.minutes} minutes · tap to use</div></div>`))
      g2.appendChild(t)
    }
    wrap.appendChild(g2)
    api.body.appendChild(wrap)
  }
  function renderTitles(api) {
    const owned = TITLES.filter(titleOwned)
    const unowned = TITLES.filter((t) => !titleOwned(t))
    if (!ui.title || !titleById(ui.title)) ui.title = state.title || 'newbie'
    const lay = h('div', 'titles')
    const list = h('div', 'tlist')
    list.dataset.keep = 'y'
    list.appendChild(h('div', 'tcount o', `— ${owned.length}/${TITLES.length} Titles —`))
    const tile = (t, have) => {
      const b = h('button', `rw-tile ttile ${have ? '' : 'locked'} ${state.title === t.id && have ? 'eq' : ''} ${ui.title === t.id ? 'sel' : ''}`)
      let inner = `<div class="tn o" style="color:${t.color}">${t.name}</div>`
      if (t.bonus) inner += `<div class="tb o">${bonusText(t.bonus)}</div>`
      else if (t.req && !have) {
        const n = titleStat(t.req.stat)
        const goal = titleTarget(t)
        inner += `<div class="tbar"><div style="width:${Math.min(100, (n / goal) * 100)}%"></div><span class="o">${fmt(Math.min(n, goal))}/${fmt(goal)}</span></div>`
      }
      if (state.title === t.id && have) inner += ico('check', 64, 'pchk')
      if (!have) inner += ico('lock', 64, 'tlock')
      b.innerHTML = inner
      b.addEventListener('click', () => {
        ui.title = t.id
        api.refresh()
      })
      return b
    }
    list.appendChild(h('div', 'tsub o', 'Owned'))
    const g1 = h('div', 'rw-grid tgrid')
    owned.forEach((t) => g1.appendChild(tile(t, true)))
    list.appendChild(g1)
    if (unowned.length) {
      list.appendChild(h('div', 'tsub o', 'Unowned'))
      const g2 = h('div', 'rw-grid tgrid')
      unowned.forEach((t) => g2.appendChild(tile(t, false)))
      list.appendChild(g2)
    }
    const sel = titleById(ui.title)
    const have = titleOwned(sel)
    const det = h('div', 'tdetail')
    let progress = ''
    if (!have && sel.req) progress = `<div class="tprog o">${fmt(Math.min(titleStat(sel.req.stat), titleTarget(sel)))} / ${fmt(titleTarget(sel))}</div>`
    det.innerHTML = `<div class="dn o" style="color:${sel.color}">${sel.name}</div><div class="dd o">${sel.desc}</div>${progress}<div class="dsp"></div>${sel.bonus ? `<div class="db o">${bonusText(sel.bonus)}</div>` : '<div class="db o dim">Cosmetic title</div>'}`
    const eq = state.title === sel.id
    det.appendChild(have ? rbtn(eq ? 'Unequip' : 'Equip', eq ? 'lime' : 'lime', () => actions.equipTitle(eq ? '' : sel.id)) : rbtn('Locked', 'grey', null, { disabled: true }))
    lay.append(list, det)
    api.body.appendChild(lay)
  }

  // --- Invite Friends ------------------------------------------------------------------------
  // Opened from the Friend Boost line at the bottom left of the HUD. A friend who JOINS through our link
  // or our direct Bloxity invite gives +FRIEND_BOOST.per Skill gain for good (the server credits each
  // account once); Boxity draws its own invite button too, which works the same way.
  let friendList = null // the last Bloxity friends list
  let friendsAt = 0
  const invitedNow = new Set() // friend ids invited this session
  function renderInvite(api) {
    const per = Math.round(FRIEND_BOOST.per * 100)
    const got = Math.min(friends.joined, FRIEND_BOOST.max)
    const info = h('div', 'inv-info')
    info.innerHTML = `<div class="inv-big o">Friend Boost: +${Math.round(friendBoost() * 100)}%</div><div class="inv-sub o">Every friend who joins the game from your invite gives you +${per}% Skill gain, forever!</div><div class="inv-bar"><div style="width:${(got / FRIEND_BOOST.max) * 100}%"></div><span class="o">${got} / ${FRIEND_BOOST.max} friends</span></div>`
    api.body.appendChild(info)
    const note = (text) => api.body.appendChild(h('div', 'inv-note o', text))
    if (!bloxity.canInvite()) return note('Invites work when you play on Bloxity.')
    if (!bloxity.authState.user) return note('Sign in to Bloxity (top-left menu) to invite friends and earn the boost.')

    const copy = rbtn('Copy Invite Link', 'lime', async () => {
      const url = bloxity.inviteLink()
      if (!url) return actions.toast?.('Could not make an invite link. Try again!', '#ff6a6a')
      try {
        await navigator.clipboard.writeText(url)
        actions.toast?.('Invite link copied! Send it to a friend', '#7dff7d')
      } catch {
        window.prompt('Copy your invite link:', url)
      }
    }, { cls: 'inv-copy' })
    api.body.appendChild(copy)

    api.body.appendChild(h('div', 'inv-h o', 'Your Bloxity friends'))
    const list = h('div', 'inv-list')
    list.dataset.keep = 'y'
    api.body.appendChild(list)
    if (!friendList || Date.now() - friendsAt > 60000) {
      list.appendChild(h('div', 'inv-note o', 'Loading friends...'))
      refreshInvites() // a friend may have been credited in another room since the load
      bloxity.getFriends().then((f) => {
        friendList = f
        friendsAt = Date.now()
        if (document.body.classList.contains('win-open')) api.refresh()
      })
      return
    }
    if (!friendList.length) return list.appendChild(h('div', 'inv-note o', 'No Bloxity friends yet: share your invite link instead!'))
    const order = { 'in-game': 0, online: 1, away: 2, offline: 3 }
    const sorted = [...friendList].sort((a, b) => (order[a.presence?.status] ?? 4) - (order[b.presence?.status] ?? 4))
    for (const f of sorted.slice(0, 40)) {
      const name = f.displayName || f.username || 'Friend'
      const status = f.presence?.status ?? 'offline'
      const row = h('div', `inv-row st-${status}`)
      const nm = h('span', 'inv-name o')
      nm.textContent = name // friend names are user text
      row.append(nm, h('span', 'inv-st o', status))
      const done = invitedNow.has(f._id)
      const b = rbtn(done ? 'Invited' : 'Invite', done ? 'grey' : 'lime', async () => {
        b.disabled = true
        const ok = await bloxity.inviteFriend(f._id)
        if (!ok) {
          b.disabled = false
          return actions.toast?.(`Could not invite ${name}. Try again!`, '#ff6a6a')
        }
        invitedNow.add(f._id)
        sendInvited(f._id)
        actions.toast?.(`Invite sent to ${name}!`, '#7dff7d')
        api.refresh()
      }, { disabled: done, cls: 'inv-btn' })
      row.appendChild(b)
      list.appendChild(row)
    }
  }

  // --- Settings ------------------------------------------------------------------------------
  function renderSettings(api) {
    const list = h('div', 'set-list')
    list.dataset.keep = 'y'
    for (const s of GAME_SETTINGS) {
      const on = !!state.settings[s.key]
      const row = h('div', 'set-row', `<span class="sl o">${s.label}</span>`)
      const b = rbtn(on ? 'ON' : 'OFF', on ? 'on' : 'off', () => actions.setSetting(s.key, !on), { cls: 'toggle-btn' })
      row.appendChild(b)
      list.appendChild(row)
    }
    api.body.appendChild(list)
  }

  // --- Rebirth -------------------------------------------------------------------------------
  function renderRebirth(api) {
    const lv = levelInfo().level
    const need = rebirthLevel()
    const ready = lv >= need
    const p = h('div', 'rw-panel rebirth')
    p.innerHTML = `
      <div class="rb-cols">
        <div class="rb-col"><div class="rb-h o">Before</div><div class="rb-box">${ico('bolt', 128, 'rbi')}<div class="o">x${fmt(rebirthMult())}<br>SKILL</div></div></div>
        ${ico('chevron', 96, 'rb-arrow')}
        <div class="rb-col"><div class="rb-h o">After</div><div class="rb-box">${ico('bolt', 128, 'rbi')}<div class="o">x${fmt(rebirthMult() + 1)}<br>SKILL</div></div></div>
      </div>
      <div class="rb-warn o">Resets your LEVEL and SKILL!</div>
      <div class="rb-bar"><div style="width:${Math.min(100, (lv / need) * 100)}%"></div><span class="o">Level ${fmt(lv)} / Level ${fmt(need)}</span></div>`
    const row = h('div', 'rb-btns')
    row.append(
      rbtn('Rebirth', ready ? 'lime' : 'grey', () => actions.rebirth(), { disabled: !ready, cls: 'rb-go' }),
      rbtn(`Skip Rebirth ${ico('trophy', 48, 'bi')}${fmtShort(skipRebirthPrice(state.rebirths))}`, 'magenta', () => actions.skipRebirth(), { cls: 'rb-skip' }),
    )
    p.appendChild(row)
    api.body.appendChild(p)
  }

  // --- Index ---------------------------------------------------------------------------------
  function renderIndex(api) {
    const tier = ui.indexTab
    sideTabs(api, PET_TIERS.map((t) => [t.id, t.name]), tier, (id) => {
      ui.indexTab = id
      api.refresh()
    }, 'itab')
    api.side.querySelectorAll('.itab').forEach((b) => b.classList.add(`it-${b.dataset.tab || 'b'}`))
    const seen = ALL_PETS.filter((p) => state.discovered.includes(indexKey(p.id, tier))).length
    api.setCount(`${seen} / ${ALL_PETS.length}`)
    const list = h('div', 'idx-list')
    list.dataset.keep = 'y'
    const groups = [...EGGS.map((e) => ({ name: e.name, pets: e.pets })), { name: 'Limited Pets', pets: [...STAND_PETS, ...LIMITED_PETS] }]
    for (const g of groups) {
      const got = g.pets.filter((p) => state.discovered.includes(indexKey(p.id, tier))).length
      list.appendChild(h('div', 'idx-h o', `${g.name}&nbsp; (${got}/${g.pets.length})`))
      const row = h('div', 'rw-grid idx-row')
      for (const p of g.pets) {
        const known = state.discovered.includes(indexKey(p.id, tier))
        const t = h('button', `rw-tile idx t-${tier || 'b'} ${known ? '' : 'unknown'}`, `${img(petThumb(p.id, tier), 'xthumb')}<div class="xn o">${known ? p.name : '???'}</div>`)
        tooltip(api, t, (tip) => {
          const d = petById(p.id)
          tip.innerHTML = `<div class="tip-h o">${known ? `${tierById(tier).id ? tierById(tier).name + ' ' : ''}${d.name}` : '???'}<div class="tip-r o" style="color:${RARITY_COLORS[d.rarity]}">${d.rarity}</div></div><div class="tip-b"><div class="tip-e o">${d.eggName}</div>${p.chance ? `<div class="tip-p o">${p.chance}% chance</div>` : ''}</div>`
        })
        row.appendChild(t)
      }
      list.appendChild(row)
    }
    api.body.appendChild(list)
    // Index Luck bar
    const total = state.discovered.length
    const earned = Math.floor(total / INDEX_LUCK.every)
    const claimable = earned - state.indexClaims
    const into = claimable > 0 ? INDEX_LUCK.every : total - earned * INDEX_LUCK.every
    const luck = h('div', 'idx-luck')
    luck.innerHTML = `<span class="il-t o">Index Luck +${Math.round(indexLuck() * 100)}%</span><div class="il-bar"><div style="width:${(into / INDEX_LUCK.every) * 100}%"></div><span class="o">${into} / ${INDEX_LUCK.every}</span>${ico('clover', 128, 'il-c')}<span class="il-p o">+${Math.round(INDEX_LUCK.pct * 100)}%</span></div>`
    luck.appendChild(rbtn(claimable > 0 ? `Claim!${claimable > 1 ? ` x${claimable}` : ''}` : 'Claim!', claimable > 0 ? 'lime' : 'grey', () => actions.claimIndexLuck(), { disabled: claimable <= 0, cls: 'il-btn' }))
    api.below.appendChild(luck)
  }

  // --- Offline training report (shown once after logging back in) -----------------------------
  function hms(sec) {
    sec = Math.floor(sec)
    const d = Math.floor(sec / 86400)
    const hh = Math.floor((sec % 86400) / 3600)
    const mm = Math.floor((sec % 3600) / 60)
    return d ? `${d}d ${hh}h` : hh ? `${hh}h ${mm}m` : `${Math.max(1, mm)}m`
  }
  function renderOffline(api) {
    const r = actions.offlineReport?.()
    const box = h('div', 'rw-panel off')
    if (!r) {
      box.innerHTML = '<div class="rw-empty o">No offline training yet. Come back after a break!</div>'
      api.body.appendChild(box)
      return
    }
    box.innerHTML = `<div class="off-t o">Free Training while you were away!</div>
      <div class="off-time o">Away for ${hms(r.away)}</div>
      ${img(iconURL('bolt', 192), 'off-img')}
      <div class="off-gain o">+${fmt(r.skill)} Skill</div>
      <div class="off-sub o">${r.capped ? `Trained for the max ${hms(r.secs)}. Log in more often to earn more!` : `Trained for ${hms(r.secs)} on your best table`}</div>`
    box.appendChild(rbtn('Awesome!', 'lime', () => actions.closeWindow?.(), { cls: 'off-btn' }))
    api.body.appendChild(box)
  }

  return {
    offline: { title: 'Welcome Back!', size: 'sm', render: renderOffline },
    daily: { title: 'Daily Rewards', size: 'md', render: renderDaily },
    playtime: { title: 'Playtime Rewards', size: 'md', render: renderPlaytime },
    trails: { title: 'Trails', size: 'lg', render: renderTrails },
    inventory: { title: 'Inventory', size: 'lg', side: true, render: renderInventory },
    settings: { title: 'Settings', size: 'sm', render: renderSettings },
    invite: { title: 'Invite Friends', size: 'md', render: renderInvite },
    rebirth: { title: 'Rebirth', size: 'md', render: renderRebirth },
    index: { title: 'Index', size: 'lg', side: true, render: renderIndex },
  }
}
export { pct, studURL }
