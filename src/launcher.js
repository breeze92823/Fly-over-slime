import { BoxGeometry, CylinderGeometry, DoubleSide, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { FLIGHT, LAUNCHERS } from './config.js'
import { buildSlingshot } from './props.js'

// The launcher: nothing stands on the Flying Zone. When the player presses FLY, a
// giant copy of their equipped slingshot (props.js buildSlingshot, without its
// small band) is summoned in front of them: it spins up out of the ground with an
// elastic bounce, gets thick stretchy straps and a pouch the player sits in, is
// drawn back (setPull 0..1), fires (release: damped spring wobble) and then shrinks
// away with a poof (vanish). Blaster-type styles become a giant cannon instead:
// the player sits on the muzzle, the barrel cranks up while charging and recoils.
// Group space: +Z is "back" (toward the lobby), the shot goes toward -Z (north).

const easeOutBack = (k) => {
  const c = 2.2
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2)
}
const easeOut = (k) => 1 - (1 - k) * (1 - k)
const tmpA = new Vector3()
const tmpB = new Vector3()

function dispose(root) {
  root.traverse((o) => {
    o.geometry?.dispose()
    const m = o.material
    if (Array.isArray(m)) m.forEach((x) => x.dispose())
    else m?.dispose()
  })
}

export function createLauncher(scene) {
  const L = LAUNCHERS
  let rig = null // the summoned launcher, or null
  const seatV = new Vector3()

  function build(style) {
    const model = buildSlingshot(style, { bands: false })
    const info = model.userData.sling ?? {}
    const cannon = !!info.cannon
    const S = cannon ? L.cannonScale : L.scale
    model.traverse((o) => {
      o.castShadow = true
      o.receiveShadow = true
    })
    model.rotation.y = Math.PI // the hand-held model pulls toward -Z; ours toward +Z
    model.scale.setScalar(S)
    const root = new Group()
    const body = new Group() // what scales / spins in and out
    root.add(body)
    body.add(model)
    const r = { root, body, model, cannon, S, straps: [], tips: [], pouch: null, restPouch: null, barrel: info.barrel, barrelX: info.barrel?.rotation.x ?? 0 }
    if (!cannon) {
      // prong tips in body space (the model is turned PI: x and z flip)
      r.tips = (info.tips ?? [new Vector3(-0.42, 1.5, 0), new Vector3(0.42, 1.5, 0)]).map((t) => new Vector3(-t.x * S, t.y * S, -t.z * S))
      const p = info.pouch ?? new Vector3(0, 1.28, -0.22)
      r.restPouch = new Vector3(0, p.y * S - 0.35, -p.z * S * 0.5)
      const bandMat = new MeshStandardMaterial({ color: info.band ?? '#2a2c35', roughness: 0.75 })
      const pouchMat = new MeshStandardMaterial({ color: info.band ?? '#2a2c35', roughness: 0.85, side: DoubleSide })
      const pouch = new Group()
      // a low sling under the seat (open to the front and above, so the rider stays in view)
      const cup = new Mesh(new CylinderGeometry(0.62, 0.62, 1.3, 16, 1, true, Math.PI * 1.25, Math.PI * 0.85).rotateZ(Math.PI / 2), pouchMat)
      cup.castShadow = true
      pouch.add(cup)
      for (const s of [-1, 1]) {
        const lip = new Mesh(new BoxGeometry(0.16, 0.4, 0.45), bandMat)
        lip.position.set(s * 0.66, -0.1, 0.25)
        pouch.add(lip)
      }
      body.add(pouch)
      r.pouch = pouch
      const strapGeo = new BoxGeometry(1, 1, 1).translate(0, 0, 0.5)
      r.straps = r.tips.map(() => {
        const m = new Mesh(strapGeo, bandMat)
        m.castShadow = true
        body.add(m)
        return m
      })
    }
    return r
  }

  // State of the current rig.
  let phase = 'none' // 'summon' | 'ready' | 'linger' | 'vanish'
  let t = 0
  let pull = 0
  let vel = 0
  let springing = false
  let sag = 0
  let kick = 0 // cannon recoil (m back)

  function layout(time) {
    const r = rig
    if (r.cannon) {
      // crank the barrel up as it charges; recoil slides the whole cannon back
      r.barrel.rotation.x = r.barrelX - Math.max(0, pull) * 0.35
      r.barrel.scale.z = 1 - Math.max(0, pull) * 0.12 + Math.max(0, -pull) * 0.1
      r.model.position.z = kick
      return
    }
    sag += (Math.max(0, pull) * FLIGHT.pullDown - sag) * 0.25
    const idle = phase === 'ready' && pull === 0 ? Math.sin(time * 2.2) * 0.05 : 0
    r.pouch.position.set(0, r.restPouch.y - sag, r.restPouch.z + pull * FLIGHT.pullBack + idle)
    r.pouch.rotation.x = -pull * 0.35
    r.straps.forEach((s, k) => {
      const side = k === 0 ? -1 : 1
      tmpA.copy(r.tips[k])
      tmpB.set(side * 0.66, r.pouch.position.y - 0.05, r.pouch.position.z + 0.25)
      const len = Math.max(0.05, tmpA.distanceTo(tmpB))
      s.position.copy(tmpA)
      s.lookAt(r.body.localToWorld(tmpB.clone()))
      const thin = 1 / Math.sqrt(Math.max(1, len / 1.6))
      s.scale.set(0.4 * thin, 0.14, len)
    })
  }

  return {
    get active() {
      return !!rig
    },
    get cannon() {
      return !!rig?.cannon
    },
    get position() {
      return rig?.root.position
    },
    // Builds the giant `style` at (x, z) and starts its entrance.
    summon(style, x, z) {
      this.remove()
      rig = build(style)
      rig.root.position.set(x, 0, z)
      rig.body.scale.setScalar(0.001)
      scene.add(rig.root)
      phase = 'summon'
      t = 0
      pull = vel = sag = kick = 0
      springing = false
      layout(0)
    },
    summoned: () => phase !== 'summon',
    setPull(p) {
      springing = false
      pull = p
      vel = 0
    },
    release() {
      springing = true
      vel = rig?.cannon ? -2 : -6
      if (rig?.cannon) kick = 1.6
      phase = 'linger'
      t = 0
    },
    // World position the player's feet should be at while seated.
    seat(out = seatV) {
      if (!rig) return out.set(0, 0, 0)
      rig.root.updateMatrixWorld(true)
      if (rig.cannon) {
        rig.barrel.localToWorld(out.set(0, 0.28, 1.05))
        return out.setY(out.y + 0.05)
      }
      const p = rig.pouch.position
      return rig.body.localToWorld(out.set(p.x, p.y - 0.62, p.z - 0.05))
    },
    remove() {
      if (!rig) return
      scene.remove(rig.root)
      dispose(rig.root)
      rig = null
      phase = 'none'
    },
    // Returns an event name on the frame something happens: 'landed' (summon done), 'vanishing', 'gone'.
    update(dt, time) {
      if (!rig) return null
      t += dt
      let event = null
      if (phase === 'summon') {
        const k = Math.min(1, t / L.summon)
        rig.body.scale.setScalar(Math.max(0.001, easeOutBack(k)))
        rig.body.rotation.y = (1 - easeOut(k)) * Math.PI * 2 // spins in
        rig.body.position.y = (1 - k) * -0.6
        if (k >= 1) {
          phase = 'ready'
          rig.body.rotation.y = 0
          rig.body.position.y = 0
          event = 'landed'
        }
      } else if (phase === 'linger' && t >= L.linger) {
        phase = 'vanish'
        t = 0
        event = 'vanishing'
      } else if (phase === 'vanish') {
        const k = Math.min(1, t / L.vanish)
        const s = k < 0.25 ? 1 + k * 0.6 : 1.15 * (1 - (k - 0.25) / 0.75) // a little swell, then gone
        rig.body.scale.setScalar(Math.max(0.001, s))
        rig.body.rotation.y = k * Math.PI * 1.5
        if (k >= 1) {
          this.remove()
          return 'gone'
        }
      }
      if (springing) {
        const stiff = rig.cannon ? 60 : 150
        vel += (-stiff * pull - (rig.cannon ? 9 : 5.5) * vel) * dt
        pull += vel * dt
        if (Math.abs(pull) < 0.002 && Math.abs(vel) < 0.02) {
          springing = false
          pull = vel = 0
        }
      }
      kick *= Math.exp(-5 * dt)
      layout(time)
      return event
    },
  }
}
