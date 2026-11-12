import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  NearestFilter,
  Object3D,
  PlaneGeometry,
  Shape,
  SphereGeometry,
} from 'three'
import { CHANNEL, CHECKER, FLY_ZONE, PLAZA, RIVER_REGIONS, STUD } from './config.js'
import { RAPIER, addFixed } from './physics.js'
import { mulberry32 } from './textures.js'
import { canvasTex, legoBoxGeo, legoMat, mergedMesh, voxelTree, withTop } from './legokit.js'
import { label } from './propkit.js'

// The lobby: a lego plaza of light-grey stud paths and lime checker grass,
// two stepped grey terraces (slingshots west, training tables east), the
// leaderboard stage to the south, terraced brown-checker cliffs with voxel
// trees all around, and to the north the yellow FLYING ZONE strip at the
// mouth of a long glossy slime river between stepped banks.

export const COLORS = {
  grey: '#d6dade',
  greyRim: '#8d939b',
  greenA: '#63e22f',
  greenB: '#4ccf22',
  cliffA: '#9a6431',
  cliffB: '#7a4a22',
  grass: '#5bd62b',
  slime: '#3fe23a',
  slimeLight: '#a6ff7a',
  yellowA: '#ffd84a',
  yellowB: '#ffc727',
}

// Grey (path) rectangles of the plaza layout, metres [x0, x1, z0, z1]; the rest is grass.
const GREY = [
  [-4.5, 4.5, -38, 42], // main path to the flying zone
  [-12, 12, -4.5, 15], // spawn hub
  [-18, -12, 0, 9],
  [12, 18, 0, 9],
  [-48, -18, -37.5, -1.5], // west terrace apron
  [-18, -9, -13.5, -4.5],
  [18, 48, -36, 19.5], // east terrace apron
  [9, 18, -15, -4.5],
  [-16.5, 16.5, 19.5, 37.5], // egg court
  [-30, 30, 37.5, 54], // stage front
  [-30, 30, -40.5, -38], // walkway along the flying zone
]
const GREEN_NOTCHES = [
  [-12, -6, 9, 15],
  [6, 12, -4.5, 1.5],
  [-13.5, -4.5, 22.5, 33],
  [4.5, 13.5, 22.5, 33],
  [-40.5, -27, -3, -1.5],
  [27, 39, 18, 19.5],
]

function paintPlaza() {
  const W = Math.round((PLAZA.maxX - PLAZA.minX) / STUD)
  const H = Math.round((PLAZA.maxZ - PLAZA.minZ) / STUD)
  const grid = new Uint8Array(W * H) // 0 grass, 1 grey, 2 rim
  const fill = (rects, v) => {
    for (const [x0, x1, z0, z1] of rects) {
      const a = Math.max(0, Math.round((x0 - PLAZA.minX) / STUD))
      const b = Math.min(W, Math.round((x1 - PLAZA.minX) / STUD))
      const c = Math.max(0, Math.round((z0 - PLAZA.minZ) / STUD))
      const d = Math.min(H, Math.round((z1 - PLAZA.minZ) / STUD))
      for (let z = c; z < d; z++) for (let x = a; x < b; x++) grid[z * W + x] = v
    }
  }
  fill(GREY, 1)
  fill(GREEN_NOTCHES, 0)
  // grey cells touching grass become the darker rim
  const rim = new Uint8Array(grid)
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (grid[z * W + x] !== 1) continue
      let edge = false
      for (let dz = -1; dz <= 1 && !edge; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const nz = z + dz
          if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue
          if (grid[nz * W + nx] === 0) {
            edge = true
            break
          }
        }
      }
      if (edge) rim[z * W + x] = 2
    }
  }
  const PX = 4
  const c = document.createElement('canvas')
  c.width = W * PX
  c.height = H * PX
  const g = c.getContext('2d')
  const perCheck = Math.round(CHECKER / STUD)
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      const v = rim[z * W + x]
      // world-aligned checker so it matches the lego shader everywhere else
      const wx = Math.floor((PLAZA.minX / STUD + x) / perCheck)
      const wz = Math.floor((PLAZA.minZ / STUD + z) / perCheck)
      g.fillStyle = v === 1 ? COLORS.grey : v === 2 ? COLORS.greyRim : (wx + wz) % 2 === 0 ? COLORS.greenA : COLORS.greenB
      g.fillRect(x * PX, z * PX, PX, PX)
    }
  }
  return c
}

