import './flightHud.css'
import { iconURL } from './icons.js'
import { fmtShort } from './props.js'

// DOM for the fly sequence (driven by flight.js): the FLY button, the big
// distance counter with the region name above it, "xN SKIPS!" pops, the trophy
// reward card and the fade back to the lobby. Kept apart from hud.js.

const fmt = (n) => Math.round(n).toLocaleString('en-US')
const h = (tag, cls, html) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  return e
}

// Small region badges drawn on a canvas (both sides of the region name).
function regionIcon(kind, color) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  g.lineJoin = g.lineCap = 'round'
  const ink = '#1b1f2e'
  const fs = (fill, w = 6) => {
    g.lineWidth = w
    g.strokeStyle = ink
    g.stroke()
    g.fillStyle = fill
    g.fill()
  }
  g.translate(32, 32)
  if (kind === 'snow') {
    for (let i = 0; i < 3; i++) {
      g.save()
      g.rotate((i * Math.PI) / 3)
      g.beginPath()
      g.rect(-4, -26, 8, 52)
      fs('#ffffff', 5)
      g.restore()
    }
    g.beginPath()
    g.arc(0, 0, 8, 0, 7)
    fs('#9fe3ff', 4)
  } else if (kind === 'comet') {
    g.beginPath()
    g.moveTo(-26, 26)
    g.quadraticCurveTo(-4, -2, 14, -22)
    g.lineTo(22, -10)
    g.quadraticCurveTo(0, 4, -26, 26)
    fs('#bfe9ff', 5)
    g.beginPath()
    g.arc(16, -16, 11, 0, 7)
    fs('#ffffff', 5)
  } else if (kind === 'bubble') {
    for (const [x, y, r] of [[-8, 6, 16], [14, -14, 9], [16, 16, 6]]) {
      g.beginPath()
      g.arc(x, y, r, 0, 7)
      fs('rgba(160,235,255,0.95)', 4)
    }
  } else if (kind === 'flame') {
    g.beginPath()
    g.moveTo(0, -28)
    g.bezierCurveTo(22, -6, 22, 26, 0, 26)
    g.bezierCurveTo(-22, 26, -22, -4, 0, -28)
    fs('#ff7a1f', 5)
    g.beginPath()
    g.moveTo(0, -6)
    g.bezierCurveTo(10, 6, 10, 20, 0, 20)
    g.bezierCurveTo(-10, 20, -10, 6, 0, -6)
    fs('#ffe46a', 3)
  } else if (kind === 'candy') {
    g.beginPath()
    g.arc(0, 0, 18, 0, 7)
    fs('#ffffff', 5)
    g.strokeStyle = '#ff5fa8'
    g.lineWidth = 6
    g.beginPath()
    g.arc(0, 0, 9, 0, 5)
    g.stroke()
  } else if (kind === 'sun') {
    for (let i = 0; i < 8; i++) {
      g.save()
      g.rotate((i * Math.PI) / 4)
      g.beginPath()
      g.moveTo(-6, -18)
      g.lineTo(0, -29)
      g.lineTo(6, -18)
      fs('#ffd23a', 4)
      g.restore()
    }
    g.beginPath()
    g.arc(0, 0, 15, 0, 7)
    fs('#ffe46a', 5)
  } else if (kind === 'planet') {
    g.beginPath()
    g.arc(0, 0, 16, 0, 7)
    fs('#c98cff', 5)
    g.beginPath()
    g.ellipse(0, 0, 29, 9, -0.35, 0, 7)
    g.lineWidth = 9
    g.strokeStyle = ink
    g.stroke()
    g.lineWidth = 4
    g.strokeStyle = '#6ff0ff'
    g.stroke()
  } else {
    g.beginPath()
    g.ellipse(0, 0, 14, 26, 0.6, 0, 7)
    fs(color, 5)
  }
  return c
}

const WING = `<svg viewBox="0 0 64 64"><path d="M6 40c10-2 20-9 26-22 4 10 2 22-6 30 10 0 20-6 30-20-2 18-16 30-34 30C14 58 8 50 6 40z" fill="#fff" stroke="#1b1f2e" stroke-width="5" stroke-linejoin="round"/></svg>`

