import {
  AdditiveBlending,
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  PointLight,
  QuadraticBezierCurve3,
  RingGeometry,
  Shape,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { EGGS, PLATFORMS, SLINGSHOTS, STAND_PETS, STUD, WORLD2_SKILL } from './config.js'
import { RAPIER, addFixed } from './physics.js'
import { canvasTex, legoBoxGeo, legoMat, withTop } from './legokit.js'
import { drawIcon } from './icons.js'
import { buildPet } from './petModels.js'
import { fontReady } from './propkit.js'
import { mulberry32 } from './textures.js'

// Every hand-built prop in the lobby, plus `makeSign` (multi-line outlined text
// sprites that can be redrawn when state changes). buildProps() places them and
// returns handles the game logic drives (pads, tables, eggs, stands, chest...).

const std = (color, extra) => new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...extra })
const metal = (color, extra) => new MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.75, ...extra })
const glowMat = (color, intensity = 1.6, extra) => new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, ...extra })
const additive = (color, opacity = 0.7) => new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })

function put(parent, geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = shadow
  m.receiveShadow = shadow
  parent.add(m)
  return m
}
const fmt = (n) => Math.round(n).toLocaleString('en-US')
export const fmtShort = (n) => {
  if (n >= 1e12) return `${+(n / 1e12).toFixed(1)}T`
  if (n >= 1e9) return `${+(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`
  if (n >= 1e4) return `${+(n / 1e3).toFixed(1)}K`
  return fmt(n)
}

// --- Signs ---------------------------------------------------------------------------------
// lines: [{ text, color, size (relative, 1 = one line height), outline, icon, pill }]
// `icon` draws an icons.js icon before the text; `pill` puts a dark rounded bar behind the line.
export function makeSign(lineHeight = 0.8) {
  const PX = 72
  const c = document.createElement('canvas')
  const tex = canvasTex(c)
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  sprite.renderOrder = 3
  let last = null
  const draw = (lines) => {
    const g = c.getContext('2d')
    const font = (s) => `700 ${Math.round(PX * s)}px Fredoka, "Arial Black", sans-serif`
    const widths = lines.map((l) => {
      g.font = font(l.size ?? 1)
      return g.measureText(l.text).width + (l.icon ? PX * (l.size ?? 1) * 1.1 : 0) + (l.pill ? PX * 0.9 : 0)
    })
    const pad = 18
    const W = Math.ceil(Math.max(...widths) + pad * 2)
    const H = Math.ceil(lines.reduce((a, l) => a + PX * (l.size ?? 1) * 1.18, 0) + pad * 2)
    c.width = W
    c.height = H
    let y = pad
    lines.forEach((l, i) => {
      const s = l.size ?? 1
      const lh = PX * s * 1.18
      g.font = font(s)
      g.textBaseline = 'middle'
      g.textAlign = 'left'
      g.lineJoin = 'round'
      const w = widths[i]
      let x = (W - w) / 2 + (l.pill ? PX * 0.45 : 0)
      if (l.pill) {
        const ph = lh * 0.95
        g.fillStyle = 'rgba(40,44,58,0.82)'
        g.beginPath()
        g.roundRect((W - w) / 2, y + (lh - ph) / 2, w, ph, ph / 2)
        g.fill()
      }
      if (l.icon) {
        drawIcon(g, l.icon, x, y + lh / 2 - PX * s * 0.5, PX * s)
        x += PX * s * 1.1
      }
      g.lineWidth = Math.max(6, PX * s * 0.16)
      g.strokeStyle = l.outline ?? '#1b1f2e'
      g.strokeText(l.text, x, y + lh / 2 + 2)
      g.fillStyle = l.color ?? '#ffffff'
      g.fillText(l.text, x, y + lh / 2 + 2)
      y += lh
    })
    tex.dispose()
    tex.needsUpdate = true
    const k = lineHeight / PX
    sprite.scale.set(W * k, H * k, 1)
  }
  sprite.set = (lines) => {
    const key = JSON.stringify(lines)
    if (key === last) return
    last = key
    draw(lines)
  }
  fontReady.then(() => {
    if (last) draw(JSON.parse(last))
  })
  return sprite
}

