import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { STUD, CHECKER } from './config.js'
import { mulberry32 } from './textures.js'

// Lego-plastic look shared by the whole lobby. Every lego material is a
// MeshStandardMaterial patched in onBeforeCompile:
//  - top faces (world normal up) get a stud tile sampled in WORLD x/z, so studs
//    line up across every box, plate and path without any UV work;
//  - side faces get thin horizontal plate seams;
//  - optional `checker`: two-tone squares in world space (the lime grass);
//  - optional `cliff`: side faces become a two-brown checker with blocky green
//    grass drips hanging from the top edge (per-vertex `aTop` = top y of the box).

// --- Stud tile -------------------------------------------------------------------
function paintStudTile(size = 64) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  g.fillStyle = 'rgb(236,236,236)'
  g.fillRect(0, 0, size, size)
  // plate edge: a faint darker border so tiles read as separate studs
  g.strokeStyle = 'rgba(0,0,0,0.10)'
  g.lineWidth = 2
  g.strokeRect(1, 1, size - 2, size - 2)
  // raised square stud with rounded corners: dark outline, light top-left rim
  const s0 = size * 0.2
  const s1 = size * 0.8
  const r = size * 0.1
  const round = (x0, y0, x1, y1) => {
    g.beginPath()
    g.moveTo(x0 + r, y0)
    g.arcTo(x1, y0, x1, y1, r)
    g.arcTo(x1, y1, x0, y1, r)
    g.arcTo(x0, y1, x0, y0, r)
    g.arcTo(x0, y0, x1, y0, r)
    g.closePath()
  }
  round(s0 + 2, s0 + 3, s1 + 2, s1 + 3)
  g.fillStyle = 'rgba(0,0,0,0.22)' // drop shadow
  g.fill()
  round(s0, s0, s1, s1)
  g.fillStyle = 'rgb(250,250,250)'
  g.fill()
  g.lineWidth = size * 0.05
  g.strokeStyle = 'rgba(40,40,40,0.55)'
  g.stroke()
  round(s0 + 4, s0 + 4, s1 - 4, s1 - 4)
  g.lineWidth = 2
  g.strokeStyle = 'rgba(255,255,255,0.9)'
  g.stroke()
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.minFilter = LinearMipmapLinearFilter
  t.anisotropy = 8
  return t
}
let studTex = null
export const studTexture = () => (studTex ||= paintStudTile())

const vertexHead = /* glsl */ `
attribute float aTop;
varying vec3 vLegoPos;
varying vec3 vLegoNormal;
varying float vLegoTop;
`
const vertexBody = /* glsl */ `
  vec4 legoWorld = modelMatrix * vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    legoWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
  #endif
  vLegoPos = legoWorld.xyz;
  vLegoNormal = normalize(mat3(modelMatrix) * objectNormal);
  vLegoTop = aTop;
`
const fragHead = /* glsl */ `
uniform sampler2D studMap;
uniform float studSize;
uniform vec3 checkA;
uniform vec3 checkB;
uniform float checkSize;
uniform vec3 cliffA;
uniform vec3 cliffB;
uniform vec3 cliffGrass;
varying vec3 vLegoPos;
varying vec3 vLegoNormal;
varying float vLegoTop;
float legoHash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
`
const fragBody = /* glsl */ `
  {
    vec3 n = normalize(vLegoNormal);
    bool top = n.y > 0.6;
    #ifdef LEGO_CHECKER
      if (top) {
        vec2 cc = floor(vLegoPos.xz / checkSize);
        diffuseColor.rgb = mod(cc.x + cc.y, 2.0) < 1.0 ? checkA : checkB;
      }
    #endif
    #ifdef LEGO_CLIFF
      if (top) {
        vec2 cc = floor(vLegoPos.xz / checkSize);
        diffuseColor.rgb = mod(cc.x + cc.y, 2.0) < 1.0 ? checkA : checkB;
      } else if (n.y > -0.5) {
        float along = abs(n.x) > 0.5 ? vLegoPos.z : vLegoPos.x;
        float col = floor(along / studSize);
        float drip = studSize * (1.0 + floor(legoHash(col + floor(vLegoTop)) * 3.2));
        float depth = vLegoTop - vLegoPos.y;
        if (depth < drip) {
          diffuseColor.rgb = cliffGrass * (depth < studSize * 0.5 ? 1.05 : 0.92);
        } else {
          vec2 cc = floor(vec2(along, vLegoPos.y - vLegoTop) / (checkSize * 1.5));
          diffuseColor.rgb = mod(cc.x + cc.y, 2.0) < 1.0 ? cliffA : cliffB;
        }
      }
    #endif
    if (top) {
      vec3 s = texture2D(studMap, vLegoPos.xz / studSize).rgb;
      diffuseColor.rgb *= s * 1.04;
    } else {
      float seam = fract(vLegoPos.y / (studSize * 0.5));
      float line = smoothstep(0.0, 0.06, seam) * smoothstep(1.0, 0.94, seam);
      float along = abs(n.x) > 0.5 ? vLegoPos.z : vLegoPos.x;
      float brick = fract(along / (studSize * 2.0));
      float vline = smoothstep(0.0, 0.03, brick);
      diffuseColor.rgb *= mix(0.86, 1.0, min(line, vline));
    }
  }
`