export function createFlightHud() {
  const root = h('div', 'fly-ui')
  document.body.appendChild(root)

  // --- FLY button ---
  const btn = h('button', 'fly-btn stroke-d', `${WING}<span>FLY!</span><span class="key">E</span>`)
  btn.dataset.silent = '' // flight.js plays its own sound on press
  root.appendChild(btn)
  let onFly = null
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (btn.classList.contains('on')) onFly?.()
  })
  // Sits just above the bottom bar (skill / level / packs), wherever that bar is.
  function placeButton() {
    const bar = document.querySelector('.hud-bottom')
    const r = bar?.getBoundingClientRect()
    const bottom = r && r.height ? window.innerHeight - r.top + Math.max(18, window.innerHeight * 0.035) : window.innerHeight * 0.3
    btn.style.bottom = `${Math.round(bottom)}px`
  }
  window.addEventListener('resize', placeButton)

  // --- Counter ---
  const top = h('div', 'fly-top')
  const region = h('div', 'fly-region')
  const dist = h('div', 'fly-dist stroke', '0 m')
  const best = h('div', 'fly-best stroke-d', 'NEW BEST!')
  top.append(region, dist, best)
  root.appendChild(top)
  let shownDist = -1
  let regionKey = null

  const fade = h('div', 'fly-fade')
  document.body.appendChild(fade)

  let skipEl = null
  let rewardEl = null

  return {
    // show = in the zone and able to launch; fn runs on press.
    showFly(show, fn) {
      if (fn) onFly = fn
      if (show === btn.classList.contains('on')) return
      if (show) placeButton()
      btn.classList.toggle('on', show)
    },
    flyVisible: () => btn.classList.contains('on'),
    setFlying(on) {
      document.body.classList.toggle('flying', on)
    },
    counter(on, d = 0) {
      top.classList.toggle('on', on)
      if (!on) {
        shownDist = -1
        return
      }
      const v = Math.floor(d)
      if (v !== shownDist) {
        if (Math.floor(v / 100) !== Math.floor(shownDist / 100) && shownDist >= 0) {
          dist.classList.remove('bump')
          void dist.offsetWidth
          dist.classList.add('bump')
        }
        shownDist = v
        dist.textContent = `${fmt(v)} m`
      }
    },
    // r = RIVER_REGIONS entry or null (hidden).
    region(r) {
      const key = r ? r.name : null
      if (key === regionKey) return
      regionKey = key
      region.classList.remove('on')
      if (!r) return
      region.innerHTML = ''
      region.style.color = r.color
      region.append(regionIcon(r.icon, r.color), h('span', null, r.name), regionIcon(r.icon, r.color))
      void region.offsetWidth
      region.classList.add('on')
    },
    best() {
      best.classList.remove('on')
      void best.offsetWidth
      best.classList.add('on')
    },
    skip(n, skill) {
      skipEl?.remove()
      skipEl = h('div', 'fly-skip', `<span class="x stroke-d">x${n} SKIPS!</span>${skill > 0 ? `<span class="sk stroke-d">+${fmtShort(skill)} Skill</span>` : ''}`)
      root.appendChild(skipEl)
      const el = skipEl
      setTimeout(() => el.remove(), 1200)
    },
    // The trophy card: counts up to `wins`, shows the Wins multiplier, then leaves.
    reward(wins, mult, sub, onTick) {
      rewardEl?.remove()
      const m = Math.round(mult * 10) / 10
      rewardEl = h('div', 'fly-reward', `<span class="n stroke-d">+0</span><img src="${iconURL('trophy', 192)}" alt=""><span class="mult">X${m}</span>${sub ? `<span class="sub stroke-d">${sub}</span>` : ''}`)
      root.appendChild(rewardEl)
      const el = rewardEl
      const n = el.querySelector('.n')
      const t0 = performance.now()
      const dur = 650
      let last = -1
      const step = () => {
        if (!el.isConnected) return
        const k = Math.min(1, (performance.now() - t0) / dur)
        const v = Math.round(wins * (1 - Math.pow(1 - k, 3)))
        if (v !== last) {
          last = v
          n.textContent = `+${fmtShort(v)}`
          if (k < 1) onTick?.()
        }
        if (k < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    },
    hideReward() {
      const el = rewardEl
      rewardEl = null
      if (!el) return
      el.classList.add('out')
      setTimeout(() => el.remove(), 380)
    },
    fade(on) {
      fade.classList.toggle('on', on)
    },
  }
}
