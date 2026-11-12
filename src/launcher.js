import { BoxGeometry, CanvasTexture, ConeGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, Object3D, RepeatWrapping, SphereGeometry, SRGBColorSpace, Vector3 } from 'three'
import { FLIGHT, LAUNCHERS } from './config.js'
import { solidPole } from './propkit.js'
import { mulberry32 } from './textures.js'

// The giant slingshots standing on the Flying Zone (original procedural model):
// a striped-wood trunk and Y fork wrapped in grey metal bands with white rivets,
// two thick black rubber straps and a leather-ish pouch the player sits in.
// setPull(p) draws the pouch back (0..1); release() lets it spring forward with
// a damped wobble; update(dt, t) animates the bands. Local +Z is "back" (toward
// the lobby), the fork opens along X and the shot goes toward -Z (north).

let woodTex = null
function paintWood() {
  if (woodTex) return woodTex
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 256
  const g = c.getContext('2d')
  const rand = mulberry32(77)
  g.fillStyle = '#b8612a'
  g.fillRect(0, 0, 64, 256)
  // long vertical grain streaks in two tones, like the reference's chunky toy wood
  for (let i = 0; i < 18; i++) {
    const x = rand() * 64
    const w = 2 + rand() * 6
    g.fillStyle = rand() < 0.5 ? '#8f4519' : '#cf7a38'
    g.globalAlpha = 0.55 + rand() * 0.35
    g.fillRect(x, 0, w, 256)
  }
  g.globalAlpha = 0.35
  for (let i = 0; i < 10; i++) {
    g.fillStyle = '#6e3410'
    g.fillRect(rand() * 64, rand() * 256, 1.5 + rand() * 2, 30 + rand() * 80)
  }
  g.globalAlpha = 1
  woodTex = new CanvasTexture(c)
  woodTex.colorSpace = SRGBColorSpace
  woodTex.wrapS = woodTex.wrapT = RepeatWrapping
  return woodTex
}

const tmpA = new Vector3()
const tmpB = new Vector3()
const up = new Vector3(0, 1, 0)

// A band of metal with white rivet triangles around it.
function metalBand(parent, mats, r, h, y, x = 0, rivets = 6) {
  const band = new Mesh(new CylinderGeometry(r, r, h, 16), mats.metal)
  band.position.set(x, y, 0)
  band.castShadow = band.receiveShadow = true
  parent.add(band)
  for (let i = 0; i < rivets; i++) {
    const a = (i / rivets) * Math.PI * 2 + 0.3
    const cone = new Mesh(new ConeGeometry(h * 0.28, h * 0.42, 3), mats.rivet)
    cone.position.set(x + Math.sin(a) * (r + 0.02), y, Math.cos(a) * (r + 0.02))
    cone.rotation.set(Math.PI / 2, 0, -a)
    cone.lookAt(x + Math.sin(a) * 10, y, Math.cos(a) * 10)
    cone.rotateX(Math.PI / 2)
    parent.add(cone)
  }
  return band
}

// A cylinder from point a to point b (local), radius r.
function limb(parent, mat, a, b, r0, r1 = r0) {
  const len = a.distanceTo(b)
  const m = new Mesh(new CylinderGeometry(r1, r0, len, 14), mat)
  m.position.copy(a).add(b).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(up, tmpA.copy(b).sub(a).normalize())
  m.castShadow = m.receiveShadow = true
  parent.add(m)
  return m
}

