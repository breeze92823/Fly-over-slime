import { Group, Mesh, MeshStandardMaterial, OctahedronGeometry } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CHANNEL, PLAZA, RIVER_REGIONS } from './config.js'
import { legoBoxGeo, legoMat, mergedMesh } from './legokit.js'
import { label } from './propkit.js'
import { mulberry32 } from './textures.js'

// Region dressing along the slime river: a gate at the start of every region
// after the first (two lego pillars on the banks, a beam across the river and the
// region's name floating above it, like the reference's big "Snow" sign), plus
// blocky snowmen on the snowy banks and glowing crystal clusters in the cosmic,
// lava and galaxy stretches. Static; one merged mesh per material.

export function buildRiver(scene) {
  const root = new Group()
  root.name = 'river-regions'
  scene.add(root)
  const rand = mulberry32(4242)
  const W = CHANNEL.halfWidth
  const gateH = 19

  RIVER_REGIONS.forEach((r, i) => {
    if (i === 0) return
    const z = PLAZA.minZ - r.at
    const geos = []
    const trims = []
    for (const side of [-1, 1]) {
      const x = side * (W + 1.5)
      geos.push(legoBoxGeo(3, gateH + 7, 3, x, (gateH - 7) / 2, z)) // from below the slime up
      trims.push(legoBoxGeo(3.8, 1.2, 3.8, x, gateH + 0.1, z), legoBoxGeo(3.8, 1.2, 3.8, x, 4, z))
    }
    geos.push(legoBoxGeo(W * 2 + 6, 1.8, 2.2, 0, gateH + 1.5, z))
    root.add(mergedMesh(geos, legoMat(r.cliff[0]), { cast: false }))
    root.add(mergedMesh(trims, legoMat(r.top[0], { emissive: r.color, emissiveIntensity: 0.25 }), { cast: false }))
    const sign = label(r.name, 11, { colors: [r.color], outline: '#ffffff', outlineWidth: 20 })
    sign.position.set(0, gateH + 10, z)
    root.add(sign)
  })

  // --- Decorations on the banks ---
  const snow = []
  const hats = []
  const crystals = { cosmic: [], lava: [], galaxy: [] }
  RIVER_REGIONS.forEach((r, i) => {
    if (!r.deco) return
    const z0 = PLAZA.minZ - r.at
    const z1 = PLAZA.minZ - (RIVER_REGIONS[i + 1]?.at ?? CHANNEL.length)
    const n = Math.round((z0 - z1) / 28)
    for (let k = 0; k < n; k++) {
      const side = rand() < 0.5 ? -1 : 1
      const z = z0 - 10 - rand() * (z0 - z1 - 20)
      // on the 3rd / 4th terrace step of the bank (see world.js bankTiers)
      const far = rand() < 0.5
      const x = side * (W + (far ? 31 + rand() * 8 : 18 + rand() * 6))
      const y = far ? 15 : 10.5
      if (r.deco === 'snowman') {
        const s = 0.8 + rand() * 0.6
        snow.push(legoBoxGeo(3.2 * s, 2.6 * s, 3.2 * s, x, y + 1.3 * s, z), legoBoxGeo(2.4 * s, 2 * s, 2.4 * s, x, y + 3.6 * s, z), legoBoxGeo(1.7 * s, 1.6 * s, 1.7 * s, x, y + 5.4 * s, z))
        hats.push(legoBoxGeo(1.4 * s, 1.1 * s, 1.4 * s, x, y + 6.7 * s, z), legoBoxGeo(2.1 * s, 0.25 * s, 2.1 * s, x, y + 6.25 * s, z))
      } else {
        const list = r.name === 'Lava Lands' ? crystals.lava : r.name === 'Galaxy' ? crystals.galaxy : crystals.cosmic
        const c = 2 + Math.floor(rand() * 3)
        for (let q = 0; q < c; q++) {
          const s = 1 + rand() * 1.6
          const g = new OctahedronGeometry(1, 0).scale(s * 0.7, s * 2, s * 0.7)
          g.rotateZ((rand() - 0.5) * 0.7)
          g.rotateX((rand() - 0.5) * 0.5)
          g.translate(x + (rand() - 0.5) * 3, y + s * 1.6, z + (rand() - 0.5) * 3)
          list.push(g)
        }
      }
    }
  })
  if (snow.length) {
    root.add(mergedMesh(snow, legoMat('#ffffff', { roughness: 0.4 }), { cast: false }))
    root.add(mergedMesh(hats, legoMat('#22252e'), { cast: false }))
  }
  const crystalColors = { cosmic: '#8fd8ff', lava: '#ff7a1f', galaxy: '#d68cff' }
  for (const [k, list] of Object.entries(crystals)) {
    if (!list.length) continue
    const geo = mergeGeometries(list, false)
    for (const g of list) g.dispose()
    const m = new Mesh(geo, new MeshStandardMaterial({ color: crystalColors[k], emissive: crystalColors[k], emissiveIntensity: 0.6, roughness: 0.15, flatShading: true }))
    root.add(m)
  }
  return root
}
