// Canvas-drawn icons shared by the HUD (as data URLs) and the 3D signs (drawn
// straight into sign canvases). All original artwork: chunky shapes with a dark
// outline and a light top highlight, readable at 24 px and at 256 px.

const OUT = '#1b1f2e'

function rr(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}
function fillStroke(g, fill, lw = 6) {
  g.fillStyle = fill
  g.fill()
  g.lineWidth = lw
  g.strokeStyle = OUT
  g.stroke()
}
function grad(g, y0, y1, a, b) {
  const gr = g.createLinearGradient(0, y0, 0, y1)
  gr.addColorStop(0, a)
  gr.addColorStop(1, b)
  return gr
}

const PAINTERS = {
  // Two chasing arrows (red top, blue bottom).
  rebirth(g) {
    const arrow = (color, rot) => {
      g.save()
      g.translate(128, 128)
      g.rotate(rot)
      g.beginPath()
      g.arc(0, 0, 78, Math.PI * 1.05, Math.PI * 1.85)
      g.arc(0, 0, 42, Math.PI * 1.85, Math.PI * 1.05, true)
      g.closePath()
      fillStroke(g, color, 10)
      g.beginPath()
      const a = Math.PI * 1.85
      g.moveTo(Math.cos(a) * 24, Math.sin(a) * 24)
      g.lineTo(Math.cos(a) * 100, Math.sin(a) * 100)
      g.lineTo(Math.cos(a + 0.5) * 66, Math.sin(a + 0.5) * 66)
      g.closePath()
      fillStroke(g, color, 10)
      g.restore()
    }
    arrow('#ff3b4e', 0)
    arrow('#2f9bff', Math.PI)
  },
  // Gold trophy cup.
  trophy(g) {
    g.lineJoin = 'round'
    // handles
    g.beginPath()
    g.ellipse(62, 92, 34, 40, 0, Math.PI * 0.5, Math.PI * 1.5)
    g.lineWidth = 26
    g.strokeStyle = OUT
    g.stroke()
    g.lineWidth = 12
    g.strokeStyle = '#ffc21f'
    g.stroke()
    g.beginPath()
    g.ellipse(194, 92, 34, 40, 0, -Math.PI * 0.5, Math.PI * 0.5)
    g.lineWidth = 26
    g.strokeStyle = OUT
    g.stroke()
    g.lineWidth = 12
    g.strokeStyle = '#ffc21f'
    g.stroke()
    // cup
    g.beginPath()
    g.moveTo(58, 42)
    g.lineTo(198, 42)
    g.quadraticCurveTo(196, 150, 128, 160)
    g.quadraticCurveTo(60, 150, 58, 42)
    g.closePath()
    fillStroke(g, grad(g, 40, 160, '#ffe46a', '#f29a12'), 10)
    rr(g, 112, 156, 32, 30, 6)
    fillStroke(g, '#f2a516', 8)
    rr(g, 76, 184, 104, 34, 10)
    fillStroke(g, grad(g, 184, 218, '#c46a2a', '#8a4114'), 10)
    g.fillStyle = 'rgba(255,255,255,0.55)'
    g.fillRect(80, 52, 18, 70)
  },
  // Blue lightning bolt.
  bolt(g) {
    g.beginPath()
    g.moveTo(150, 14)
    g.lineTo(58, 140)
    g.lineTo(118, 140)
    g.lineTo(96, 242)
    g.lineTo(198, 102)
    g.lineTo(136, 102)
    g.closePath()
    g.lineJoin = 'round'
    fillStroke(g, grad(g, 14, 242, '#7fe7ff', '#1f7bff'), 12)
  },
  // Blue crystal shard (skill packs).
  crystal(g) {
    g.lineJoin = 'round'
    g.beginPath()
    g.moveTo(128, 10)
    g.lineTo(196, 90)
    g.lineTo(150, 246)
    g.lineTo(80, 210)
    g.lineTo(60, 90)
    g.closePath()
    fillStroke(g, grad(g, 10, 246, '#a8f4ff', '#1d6bff'), 10)
    g.beginPath()
    g.moveTo(128, 10)
    g.lineTo(118, 120)
    g.lineTo(150, 246)
    g.strokeStyle = 'rgba(255,255,255,0.6)'
    g.lineWidth = 6
    g.stroke()
  },
  // Race token: a coin with a chequered flag.
  token(g) {
    g.beginPath()
    g.arc(128, 128, 100, 0, Math.PI * 2)
    fillStroke(g, grad(g, 28, 228, '#fff07a', '#e8a412'), 12)
    g.beginPath()
    g.arc(128, 128, 72, 0, Math.PI * 2)
    g.strokeStyle = '#c47a0e'
    g.lineWidth = 8
    g.stroke()
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 ? '#ffffff' : '#262a3a'
      g.fillRect(84 + x * 24, 92 + y * 22, 24, 22)
    }
    g.fillStyle = '#262a3a'
    g.fillRect(78, 88, 8, 90)
  },
  // Shopping basket (red).
  shop(g) {
    g.lineJoin = 'round'
    g.beginPath()
    g.moveTo(80, 100)
    g.quadraticCurveTo(128, 10, 176, 100)
    g.lineWidth = 26
    g.strokeStyle = OUT
    g.stroke()
    g.lineWidth = 14
    g.strokeStyle = '#d9dde4'
    g.stroke()
    g.beginPath()
    g.moveTo(30, 100)
    g.lineTo(226, 100)
    g.lineTo(204, 222)
    g.lineTo(52, 222)
    g.closePath()
    fillStroke(g, grad(g, 100, 222, '#ff5a5a', '#c41a24'), 10)
    g.strokeStyle = 'rgba(0,0,0,0.25)'
    g.lineWidth = 8
    for (let i = 1; i < 5; i++) {
      g.beginPath()
      g.moveTo(30 + i * 39, 108)
      g.lineTo(46 + i * 33, 214)
      g.stroke()
    }
    rr(g, 22, 88, 212, 26, 8)
    fillStroke(g, '#ff7a7a', 8)
  },
  // Backpack (blue).
  bag(g) {
    rr(g, 52, 56, 152, 180, 40)
    fillStroke(g, grad(g, 56, 236, '#5fb4ff', '#1f5fd1'), 10)
    rr(g, 88, 22, 80, 48, 22)
    g.lineWidth = 22
    g.strokeStyle = OUT
    g.stroke()
    g.lineWidth = 10
    g.strokeStyle = '#3b7fe0'
    g.stroke()
    rr(g, 76, 142, 104, 74, 18)
    fillStroke(g, '#2b6fd8', 8)
    rr(g, 112, 132, 32, 22, 6)
    fillStroke(g, '#ffd23a', 6)
  },
  // Book with a question mark (index).
  book(g) {
    g.save()
    g.translate(128, 132)
    g.rotate(-0.12)
    rr(g, -86, -96, 172, 196, 18)
    fillStroke(g, grad(g, -96, 100, '#5ab8ff', '#1b62c9'), 10)
    rr(g, -86, 70, 172, 26, 8)
    fillStroke(g, '#f4f1e6', 8)
    g.beginPath()
    g.arc(10, -14, 52, 0, Math.PI * 2)
    fillStroke(g, '#ffd23a', 8)
    g.font = '800 82px Fredoka, Arial Black, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#ffffff'
    g.lineWidth = 8
    g.strokeStyle = '#c4790e'
    g.strokeText('?', 10, -10)
    g.fillText('?', 10, -10)
    g.restore()
  },
  // A flying figure with a white streak (trails).
  trail(g) {
    g.lineCap = 'round'
    const streak = (y, w, c) => {
      g.beginPath()
      g.moveTo(30, y)
      g.quadraticCurveTo(100, y - 30, 160, y - 10)
      g.lineWidth = w + 10
      g.strokeStyle = OUT
      g.stroke()
      g.lineWidth = w
      g.strokeStyle = c
      g.stroke()
    }
    streak(180, 26, '#7fd8ff')
    streak(150, 18, '#ffffff')
    streak(206, 14, '#3fa2ff')
    // little figure
    rr(g, 150, 70, 70, 52, 18)
    fillStroke(g, '#ffffff', 8)
    g.beginPath()
    g.arc(204, 66, 30, 0, Math.PI * 2)
    fillStroke(g, '#ffffff', 8)
    g.fillStyle = OUT
    g.fillRect(208, 58, 8, 12)
  },
  // Red gift box with a white bow.
  gift(g) {
    rr(g, 34, 104, 188, 128, 12)
    fillStroke(g, grad(g, 104, 232, '#ff4b4b', '#bf1b23'), 10)
    rr(g, 24, 78, 208, 42, 10)
    fillStroke(g, '#ff6060', 10)
    g.fillStyle = '#ffffff'
    g.fillRect(112, 80, 32, 150)
    g.strokeStyle = OUT
    g.lineWidth = 6
    g.strokeRect(112, 80, 32, 150)
    for (const s of [-1, 1]) {
      g.beginPath()
      g.ellipse(128 + s * 40, 58, 42, 26, s * 0.5, 0, Math.PI * 2)
      fillStroke(g, '#ffffff', 8)
    }
    g.beginPath()
    g.arc(128, 74, 18, 0, Math.PI * 2)
    fillStroke(g, '#ffe7e7', 8)
  },
  // Starter pack: an open chest bursting with a bolt and potions.
  starter(g) {
    g.lineJoin = 'round'
    // potions
    const potion = (x, c, r) => {
      g.save()
      g.translate(x, 92)
      g.rotate(r)
      g.beginPath()
      g.arc(0, 20, 34, 0, Math.PI * 2)
      fillStroke(g, c, 8)
      rr(g, -12, -36, 24, 30, 6)
      fillStroke(g, '#e8f6ff', 8)
      g.restore()
    }
    potion(62, '#ff5ad8', -0.4)
    potion(196, '#3fe0ff', 0.4)
    // bolt
    g.save()
    g.translate(64, -10)
    g.scale(0.5, 0.5)
    PAINTERS.bolt(g)
    g.restore()
    // chest
    rr(g, 40, 134, 176, 96, 14)
    fillStroke(g, grad(g, 134, 230, '#c9782e', '#7d4114'), 10)
    rr(g, 32, 118, 192, 34, 10)
    fillStroke(g, '#ffd23a', 8)
    rr(g, 112, 150, 32, 40, 6)
    fillStroke(g, '#ffd23a', 8)
    g.fillStyle = '#ffd23a'
    g.fillRect(40, 196, 176, 10)
  },
  // Plus inside a green circle.
  plus(g) {
    g.beginPath()
    g.arc(128, 128, 96, 0, Math.PI * 2)
    fillStroke(g, '#3ed14a', 14)
    g.fillStyle = '#ffffff'
    g.fillRect(108, 64, 40, 128)
    g.fillRect(64, 108, 128, 40)
  },
  // Clock (playtime / next update).
  clock(g) {
    g.beginPath()
    g.arc(128, 136, 92, 0, Math.PI * 2)
    fillStroke(g, '#ffb21f', 12)
    g.beginPath()
    g.arc(128, 136, 70, 0, Math.PI * 2)
    fillStroke(g, '#ffffff', 6)
    g.strokeStyle = OUT
    g.lineWidth = 10
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(128, 136)
    g.lineTo(128, 88)
    g.moveTo(128, 136)
    g.lineTo(162, 150)
    g.stroke()
    for (const s of [-1, 1]) {
      g.beginPath()
      g.arc(128 + s * 64, 50, 22, 0, Math.PI * 2)
      fillStroke(g, '#ffb21f', 8)
    }
  },
  // Star (top level).
  star(g) {
    g.beginPath()
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 46 : 110
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      g.lineTo(128 + Math.cos(a) * r, 136 + Math.sin(a) * r)
    }
    g.closePath()
    g.lineJoin = 'round'
    fillStroke(g, grad(g, 26, 236, '#fff27a', '#ffae12'), 12)
  },
  lock(g) {
    g.beginPath()
    g.arc(128, 104, 54, Math.PI, 0)
    g.lineWidth = 34
    g.strokeStyle = OUT
    g.stroke()
    g.lineWidth = 20
    g.strokeStyle = '#c9d1dc'
    g.stroke()
    rr(g, 54, 104, 148, 120, 20)
    fillStroke(g, '#ffd23a', 12)
  },
  gear(g) {
    g.save()
    g.translate(128, 128)
    for (let i = 0; i < 8; i++) {
      g.rotate(Math.PI / 4)
      rr(g, -18, -112, 36, 50, 8)
      fillStroke(g, '#ffffff', 8)
    }
    g.beginPath()
    g.arc(0, 0, 76, 0, Math.PI * 2)
    fillStroke(g, '#ffffff', 10)
    g.beginPath()
    g.arc(0, 0, 32, 0, Math.PI * 2)
    fillStroke(g, '#2a2e3a', 8)
    g.restore()
  },
}

