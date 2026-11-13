import './laneHud.css'
import { iconURL } from './icons.js'
import { fmtShort } from './props.js'

// DOM for the lane animals (driven by lane/hazards.js through flight.js): animal
// alerts, CLOSE CALL / BLOCKED / BOOST callouts, the "-123 m" ouch pop, the dodge
// streak + Wins bonus, shield bubbles, the DASH button (touch) with its cooldown
// ring, the tap-to-escape prompt, ink / frost / hit-flash overlays, the boss bar,
// the danger meter and the bonus chips under the reward card.

const h = (tag, cls, html) => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html != null) e.innerHTML = html
  return e
}
const fmt = (n) => Math.round(n).toLocaleString('en-US')

// Ink splats: one canvas painted with a few random blobs and drips.
function paintInk(c) {
  const g = c.getContext('2d')
  c.width = 512
  c.height = 512
  g.clearRect(0, 0, 512, 512)
  g.fillStyle = '#16102a'
  const blob = (x, y, r) => {
    g.beginPath()
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2
      const rr = r * (0.75 + Math.random() * 0.45)
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
    }
    g.fill()
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2
      g.beginPath()
      g.arc(x + Math.cos(a) * r * 1.4, y + Math.sin(a) * r * 1.4, r * (0.08 + Math.random() * 0.12), 0, 7)
      g.fill()
    }
    for (let i = 0; i < 3; i++) {
      const dx = x + (Math.random() - 0.5) * r
      g.fillRect(dx, y, r * 0.12, r * (0.8 + Math.random() * 1.2))
    }
  }
  blob(256, 230, 120)
  blob(110 + Math.random() * 60, 120 + Math.random() * 80, 60)
  blob(380 + Math.random() * 60, 330 + Math.random() * 80, 70)
}