// --- Slingshots ---------------------------------------------------------------------------
const SLING_STYLES = {
  twig: { wood: '#c98a4b', wrap: '#f3e1bf', band: '#4a2f22' },
  wrap: { wood: '#d0782a', wrap: '#ffd28a', band: '#5a2a1a' },
  ember: { wood: '#a8521f', wrap: '#ff4a1f', band: '#3a1a12', tip: '#ff7a1a' },
  steel: { wood: '#b8702e', wrap: '#d6dde6', band: '#2a2a33', cap: '#cfd6df' },
  royal: { wood: '#e0801f', wrap: '#ffd23a', band: '#6a1a1a', gem: '#ff2b4a' },
  vine: { wood: '#7a5a2a', wrap: '#3cc21f', band: '#2a5a1a', leaves: '#4fdc2a' },
  frost: { wood: '#9fe6ff', wrap: '#ffffff', band: '#2a6bbf', crystal: '#7fdcff', ice: true },
  shadow: { wood: '#3a1f5a', wrap: '#8a3cff', band: '#14081f', spikes: '#b45cff' },
  sun: { wood: '#ffcf3a', wrap: '#fff1a8', band: '#b0700e', wings: '#ffffff', gold: true },
}
// opts.bands = false leaves out the band + pouch (the giant launcher in launcher.js
// draws its own stretchy ones). root.userData.sling describes the rig for it:
// { tips, pouch, band } for a slingshot, { cannon, barrel, mouth } for a blaster.
export function buildSlingshot(style, { bands = true } = {}) {
  const root = new Group()
  if (style === 'blaster') return buildBlaster(root)
  if (style === 'galaxy') return buildBlaster(root, { body: '#7a3cff', dark: '#ffd23a', wood: '#2a1a5a', muzzle: '#5ae8ff', hub: '#ff8fd8' })
  const s = SLING_STYLES[style] ?? SLING_STYLES.twig
  const woodMat = s.ice ? std(s.wood, { emissive: '#3ab8ff', emissiveIntensity: 0.35, roughness: 0.15, transparent: true, opacity: 0.9 }) : s.gold ? metal(s.wood, { emissive: '#ffae12', emissiveIntensity: 0.25 }) : std(s.wood, { roughness: 0.75 })
  const wrapMat = std(s.wrap, s.spikes ? { emissive: s.wrap, emissiveIntensity: 0.6 } : {})
  put(root, new CylinderGeometry(0.11, 0.13, 0.85, 10), woodMat, 0, 0.42, 0)
  for (const y of [0.15, 0.32, 0.5]) put(root, new TorusGeometry(0.13, 0.04, 6, 14).rotateX(Math.PI / 2), wrapMat, 0, y, 0)
  const tips = []
  for (const side of [-1, 1]) {
    const curve = new QuadraticBezierCurve3(new Vector3(0, 0.8, 0), new Vector3(side * 0.42, 0.95, 0), new Vector3(side * 0.42, 1.55, 0))
    put(root, new TubeGeometry(curve, 12, 0.095, 8), woodMat)
    tips.push(new Vector3(side * 0.42, 1.55, 0))
    put(root, new TorusGeometry(0.11, 0.035, 6, 12).rotateX(Math.PI / 2), wrapMat, side * 0.42, 1.36, 0)
  }
  put(root, new SphereGeometry(0.15, 10, 8), woodMat, 0, 0.82, 0)
  // band + pouch, pulled slightly back (-Z)
  const pouch = new Vector3(0, 1.28, -0.22)
  root.userData.sling = { tips: tips.map((t) => t.clone().setY(1.5)), pouch: pouch.clone(), band: s.band }
  if (bands) {
    const bandMat = std(s.band, { roughness: 0.9 })
    for (const t of tips) {
      const band = new CatmullRomCurve3([t.clone().setY(1.5), new Vector3(t.x * 0.45, 1.36, -0.15), pouch])
      put(root, new TubeGeometry(band, 8, 0.03, 5), bandMat)
    }
    put(root, new SphereGeometry(0.1, 8, 6).scale(1.3, 0.8, 0.6), bandMat, pouch.x, pouch.y, pouch.z)
  }
  if (s.cap) for (const t of tips) put(root, new SphereGeometry(0.12, 10, 8), metal(s.cap), t.x, t.y, t.z)
  if (s.tip) for (const t of tips) put(root, new SphereGeometry(0.12, 10, 8), glowMat(s.tip, 2.2), t.x, t.y, t.z)
  if (s.gem) put(root, new OctahedronGeometry(0.13), glowMat(s.gem, 0.9), 0, 0.84, 0.13)
  if (s.leaves) {
    const leafMat = std(s.leaves, { side: DoubleSide })
    for (let i = 0; i < 7; i++) {
      const a = i * 1.7
      const leaf = put(root, new SphereGeometry(0.11, 6, 4).scale(1, 0.35, 1.8), leafMat, Math.cos(a) * 0.16 + (i % 2 ? 0.3 : -0.3) * (i > 3 ? 1 : 0), 0.3 + i * 0.18, Math.sin(a) * 0.16)
      leaf.rotation.set(a, a * 0.5, 0.6)
    }
    const vine = new CatmullRomCurve3(Array.from({ length: 14 }, (_, i) => new Vector3(Math.cos(i * 1.4) * 0.14, i * 0.1, Math.sin(i * 1.4) * 0.14)))
    put(root, new TubeGeometry(vine, 40, 0.03, 5), std('#2f9a1a'))
  }
  if (s.crystal) {
    const cm = glowMat(s.crystal, 0.5, { transparent: true, opacity: 0.85, roughness: 0.1 })
    for (const t of tips) for (let i = 0; i < 3; i++) {
      const cr = put(root, new ConeGeometry(0.07, 0.4, 5), cm, t.x + (i - 1) * 0.08, t.y + 0.12, (i - 1) * 0.05)
      cr.rotation.z = (i - 1) * 0.5
    }
    put(root, new OctahedronGeometry(0.18).scale(1, 1.6, 1), cm, 0, 0.84, 0)
  }
  if (s.spikes) {
    const sm = glowMat(s.spikes, 1.2)
    for (const t of tips) for (let i = 0; i < 2; i++) {
      const sp = put(root, new ConeGeometry(0.06, 0.32, 4), sm, t.x + Math.sign(t.x) * 0.06, t.y - 0.1 - i * 0.25, 0)
      sp.rotation.z = -Math.sign(t.x) * 1.2
    }
    put(root, new OctahedronGeometry(0.16), sm, 0, 0.84, 0.05)
  }
  if (s.wings) {
    const wm = std(s.wings, { emissive: '#fff3c0', emissiveIntensity: 0.35 })
    for (const t of tips) for (let i = 0; i < 3; i++) {
      const f = put(root, new SphereGeometry(0.1, 8, 6).scale(2.4 - i * 0.5, 0.5, 0.6), wm, t.x + Math.sign(t.x) * (0.25 + i * 0.05), t.y - 0.05 - i * 0.12, -0.05)
      f.rotation.z = Math.sign(t.x) * (0.5 - i * 0.25)
    }
  }
  return root
}
function buildBlaster(root, c = {}) {
  const body = std(c.body ?? '#ff7a1a', c.body ? { emissive: c.body, emissiveIntensity: 0.25 } : {})
  const dark = std(c.dark ?? '#4a4f5a', c.dark ? { metalness: 0.6, roughness: 0.3 } : {})
  const wood = std(c.wood ?? '#8a5226', { roughness: 0.8 })
  // carriage + wheels
  put(root, new BoxGeometry(0.9, 0.3, 1.1), wood, 0, 0.35, 0)
  for (const s of [-1, 1]) for (const z of [-0.35, 0.35]) {
    const w = put(root, new CylinderGeometry(0.28, 0.28, 0.12, 14).rotateZ(Math.PI / 2), dark, s * 0.5, 0.28, z)
    put(w, new CylinderGeometry(0.1, 0.1, 0.14, 8).rotateZ(Math.PI / 2), std(c.hub ?? '#ffd23a'))
  }
  // barrel tilted up and forward (+Z)
  const barrel = new Group()
  barrel.position.set(0, 0.62, 0)
  barrel.rotation.x = -0.6
  root.add(barrel)
  put(barrel, new CylinderGeometry(0.26, 0.32, 1.3, 16).rotateX(Math.PI / 2), body, 0, 0, 0.35)
  for (const z of [-0.15, 0.3, 0.85]) put(barrel, new TorusGeometry(0.31, 0.05, 8, 18), dark, 0, 0, z)
  put(barrel, new CylinderGeometry(0.2, 0.2, 0.05, 14).rotateX(Math.PI / 2), glowMat(c.muzzle ?? '#3cff3c', 2.2), 0, 0, 1.01)
  put(barrel, new SphereGeometry(0.3, 14, 10), body, 0, 0, -0.3)
  root.userData.sling = { cannon: true, barrel, mouth: new Vector3(0, 0, 1.01) }
  return root
}

// --- Slingshot pads (west terrace) --------------------------------------------------------
function buildPads(scene) {
  const pads = []
  const rowX = [-27, -42.5]
  const rowY = [STUD, 3 * STUD]
  const zs = [-7.5, -13.5, -19.5, -25.5, -31.5]
  let i0 = 0
  SLINGSHOTS.forEach((sl, i) => {
    const row = sl.row
    const k = row === 0 ? i : i - 5
    const x = rowX[row]
    const y = rowY[row]
    const z = zs[k]
    const g = new Group()
    g.position.set(x, y, z)
    scene.add(g)
    const padRed = legoMat('#e8262b')
    const padGreen = legoMat('#38cf26')
    const pad = new Mesh(withTop(new BoxGeometry(4.5, 0.4, 4.5)), padRed)
    pad.position.y = 0.2
    pad.receiveShadow = pad.castShadow = true
    g.add(pad)
    const model = buildSlingshot(sl.style)
    model.scale.setScalar(1.45)
    model.position.y = 0.4
    model.rotation.y = Math.PI / 2 // faces east, toward the plaza
    g.add(model)
    const sign = makeSign(0.62)
    sign.position.set(0, 4.6, 0)
    g.add(sign)
    pads.push({
      index: i,
      x,
      y,
      z,
      half: 2.25,
      setState(state) {
        pad.material = state === 'locked' ? padRed : state === 'unlocked' ? padRed : padGreen
        const top =
          state === 'equipped' ? { text: 'EQUIPPED', color: '#4dff4d', size: 0.62 } : state === 'owned' ? { text: 'OWNED', color: '#ffffff', size: 0.62 } : { text: 'UNLOCKED', color: '#ffd23a', size: 0.62 }
        sign.set([top, { text: `+${fmt(sl.skill)} Skill`, size: 1 }, sl.price ? { text: `${fmt(sl.price)} Wins`, color: '#ff4848', size: 0.7 } : { text: 'FREE', color: '#ffffff', size: 0.62 }])
      },
    })
    i0++
  })
  return pads
}