// --- Windows (Daily / Playtime / Inventory / Index / Settings) ----------------------
function potion(g, top, bot, liquid) {
  g.lineJoin = 'round'
  // round flask body
  g.beginPath()
  g.arc(128, 160, 84, 0, Math.PI * 2)
  fillStroke(g, 'rgba(225,245,255,0.95)', 10)
  // liquid (lower part of the flask)
  g.save()
  g.beginPath()
  g.arc(128, 160, 78, 0, Math.PI * 2)
  g.clip()
  g.fillStyle = grad(g, 96, 244, top, bot)
  g.beginPath()
  g.moveTo(40, 120)
  g.quadraticCurveTo(128, 96, 216, 120)
  g.lineTo(216, 250)
  g.lineTo(40, 250)
  g.closePath()
  g.fill()
  g.fillStyle = 'rgba(255,255,255,0.35)'
  for (const [x, y, r] of [[96, 170, 12], [150, 200, 9], [120, 140, 7], [170, 150, 6]]) {
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = liquid
  g.globalAlpha = 0.25
  g.fillRect(40, 96, 176, 18)
  g.restore()
  // neck + cork
  rr(g, 100, 40, 56, 52, 10)
  fillStroke(g, 'rgba(225,245,255,0.95)', 10)
  rr(g, 94, 14, 68, 36, 10)
  fillStroke(g, grad(g, 14, 50, '#e0a060', '#9a5a26'), 10)
  // shine
  g.strokeStyle = 'rgba(255,255,255,0.85)'
  g.lineWidth = 12
  g.lineCap = 'round'
  g.beginPath()
  g.arc(128, 160, 58, Math.PI * 1.1, Math.PI * 1.4)
  g.stroke()
}
Object.assign(PAINTERS, {
  potionSkill: (g) => potion(g, '#5fe0ff', '#1f5fe8', '#bff6ff'),
  potionWins: (g) => potion(g, '#ffe86a', '#f08a12', '#fff6c0'),
  potionLuck: (g) => potion(g, '#9cff5a', '#1fae3a', '#e0ffc0'),
  // Orange paw print.
  paw(g) {
    g.lineJoin = 'round'
    const c = grad(g, 30, 236, '#ffd23a', '#ff6a12')
    g.beginPath()
    g.ellipse(128, 168, 66, 56, 0, 0, Math.PI * 2)
    fillStroke(g, c, 10)
    for (const [x, y, r] of [[50, 104, 30], [92, 56, 32], [164, 56, 32], [206, 104, 30]]) {
      g.beginPath()
      g.ellipse(x, y, r * 0.9, r * 1.1, 0, 0, Math.PI * 2)
      fillStroke(g, c, 10)
    }
  },
  // Blue backpack.
  backpack(g) {
    g.lineJoin = 'round'
    rr(g, 86, 18, 84, 40, 18)
    g.lineWidth = 16
    g.strokeStyle = OUT
    g.stroke()
    g.lineWidth = 8
    g.strokeStyle = '#3a6fd8'
    g.stroke()
    rr(g, 46, 46, 164, 196, 40)
    fillStroke(g, grad(g, 46, 242, '#6fb8ff', '#2a5fd8'), 10)
    rr(g, 70, 140, 116, 86, 18)
    fillStroke(g, grad(g, 140, 226, '#4f9cff', '#2450c0'), 8)
    g.fillStyle = '#ffd23a'
    g.fillRect(118, 150, 20, 18)
    g.strokeStyle = OUT
    g.lineWidth = 5
    g.strokeRect(118, 150, 20, 18)
    g.strokeStyle = 'rgba(255,255,255,0.5)'
    g.lineWidth = 8
    g.beginPath()
    g.moveTo(70, 80)
    g.lineTo(186, 80)
    g.stroke()
  },
  // Titles: a gold crest with a blue gem.
  titles(g) {
    g.lineJoin = 'round'
    g.beginPath()
    g.moveTo(20, 110)
    g.lineTo(70, 40)
    g.lineTo(100, 96)
    g.lineTo(128, 20)
    g.lineTo(156, 96)
    g.lineTo(186, 40)
    g.lineTo(236, 110)
    g.lineTo(206, 200)
    g.lineTo(50, 200)
    g.closePath()
    fillStroke(g, grad(g, 20, 200, '#fff07a', '#e89412'), 10)
    g.beginPath()
    g.moveTo(128, 70)
    g.lineTo(184, 140)
    g.lineTo(128, 236)
    g.lineTo(72, 140)
    g.closePath()
    fillStroke(g, grad(g, 70, 236, '#9fe8ff', '#1f5fe8'), 10)
    g.beginPath()
    g.moveTo(128, 70)
    g.lineTo(128, 236)
    g.moveTo(72, 140)
    g.lineTo(184, 140)
    g.strokeStyle = 'rgba(255,255,255,0.55)'
    g.lineWidth = 5
    g.stroke()
  },
  // Time Play: an alarm clock with a gift and a star.
  alarm(g) {
    g.save()
    g.translate(30, 0)
    g.scale(0.85, 0.85)
    PAINTERS.clock(g)
    g.restore()
    g.save()
    g.translate(0, 112)
    g.scale(0.55, 0.55)
    PAINTERS.gift(g)
    g.restore()
    g.save()
    g.translate(150, 130)
    g.scale(0.42, 0.42)
    PAINTERS.star(g)
    g.restore()
  },
  // Four-leaf clover (Index Luck).
  clover(g) {
    g.lineJoin = 'round'
    const c = grad(g, 20, 236, '#9cff5a', '#1fae3a')
    for (let i = 0; i < 4; i++) {
      g.save()
      g.translate(128, 120)
      g.rotate((i * Math.PI) / 2 + Math.PI / 4)
      g.beginPath()
      g.moveTo(0, 0)
      g.bezierCurveTo(-70, -30, -60, -100, 0, -84)
      g.bezierCurveTo(60, -100, 70, -30, 0, 0)
      fillStroke(g, c, 10)
      g.restore()
    }
    g.beginPath()
    g.moveTo(128, 130)
    g.quadraticCurveTo(140, 200, 110, 244)
    g.lineWidth = 22
    g.strokeStyle = OUT
    g.stroke()
    g.lineWidth = 10
    g.strokeStyle = '#2fbf3a'
    g.stroke()
  },
  // Green tick in a circle.
  check(g) {
    g.beginPath()
    g.arc(128, 128, 104, 0, Math.PI * 2)
    fillStroke(g, '#3ed14a', 14)
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.beginPath()
    g.moveTo(74, 132)
    g.lineTo(112, 172)
    g.lineTo(186, 86)
    g.lineWidth = 26
    g.strokeStyle = '#ffffff'
    g.stroke()
  },
  // Chevron (Before -> After).
  chevron(g) {
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.beginPath()
    g.moveTo(84, 40)
    g.lineTo(176, 128)
    g.lineTo(84, 216)
    g.lineWidth = 64
    g.strokeStyle = OUT
    g.stroke()
    g.lineWidth = 40
    g.strokeStyle = '#ffffff'
    g.stroke()
  },
  trash(g) {
    g.lineJoin = 'round'
    rr(g, 60, 76, 136, 160, 14)
    fillStroke(g, grad(g, 76, 236, '#ff8a8a', '#d42b2b'), 10)
    rr(g, 40, 50, 176, 30, 8)
    fillStroke(g, '#ff6a6a', 10)
    rr(g, 100, 24, 56, 30, 8)
    fillStroke(g, '#ff6a6a', 8)
    g.fillStyle = 'rgba(0,0,0,0.25)'
    for (const x of [92, 122, 152]) g.fillRect(x, 104, 12, 106)
  },
  // Storage box (pet storage).
  box(g) {
    g.lineJoin = 'round'
    g.beginPath()
    g.moveTo(128, 30)
    g.lineTo(228, 74)
    g.lineTo(128, 118)
    g.lineTo(28, 74)
    g.closePath()
    fillStroke(g, '#ffd27a', 10)
    g.beginPath()
    g.moveTo(28, 74)
    g.lineTo(128, 118)
    g.lineTo(128, 236)
    g.lineTo(28, 190)
    g.closePath()
    fillStroke(g, '#e89a3a', 10)
    g.beginPath()
    g.moveTo(228, 74)
    g.lineTo(128, 118)
    g.lineTo(128, 236)
    g.lineTo(228, 190)
    g.closePath()
    fillStroke(g, '#c87a22', 10)
  },
})

// Trail card art: a blocky white figure flying right with a swoosh of the trail's colours behind.
const trailArts = new Map()
export function trailArtURL(id, colors, size = 256) {
  const key = `${id}@${size}`
  if (trailArts.has(key)) return trailArts.get(key)
  const c = document.createElement('canvas')
  c.width = size
  c.height = Math.round(size * 0.8)
  const g = c.getContext('2d')
  g.scale(size / 256, size / 256)
  g.lineJoin = 'round'
  g.lineCap = 'round'
  const cols = colors.length > 1 ? colors : [colors[0], colors[0]]
  // swooshes: three curved blades sweeping in from the lower left
  for (let i = 0; i < 3; i++) {
    const gr = g.createLinearGradient(10, 0, 170, 0)
    cols.forEach((col, k) => gr.addColorStop(k / (cols.length - 1), col))
    const y = 120 + i * 22
    g.beginPath()
    g.moveTo(150, y - 30)
    g.bezierCurveTo(90, y - 60 + i * 6, 20, y - 30, 14 + i * 12, y + 18)
    g.bezierCurveTo(50, y - 10, 100, y - 12, 150, y - 4)
    g.closePath()
    g.fillStyle = gr
    g.fill()
    g.lineWidth = 5
    g.strokeStyle = 'rgba(20,24,40,0.9)'
    g.stroke()
    g.beginPath()
    g.moveTo(140, y - 22)
    g.bezierCurveTo(90, y - 44 + i * 6, 40, y - 24, 26 + i * 12, y + 6)
    g.strokeStyle = 'rgba(255,255,255,0.55)'
    g.lineWidth = 3
    g.stroke()
  }
  // the flyer: blocky body tilted forward
  const block = (x, y, w, h, r) => {
    g.save()
    g.translate(x, y)
    g.rotate(r)
    rr(g, -w / 2, -h / 2, w, h, 6)
    g.fillStyle = grad(g, -h / 2, h / 2, '#ffffff', '#cdd6e2')
    g.fill()
    g.lineWidth = 5
    g.strokeStyle = OUT
    g.stroke()
    g.restore()
  }
  block(150, 140, 30, 22, -0.4)
  block(160, 118, 30, 22, -0.25)
  block(196, 108, 64, 44, -0.45)
  block(168, 86, 22, 46, -1.2)
  block(222, 120, 22, 46, -1.0)
  block(226, 66, 46, 44, -0.15)
  g.fillStyle = OUT
  for (const x of [222, 238]) {
    g.beginPath()
    g.ellipse(x, 60, 3.5, 6, -0.15, 0, Math.PI * 2)
    g.fill()
  }
  g.beginPath()
  g.arc(232, 74, 7, 0.1, Math.PI - 0.3)
  g.fillStyle = '#d43a4a'
  g.fill()
  const url = c.toDataURL()
  trailArts.set(key, url)
  return url
}

// Lego-stud tile (white, translucent) laid over coloured window headers and cards.
let studUrl = ''
export function studURL() {
  if (studUrl) return studUrl
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const g = c.getContext('2d')
  rr(g, 5, 5, 22, 22, 5)
  g.fillStyle = 'rgba(255,255,255,0.10)'
  g.fill()
  g.lineWidth = 2.5
  g.strokeStyle = 'rgba(255,255,255,0.32)'
  g.stroke()
  g.beginPath()
  g.moveTo(8, 28)
  g.lineTo(28, 28)
  g.lineTo(28, 8)
  g.strokeStyle = 'rgba(0,0,0,0.16)'
  g.lineWidth = 2
  g.stroke()
  studUrl = c.toDataURL()
  return studUrl
}

// Draws icon `name` into ctx at (x, y) with size s (pixels).
export function drawIcon(ctx, name, x, y, s) {
  const p = PAINTERS[name]
  if (!p) return
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s / 256, s / 256)
  p(ctx)
  ctx.restore()
}

const urls = new Map()
export function iconURL(name, size = 128) {
  const key = `${name}@${size}`
  if (!urls.has(key)) {
    const c = document.createElement('canvas')
    c.width = c.height = size
    drawIcon(c.getContext('2d'), name, 0, 0, size)
    urls.set(key, c.toDataURL())
  }
  return urls.get(key)
}
export const ICON_NAMES = Object.keys(PAINTERS)