export function createLaneHud() {
  const root = h('div', 'lane-ui')
  document.body.appendChild(root)

  // alerts (top centre, under the distance counter)
  const alerts = h('div', 'lane-alerts')
  // danger meter (under the region name)
  const danger = h('div', 'lane-danger stroke-d')
  // dodge streak + Wins bonus (right)
  const streak = h('div', 'lane-streak')
  streak.innerHTML = '<div class="n stroke-d">x0</div><div class="l stroke-d">DODGES</div><div class="b stroke-d">+0% Wins</div>'
  // shields (left of the counter)
  const shields = h('div', 'lane-shields')
  // callouts
  const pops = h('div', 'lane-pops')
  // DASH button (shown when Air Dash is owned; touch + mouse)
  const dashBtn = h('button', 'lane-dash stroke-d', '<svg viewBox="0 0 40 40" class="ring"><circle cx="20" cy="20" r="17"></circle></svg><span>DASH</span><span class="key">SPACE</span>')
  dashBtn.dataset.silent = ''
  // trapped: tap anywhere
  const trap = h('div', 'lane-trap', '<div class="box"><div class="t stroke-d">TAP TAP TAP!</div><div class="bar"><div class="fill"></div></div><div class="sub stroke-d">Break free!</div><div class="time"><div></div></div></div>')
  // overlays
  const ink = h('canvas', 'lane-ink')
  const frost = h('div', 'lane-frost')
  const flash = h('div', 'lane-flash')
  // boss bar
  const bossBar = h('div', 'lane-boss')
  // tips + reward chips
  const tip = h('div', 'lane-tip stroke-d')
  const chips = h('div', 'lane-chips')
  root.append(alerts, danger, streak, shields, pops, dashBtn, trap, tip, chips, bossBar)
  document.body.append(ink, frost, flash)

  let onDash = null
  let onMash = null
  dashBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    onDash?.()
  })
  trap.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    e.stopPropagation()
    onMash?.()
    trap.classList.remove('tap')
    void trap.offsetWidth
    trap.classList.add('tap')
  })

  let inkTimer = 0
  let frostTimer = 0
  let tipTimer = 0
  let chipsTimer = 0
  const ring = dashBtn.querySelector('circle')
  const RING = 2 * Math.PI * 17
  ring.style.strokeDasharray = `${RING}`

  function callout(text, color, cls = '') {
    const el = h('div', `lane-pop ${cls} stroke-d`, text)
    el.style.color = color
    pops.appendChild(el)
    while (pops.children.length > 3) pops.firstChild.remove()
    setTimeout(() => el.remove(), 1300)
  }

  return {
    onDash(fn) {
      onDash = fn
    },
    onMash(fn) {
      onMash = fn
    },
    start({ shields: n, dash, on }) {
      root.classList.add('on')
      root.classList.toggle('animals', !!on)
      this.shields(n)
      dashBtn.classList.toggle('show', !!dash && !!on)
      this.dodge(0, 1)
      streak.classList.remove('show')
      alerts.innerHTML = ''
      pops.innerHTML = ''
    },
    stop() {
      root.classList.remove('on')
      dashBtn.classList.remove('show')
      this.trap(false)
      this.boss(null)
    },
    // name = animal name; side -1 / 0 / 1 = where it is relative to the player
    alert(name, color, side = 0, good = false) {
      const el = h('div', `lane-alert ${good ? 'good' : ''} stroke-d`, `${side < 0 ? '<span class="arr">◀</span>' : ''}<span class="ic">${good ? '★' : '!'}</span><span>${name}</span>${side > 0 ? '<span class="arr">▶</span>' : ''}`)
      el.style.setProperty('--c', color)
      alerts.prepend(el)
      while (alerts.children.length > 3) alerts.lastChild.remove()
      setTimeout(() => el.classList.add('out'), 1100)
      setTimeout(() => el.remove(), 1500)
    },
    pop: callout,
    ouch(text, lost) {
      callout(`${text}${lost > 0 ? ` <span class="lost">-${fmt(lost)} m</span>` : ''}`, '#ff5a5a', 'ouch')
    },
    dodge(n, mult) {
      streak.classList.toggle('show', n > 0 || mult > 1.001)
      streak.classList.toggle('hot', n >= 8)
      streak.querySelector('.n').textContent = `x${n}`
      streak.querySelector('.b').textContent = `+${Math.round((mult - 1) * 100)}% Wins`
      if (n > 0) {
        streak.classList.remove('bump')
        void streak.offsetWidth
        streak.classList.add('bump')
      }
    },
    shields(n) {
      shields.innerHTML = ''
      for (let i = 0; i < n; i++) shields.appendChild(h('span', 'sh'))
      shields.classList.toggle('show', n > 0)
    },
    dashState(k) {
      ring.style.strokeDashoffset = `${RING * (1 - Math.min(1, Math.max(0, k)))}`
      dashBtn.classList.toggle('ready', k >= 1)
    },
    trap(on, taps = 0, need = 1) {
      trap.classList.toggle('on', on)
      document.body.classList.toggle('lane-trapped', on)
      if (on) trap.querySelector('.fill').style.width = `${Math.min(100, (taps / need) * 100)}%`
    },
    trapTime(k) {
      trap.querySelector('.time > div').style.width = `${Math.max(0, k) * 100}%`
    },
    ink(seconds) {
      paintInk(ink)
      ink.classList.remove('on')
      void ink.offsetWidth
      ink.style.setProperty('--d', `${seconds}s`)
      ink.classList.add('on')
      clearTimeout(inkTimer)
      inkTimer = setTimeout(() => ink.classList.remove('on'), seconds * 1000)
    },
    frost(seconds) {
      frost.classList.add('on')
      clearTimeout(frostTimer)
      frostTimer = setTimeout(() => frost.classList.remove('on'), seconds * 1000)
    },
    flash(color) {
      flash.style.setProperty('--c', color)
      flash.classList.remove('on')
      void flash.offsetWidth
      flash.classList.add('on')
    },
    boss(def, fired = 0) {
      if (!def) {
        bossBar.classList.remove('on')
        return
      }
      if (!bossBar.classList.contains('on') || bossBar.dataset.id !== def.id) {
        bossBar.dataset.id = def.id
        bossBar.innerHTML = `<div class="name stroke-d">${def.name}</div><div class="pips">${Array.from({ length: def.shots }, () => '<span></span>').join('')}</div><div class="sub stroke-d">SURVIVE!</div>`
        bossBar.style.setProperty('--c', def.color)
        bossBar.classList.add('on')
      }
      bossBar.querySelectorAll('.pips span').forEach((p, i) => p.classList.toggle('done', i < fired))
    },
    bossWin(def, bonus, first) {
      callout(`${def.name} ESCAPED!<br><span class="bonus">+${fmtShort(bonus)} Wins${first ? ' (FIRST x3!)' : ''}</span>`, '#ffd23a', 'boss')
    },
    // level 1..8, rate = animals per second
    danger(level, name, rate) {
      const skulls = Math.min(5, Math.max(1, Math.ceil(level * 0.62)))
      danger.innerHTML = `DANGER ${'<i class="on"></i>'.repeat(skulls)}${'<i></i>'.repeat(5 - skulls)}`
      danger.dataset.level = String(skulls)
      danger.classList.remove('bump')
      void danger.offsetWidth
      danger.classList.add('bump')
    },
    tip(text) {
      tip.textContent = text
      tip.classList.add('on')
      clearTimeout(tipTimer)
      tipTimer = setTimeout(() => tip.classList.remove('on'), 4200)
    },
    // Bonus chips under the reward card.
    summary(ls, beginner) {
      chips.innerHTML = ''
      const add = (text, color, delay) => {
        const c = h('div', 'chip stroke-d', text)
        c.style.setProperty('--c', color)
        c.style.animationDelay = `${delay}s`
        chips.appendChild(c)
      }
      let d = 0.35
      if (ls.on && ls.mult > 1.001) {
        add(`Dodge Bonus x${(Math.round(ls.mult * 100) / 100).toFixed(2)}`, '#7dff5a', d)
        d += 0.15
      }
      if (ls.near) {
        add(`${ls.near} Close Call${ls.near > 1 ? 's' : ''}`, '#5fe0ff', d)
        d += 0.15
      }
      for (const b of ls.bosses ?? []) {
        add(`${b} escaped!`, '#ffd23a', d)
        d += 0.15
      }
      if (ls.boosts) {
        add(`${ls.boosts} Boost${ls.boosts > 1 ? 's' : ''}`, '#ffb21f', d)
        d += 0.15
      }
      if (beginner > 1) add(`Beginner Bonus x${beginner}`, '#ff8fd8', d)
      chips.classList.add('on')
      clearTimeout(chipsTimer)
    },
    hideSummary() {
      chips.classList.remove('on')
      chipsTimer = setTimeout(() => (chips.innerHTML = ''), 300)
    },
    icon: (name) => iconURL(name),
  }
}