// --- Cliffs ---------------------------------------------------------------------------
// Terraced blocky cliffs: for every segment along an edge, tiers of boxes step up and
// away from the edge with a little random jitter so the outline reads hand-built.
function terraceRun({ along, from, to, edge, outward, seg, tiers, rand, geos, colliders, trees, treeEvery }) {
  for (let s = from; s < to; s += seg) {
    const len = Math.min(seg, to - s)
    const mid = s + len / 2
    let prevOff = 0
    tiers.forEach((t, k) => {
      const off = t.off + Math.round(rand() * t.jitter / STUD) * STUD
      const near = edge + outward * off
      const far = edge + outward * (t.off + 70)
      const lo = t.base ?? -1
      const h = t.h + (k > 0 ? Math.round((rand() - 0.5) * 2) * STUD * 2 : 0)
      const w = Math.abs(far - near)
      const c = (near + far) / 2
      const geo = along === 'z' ? legoBoxGeo(w, h - lo, len + 0.02, c, (h + lo) / 2, mid) : legoBoxGeo(len + 0.02, h - lo, w, mid, (h + lo) / 2, c)
      geos.push(geo)
      if (colliders && k < 2) {
        if (along === 'z') addFixed(RAPIER.ColliderDesc.cuboid(w / 2, (h - lo) / 2, len / 2), { x: c, y: (h + lo) / 2, z: mid })
        else addFixed(RAPIER.ColliderDesc.cuboid(len / 2, (h - lo) / 2, w / 2), { x: mid, y: (h + lo) / 2, z: c })
      }
      // trees on the exposed top of this tier (between this tier's edge and the next one)
      if (trees && rand() < treeEvery * (k === 0 ? 0.6 : 1)) {
        const nextOff = tiers[k + 1] ? tiers[k + 1].off : off + 10
        const depth = Math.max(2.5, nextOff - off - 1)
        const d = off + 1.5 + rand() * (depth - 2)
        const p = edge + outward * d
        const q = s + 1 + rand() * Math.max(0.5, len - 2)
        trees.push(along === 'z' ? [p, h, q] : [q, h, p])
      }
      prevOff = off
    })
  }
}