function buildOne() {
  const L = LAUNCHERS
  const tex = paintWood()
  const mats = {
    wood: new MeshStandardMaterial({ map: tex, roughness: 0.7 }),
    metal: new MeshStandardMaterial({ color: '#a7b0ba', roughness: 0.35, metalness: 0.6 }),
    rivet: new MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }),
    rubber: new MeshStandardMaterial({ color: '#1c1e25', roughness: 0.75 }),
    pouch: new MeshStandardMaterial({ color: '#2a2c35', roughness: 0.8, side: DoubleSide }),
  }
  const root = new Group()
  const S = L.armSpread
  // trunk + base
  limb(root, mats.wood, new Vector3(0, 0, 0), new Vector3(0, 2.75, 0), 0.82, 0.7)
  metalBand(root, mats, 0.92, 0.55, 0.42)
  metalBand(root, mats, 0.82, 0.5, 2.05)
  const knot = new Mesh(new SphereGeometry(0.86, 16, 12), mats.wood)
  knot.position.y = 2.75
  knot.scale.set(1.25, 0.8, 0.95)
  knot.castShadow = true
  root.add(knot)
  // the fork: diagonal arms, then upright prongs with flat tops
  const tips = []
  for (const s of [-1, 1]) {
    const elbow = new Vector3(s * S, 4.35, 0)
    limb(root, mats.wood, new Vector3(s * 0.35, 2.75, 0), elbow, 0.62, 0.58)
    const top = new Vector3(s * (S + 0.25), L.height, 0)
    limb(root, mats.wood, elbow, top, 0.58, 0.6)
    const cap = new Mesh(new CylinderGeometry(0.6, 0.6, 0.18, 14), mats.wood)
    cap.position.copy(top)
    root.add(cap)
    const j = new Mesh(new SphereGeometry(0.58, 12, 10), mats.wood)
    j.position.copy(elbow)
    root.add(j)
    metalBand(root, mats, 0.7, 0.5, L.height - 0.75, s * (S + 0.22), 5)
    tips.push(new Vector3(s * (S + 0.22) - s * 0.55, L.height - 0.75, 0.05))
  }
  // pouch: a curved strap cupping the seat from below and behind (open to -Z / up)
  const pouch = new Group()
  const cup = new Mesh(new CylinderGeometry(0.78, 0.78, 1.35, 16, 1, true, Math.PI * 1.25, Math.PI).rotateZ(Math.PI / 2), mats.pouch)
  cup.castShadow = true
  pouch.add(cup)
  for (const s of [-1, 1]) {
    const lip = new Mesh(new BoxGeometry(0.16, 0.5, 0.5), mats.rubber)
    lip.position.set(s * 0.7, 0.15, 0.32)
    pouch.add(lip)
  }
  pouch.position.set(0, L.pouchY, 0)
  root.add(pouch)
  // straps from each prong to the pouch sides (unit boxes stretched every frame)
  const strapGeo = new BoxGeometry(1, 1, 1).translate(0, 0, 0.5)
  const straps = tips.map(() => {
    const m = new Mesh(strapGeo, mats.rubber)
    m.castShadow = true
    root.add(m)
    return m
  })
  const anchor = new Object3D()
  return { root, pouch, straps, tips, anchor }
}

export function createLaunchers(scene) {
  const L = LAUNCHERS
  return L.xs.map((x, i) => {
    const m = buildOne()
    m.root.position.set(x, 0, L.z)
    scene.add(m.root)
    solidPole(0.8, 3, x, L.z) // the trunk blocks; the fork is above head height
    let pull = 0 // 0 rest .. 1 full draw (negative = flung forward past rest)
    let vel = 0
    let springing = false
    let sag = 0
    const seat = new Vector3()
    const api = {
      index: i,
      x,
      z: L.z,
      // Draw the pouch back (p 0..1); it sags as it stretches.
      setPull(p) {
        springing = false
        pull = p
        vel = 0
      },
      release() {
        springing = true
        vel = -6
      },
      // World position the seated player's feet should be at.
      seat(out = seat) {
        const p = m.pouch.position
        return out.set(x + p.x, p.y - 0.95, L.z + p.z + 0.12)
      },
      update(dt, t) {
        if (springing) {
          // damped spring back to rest: overshoots forward and wobbles
          const acc = -150 * pull - 5.5 * vel
          vel += acc * dt
          pull += vel * dt
          if (Math.abs(pull) < 0.002 && Math.abs(vel) < 0.02) {
            springing = false
            pull = 0
            vel = 0
          }
        }
        sag += ((Math.max(0, pull) * FLIGHT.pullDown) - sag) * Math.min(1, dt * 10)
        const idle = springing || pull !== 0 ? 0 : Math.sin(t * 1.3 + i) * 0.04
        m.pouch.position.set(0, L.pouchY - sag + idle * 0.5, pull * FLIGHT.pullBack + idle)
        m.pouch.rotation.x = -pull * 0.35
        // stretch the straps from the prong tips to the pouch sides
        m.straps.forEach((s, k) => {
          const side = k === 0 ? -1 : 1
          tmpA.copy(m.tips[k])
          tmpB.set(side * 0.66, m.pouch.position.y + 0.25, m.pouch.position.z + 0.3)
          const len = Math.max(0.05, tmpA.distanceTo(tmpB))
          s.position.copy(tmpA)
          s.lookAt(tmpB.x + m.root.position.x, tmpB.y, tmpB.z + m.root.position.z)
          // a stretched strap gets thinner
          const thin = 1 / Math.sqrt(Math.max(1, len / 1.6))
          s.scale.set(0.42 * thin, 0.14, len)
        })
      },
    }
    api.update(0, 0)
    return api
  })
}
