import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
} from 'three'
import { paintSoftDot } from './textures.js'

// One pooled GPU particle system per blend mode (additive glow / normal solid).
// Everything that sparkles, burns, smokes, snows or splashes goes through
// emit()/burst(). Emitters are cheap objects that spawn at a rate per second.
// Particle budget scales with the graphics preset (`setQuality`).

const vert = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
attribute float aShape;
uniform float uScale;
varying float vAlpha;
varying vec3 vColor;
varying float vShape;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  vAlpha = aAlpha;
  vColor = aColor;
  vShape = aShape;
}`
const frag = /* glsl */ `
uniform sampler2D uMap;
varying float vAlpha;
varying vec3 vColor;
varying float vShape;
void main() {
  vec2 uv = gl_PointCoord;
  float a;
  if (vShape > 1.5) {          // star sparkle
    vec2 d = abs(uv - 0.5);
    float cross = max(smoothstep(0.08, 0.0, d.x) * smoothstep(0.5, 0.0, d.y), smoothstep(0.08, 0.0, d.y) * smoothstep(0.5, 0.0, d.x));
    a = max(cross, texture2D(uMap, uv).a * 0.8);
  } else if (vShape > 0.5) {   // chunky square (confetti, voxel bits)
    vec2 d = abs(uv - 0.5);
    a = step(max(d.x, d.y), 0.38);
  } else {
    a = texture2D(uMap, uv).a;
  }
  if (a * vAlpha < 0.01) discard;
  gl_FragColor = vec4(vColor, a * vAlpha);
}`

const SHAPES = { dot: 0, square: 1, star: 2 }

function makePool(max, blending, map) {
  const geo = new BufferGeometry()
  const pos = new Float32Array(max * 3)
  const col = new Float32Array(max * 3)
  const size = new Float32Array(max)
  const alpha = new Float32Array(max)
  const shape = new Float32Array(max)
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  geo.setAttribute('aColor', new BufferAttribute(col, 3))
  geo.setAttribute('aSize', new BufferAttribute(size, 1))
  geo.setAttribute('aAlpha', new BufferAttribute(alpha, 1))
  geo.setAttribute('aShape', new BufferAttribute(shape, 1))
  const mat = new ShaderMaterial({
    uniforms: { uMap: { value: map }, uScale: { value: 600 } },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    blending,
  })
  const points = new Points(geo, mat)
  points.frustumCulled = false
  points.renderOrder = 5
  const parts = []
  for (let i = 0; i < max; i++) parts.push({ life: 0 })
  return { points, geo, mat, parts, max, cursor: 0, pos, col, size, alpha, shape }
}

const c0 = new Color()
const c1 = new Color()

export function createFx(scene) {
  const map = new CanvasTexture(paintSoftDot(64))
  const glow = makePool(2500, AdditiveBlending, map)
  const solid = makePool(2000, NormalBlending, map)
  scene.add(glow.points, solid.points)
  let quality = 1
  const emitters = new Set()

  function spawn(o) {
    const pool = o.additive === false ? solid : glow
    if (Math.random() > quality && !o.always) return
    const p = pool.parts[pool.cursor]
    pool.cursor = (pool.cursor + 1) % pool.max
    const sp = o.spread ?? 0
    p.x = o.x + (Math.random() - 0.5) * sp
    p.y = o.y + (Math.random() - 0.5) * (o.spreadY ?? sp)
    p.z = o.z + (Math.random() - 0.5) * sp
    const v = o.speed ?? 1
    const dir = o.dir
    if (dir) {
      p.vx = dir[0] * v + (Math.random() - 0.5) * (o.jitter ?? 0.5)
      p.vy = dir[1] * v + (Math.random() - 0.5) * (o.jitter ?? 0.5)
      p.vz = dir[2] * v + (Math.random() - 0.5) * (o.jitter ?? 0.5)
    } else {
      // random direction on a sphere (upper half bias via `up`)
      const u = Math.random() * Math.PI * 2
      const w = Math.random() * 2 - 1
      const s = Math.sqrt(1 - w * w)
      p.vx = Math.cos(u) * s * v
      p.vy = Math.abs(w) * v * (o.up ?? 1) + (o.lift ?? 0)
      p.vz = Math.sin(u) * s * v
    }
    p.g = o.gravity ?? 0
    p.drag = o.drag ?? 0
    p.max = p.life = (o.life ?? 1) * (0.7 + Math.random() * 0.6)
    p.s0 = o.size ?? 0.5
    p.s1 = o.sizeEnd ?? p.s0
    const cols = Array.isArray(o.color) ? o.color : [o.color ?? '#ffffff']
    c0.set(cols[Math.floor(Math.random() * cols.length)])
    p.r0 = c0.r
    p.g0 = c0.g
    p.b0 = c0.b
    c1.set(o.colorEnd ?? c0)
    p.r1 = c1.r
    p.g1 = c1.g
    p.b1 = c1.b
    p.a = o.alpha ?? 1
    p.shape = SHAPES[o.shape ?? 'dot']
    p.swirl = o.swirl ?? 0
    p.cx = o.x
    p.cz = o.z
  }

  function stepPool(pool, dt) {
    const { parts, pos, col, size, alpha, shape } = pool
    for (let i = 0; i < pool.max; i++) {
      const p = parts[i]
      if (p.life <= 0) {
        if (alpha[i] !== 0) alpha[i] = 0
        continue
      }
      p.life -= dt
      p.vy += p.g * dt
      if (p.drag) {
        const k = Math.exp(-p.drag * dt)
        p.vx *= k
        p.vy *= k
        p.vz *= k
      }
      if (p.swirl) {
        // orbit around the spawn centre (portal / vortex)
        const dx = p.x - p.cx
        const dz = p.z - p.cz
        p.x = p.cx + dx * Math.cos(p.swirl * dt) - dz * Math.sin(p.swirl * dt)
        p.z = p.cz + dx * Math.sin(p.swirl * dt) + dz * Math.cos(p.swirl * dt)
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      const t = 1 - Math.max(0, p.life) / p.max
      pos[i * 3] = p.x
      pos[i * 3 + 1] = p.y
      pos[i * 3 + 2] = p.z
      col[i * 3] = p.r0 + (p.r1 - p.r0) * t
      col[i * 3 + 1] = p.g0 + (p.g1 - p.g0) * t
      col[i * 3 + 2] = p.b0 + (p.b1 - p.b0) * t
      size[i] = p.s0 + (p.s1 - p.s0) * t
      alpha[i] = p.a * Math.min(1, t * 8) * (1 - t * t)
      shape[i] = p.shape
    }
    pool.geo.attributes.position.needsUpdate = true
    pool.geo.attributes.aColor.needsUpdate = true
    pool.geo.attributes.aSize.needsUpdate = true
    pool.geo.attributes.aAlpha.needsUpdate = true
    pool.geo.attributes.aShape.needsUpdate = true
  }

  let enabled = true
  return {
    setQuality(q) {
      quality = q
    },
    // Settings > Effects: when off, one-shot bursts are skipped (ambient emitters keep running).
    setEnabled(on) {
      enabled = !!on
    },
    burst(n, o) {
      if (!enabled) return
      for (let i = 0; i < n; i++) spawn(o)
    },
    // Continuous emitter: { rate (per s), ...spawn options }. Returns a handle; set .on = false to pause.
    emitter(o) {
      const e = { ...o, acc: 0, on: true, always: true }
      emitters.add(e)
      return e
    },
    remove(e) {
      emitters.delete(e)
    },
    update(dt, camera, viewportHeight) {
      const scale = viewportHeight / (2 * Math.tan((camera.fov * Math.PI) / 360))
      glow.mat.uniforms.uScale.value = scale
      solid.mat.uniforms.uScale.value = scale
      for (const e of emitters) {
        if (!e.on) continue
        if (e.cull && camera.position.distanceToSquared(e.cull) > 140 * 140) continue
        e.acc += dt * e.rate * quality
        while (e.acc >= 1) {
          e.acc -= 1
          spawn(e)
        }
      }
      stepPool(glow, dt)
      stepPool(solid, dt)
    },
  }
}
