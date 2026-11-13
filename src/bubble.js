// A Bloxity chat message as a speech bubble over a player's head (ours in main.js, the others' in
// remotePlayers.js). Drawn here as one canvas sprite rather than through the SDK's three.js helper
// (chat.attachBubble), which needs the whole `three` namespace in the bundle. Same rules: shown for
// SECONDS, a newer message replaces the older one, GIFs arrive as "sent a GIF" (bloxity.js onChat).
import { CanvasTexture, SRGBColorSpace, Sprite, SpriteMaterial } from 'three'
import { FONT_FAMILY } from './config.js'

const SECONDS = 4
const MAX_CHARS = 120
const WIDTH = 512 // canvas px; the bubble is HEIGHT_M tall per text line in the world
const LINE_M = 0.34
const PAD = 26
const FONT_PX = 34
const LINE_PX = 42

function wrap(ctx, text, max) {
  const lines = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= max || !line) line = next
    else {
      lines.push(line)
      line = word
    }
    if (lines.length === 3) break
  }
  if (line && lines.length < 4) lines.push(line)
  return lines.slice(0, 4)
}

// Shows `text` over `target` (a Group whose origin is the feet) at `height` m. Returns { remove() }.
export function speechBubble(target, text, height = 2.9) {
  const msg = String(text).slice(0, MAX_CHARS)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = `600 ${FONT_PX}px ${FONT_FAMILY}, sans-serif`
  const lines = wrap(ctx, msg, WIDTH - PAD * 2)
  const w = Math.min(WIDTH, Math.max(...lines.map((l) => ctx.measureText(l).width)) + PAD * 2)
  const h = lines.length * LINE_PX + PAD * 2 - 10
  canvas.width = Math.ceil(w)
  canvas.height = Math.ceil(h + 18) // + the tail
  ctx.font = `600 ${FONT_PX}px ${FONT_FAMILY}, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.strokeStyle = 'rgba(30,30,40,0.35)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.roundRect(2, 2, canvas.width - 4, h - 4, 22)
  ctx.moveTo(canvas.width / 2 - 14, h - 3)
  ctx.lineTo(canvas.width / 2, h + 15)
  ctx.lineTo(canvas.width / 2 + 14, h - 3)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#23242b'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, PAD - 5 + LINE_PX * (i + 0.5)))

  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }))
  const k = (LINE_M * lines.length + 0.3) / canvas.height
  sprite.scale.set(canvas.width * k, canvas.height * k, 1)
  sprite.center.set(0.5, 0)
  sprite.renderOrder = 10
  // The target may be scaled (the avatar rig is not: callers pass the unscaled player group).
  sprite.position.y = height
  target.add(sprite)
  let gone = false
  const remove = () => {
    if (gone) return
    gone = true
    clearTimeout(timer)
    sprite.removeFromParent()
    tex.dispose()
    sprite.material.dispose()
  }
  const timer = setTimeout(remove, SECONDS * 1000)
  return { remove }
}
