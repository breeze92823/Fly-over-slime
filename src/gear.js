import './gear.css'
import { GEAR, LANE } from './config.js'
import { iconURL } from './icons.js'
import { fmtShort } from './props.js'
import { changed, gearLevel, state } from './state.js'
import { sfx } from './audio/index.js'

// Flight Gear: upgrades that help against the lane animals (config GEAR). Every level
// is bought with Wins (never premium currency). Opened from the "Gear" side button.

const h = (tag, cls, html) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  return e
}
const ico = (name, size = 64, cls = '') => `<img class="${cls}" src="${iconURL(name, size)}" alt="" draggable="false">`

// --- Icons (canvas, cached as data URLs) -----------------------------------------------------
const cache = new Map()
const INK = '#1b1f2e'
function paint(id) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.lineJoin = g.lineCap = 'round'
  g.translate(64, 64)
  const fs = (fill, w = 8) => {
    g.lineWidth = w
    g.strokeStyle = INK
    g.stroke()
    g.fillStyle = fill
    g.fill()
  }
  const grad = (a, b, y0 = -50, y1 = 50) => {
    const gr = g.createLinearGradient(0, y0, 0, y1)
    gr.addColorStop(0, a)
    gr.addColorStop(1, b)
    return gr
  }
  if (id === 'shield') {
    g.beginPath()
    g.arc(0, 0, 46, 0, 7)
    const r = g.createRadialGradient(-16, -18, 4, 0, 0, 50)
    r.addColorStop(0, '#ffffff')
    r.addColorStop(0.3, '#bff6ff')
    r.addColorStop(1, '#2a8fe8')
    fs(r)
    g.beginPath()
    g.ellipse(-16, -20, 12, 7, -0.6, 0, 7)
    g.fillStyle = 'rgba(255,255,255,0.9)'
    g.fill()
  } else if (id === 'dash') {
    for (const [y, w] of [[-26, 40], [0, 54], [26, 40]]) {
      g.beginPath()
      g.roundRect(-54, y - 7, w, 14, 7)
      fs('#bff6ff', 6)
    }
    g.beginPath()
    g.moveTo(4, -40)
    g.lineTo(52, 0)
    g.lineTo(4, 40)
    g.lineTo(14, 0)
    g.closePath()
    fs(grad('#7fe7ff', '#1f7fe8'))
  } else if (id === 'suit') {
    g.beginPath()
    g.moveTo(-30, -44)
    g.lineTo(-48, -20)
    g.lineTo(-36, -8)
    g.lineTo(-30, -14)
    g.lineTo(-30, 46)
    g.lineTo(30, 46)
    g.lineTo(30, -14)
    g.lineTo(36, -8)
    g.lineTo(48, -20)
    g.lineTo(30, -44)
    g.lineTo(12, -44)
    g.quadraticCurveTo(0, -30, -12, -44)
    g.closePath()
    fs(grad('#a6ff7a', '#2fae3a'))
    g.beginPath()
    g.arc(0, 10, 13, 0, 7)
    fs('#ffd23a', 6)
  } else if (id === 'wings') {
    for (const s of [-1, 1]) {
      g.save()
      g.scale(s, 1)
      g.beginPath()
      g.moveTo(4, 10)
      g.quadraticCurveTo(30, -50, 58, -36)
      g.quadraticCurveTo(50, -14, 40, -10)
      g.quadraticCurveTo(48, 2, 34, 8)
      g.quadraticCurveTo(38, 22, 20, 22)
      g.closePath()
      fs(grad('#ffffff', '#cfe9ff'))
      g.restore()
    }
    g.beginPath()
    g.arc(0, 12, 9, 0, 7)
    fs('#ffd23a', 6)
  } else if (id === 'boots') {
    for (const s of [-1, 1]) {
      g.beginPath()
      g.moveTo(s * 6, -40)
      g.lineTo(s * 30, -40)
      g.lineTo(s * 30, 20)
      g.lineTo(s * 52, 26)
      g.lineTo(s * 52, 44)
      g.lineTo(s * 6, 44)
      g.closePath()
      fs(s < 0 ? grad('#ff6a6a', '#c8121a') : grad('#d8dee8', '#7e8796'))
    }
    g.beginPath()
    g.moveTo(-50, -54)
    g.lineTo(50, 54)
    g.lineWidth = 12
    g.strokeStyle = '#ff2a3a'
    g.stroke()
  } else if (id === 'escape') {
    g.beginPath()
    g.arc(0, 0, 44, 0, 7)
    fs('rgba(160,235,255,0.55)', 7)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      g.beginPath()
      g.moveTo(Math.cos(a) * 30, Math.sin(a) * 30)
      g.lineTo(Math.cos(a) * 58, Math.sin(a) * 58)
      g.lineWidth = 8
      g.strokeStyle = '#ffffff'
      g.stroke()
    }
    g.beginPath()
    g.arc(0, 0, 18, 0, 7)
    fs('#ffd23a', 6)
  } else if (id === 'radar') {
    g.beginPath()
    g.arc(0, 0, 50, 0, 7)
    fs(grad('#2a5a3a', '#0f2a1a'))
    g.strokeStyle = '#7dff5a'
    g.lineWidth = 4
    for (const r of [16, 32]) {
      g.beginPath()
      g.arc(0, 0, r, 0, 7)
      g.stroke()
    }
    g.beginPath()
    g.moveTo(0, 0)
    g.arc(0, 0, 48, -1.6, -0.6)
    g.closePath()
    g.fillStyle = 'rgba(125,255,90,0.55)'
    g.fill()
    g.beginPath()
    g.arc(20, -22, 7, 0, 7)
    fs('#ff3a3a', 4)
  }
  return c.toDataURL()
}
export const gearIcon = (id) => {
  if (!cache.has(id)) cache.set(id, paint(id))
  return cache.get(id)
}

