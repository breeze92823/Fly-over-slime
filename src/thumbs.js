import { AmbientLight, Box3, DirectionalLight, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three'

// Small offscreen renderer that turns 3D models (pets, eggs, slingshots) into
// cached PNG data URLs for the HUD windows and the hatch overlay.
let renderer = null
let scene = null
let camera = null
const cache = new Map()

function setup() {
  renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setSize(192, 192, false)
  renderer.setPixelRatio(1)
  renderer.outputColorSpace = SRGBColorSpace
  scene = new Scene()
  scene.add(new AmbientLight('#ffffff', 1.6))
  const key = new DirectionalLight('#ffffff', 2.6)
  key.position.set(2, 3, 4)
  scene.add(key)
  const rim = new DirectionalLight('#bfe4ff', 1.2)
  rim.position.set(-3, 2, -2)
  scene.add(rim)
  camera = new PerspectiveCamera(32, 1, 0.05, 100)
}

// build() -> Object3D; yaw turns the model a little toward the camera.
export function thumb(key, build, yaw = 0.5) {
  if (cache.has(key)) return cache.get(key)
  try {
    if (!renderer) setup()
    const obj = build()
    obj.rotation.y += yaw
    scene.add(obj)
    const box = new Box3().setFromObject(obj)
    const size = box.getSize(new Vector3())
    const center = box.getCenter(new Vector3())
    const r = Math.max(size.x, size.y, size.z) * 0.62
    const dist = r / Math.tan((camera.fov * Math.PI) / 360)
    camera.position.set(center.x, center.y + r * 0.35, center.z + dist)
    camera.lookAt(center)
    renderer.render(scene, camera)
    const url = renderer.domElement.toDataURL('image/png')
    scene.remove(obj)
    cache.set(key, url)
    return url
  } catch {
    return ''
  }
}