// --- Training tables (east terrace) ------------------------------------------------------
function paintTableTop(style) {
  const S = 512
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')
  const C = S / 2
  const ring = (r, color) => {
    g.beginPath()
    g.arc(C, C, r, 0, Math.PI * 2)
    g.fillStyle = color
    g.fill()
  }
  // stud grid overlay
  const studs = (alpha) => {
    g.strokeStyle = `rgba(0,0,0,${alpha})`
    g.lineWidth = 2
    for (let y = 8; y < S; y += 32) for (let x = 8; x < S; x += 32) g.strokeRect(x + 4, y + 4, 16, 16)
  }
  if (style === 'target') {
    const cols = ['#e8302f', '#fff4e6']
    for (let i = 0; i < 6; i++) ring(C - i * 42, cols[i % 2])
    studs(0.08)
  } else if (style === 'cloud') {
    ring(C, '#2f8cff')
    studs(0.12)
    g.lineWidth = 16
    g.strokeStyle = '#e8f6ff'
    g.beginPath()
    g.arc(C, C, C * 0.72, 0, Math.PI * 2)
    g.stroke()
    g.fillStyle = '#ffffff'
    for (const [x, y, r] of [[-60, 20, 60], [10, -20, 80], [80, 20, 58], [0, 40, 60]]) {
      g.beginPath()
      g.arc(C + x, C + y, r, 0, Math.PI * 2)
      g.fill()
    }
  } else if (style === 'leaf') {
    ring(C, '#2fbf2a')
    studs(0.12)
    g.fillStyle = '#9dff6a'
    g.save()
    g.translate(C, C)
    for (let i = 0; i < 6; i++) {
      g.rotate(Math.PI / 3)
      g.beginPath()
      g.ellipse(0, -80, 46, 86, 0, 0, Math.PI * 2)
      g.fill()
    }
    g.beginPath()
    g.arc(0, 0, 40, 0, Math.PI * 2)
    g.fillStyle = '#d8ff9a'
    g.fill()
    g.restore()
  } else if (style === 'frost') {
    ring(C, '#4fb8ff')
    ring(C * 0.82, '#8fdcff')
    studs(0.1)
    g.strokeStyle = '#ffffff'
    g.lineWidth = 18
    g.lineCap = 'round'
    g.save()
    g.translate(C, C)
    for (let i = 0; i < 6; i++) {
      g.rotate(Math.PI / 3)
      g.beginPath()
      g.moveTo(0, 0)
      g.lineTo(0, -150)
      g.moveTo(0, -90)
      g.lineTo(-40, -130)
      g.moveTo(0, -90)
      g.lineTo(40, -130)
      g.stroke()
    }
    g.restore()
  } else if (style === 'lava' || style === 'void') {
    ring(C, style === 'lava' ? '#3a2a24' : '#2a1640')
    studs(0.2)
  } else if (style === 'gold') {
    ring(C, '#fff4c8')
    ring(C * 0.78, '#ffe58a')
    ring(C * 0.5, '#fff8e0')
    studs(0.08)
  }
  return canvasTex(c)
}
function paintSwirl(a, b) {
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')
  const img = g.createImageData(S, S)
  const ca = new Color(a)
  const cb = new Color(b)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x - S / 2) / (S / 2)
    const dy = (y - S / 2) / (S / 2)
    const r = Math.hypot(dx, dy)
    const ang = Math.atan2(dy, dx)
    const v = 0.5 + 0.5 * Math.sin(ang * 3 + r * 10)
    const fade = Math.max(0, 1 - r)
    const i = (y * S + x) * 4
    img.data[i] = (ca.r + (cb.r - ca.r) * v) * 255
    img.data[i + 1] = (ca.g + (cb.g - ca.g) * v) * 255
    img.data[i + 2] = (ca.b + (cb.b - ca.b) * v) * 255
    img.data[i + 3] = Math.min(1, fade * 2.2) * 255
  }
  g.putImageData(img, 0, 0)
  const t = canvasTex(c)
  t.center.set(0.5, 0.5)
  return t
}