// What one level does, as text.
function effect(gr, lv) {
  if (lv <= 0) return gr.id === 'dash' ? 'Locked' : 'None'
  switch (gr.id) {
    case 'dash':
      return `Cooldown ${gr.cooldown[Math.min(gr.cooldown.length, lv) - 1]} s`
    case 'shield':
      return `${lv} bubble${lv > 1 ? 's' : ''} / flight`
    case 'suit':
    case 'wings':
    case 'boots':
      return `-${Math.round(gr.per * lv * 100)}% lost`
    case 'escape':
      return `${Math.max(3, Math.round(LANE.trap.taps - lv * gr.per))} taps to escape`
    case 'radar':
      return `+${(gr.per * lv).toFixed(2)} s warning`
    default:
      return `Level ${lv}`
  }
}

export function buyGear(id, onToast) {
  const gr = GEAR.find((g) => g.id === id)
  if (!gr) return false
  const lv = gearLevel(id)
  const price = gr.prices[lv]
  if (price == null) return false
  if (state.wins < price) {
    sfx.deny()
    onToast?.(`Not enough Wins! Need ${fmtShort(price)}`, '#ff6a6a')
    return false
  }
  state.wins -= price
  state.gear = { ...(state.gear ?? {}), [id]: lv + 1 }
  if (state.stats) state.stats.spent = (state.stats.spent ?? 0) + price
  changed()
  sfx.purchase()
  onToast?.(`${gr.name} Level ${lv + 1}!`, '#7dff5a')
  return true
}

// Window definition for hud.js (WINDOWS.gear).
export function gearWindow({ toast }) {
  return {
    title: 'Flight Gear',
    size: 'lg',
    render(api) {
      const owned = GEAR.reduce((n, g) => n + gearLevel(g.id), 0)
      const total = GEAR.reduce((n, g) => n + g.prices.length, 0)
      api.setCount(`${owned} / ${total}`)
      const list = h('div', 'gear-list')
      list.dataset.keep = 'y'
      list.appendChild(h('div', 'gear-intro o', 'Animals try to cut your flight short. Gear up to dodge them and fly farther!'))
      for (const gr of GEAR) {
        const lv = gearLevel(gr.id)
        const max = gr.prices.length
        const price = gr.prices[lv]
        const card = h('div', `gear-card ${lv >= max ? 'maxed' : ''}`)
        card.innerHTML = `<img class="gi" src="${gearIcon(gr.id)}" alt="" draggable="false">
          <div class="gtxt"><div class="gn o">${gr.name}</div><div class="gd">${gr.desc}</div>
          <div class="gpips">${Array.from({ length: max }, (_, i) => `<span class="${i < lv ? 'on' : ''}"></span>`).join('')}</div>
          <div class="ge o">${effect(gr, lv)}${lv < max ? ` <span class="arr">➜</span> <span class="nx">${effect(gr, lv + 1)}</span>` : ''}</div></div>`
        const b = h('button', `rb ${lv >= max ? 'grey' : state.wins >= price ? 'lime' : 'green'} gbtn`, `<span class="o">${lv >= max ? 'MAX' : `${ico('trophy', 64, 'bi')}${fmtShort(price)}`}</span>`)
        b.disabled = lv >= max
        b.addEventListener('click', (e) => {
          e.stopPropagation()
          if (buyGear(gr.id, toast)) api.refresh()
        })
        card.appendChild(b)
        list.appendChild(card)
      }
      api.body.appendChild(list)
    },
  }
}