export function buildGround(scene) {
  const rand = mulberry32(7331)
  const root = new Group()
  root.name = 'lobby'
  scene.add(root)

  // --- Plaza floor ---
  const plazaW = PLAZA.maxX - PLAZA.minX
  const plazaD = PLAZA.maxZ - PLAZA.minZ
  const tex = canvasTex(paintPlaza())
  tex.magFilter = NearestFilter
  const floorGeo = withTop(new PlaneGeometry(plazaW, plazaD).rotateX(-Math.PI / 2).translate((PLAZA.minX + PLAZA.maxX) / 2, 0, (PLAZA.minZ + PLAZA.maxZ) / 2))
  const floor = new Mesh(floorGeo, legoMat('#ffffff', { map: tex }))
  floor.receiveShadow = true
  root.add(floor)
  addFixed(RAPIER.ColliderDesc.cuboid(plazaW / 2 + 40, 3, plazaD / 2 + 40), { x: 0, y: -3, z: (PLAZA.minZ + PLAZA.maxZ) / 2 + 30 })

  // --- Grey stepped terraces + stage (one merged mesh) ---
  const greyGeos = []
  const solid = (x0, x1, y0, y1, z0, z1) => {
    greyGeos.push(legoBoxGeo(x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    addFixed(RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 })
  }
  const S = STUD
  // west terrace (slingshots), rising toward the west
  solid(-48, -23, 0, S, -34.5, -4.5)
  solid(-48, -31.5, S, 2 * S, -34.5, -4.5)
  solid(-48, -37.5, 2 * S, 3 * S, -34.5, -4.5)
  // east terrace (training tables), rising toward the east
  solid(20, 48, 0, S, -33, 16.5)
  solid(32, 48, S, 2 * S, -33, 16.5)
  solid(35, 48, 2 * S, 3 * S, -33, 16.5)
  // leaderboard stage with stairs in the middle
  solid(-27, 27, 0, 2 * S, 41, 50.5)
  solid(-4.5, 4.5, 0, S, 37.5, 39.25)
  solid(-4.5, 4.5, S, 2 * S, 39.25, 41)
  solid(-27, 27, 2 * S, 3 * S, 47.5, 50.5) // back ledge the boards stand on
  root.add(mergedMesh(greyGeos, legoMat(COLORS.grey)))

  // --- Flying zone strip: yellow checker plate, its north face drops into the slime ---
  const fz = FLY_ZONE
  const zoneGeo = legoBoxGeo(fz.maxX - fz.minX, 6.04, fz.maxZ - fz.minZ, 0, -3, (fz.minZ + fz.maxZ) / 2)
  const zone = new Mesh(zoneGeo, legoMat('#ffffff', { checker: [COLORS.yellowA, COLORS.yellowB] }))
  zone.receiveShadow = true
  root.add(zone)
  root.add(flyingZoneDecal())
  root.add(chevrons())

  // --- Cliffs around the plaza and the banks of the slime river ---
  const cliffGeos = []
  const treeSpots = []
  const lobbyTiers = [
    { off: 0, jitter: 1.5, h: 3.75 },
    { off: 6, jitter: 3, h: 7.5 },
    { off: 13, jitter: 3, h: 11.25 },
    { off: 21, jitter: 4, h: 15.75 },
  ]
  terraceRun({ along: 'z', from: PLAZA.minZ, to: PLAZA.maxZ + 30, edge: PLAZA.minX, outward: -1, seg: 6, tiers: lobbyTiers, rand, geos: cliffGeos, colliders: true, trees: treeSpots, treeEvery: 0.35 })
  terraceRun({ along: 'z', from: PLAZA.minZ, to: PLAZA.maxZ + 30, edge: PLAZA.maxX, outward: 1, seg: 6, tiers: lobbyTiers, rand, geos: cliffGeos, colliders: true, trees: treeSpots, treeEvery: 0.35 })
  terraceRun({ along: 'x', from: PLAZA.minX, to: PLAZA.maxX, edge: PLAZA.maxZ, outward: 1, seg: 6, tiers: lobbyTiers, rand, geos: cliffGeos, colliders: true, trees: treeSpots, treeEvery: 0.35 })
  // the two corners in the north where the plaza is wider than the river
  for (const side of [-1, 1]) {
    const x0 = side * CHANNEL.halfWidth
    const x1 = side * PLAZA.maxX
    addFixed(RAPIER.ColliderDesc.cuboid(Math.abs(x1 - x0) / 2, 3, 0.5), { x: (x0 + x1) / 2, y: 3, z: PLAZA.minZ - 0.5 })
  }
  const bankTiers = [
    { off: 0, jitter: 0, h: 1.5, base: -7 },
    { off: 6, jitter: 4.5, h: 6, base: -7 },
    { off: 16, jitter: 6, h: 10.5, base: -7 },
    { off: 28, jitter: 6, h: 15, base: -7 },
  ]
  // The banks change colour region by region (RIVER_REGIONS); the first region (Meadow)
  // shares the lobby's cliffs and trees, every later one gets its own cliff + tree meshes.
  const bankEnd = PLAZA.minZ - CHANNEL.length
  const regionTrees = []
  RIVER_REGIONS.forEach((r, i) => {
    const from = Math.max(bankEnd, PLAZA.minZ - (RIVER_REGIONS[i + 1]?.at ?? CHANNEL.length))
    const to = PLAZA.minZ - r.at
    const geos = i === 0 ? cliffGeos : []
    const trees = i === 0 ? treeSpots : []
    for (const side of [-1, 1]) {
      const edge = side * CHANNEL.halfWidth
      terraceRun({ along: 'z', from, to, edge, outward: side, seg: 12, tiers: bankTiers, rand, geos, colliders: false, trees, treeEvery: 0.28 })
    }
    if (i === 0) return
    const mat = legoMat('#ffffff', { cliff: { a: r.cliff[0], b: r.cliff[1], grass: r.grass, top: r.top } })
    root.add(mergedMesh(geos, mat, { cast: false }))
    regionTrees.push({ r, trees })
  })
  const cliffMat = legoMat('#ffffff', { cliff: { a: COLORS.cliffA, b: COLORS.cliffB, grass: COLORS.grass, top: [COLORS.greenA, COLORS.greenB] } })
  const cliffs = mergedMesh(cliffGeos, cliffMat, { cast: false })
  root.add(cliffs)
  // walls so nobody leaves the plaza
  addFixed(RAPIER.ColliderDesc.cuboid(2, 20, plazaD), { x: PLAZA.minX - 1.5, y: 10, z: 0 })
  addFixed(RAPIER.ColliderDesc.cuboid(2, 20, plazaD), { x: PLAZA.maxX + 1.5, y: 10, z: 0 })
  addFixed(RAPIER.ColliderDesc.cuboid(plazaW, 20, 2), { x: 0, y: 10, z: PLAZA.maxZ + 1.5 })

  // --- Voxel trees ---
  const trunkGeos = []
  const leafGeos = []
  treeSpots.forEach(([x, y, z], i) => {
    const t = voxelTree(x, y, z, 900 + i, 0.9 + rand() * 0.5)
    trunkGeos.push(...t.trunk)
    leafGeos.push(...t.leaves)
  })
  root.add(mergedMesh(trunkGeos, legoMat('#6b3f1d', { roughness: 0.8 }), { cast: true }))
  root.add(mergedMesh(leafGeos, legoMat('#3cc21f', { roughness: 0.6 }), { cast: true }))
  regionTrees.forEach(({ r, trees }, k) => {
    if (!trees.length) return
    const tg = []
    const lg = []
    trees.forEach(([x, y, z], i) => {
      const t = voxelTree(x, y, z, 5000 + k * 300 + i, 0.9 + rand() * 0.5)
      tg.push(...t.trunk)
      lg.push(...t.leaves)
    })
    root.add(mergedMesh(tg, legoMat(r.trunk, { roughness: 0.8 }), { cast: false }))
    root.add(mergedMesh(lg, legoMat(r.leaves, { roughness: 0.6 }), { cast: false }))
  })

  // --- Little red flowers, stone piles and blue puddles ---
  const flowerGeos = []
  const flowerCenters = []
  for (let i = 0; i < 70; i++) {
    let x, z, y
    if (i < 30) {
      const spot = treeSpots[Math.floor(rand() * treeSpots.length)]
      x = spot[0] + (rand() - 0.5) * 6
      z = spot[2] + (rand() - 0.5) * 6
      y = spot[1]
    } else {
      x = PLAZA.minX + 2 + rand() * (plazaW - 4)
      z = PLAZA.minZ + 10 + rand() * (plazaD - 14)
      y = 0
      if (Math.abs(x) < 6 || (x < -22 && z < -2) || (x > 19 && z < 18) || z > 37) continue
    }
    const r = rand() < 0.5
    flowerGeos.push(legoBoxGeo(r ? 1.1 : 0.55, 0.22, r ? 0.55 : 1.1, x, y + 0.11, z))
    flowerCenters.push(legoBoxGeo(0.3, 0.26, 0.3, x, y + 0.13, z))
  }
  root.add(mergedMesh(flowerGeos, legoMat('#ff2b2b'), { cast: false }))
  root.add(mergedMesh(flowerCenters, legoMat('#ffd21f'), { cast: false }))

  const stoneGeos = []
  const pile = (x, z, n, s = 1) => {
    for (let i = 0; i < n; i++) {
      const w = (2 + rand() * 1.5) * s
      const d = (1.5 + rand()) * s
      const lvl = Math.floor(i / 2)
      stoneGeos.push(legoBoxGeo(w, S * 1.5, d, x + (rand() - 0.5) * 1.5 * s, S * 0.75 + lvl * S * 1.5, z + (rand() - 0.5) * 1.5 * s))
    }
    addFixed(RAPIER.ColliderDesc.cuboid(1.6 * s, S * 1.5 * Math.ceil(n / 2) / 2, 1.3 * s), { x, y: (S * 1.5 * Math.ceil(n / 2)) / 2, z })
  }
  pile(-31, 47, 5)
  pile(31, 46, 4)
  pile(-44, -36.5, 4, 0.9)
  pile(45, -35.5, 5, 0.9)
  pile(-46, 6, 3, 0.8)
  root.add(mergedMesh(stoneGeos, legoMat('#9aa1aa')))

  const waterGeos = []
  for (const [x, z, w, d] of [[-37, 51, 7, 3], [-41, 49, 3, 4], [36, 51, 8, 3], [41, 49, 4, 3]]) waterGeos.push(legoBoxGeo(w, 0.18, d, x, 0.09, z))
  root.add(mergedMesh(waterGeos, legoMat('#36b6ff', { roughness: 0.15, emissive: '#0a5fbf', emissiveIntensity: 0.25 }), { cast: false }))

  return root
}

// "FLYING ZONE" + blue arrow badges painted on a transparent decal over the strip.
function flyingZoneDecal() {
  const fz = FLY_ZONE
  const W = 2048
  const H = Math.round((W * (fz.maxZ - fz.minZ)) / (fz.maxX - fz.minX))
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  const draw = () => {
    g.clearRect(0, 0, W, H)
    const badge = (cx) => {
      g.save()
      g.translate(cx, H / 2)
      g.fillStyle = '#1e8fff'
      g.strokeStyle = '#ffffff'
      g.lineWidth = 10
      g.beginPath()
      g.moveTo(-95, -60)
      g.lineTo(80, -60)
      g.lineTo(110, 0)
      g.lineTo(80, 60)
      g.lineTo(-95, 60)
      g.lineTo(-70, 0)
      g.closePath()
      g.fill()
      g.fillStyle = '#ffffff'
      g.beginPath()
      g.moveTo(-10, -38)
      g.lineTo(40, 18)
      g.lineTo(10, 18)
      g.lineTo(-10, -4)
      g.lineTo(-30, 18)
      g.lineTo(-60, 18)
      g.closePath()
      g.fill()
      g.fillRect(-28, 22, 36, 12)
      g.restore()
    }
    badge(170)
    badge(W - 170)
    g.font = `800 ${Math.round(H * 0.62)}px Fredoka, "Arial Black", sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineJoin = 'round'
    g.lineWidth = 26
    g.strokeStyle = '#3a3f4a'
    g.strokeText('FLYING ZONE', W / 2, H / 2 + 6)
    g.fillStyle = '#ffffff'
    g.fillText('FLYING ZONE', W / 2, H / 2 + 6)
  }
  draw()
  document.fonts?.load('800 96px Fredoka').then(() => {
    draw()
    tex.needsUpdate = true
  })
  const tex = canvasTex(c)
  const m = new Mesh(
    new PlaneGeometry(fz.maxX - fz.minX - 4, fz.maxZ - fz.minZ - 0.8),
    new MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  )
  m.rotation.x = -Math.PI / 2
  m.position.set(0, 0.05, (fz.minZ + fz.maxZ) / 2)
  m.receiveShadow = true
  m.renderOrder = 2
  return m
}

// Dark rounded chevrons on the main path, all pointing north at the flying zone.
function chevrons() {
  const s = new Shape()
  const w = 3.4
  const t = 1.1
  s.moveTo(-w, -0.2)
  s.lineTo(0, -w * 0.62)
  s.lineTo(w, -0.2)
  s.lineTo(w, t - 0.2)
  s.lineTo(0, -w * 0.62 + t)
  s.lineTo(-w, t - 0.2)
  s.closePath()
  const geo = new ExtrudeGeometry(s, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.18, bevelSegments: 2 })
  geo.rotateX(-Math.PI / 2) // shape y -> -z (north)
  const mat = new MeshStandardMaterial({ color: '#474c55', roughness: 0.6 })
  const group = new Group()
  for (const z of [17, -8, -14, -20, -26, -32]) {
    const m = new Mesh(geo, mat)
    m.position.set(0, 0.0, z)
    m.receiveShadow = true
    group.add(m)
  }
  return group
}

// --- Sky decorations, the slime river, distance signs --------------------------------
function makeClouds() {
  const rand = mulberry32(2024)
  const geo = new IcosahedronGeometry(1, 3)
  const mat = new MeshLambertMaterial({ color: '#ffffff', emissive: '#dcebff', emissiveIntensity: 0.62, fog: false })
  const group = new Group()
  for (let i = 0; i < 26; i++) {
    const ang = rand() * Math.PI * 2
    const dist = 260 + rand() * 200
    const cloud = new Group()
    const puffs = 5 + Math.floor(rand() * 4)
    const len = 22 + rand() * 26
    for (let p = 0; p < puffs; p++) {
      const t = p / (puffs - 1) - 0.5
      const r = (1 - Math.abs(t) * 1.1) * (9 + rand() * 6)
      const puff = new Mesh(geo, mat)
      puff.scale.set(r, r * 0.82, r)
      puff.position.set(t * len, r * 0.25 + rand() * 3, (rand() - 0.5) * 8)
      cloud.add(puff)
    }
    cloud.position.set(Math.cos(ang) * dist, 60 + rand() * 80, Math.sin(ang) * dist)
    cloud.lookAt(0, cloud.position.y, 0)
    group.add(cloud)
  }
  return group
}

const slimeHead = /* glsl */ `
uniform float slimeTime;
uniform vec3 slimeLight;
varying vec3 vSlimePos;
float sHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash(i), sHash(i + vec2(1, 0)), u.x), mix(sHash(i + vec2(0, 1)), sHash(i + vec2(1, 1)), u.x), u.y);
}
`
export function createWorld(scene) {
  scene.add(makeClouds())

  // Slime: glossy lime surface with drifting lighter blobs, a slow swell and soft glow.
  const length = CHANNEL.length + 120
  const slimeGeo = new PlaneGeometry(CHANNEL.halfWidth * 2 + 4, length, 24, 400).rotateX(-Math.PI / 2).translate(0, CHANNEL.slimeY, PLAZA.minZ - length / 2)
  const uniforms = { slimeTime: { value: 0 }, slimeLight: { value: new Color(COLORS.slimeLight) } }
  const slimeMat = new MeshStandardMaterial({ color: COLORS.slime, roughness: 0.12, metalness: 0, emissive: '#1d8a12', emissiveIntensity: 0.35 })
  slimeMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float slimeTime;\nvarying vec3 vSlimePos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n vec4 sw = modelMatrix * vec4(transformed, 1.0);\n transformed.y += sin(sw.z * 0.09 + slimeTime * 1.3) * 0.12 + sin(sw.x * 0.21 + slimeTime * 0.9) * 0.08;\n vSlimePos = sw.xyz;`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${slimeHead}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec2 sp = vSlimePos.xz * 0.12 + vec2(0.0, slimeTime * 0.25);
        float n = sNoise(sp) * 0.6 + sNoise(sp * 2.3 + 7.0) * 0.4;
        float blob = smoothstep(0.62, 0.7, n);
        float shine = smoothstep(0.82, 0.88, sNoise(vSlimePos.xz * 0.35 + vec2(slimeTime * 0.4, 0.0)));
        diffuseColor.rgb = mix(diffuseColor.rgb, slimeLight, blob * 0.55 + shine * 0.6);`,
      )
  }
  const slime = new Mesh(slimeGeo, slimeMat)
  slime.receiveShadow = true
  scene.add(slime)

  // Floating slime bubbles: pale green flattened domes recycled around the camera.
  const BUBBLES = 140
  const bubbleMat = new MeshStandardMaterial({ color: '#c9ff9f', roughness: 0.1, emissive: '#4fbf2a', emissiveIntensity: 0.25, transparent: true, opacity: 0.85 })
  const bubbles = new InstancedMesh(new SphereGeometry(1, 14, 8), bubbleMat, BUBBLES)
  bubbles.instanceMatrix.setUsage(DynamicDrawUsage)
  const bubbleState = []
  const rand = mulberry32(55)
  for (let i = 0; i < BUBBLES; i++) bubbleState.push({ x: (rand() - 0.5) * CHANNEL.halfWidth * 1.9, z: PLAZA.minZ - rand() * 400, s: 0.4 + rand() * 1.4, ph: rand() * 6.28, sp: 0.4 + rand() * 0.8 })
  scene.add(bubbles)
  const tmp = new Object3D()

  // Distance signs over the left bank every 250 m, and the snowy end of the river.
  const signs = new Group()
  for (let d = 250; d <= CHANNEL.length; d += 250) {
    const s = label(`${d.toLocaleString()}m`, 7, { color: '#ffffff', outline: '#1d6b12' })
    s.position.set(-CHANNEL.halfWidth - 4, 12, PLAZA.minZ - d)
    signs.add(s)
  }
  scene.add(signs)
  const endZ = PLAZA.minZ - CHANNEL.length
  const snowGeos = [legoBoxGeo(CHANNEL.halfWidth * 2 + 160, 30, 60, 0, 6, endZ - 30), legoBoxGeo(50, 12, 20, 0, 27, endZ - 40)]
  scene.add(mergedMesh(snowGeos, legoMat('#f4fbff', { roughness: 0.4 }), { cast: false }))
  const snowSign = label('World 2 Soon!', 40, { colors: ['#ffd23a'], outline: '#ffffff', outlineWidth: 18 }) // the river's end (Snow is now a region near the start)
  snowSign.material.fog = false
  snowSign.position.set(0, 70, endZ - 20)
  scene.add(snowSign)
  // a blocky snowman next to the sign
  const snowman = new Group()
  const white = new MeshLambertMaterial({ color: '#ffffff', fog: false })
  for (const [r, y] of [[9, 9], [6.5, 22], [4.5, 32]]) {
    const b = new Mesh(new BoxGeometry(r * 2, r * 1.6, r * 2), white)
    b.position.y = y
    snowman.add(b)
  }
  const hat = new Mesh(new BoxGeometry(6, 5, 6), new MeshLambertMaterial({ color: '#d42b2b', fog: false }))
  hat.position.y = 38
  snowman.add(hat)
  snowman.position.set(50, 20, endZ - 26)
  scene.add(snowman)

  return {
    update(dt, elapsed, camera) {
      uniforms.slimeTime.value = elapsed
      const cz = camera.position.z
      for (let i = 0; i < BUBBLES; i++) {
        const b = bubbleState[i]
        // keep bubbles within a moving window around the camera (river only)
        if (b.z > cz + 60) b.z -= 400
        if (b.z < cz - 340) b.z += 400
        if (b.z > PLAZA.minZ - 2) b.z -= 400
        const pulse = 0.6 + 0.4 * Math.sin(elapsed * b.sp + b.ph)
        tmp.position.set(b.x, CHANNEL.slimeY + 0.05, b.z)
        tmp.scale.set(b.s * (1 + pulse * 0.3), b.s * 0.22 * pulse, b.s * 0.7 * (1 + pulse * 0.3))
        tmp.updateMatrix()
        bubbles.setMatrixAt(i, tmp.matrix)
      }
      bubbles.instanceMatrix.needsUpdate = true
    },
  }
}