const TABLE_STYLES = {
  target: { rim: '#e9932f', rimDark: '#b5651f', leg: '#c87a35', bracket: '#b9c2cc', gem: null },
  cloud: { rim: '#2f7fe8', rimDark: '#1f5fbf', leg: '#c87a35', bracket: '#c9d1dc', gem: '#7ff6ff' },
  leaf: { rim: '#e98a2f', rimDark: '#b5651f', leg: '#c87a35', bracket: '#e98a2f', gem: '#4fff4f' },
  frost: { rim: '#4fa8ff', rimDark: '#2f7fe8', leg: '#3f8cff', bracket: '#c9d1dc', gem: '#bff4ff' },
  lava: { rim: '#4a3a34', rimDark: '#2a201c', leg: '#3a2c26', bracket: '#2a201c', gem: '#ff7a1a' },
  void: { rim: '#5a2f8a', rimDark: '#3a1a5a', leg: '#3a1a5a', bracket: '#2a1640', gem: '#c46aff' },
  gold: { rim: '#fff4d6', rimDark: '#ffd23a', leg: '#ffd23a', bracket: '#ffcf3a', gem: '#3fa2ff' },
}
function buildTable(style, fx, wx, wy, wz) {
  const st = TABLE_STYLES[style]
  const root = new Group()
  const R = 4
  const H = 1.15
  // legs
  const legMat = style === 'gold' ? metal(st.leg) : std(st.leg, { roughness: 0.75 })
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    put(root, new BoxGeometry(0.8, H, 0.8), legMat, Math.cos(a) * R * 0.68, H / 2, Math.sin(a) * R * 0.68)
    put(root, new BoxGeometry(1.0, 0.25, 1.0), std(style === 'cloud' || style === 'frost' ? '#2f7fe8' : st.rimDark), Math.cos(a) * R * 0.68, 0.12, Math.sin(a) * R * 0.68)
  }
  // top disc
  const topTex = paintTableTop(style)
  const topMats = [std(st.rimDark), std('#ffffff', { map: topTex, roughness: 0.5 }), std(st.rimDark)]
  put(root, new CylinderGeometry(R * 0.92, R * 0.92, 0.4, 48), topMats, 0, H + 0.2, 0)
  // blocky rim: ring of boxes, alternating light/dark
  const segs = 20
  const rimMatA = style === 'gold' ? metal(st.rim) : legoMat(st.rim)
  const rimMatB = style === 'gold' ? metal(st.rimDark) : legoMat(st.rimDark)
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2
    const b = put(root, withTop(new BoxGeometry(1.3, 0.55, 0.7)), i % 2 ? rimMatA : rimMatB, Math.cos(a) * R, H + 0.28, Math.sin(a) * R)
    b.rotation.y = -a + Math.PI / 2
  }
  // brackets with gems
  const bracketMat = style === 'gold' ? metal(st.bracket) : std(st.bracket, { roughness: 0.4, metalness: style === 'target' || style === 'cloud' || style === 'frost' ? 0.5 : 0 })
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.26
    const b = put(root, new BoxGeometry(0.95, 0.85, 0.95), bracketMat, Math.cos(a) * (R + 0.15), H + 0.35, Math.sin(a) * (R + 0.15))
    b.rotation.y = -a
    if (st.gem) {
      const gem = put(b, new BoxGeometry(0.42, 0.42, 0.1), glowMat(st.gem, 1.4), 0, 0.05, 0.0)
      gem.position.set(0.48, 0.05, 0)
      gem.rotation.y = Math.PI / 2
    }
  }
  const anim = []
  if (style === 'target') {
    // planks across the rim
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const p = put(root, new BoxGeometry(0.4, 0.2, 1.6), std('#f0a24a'), Math.cos(a) * (R - 0.3), H + 0.58, Math.sin(a) * (R - 0.3))
      p.rotation.y = -a
    }
  }
  if (style === 'leaf') {
    const vineMat = std('#4fcf2a')
    for (let k = 0; k < 3; k++) {
      const pts = []
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 2 + k
        pts.push(new Vector3(Math.cos(a) * (R + 0.35), H + 0.3 + Math.sin(a * 6 + k) * 0.35, Math.sin(a) * (R + 0.35)))
      }
      put(root, new TubeGeometry(new CatmullRomCurve3(pts, true), 120, 0.09, 6, true), vineMat)
    }
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2
      const pts = Array.from({ length: 10 }, (_, j) => new Vector3(Math.cos(a) * R * 0.68 + Math.cos(j * 1.6) * 0.5, j * 0.13, Math.sin(a) * R * 0.68 + Math.sin(j * 1.6) * 0.5))
      put(root, new TubeGeometry(new CatmullRomCurve3(pts), 40, 0.07, 5), vineMat)
    }
    const leafMat = std('#3fd42a', { side: DoubleSide })
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2
      const l = put(root, new SphereGeometry(0.22, 6, 4).scale(1, 0.3, 1.8), leafMat, Math.cos(a) * (R + 0.5), H + 0.5 + Math.sin(i * 2.3) * 0.3, Math.sin(a) * (R + 0.5))
      l.rotation.set(i, a, 0.5)
    }
    fx.emitter({ rate: 2.5, x: wx, y: wy + H + 1, z: wz, spread: 8, spreadY: 1, speed: 0.6, gravity: -0.6, drag: 0.5, life: 3, size: 0.35, color: ['#5fe22e', '#9dff6a', '#3cc21f'], additive: false, shape: 'square', cull: new Vector3(wx, wy, wz) })
  }
  if (style === 'frost') {
    const cm = glowMat('#7fdcff', 0.45, { transparent: true, opacity: 0.88, roughness: 0.08 })
    const rand = mulberry32(31)
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2
      const under = i > 16
      const r = under ? R * (0.4 + rand() * 0.4) : R + 0.2 + rand() * 0.6
      const h = 0.6 + rand() * 1.4
      const cr = put(root, new ConeGeometry(0.22 + rand() * 0.2, h, 5), cm, Math.cos(a) * r, under ? H - h / 2 + 0.1 : H + 0.2 + h / 2 - 0.2, Math.sin(a) * r)
      if (under) cr.rotation.x = Math.PI
      cr.rotation.z += (rand() - 0.5) * 0.7
    }
    fx.emitter({ rate: 5, x: wx, y: wy + H + 5, z: wz, spread: 9, spreadY: 1, speed: 0.3, gravity: -1.2, drag: 0.4, life: 3.5, size: 0.28, color: '#ffffff', additive: false, cull: new Vector3(wx, wy, wz) })
  }
  if (style === 'lava' || style === 'void') {
    const lava = style === 'lava'
    const swirl = paintSwirl(lava ? '#ff3a00' : '#2a0a5a', lava ? '#ffe23a' : '#c46aff')
    const disc = put(root, new PlaneGeometry(R * 1.7, R * 1.7).rotateX(-Math.PI / 2), new MeshBasicMaterial({ map: swirl, transparent: true, depthWrite: false, color: new Color(lava ? '#ffffff' : '#ffffff').multiplyScalar(lava ? 2.2 : 1.6) }), 0, H + 0.42, 0, false)
    anim.push((dt) => (swirl.rotation += dt * (lava ? 0.8 : -1.1)))
    // cracked glowing pillars / purple spikes
    const crack = glowMat(lava ? '#ff6a00' : '#b45cff', lava ? 2.6 : 2)
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2
      for (let j = 0; j < 3; j++) put(root, new BoxGeometry(0.84, 0.12, 0.3), crack, Math.cos(a) * R * 0.68 + Math.cos(a + 1.57) * 0.1, 0.25 + j * 0.35, Math.sin(a) * R * 0.68 + 0.27 * (j % 2 ? 1 : -1))
    }
    const spikeMat = lava ? std('#2a201c') : glowMat('#a24aff', 0.9)
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      const sp = put(root, new ConeGeometry(0.28, 1.1 + (i % 3) * 0.4, 4), spikeMat, Math.cos(a) * (R + 0.1), H + 1, Math.sin(a) * (R + 0.1))
      sp.rotation.z = Math.cos(a) * -0.3
      sp.rotation.x = Math.sin(a) * 0.3
    }
    if (!lava) {
      // chains hanging off the rim
      const chainMat = metal('#5a5470')
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.5
        for (let j = 0; j < 4; j++) {
          const l = put(root, new TorusGeometry(0.14, 0.04, 6, 10), chainMat, Math.cos(a) * (R + 0.3), H - 0.1 - j * 0.24, Math.sin(a) * (R + 0.3))
          l.rotation.y = j % 2 ? -a : -a + Math.PI / 2
        }
      }
    }
    const light = new PointLight(lava ? '#ff7a1a' : '#b45cff', 18, 16, 2)
    light.position.set(0, H + 2, 0)
    root.add(light)
    anim.push((dt, t) => (light.intensity = 16 + Math.sin(t * 7) * 3 + Math.sin(t * 13) * 2))
    if (lava) {
      fx.emitter({ rate: 14, x: wx, y: wy + H + 0.6, z: wz, spread: 7, spreadY: 0.4, speed: 2.2, up: 1, lift: 1, gravity: 0.6, drag: 1, life: 1.1, size: 0.7, sizeEnd: 0.1, color: ['#ffd23a', '#ff8a1a'], colorEnd: '#ff2a00', cull: new Vector3(wx, wy, wz) })
      fx.emitter({ rate: 3, x: wx, y: wy + H + 1, z: wz, spread: 6, speed: 1, lift: 1.5, drag: 0.5, life: 2.4, size: 0.9, sizeEnd: 1.8, color: '#3a2a26', additive: false, alpha: 0.5, cull: new Vector3(wx, wy, wz) })
    } else {
      fx.emitter({ rate: 9, x: wx, y: wy + H + 0.8, z: wz, spread: 7, spreadY: 1, speed: 0.8, lift: 1, drag: 0.6, life: 2.2, size: 0.8, sizeEnd: 0.2, color: ['#1a0a2a', '#2a0a3a'], additive: false, shape: 'square', alpha: 0.85, cull: new Vector3(wx, wy, wz) })
      fx.emitter({ rate: 5, x: wx, y: wy + H + 1, z: wz, spread: 6, speed: 0.6, lift: 1, life: 1.6, size: 0.5, color: '#c46aff', shape: 'star', cull: new Vector3(wx, wy, wz) })
    }
  }
  if (style === 'gold') {
    const gm = metal('#ffcf3a', { emissive: '#ffae12', emissiveIntensity: 0.3 })
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const wing = put(root, new ConeGeometry(0.3, 2.2, 4), gm, Math.cos(a) * (R + 0.2), H + 1.3, Math.sin(a) * (R + 0.2))
      wing.rotation.z = Math.cos(a) * -0.45
      wing.rotation.x = Math.sin(a) * 0.45
    }
    put(root, new RingGeometry(R * 0.3, R * 0.85, 48).rotateX(-Math.PI / 2), additive('#fff2a0', 0.45), 0, H + 0.43, 0, false)
    fx.emitter({ rate: 8, x: wx, y: wy + H + 1.5, z: wz, spread: 8, spreadY: 2, speed: 0.4, lift: 0.6, life: 1.4, size: 0.55, color: ['#fff6b0', '#ffd23a'], shape: 'star', cull: new Vector3(wx, wy, wz) })
    const light = new PointLight('#ffd23a', 10, 14, 2)
    light.position.set(0, H + 2, 0)
    root.add(light)
  }
  // collider: the table top (player jumps on), legs as one block underneath
  addFixed(RAPIER.ColliderDesc.cylinder((H + 0.45) / 2, R + 0.3), { x: wx, y: wy + (H + 0.45) / 2, z: wz })
  root.position.set(wx, wy, wz)
  return { root, anim, topY: wy + H + 0.42, radius: R }
}