// opts: { checker: [a, b], cliff: { a, b, grass }, roughness, emissive, ... }
export function legoMat(color = '#ffffff', opts = {}) {
  const { checker, cliff, ...rest } = opts
  const m = new MeshStandardMaterial({ color, roughness: 0.55, metalness: 0, ...rest })
  const uniforms = {
    studMap: { value: studTexture() },
    studSize: { value: STUD },
    checkA: { value: new Color(checker?.[0] ?? cliff?.top?.[0] ?? '#ffffff') },
    checkB: { value: new Color(checker?.[1] ?? cliff?.top?.[1] ?? '#ffffff') },
    checkSize: { value: CHECKER },
    cliffA: { value: new Color(cliff?.a ?? '#8a5a2b') },
    cliffB: { value: new Color(cliff?.b ?? '#6b4221') },
    cliffGrass: { value: new Color(cliff?.grass ?? '#5ad42a') },
  }
  // the colour uniforms are linear like material.color
  m.defines = { ...(m.defines || {}) }
  if (checker) m.defines.LEGO_CHECKER = ''
  if (cliff) m.defines.LEGO_CLIFF = ''
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms)
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${vertexHead}`).replace('#include <begin_vertex>', `#include <begin_vertex>\n${vertexBody}`)
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${fragHead}`).replace('#include <map_fragment>', `#include <map_fragment>\n${fragBody}`)
  }
  m.customProgramCacheKey = () => `lego-${checker ? 'c' : ''}${cliff ? 'k' : ''}`
  m.userData.legoUniforms = uniforms
  return m
}

// A box geometry carrying the aTop attribute (top y in world space after placement).
export function legoBoxGeo(w, h, d, x = 0, y = 0, z = 0) {
  const g = new BoxGeometry(w, h, d)
  g.translate(x, y, z)
  const n = g.attributes.position.count
  g.setAttribute('aTop', new Float32BufferAttribute(new Float32Array(n).fill(y + h / 2), 1))
  return g
}

// Merge many legoBoxGeo's into one mesh with one material.
export function mergedMesh(geos, material, { cast = true, receive = true } = {}) {
  const geo = mergeGeometries(geos, false)
  for (const g of geos) g.dispose()
  const m = new Mesh(geo, material)
  m.castShadow = cast
  m.receiveShadow = receive
  return m
}

// Ensures a geometry has aTop (lego shader reads it); value is irrelevant without LEGO_CLIFF.
export function withTop(g, top = 0) {
  if (!g.attributes.aTop) g.setAttribute('aTop', new Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(top), 1))
  return g
}

// --- Voxel trees --------------------------------------------------------------------
// A crooked trunk of brown blocks with a side branch, and 2-3 stacked leaf slabs.
// Returns { trunk: geos[], leaves: geos[] } in world space for merging.
export function voxelTree(x, y, z, seed, scale = 1) {
  const rand = mulberry32(seed)
  const trunk = []
  const leaves = []
  const s = scale
  const tw = 1.1 * s
  const h1 = (3 + rand() * 2) * s
  const lean = (rand() - 0.5) * 1.6 * s
  trunk.push(legoBoxGeo(tw, h1, tw, x, y + h1 / 2, z))
  const h2 = (2 + rand() * 2) * s
  const bx = x + lean
  trunk.push(legoBoxGeo(tw * 0.9, h2, tw * 0.9, bx, y + h1 + h2 / 2 - 0.2, z + lean * 0.4))
  // diagonal branch
  const dir = rand() < 0.5 ? -1 : 1
  for (let i = 0; i < 3; i++) trunk.push(legoBoxGeo(0.7 * s, 0.7 * s, 0.7 * s, x + dir * (0.6 + i * 0.55) * s, y + h1 * 0.6 + i * 0.55 * s, z))
  const top = y + h1 + h2
  const cx = bx
  const cz = z + lean * 0.4
  const w0 = (4.5 + rand() * 2) * s
  leaves.push(legoBoxGeo(w0, 1.6 * s, w0 * (0.8 + rand() * 0.3), cx, top + 0.6 * s, cz))
  const w1 = w0 * (0.62 + rand() * 0.15)
  leaves.push(legoBoxGeo(w1, 1.5 * s, w1, cx + (rand() - 0.5) * s, top + 2.1 * s, cz + (rand() - 0.5) * s))
  if (rand() < 0.6) leaves.push(legoBoxGeo(w1 * 0.55, 1.2 * s, w1 * 0.55, cx, top + 3.3 * s, cz))
  // small leaf clump on the branch tip
  leaves.push(legoBoxGeo(1.8 * s, 1.1 * s, 1.8 * s, x + dir * 2.0 * s, y + h1 * 0.6 + 1.9 * s, z))
  return { trunk, leaves }
}

// sRGB canvas texture helper for signs, decals etc.
export function canvasTex(c) {
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}