// --- Eggs ---------------------------------------------------------------------------------
const eggProfile = (() => {
  const pts = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    const a = t * Math.PI
    const r = Math.sin(a) * (0.62 - 0.12 * t) * (1 + 0.08 * Math.sin(a))
    pts.push(new Vector2(Math.max(0.001, r), -Math.cos(a) * 0.85 + 0.85))
  }
  return pts
})()
function paintEgg(look) {
  const W = 512
  const H = 256
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const rand = mulberry32(look.length * 97)
  if (look === 'common') {
    g.fillStyle = '#d9a173'
    g.fillRect(0, 0, W, H)
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(120,70,40,${0.2 + rand() * 0.3})`
      g.beginPath()
      g.ellipse(rand() * W, rand() * H, 3 + rand() * 7, 2 + rand() * 5, 0, 0, Math.PI * 2)
      g.fill()
    }
  } else if (look === 'uncommon') {
    g.fillStyle = '#9fdcff'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#e8262b'
    g.fillRect(0, 0, W, H * 0.45)
    g.fillStyle = '#ffffff'
    g.fillRect(0, H * 0.42, W, H * 0.1)
    for (let i = 0; i < 16; i++) {
      g.beginPath()
      g.arc(rand() * W, rand() * H * 0.35, 6 + rand() * 6, 0, Math.PI * 2)
      g.fill()
    }
  } else if (look === 'rare') {
    g.fillStyle = '#4a3220'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#2fa83a'
    g.fillRect(0, 0, W, H * 0.6)
    for (let i = 0; i < 40; i++) {
      g.fillStyle = ['#3fa2ff', '#7fe0ff', '#9dff6a'][i % 3]
      g.beginPath()
      g.arc(rand() * W, rand() * H * 0.62, 6 + rand() * 12, 0, Math.PI * 2)
      g.fill()
    }
  } else if (look === 'race') {
    g.fillStyle = '#f6f2ff'
    g.fillRect(0, 0, W, H)
    g.strokeStyle = '#8a3cd8'
    g.lineWidth = 22
    for (let k = 0; k < 2; k++) {
      g.beginPath()
      for (let x = 0; x <= W; x += 8) g.lineTo(x, H * (0.38 + k * 0.22) + Math.sin((x / W) * Math.PI * 4 + k) * 22)
      g.stroke()
    }
    g.fillStyle = '#ffd23a'
    g.fillRect(0, H * 0.06, W, 14)
  } else if (look === 'exclusive') {
    g.fillStyle = '#d61f2a'
    g.fillRect(0, 0, W, H)
    g.fillStyle = '#ffd23a'
    for (let x = 0; x < W; x += 64) g.fillRect(x, 0, 14, H)
    g.fillRect(0, H * 0.48, W, 18)
    for (let x = 32; x < W; x += 64) {
      g.fillStyle = ['#3fa2ff', '#4fff7a', '#ff6ad5'][(x / 64) % 3 | 0]
      g.beginPath()
      g.arc(x, H * 0.52, 12, 0, Math.PI * 2)
      g.fill()
    }
  }
  return canvasTex(c)
}
export function buildEgg(look) {
  const root = new Group()
  if (look === 'rainbow') {
    const geo = new IcosahedronGeometry(0.72, 1).toNonIndexed()
    geo.scale(0.95, 1.18, 0.95)
    const cols = ['#ff3b3b', '#ffb21f', '#ffef3a', '#3cff6a', '#3fa2ff', '#b45cff', '#ff6ad5']
    const colorArr = []
    const c = new Color()
    for (let f = 0; f < geo.attributes.position.count / 3; f++) {
      c.set(cols[(f * 5) % cols.length])
      for (let v = 0; v < 3; v++) colorArr.push(c.r, c.g, c.b)
    }
    geo.setAttribute('color', new (geo.attributes.position.constructor)(new Float32Array(colorArr), 3))
    put(root, geo, new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.35 }), 0, 0.85, 0)
    return root
  }
  const egg = put(root, new LatheGeometry(eggProfile, 32), std('#ffffff', { map: paintEgg(look), roughness: look === 'exclusive' ? 0.25 : 0.45, metalness: look === 'exclusive' ? 0.3 : 0 }))
  egg.scale.setScalar(1.05)
  if (look === 'uncommon') {
    const cm = glowMat('#aee8ff', 0.35, { transparent: true, opacity: 0.9, roughness: 0.1 })
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2
      const cr = put(root, new ConeGeometry(0.16, 0.6, 5), cm, Math.cos(a) * 0.52, 0.32, Math.sin(a) * 0.52)
      cr.rotation.z = Math.cos(a) * -0.9
      cr.rotation.x = Math.sin(a) * 0.9
    }
  }
  if (look === 'rare') {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      put(root, new SphereGeometry(0.11, 8, 6), std('#ffffff'), Math.cos(a) * 0.14, 1.78, Math.sin(a) * 0.14)
    }
    put(root, new SphereGeometry(0.1, 8, 6), std('#ffd23a'), 0, 1.82, 0)
  }
  if (look === 'exclusive' || look === 'race') {
    const crown = new Group()
    crown.position.y = look === 'race' ? 1.62 : 1.66
    root.add(crown)
    const gold = metal('#ffcf3a', { emissive: '#ffae12', emissiveIntensity: 0.35 })
    put(crown, new CylinderGeometry(0.3, 0.34, 0.16, 16, 1, true), gold)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      put(crown, new ConeGeometry(0.07, 0.24, 4), gold, Math.cos(a) * 0.3, 0.16, Math.sin(a) * 0.3)
    }
    if (look === 'exclusive') {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2
        const w = put(root, new ConeGeometry(0.12, 0.7, 4), gold, Math.cos(a) * 0.62, 1.0, Math.sin(a) * 0.62)
        w.rotation.z = Math.cos(a) * -1.1
        w.rotation.x = Math.sin(a) * 1.1
      }
    }
  }
  return root
}
function buildPedestal(kind) {
  const root = new Group()
  if (kind === 'neon') {
    put(root, new CylinderGeometry(1.9, 2.1, 0.5, 6), std('#2a3a8a'), 0, 0.25, 0)
    put(root, new CylinderGeometry(1.95, 1.95, 0.12, 6), glowMat('#3fe0ff', 2.4), 0, 0.52, 0)
    put(root, new CylinderGeometry(1.55, 1.75, 0.45, 6), std('#5a3ad8'), 0, 0.8, 0)
    put(root, new CylinderGeometry(1.45, 1.45, 0.06, 6), glowMat('#ff8af5', 1.8), 0, 1.04, 0)
    return { root, top: 1.07 }
  }
  if (kind === 'pink') {
    put(root, new CylinderGeometry(1.5, 1.6, 0.4, 8), std('#ff5fd0'), 0, 0.2, 0)
    put(root, new CylinderGeometry(1.25, 1.35, 0.35, 8), std('#ff8ae0'), 0, 0.57, 0)
    return { root, top: 0.75 }
  }
  if (kind === 'purple') {
    put(root, new CylinderGeometry(1.3, 1.45, 0.35, 8), std('#7a3cff'), 0, 0.18, 0)
    put(root, new CylinderGeometry(1.15, 1.2, 0.3, 8), glowMat('#c46aff', 0.6), 0, 0.5, 0)
    return { root, top: 0.65 }
  }
  if (kind === 'gold') {
    const gold = metal('#ffcf3a', { emissive: '#ffae12', emissiveIntensity: 0.45 })
    put(root, new CylinderGeometry(1.9, 2.1, 0.45, 8), gold, 0, 0.22, 0)
    put(root, new CylinderGeometry(1.5, 1.7, 0.6, 8), gold, 0, 0.75, 0)
    put(root, new CylinderGeometry(1.6, 1.6, 0.12, 8), glowMat('#fff3a0', 2.2), 0, 1.1, 0)
    return { root, top: 1.16 }
  }
  // green two-tier octagon
  put(root, new CylinderGeometry(1.45, 1.6, 0.35, 8), std('#2f8f4a'), 0, 0.18, 0)
  put(root, new CylinderGeometry(1.3, 1.4, 0.3, 8), std('#d6f5dc'), 0, 0.5, 0)
  put(root, new CylinderGeometry(1.15, 1.25, 0.08, 8), std('#3fae5a'), 0, 0.68, 0)
  return { root, top: 0.72 }
}

// --- Free rewards chest -------------------------------------------------------------------
function buildChest() {
  const root = new Group()
  const red = std('#e8262b')
  const gold = metal('#ffcf3a', { emissive: '#ffae12', emissiveIntensity: 0.3 })
  put(root, new BoxGeometry(3.2, 1.6, 2.2), red, 0, 1.1, 0)
  for (const x of [-1.3, 1.3]) put(root, new BoxGeometry(0.3, 1.7, 2.3), gold, x, 1.1, 0)
  put(root, new BoxGeometry(3.3, 0.3, 2.3), gold, 0, 1.9, 0)
  const lid = new Group()
  lid.position.set(0, 1.95, -1.1)
  root.add(lid)
  put(lid, new CylinderGeometry(1.1, 1.1, 3.2, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), red, 0, 0, 1.1)
  for (const x of [-1.3, 1.3]) put(lid, new CylinderGeometry(1.13, 1.13, 0.3, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2), gold, x, 0, 1.1)
  lid.rotation.x = -0.12
  put(root, new BoxGeometry(0.6, 0.7, 0.2), gold, 0, 1.6, 1.15)
  put(root, new BoxGeometry(0.16, 0.25, 0.05), std('#2a1a1a'), 0, 1.55, 1.27)
  // glowing rings underneath
  const rings = []
  for (let i = 0; i < 3; i++) {
    const ring = put(root, new RingGeometry(2.4 + i * 0.6, 2.75 + i * 0.6, 48).rotateX(-Math.PI / 2), additive(i === 1 ? '#fff27a' : '#ffcf3a', 0.55 - i * 0.12), 0, 0.08 + i * 0.01, 0, false)
    rings.push(ring)
  }
  put(root, new CylinderGeometry(2.4, 2.4, 0.06, 40), glowMat('#ffd23a', 1.2, { transparent: true, opacity: 0.7 }), 0, 0.05, 0, false)
  return { root, rings, lid }
}

// --- Farm: barn, silo, windmill -------------------------------------------------------------
function buildBarn() {
  const root = new Group()
  const red = legoMat('#d8262b')
  const white = std('#f4f4f4')
  const W = 10
  const D = 12
  const H = 6
  put(root, withTop(new BoxGeometry(W, H, D)), red, 0, H / 2, 0)
  // gable ends
  const gable = new Shape()
  gable.moveTo(-W / 2, 0)
  gable.lineTo(W / 2, 0)
  gable.lineTo(0, 3.6)
  gable.closePath()
  const gGeo = new ExtrudeGeometry(gable, { depth: D, bevelEnabled: false })
  put(root, gGeo, std('#c21f24'), 0, H, -D / 2)
  // roof planes
  const roofMat = std('#8a8f99', { roughness: 0.7 })
  const slope = Math.hypot(W / 2, 3.6) + 0.6
  for (const s of [-1, 1]) {
    const roof = put(root, new BoxGeometry(slope, 0.35, D + 1), roofMat, s * W / 4, H + 1.85, 0)
    roof.rotation.z = -s * Math.atan2(3.6, W / 2)
  }
  put(root, new BoxGeometry(0.5, 0.5, D + 1), std('#6a6f79'), 0, H + 3.7, 0)
  // front: dark doorway with white X frame (faces -Z = north toward the plaza)
  put(root, new BoxGeometry(4.4, 4.6, 0.2), std('#141820'), 0, 2.3, -D / 2 - 0.05)
  const frame = (x, y, w, h) => put(root, new BoxGeometry(w, h, 0.3), white, x, y, -D / 2 - 0.12)
  frame(-2.3, 2.4, 0.35, 4.8)
  frame(2.3, 2.4, 0.35, 4.8)
  frame(0, 4.8, 4.95, 0.35)
  for (const s of [-1, 1]) {
    // side panels with X braces
    const px = s * 3.6
    frame(px, 2.6, 2.2, 0.3)
    const d1 = frame(px, 2.6, 0.25, 4.6)
    d1.rotation.z = 0.45
    const d2 = frame(px, 2.6, 0.25, 4.6)
    d2.rotation.z = -0.45
  }
  put(root, new BoxGeometry(1.4, 1.4, 0.3), white, 0, 7.8, -D / 2 - 0.1)
  put(root, new BoxGeometry(1.0, 1.0, 0.35), std('#141820'), 0, 7.8, -D / 2 - 0.15)
  return root
}
function buildSilo() {
  const root = new Group()
  const red = std('#d8262b')
  put(root, new CylinderGeometry(2.6, 2.6, 11, 24), red, 0, 5.5, 0)
  for (const y of [2.5, 6, 9.5]) put(root, new CylinderGeometry(2.66, 2.66, 0.35, 24), std('#f4f4f4'), 0, y, 0)
  put(root, new SphereGeometry(2.8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std('#b0703a', { roughness: 0.8 }), 0, 11, 0)
  put(root, new BoxGeometry(1.6, 2, 0.3), std('#f4f4f4'), 0, 8.5, -2.6)
  put(root, new BoxGeometry(1.1, 1.5, 0.35), std('#141820'), 0, 8.5, -2.65)
  return root
}
function buildWindmill() {
  const root = new Group()
  const wood = std('#b8752f', { roughness: 0.8 })
  const tower = put(root, new CylinderGeometry(1.1, 2, 10, 4), wood, 0, 5, 0)
  tower.rotation.y = Math.PI / 4
  const hub = new Group()
  hub.position.set(0, 9.6, -1.6)
  root.add(hub)
  put(hub, new CylinderGeometry(0.5, 0.5, 0.8, 12).rotateX(Math.PI / 2), std('#6a3f1d'))
  const blades = new Group()
  hub.add(blades)
  const slat = std('#d99a4f', { roughness: 0.8 })
  for (let i = 0; i < 4; i++) {
    const arm = new Group()
    arm.rotation.z = (i * Math.PI) / 2
    blades.add(arm)
    put(arm, new BoxGeometry(0.3, 6, 0.2), std('#7a4a22'), 0, 3, -0.3)
    for (let j = 0; j < 5; j++) put(arm, new BoxGeometry(1.6, 0.18, 0.1), slat, 0.75, 1.4 + j * 1.0, -0.38)
    put(arm, new BoxGeometry(0.1, 5, 0.1), slat, 1.5, 3.4, -0.38)
  }
  return { root, blades }
}

// --- Leaderboards -----------------------------------------------------------------------------
function paintBoard(title, rows, color) {
  const W = 512
  const H = 560
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#1f5fd1')
  bg.addColorStop(1, '#0d2f7a')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  g.font = '700 22px Fredoka, Arial, sans-serif'
  g.textBaseline = 'middle'
  // podium: top three with circles
  // (rows[0] = 1st in the middle, rows[1] = 2nd on the left, rows[2] = 3rd on the right)
  const podium = [[0, W / 2, 70, 44], [1, W / 2 - 150, 92, 36], [2, W / 2 + 150, 92, 36]]
  for (const [rank, x, y, r] of podium) {
    const row = rows[rank]
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fillStyle = ['#ffd23a', '#d6dde6', '#e09a5a'][rank]
    g.fill()
    g.beginPath()
    g.arc(x, y, r - 6, 0, Math.PI * 2)
    g.fillStyle = row?.color ?? '#2a3a6a'
    g.fill()
    g.fillStyle = '#ffffff'
    g.textAlign = 'center'
    g.font = '700 26px Fredoka, Arial, sans-serif'
    g.fillText(`${rank + 1}`, x, y - r - 4)
    g.font = '700 20px Fredoka, Arial, sans-serif'
    g.fillText(row?.name ?? '-', x, y + r + 16)
    g.fillStyle = '#ffd23a'
    g.fillText(row?.value ?? '', x, y + r + 38)
  }
  for (let i = 3; i < 11; i++) {
    const y = 190 + (i - 3) * 44
    g.fillStyle = i % 2 ? 'rgba(10,30,90,0.75)' : 'rgba(30,70,170,0.75)'
    g.beginPath()
    g.roundRect(18, y, W - 36, 38, 10)
    g.fill()
    const row = rows[i]
    g.textAlign = 'left'
    g.fillStyle = '#ffffff'
    g.font = '700 21px Fredoka, Arial, sans-serif'
    g.fillText(`#${i + 1}`, 30, y + 20)
    g.beginPath()
    g.arc(96, y + 19, 12, 0, Math.PI * 2)
    g.fillStyle = row?.color ?? '#5a6a9a'
    g.fill()
    g.fillStyle = row?.me ? '#7dff7d' : '#ffffff'
    g.fillText(row?.name ?? '-', 118, y + 20)
    g.textAlign = 'right'
    g.fillStyle = '#ffffff'
    g.fillText(row?.value ?? '', W - 32, y + 20)
  }
  return c
}
function buildLeaderboard(title, icon) {
  const root = new Group()
  const W = 8
  const H = 8.6
  const stone = legoMat('#9aa1aa')
  // stone pillars + base
  for (const s of [-1, 1]) put(root, withTop(new BoxGeometry(1, H + 0.6, 1)), stone, s * (W / 2 + 0.3), (H + 0.6) / 2, 0)
  put(root, withTop(new BoxGeometry(W + 2.2, 0.8, 1.4)), stone, 0, 0.4, 0)
  // glowing cyan inner frame
  for (const s of [-1, 1]) put(root, new BoxGeometry(0.22, H - 1, 0.3), glowMat('#3fe0ff', 2.6), s * (W / 2 - 0.15), H / 2 + 0.45, -0.32)
  const boardCanvas = paintBoard(title, [], '#1f5fd1')
  const tex = canvasTex(boardCanvas)
  const board = put(root, new PlaneGeometry(W - 0.6, H - 1), std('#ffffff', { map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.5, roughness: 0.6 }), 0, H / 2 + 0.45, -0.36, false)
  board.rotation.y = Math.PI // faces -Z (north)
  put(root, new BoxGeometry(W, H - 0.6, 0.6), std('#123a8f'), 0, H / 2 + 0.45, 0)
  // gold crown on top
  const gold = metal('#ffcf3a', { emissive: '#ffae12', emissiveIntensity: 0.35 })
  put(root, new BoxGeometry(W * 0.7, 0.6, 0.7), gold, 0, H + 0.4, 0)
  for (let i = -2; i <= 2; i++) {
    const sp = put(root, new ConeGeometry(0.42, 1.3 - Math.abs(i) * 0.25, 4), gold, i * 0.9, H + 1.2 - Math.abs(i) * 0.1, 0)
    sp.rotation.y = Math.PI / 4
  }
  put(root, new OctahedronGeometry(0.5), glowMat('#3fa2ff', 1.2), 0, H + 1.0, -0.4)
  for (const s of [-1, 1]) put(root, new BoxGeometry(0.9, 0.9, 0.9), gold, s * (W / 2 + 0.3), H + 0.75, 0)
  const sign = makeSign(1.2)
  sign.set([{ text: title, icon, size: 1 }])
  sign.position.set(0, H + 3.2, 0)
  root.add(sign)
  return {
    root,
    set(rows) {
      const next = paintBoard(title, rows)
      boardCanvas.width = next.width
      boardCanvas.getContext('2d').drawImage(next, 0, 0)
      tex.needsUpdate = true
    },
  }
}

// --- Next update sign ----------------------------------------------------------------------
function paintPoster() {
  const W = 512
  const H = 288
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const sky = g.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#3fb4ff')
  sky.addColorStop(1, '#bff0ff')
  g.fillStyle = sky
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#3fe23a'
  g.beginPath()
  g.moveTo(0, H * 0.75)
  g.quadraticCurveTo(W / 2, H * 0.6, W, H * 0.78)
  g.lineTo(W, H)
  g.lineTo(0, H)
  g.fill()
  // a flying hero with a speed trail
  g.strokeStyle = '#ffffff'
  g.lineWidth = 14
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(60, 200)
  g.quadraticCurveTo(200, 150, 300, 110)
  g.stroke()
  g.fillStyle = '#ffd23a'
  g.fillRect(290, 86, 60, 34)
  g.fillStyle = '#ffcc99'
  g.beginPath()
  g.arc(370, 100, 22, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#3a2a1a'
  g.fillRect(352, 78, 34, 10)
  g.font = '800 40px Fredoka, Arial Black, sans-serif'
  g.fillStyle = '#ffffff'
  g.strokeStyle = '#1b1f2e'
  g.lineWidth = 8
  g.strokeText('100', 20, 46)
  g.fillText('100', 20, 46)
  g.textAlign = 'right'
  g.fillStyle = '#ffd23a'
  g.strokeText('NEW WORLD!', W - 16, 46)
  g.fillText('NEW WORLD!', W - 16, 46)
  return canvasTex(c)
}
function buildUpdateSign() {
  const root = new Group()
  const wood = std('#8a5226', { roughness: 0.8 })
  for (const s of [-1, 1]) put(root, new BoxGeometry(0.5, 4.2, 0.5), wood, s * 3.1, 2.1, 0)
  put(root, new BoxGeometry(6.8, 0.5, 0.6), wood, 0, 4.1, 0)
  put(root, new BoxGeometry(6.8, 0.4, 0.6), wood, 0, 0.9, 0)
  const pic = put(root, new PlaneGeometry(5.7, 3.0), std('#ffffff', { map: paintPoster(), roughness: 0.6 }), 0, 2.5, -0.31, false)
  pic.rotation.y = Math.PI
  put(root, new BoxGeometry(5.9, 3.2, 0.3), std('#5a3416'), 0, 2.5, 0)
  const sign = makeSign(0.75)
  sign.position.set(0, 6, 0)
  root.add(sign)
  return { root, sign }
}

// --- World 2 portal ---------------------------------------------------------------------------
function buildPortal(fx, wx, wz) {
  const root = new Group()
  const stoneA = legoMat('#e3b56a')
  const stoneB = legoMat('#8a4a22')
  const R = 3.6
  const segs = 16
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2
    const b = put(root, withTop(new BoxGeometry(1.6, 1.3, 1.5)), i % 2 ? stoneA : stoneB, Math.cos(a) * R, R + 1.2 + Math.sin(a) * R, 0)
    b.rotation.z = a
  }
  // base steps
  put(root, withTop(new BoxGeometry(9, 1.1, 4)), stoneB, 0, 0.55, 0)
  put(root, withTop(new BoxGeometry(7, 0.6, 3)), stoneA, 0, 1.3, 0)
  // ornaments
  const gold = metal('#ffcf3a', { emissive: '#ffae12', emissiveIntensity: 0.4 })
  put(root, new OctahedronGeometry(0.8), glowMat('#ffb21f', 1.2), 0, 2 * R + 1.9, 0)
  for (const s of [-1, 1]) put(root, new ConeGeometry(0.5, 2, 4), gold, s * (R + 1.2), R + 1.2, 0)
  // swirling golden vortex
  const swirl = paintSwirl('#ff9a00', '#fff27a')
  const disc = put(root, new PlaneGeometry(R * 2.1, R * 2.1), new MeshBasicMaterial({ map: swirl, transparent: true, side: DoubleSide, depthWrite: false, color: new Color(1.8, 1.6, 1.2) }), 0, R + 1.2, 0, false)
  const disc2 = put(root, new PlaneGeometry(R * 1.6, R * 1.6), new MeshBasicMaterial({ map: swirl, transparent: true, side: DoubleSide, depthWrite: false, opacity: 0.6, blending: AdditiveBlending }), 0, R + 1.2, 0.05, false)
  const light = new PointLight('#ffc23a', 22, 20, 2)
  light.position.set(0, R + 1.2, 1.5)
  root.add(light)
  const sign = makeSign(1.0)
  sign.set([{ text: 'World 2', size: 1.1 }, { text: `${WORLD2_SKILL / 1e6}M Skills`, color: '#3fd4ff', icon: 'bolt', size: 0.6 }])
  sign.position.set(0, 2 * R + 4.4, 0)
  root.add(sign)
  root.position.set(wx, 0, wz)
  root.rotation.y = Math.PI / 5
  addFixed(RAPIER.ColliderDesc.cuboid(4.5, 0.9, 2), { x: wx, y: 0.9, z: wz })
  fx.emitter({ rate: 14, x: wx, y: R + 1.2, z: wz, spread: R * 1.6, spreadY: R * 1.6, speed: 0.2, swirl: 2, life: 1.4, size: 0.4, color: ['#fff27a', '#ffb21f'], shape: 'star', cull: new Vector3(wx, 4, wz) })
  return {
    root,
    update(dt, t) {
      swirl.rotation -= dt * 2.2
      disc2.rotation.z += dt * 0.9
      light.intensity = 20 + Math.sin(t * 3) * 4
    },
  }
}

// --- Assemble the lobby -------------------------------------------------------------------
export function buildProps(scene, fx) {
  const anims = []
  const out = { pads: [], tables: [], eggs: [], stands: [] }

  // slingshot pads
  out.pads = buildPads(scene)

  // training tables
  for (const p of PLATFORMS) {
    const wy = p.step === 2 ? 3 * STUD : STUD
    const t = buildTable(p.style, fx, p.x, wy, p.z)
    scene.add(t.root)
    anims.push(...t.anim)
    const sign = makeSign(0.75)
    sign.position.set(p.x, wy + 5.6, p.z)
    scene.add(sign)
    out.tables.push({ data: p, x: p.x, z: p.z, topY: t.topY, radius: t.radius, sign, root: t.root })
  }

  // eggs
  for (const e of EGGS) {
    const kind = e.look === 'exclusive' ? 'neon' : e.look === 'race' ? 'pink' : 'green'
    const ped = buildPedestal(kind)
    ped.root.position.set(e.x, 0, e.z)
    scene.add(ped.root)
    addFixed(RAPIER.ColliderDesc.cylinder(0.6, kind === 'neon' ? 2 : 1.5), { x: e.x, y: 0.6, z: e.z })
    const egg = buildEgg(e.look)
    egg.position.set(e.x, ped.top, e.z)
    scene.add(egg)
    const sign = makeSign(0.6)
    const price = e.currency === 'tokens' ? { text: `${e.price} Race Tokens`, icon: 'token', color: '#ffe46a', size: 0.55 } : { text: `${fmt(e.price)} Wins`, icon: 'trophy', color: '#ffe46a', size: 0.6 }
    sign.set([{ text: e.name, color: e.look === 'exclusive' ? '#b98cff' : e.look === 'race' ? '#ffffff' : e.look === 'rainbow' ? '#ffd23a' : e.look === 'rare' ? '#5fb4ff' : '#ffffff', size: 1 }, price])
    sign.position.set(e.x, ped.top + 3.0, e.z)
    scene.add(sign)
    const baseY = ped.top
    anims.push((dt, t) => {
      egg.position.y = baseY + Math.sin(t * 1.6 + e.x) * 0.08
      egg.rotation.y += dt * (e.look === 'exclusive' ? 0.9 : 0.25)
    })
    if (e.look === 'exclusive' || e.look === 'rainbow') {
      fx.emitter({ rate: 7, x: e.x, y: ped.top + 0.9, z: e.z, spread: 1.6, spreadY: 1.6, speed: 0.6, life: 1, size: 0.45, color: e.look === 'exclusive' ? ['#ffffff', '#ff8af5', '#7fe7ff'] : ['#ff6ad5', '#ffef3a', '#3fa2ff'], shape: 'star', cull: new Vector3(e.x, 1, e.z) })
    }
    if (e.look === 'exclusive') {
      const l = new PointLight('#7fd8ff', 14, 12, 2)
      l.position.set(e.x, 2.5, e.z)
      scene.add(l)
    }
    out.eggs.push({ data: e, x: e.x, z: e.z, egg, topY: ped.top, sign })
  }

  // pet stands (limited pets sold for Wins)
  for (const sp of STAND_PETS) {
    const ped = buildPedestal(sp.id === 'seraph' ? 'gold' : 'purple')
    ped.root.position.set(sp.x, 0, sp.z)
    scene.add(ped.root)
    addFixed(RAPIER.ColliderDesc.cylinder(0.6, sp.id === 'seraph' ? 2 : 1.4), { x: sp.x, y: 0.6, z: sp.z })
    const pet = buildPet(sp.look)
    pet.scale.setScalar(sp.id === 'seraph' ? 2.6 : 1.9)
    pet.position.set(sp.x, ped.top, sp.z)
    pet.rotation.y = sp.id === 'seraph' ? Math.PI : Math.PI / 2
    scene.add(pet)
    const sign = makeSign(sp.id === 'seraph' ? 0.9 : 0.5)
    sign.set([
      { text: `Stock ${fmt(sp.stock)}/${fmt(sp.stock)}`, size: 0.8 },
      { text: 'BEST IN GAME', color: '#c98cff', size: 0.8 },
      { text: `Always ${sp.better} Better`, color: sp.id === 'seraph' ? '#ff5ad8' : '#ff5ad8', size: 0.8 },
      { text: `ONLY ${fmtShort(sp.price)} Wins`, icon: 'trophy', color: sp.id === 'seraph' ? '#ff8a1a' : '#ffffff', size: 0.75 },
    ])
    sign.position.set(sp.x, ped.top + (sp.id === 'seraph' ? 6.4 : 3.6), sp.z)
    scene.add(sign)
    if (sp.id === 'seraph') {
      const beam = put(scene, new CylinderGeometry(1.4, 1.8, 9, 24, 1, true), additive('#fff3a0', 0.18), sp.x, ped.top + 4.5, sp.z, false)
      const light = new PointLight('#ffe066', 22, 16, 2)
      light.position.set(sp.x, 4, sp.z)
      scene.add(light)
      fx.emitter({ rate: 14, x: sp.x, y: ped.top + 1.8, z: sp.z, spread: 3, spreadY: 3, speed: 0.8, lift: 0.5, life: 1.2, size: 0.55, color: ['#ffffff', '#fff27a', '#ffd23a'], shape: 'star', cull: new Vector3(sp.x, 2, sp.z) })
      anims.push((dt, t) => {
        beam.material.opacity = 0.14 + Math.sin(t * 2) * 0.05
      })
    } else {
      fx.emitter({ rate: 4, x: sp.x, y: ped.top + 1, z: sp.z, spread: 1.6, spreadY: 1.6, speed: 0.4, life: 1, size: 0.4, color: ['#c46aff', '#ffd23a'], shape: 'star', cull: new Vector3(sp.x, 2, sp.z) })
    }
    const baseY = ped.top
    anims.push((dt, t) => {
      pet.position.y = baseY + 0.15 + Math.sin(t * 2) * 0.15
      pet.rotation.y += dt * 0.5
      const w = pet.userData.wings
      if (w) for (const c of w.children) c.rotation.z = c.userData.side * (0.3 + Math.sin(t * 6) * 0.35)
    })
    out.stands.push({ data: sp, x: sp.x, z: sp.z })
  }

  // free rewards chest
  const chest = buildChest()
  chest.root.position.set(-20, 0, 33)
  chest.root.rotation.y = Math.PI * 0.85
  scene.add(chest.root)
  addFixed(RAPIER.ColliderDesc.cuboid(1.7, 1.2, 1.3), { x: -20, y: 1.2, z: 33 })
  const chestSign = makeSign(0.8)
  chestSign.position.set(-20, 5, 33)
  scene.add(chestSign)
  const chestLight = new PointLight('#ffd23a', 12, 12, 2)
  chestLight.position.set(-20, 2.5, 33)
  scene.add(chestLight)
  fx.emitter({ rate: 6, x: -20, y: 1.2, z: 33, spread: 4, spreadY: 1, speed: 0.6, lift: 1, life: 1.3, size: 0.45, color: ['#fff27a', '#ffd23a'], shape: 'star', cull: new Vector3(-20, 1, 33) })
  anims.push((dt, t) => {
    chest.rings.forEach((r, i) => {
      r.rotation.y += dt * (i % 2 ? -0.6 : 0.9)
      r.scale.setScalar(1 + Math.sin(t * 2 + i) * 0.04)
    })
    chest.lid.rotation.x = -0.12 - Math.max(0, Math.sin(t * 2.5)) * 0.08
  })
  out.chest = { x: -20, z: 33, sign: chestSign }

  // next update sign
  const upd = buildUpdateSign()
  upd.root.position.set(15, 0, 37)
  upd.root.rotation.y = -0.35
  scene.add(upd.root)
  addFixed(RAPIER.ColliderDesc.cuboid(3.4, 2.2, 0.5), { x: 15, y: 2.2, z: 37 })
  out.updateSign = upd.sign

  // leaderboards on the stage
  const boards = [
    ['Top Skill', 'bolt'],
    ['Time Played', 'clock'],
    ['Top Level', 'star'],
    ['Top Wins', 'trophy'],
  ]
  out.boards = boards.map(([title, icon], i) => {
    const b = buildLeaderboard(title, icon)
    b.root.position.set(-18 + i * 12, 3 * STUD, 49)
    scene.add(b.root)
    addFixed(RAPIER.ColliderDesc.cuboid(5, 5, 0.8), { x: -18 + i * 12, y: 5, z: 49 })
    return b
  })

  // farm in the south-east corner
  const barn = buildBarn()
  barn.position.set(36, 0, 38)
  barn.rotation.y = -0.25
  scene.add(barn)
  addFixed(RAPIER.ColliderDesc.cuboid(5.2, 5, 6.2), { x: 36, y: 5, z: 38 }, { x: 0, y: Math.sin(-0.125), z: 0, w: Math.cos(-0.125) })
  const silo = buildSilo()
  silo.position.set(44.5, 0, 28)
  scene.add(silo)
  addFixed(RAPIER.ColliderDesc.cylinder(6, 2.7), { x: 44.5, y: 6, z: 28 })
  const mill = buildWindmill()
  mill.root.position.set(45, 0, 20)
  mill.root.rotation.y = 0.5
  scene.add(mill.root)
  addFixed(RAPIER.ColliderDesc.cylinder(5, 1.8), { x: 45, y: 5, z: 20 })
  anims.push((dt) => (mill.blades.rotation.z += dt * 0.7))

  // world 2 portal by the flying zone
  const portal = buildPortal(fx, -35, -40)
  scene.add(portal.root)
  anims.push(portal.update)
  out.portal = { x: -35, z: -40 }

  out.update = (dt, t) => {
    for (const a of anims) a(dt, t)
  }
  return out
}
