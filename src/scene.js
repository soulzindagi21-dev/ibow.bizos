import * as THREE from 'three'
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js'

/*
 * Scroll-driven particle scene.
 *
 * Every "shape" is a procedural mesh that is sampled into the same number of
 * surface points with MeshSurfaceSampler. All shapes live on one THREE.Points
 * object as separate position attributes; the vertex shader blends between
 * the two shapes either side of the current scroll position, adding some
 * scatter mid-transition so the cloud visibly dissolves and re-forms.
 *
 * Shape 0 is a loose star field (hero), then: browser window (websites),
 * torus knot (automation), rocket (growth), globe (serving India).
 */

const COUNT = 14000
const SHAPES = 5

/* ---------- procedural geometries ---------- */

function merge(parts) {
  // Tiny merge helper: bake each mesh transform and collect as meshes in a group.
  const group = new THREE.Group()
  parts.forEach((p) => group.add(p))
  group.updateMatrixWorld(true)
  return group
}

function meshOf(geo, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial())
  m.position.set(...pos)
  m.rotation.set(...rot)
  return m
}

function buildRocket() {
  return merge([
    meshOf(new THREE.CylinderGeometry(0.55, 0.55, 2.2, 32), [0, 0, 0]),
    meshOf(new THREE.ConeGeometry(0.55, 1.1, 32), [0, 1.65, 0]),
    meshOf(new THREE.SphereGeometry(0.2, 16, 16), [0, 0.5, 0.52]),
    meshOf(new THREE.ConeGeometry(0.4, 0.9, 24), [0, -1.5, 0], [Math.PI, 0, 0]),
    meshOf(new THREE.BoxGeometry(0.08, 0.9, 0.7), [0.7, -0.75, 0], [0, 0, -0.3]),
    meshOf(new THREE.BoxGeometry(0.08, 0.9, 0.7), [-0.7, -0.75, 0], [0, 0, 0.3]),
    meshOf(new THREE.BoxGeometry(0.7, 0.9, 0.08), [0, -0.75, 0.7], [0.3, 0, 0]),
    meshOf(new THREE.BoxGeometry(0.7, 0.9, 0.08), [0, -0.75, -0.7], [-0.3, 0, 0]),
  ])
}

function buildBrowser() {
  return merge([
    meshOf(new THREE.BoxGeometry(2.8, 1.9, 0.12), [0, 0, 0]),
    meshOf(new THREE.BoxGeometry(2.8, 0.28, 0.2), [0, 0.8, 0.08]),
    meshOf(new THREE.BoxGeometry(1.1, 0.7, 0.2), [-0.7, -0.1, 0.1]),
    meshOf(new THREE.BoxGeometry(1.0, 0.18, 0.2), [0.75, 0.15, 0.1]),
    meshOf(new THREE.BoxGeometry(1.0, 0.18, 0.2), [0.75, -0.15, 0.1]),
    meshOf(new THREE.BoxGeometry(1.0, 0.18, 0.2), [0.75, -0.45, 0.1]),
  ])
}

function buildKnot() {
  return merge([meshOf(new THREE.TorusKnotGeometry(1.1, 0.34, 220, 32, 2, 3))])
}

function buildGlobe() {
  return merge([
    meshOf(new THREE.SphereGeometry(1.5, 48, 48)),
    meshOf(new THREE.TorusGeometry(2.1, 0.03, 8, 120), [0, 0, 0], [Math.PI / 2.4, 0.2, 0]),
  ])
}

function samplePoints(group, count, seedColors) {
  const meshes = []
  group.traverse((o) => o.isMesh && meshes.push(o))
  // Weight sample counts by surface area so density is even across parts.
  const areas = meshes.map((m) => {
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry
    const p = g.attributes.position
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
    let total = 0
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2)
      total += b.sub(a).cross(c.sub(a)).length() * 0.5
    }
    return total
  })
  const sum = areas.reduce((s, v) => s + v, 0)
  const out = new Float32Array(count * 3)
  const v = new THREE.Vector3()
  let w = 0
  meshes.forEach((m, mi) => {
    const n = mi === meshes.length - 1 ? count - w : Math.round((areas[mi] / sum) * count)
    const sampler = new MeshSurfaceSampler(m).build()
    for (let i = 0; i < n && w < count; i++, w++) {
      sampler.sample(v)
      v.applyMatrix4(m.matrixWorld)
      out[w * 3] = v.x; out[w * 3 + 1] = v.y; out[w * 3 + 2] = v.z
    }
  })
  return out
}

function buildStarfield(count) {
  const out = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const r = 2 + Math.random() * 5
    const th = Math.random() * Math.PI * 2
    const ph = Math.acos(2 * Math.random() - 1)
    out[i * 3] = r * Math.sin(ph) * Math.cos(th)
    out[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.7
    out[i * 3 + 2] = r * Math.cos(ph) - 1
  }
  return out
}

/* ---------- shaders ---------- */

const vertex = /* glsl */ `
  attribute vec3 p0; attribute vec3 p1; attribute vec3 p2; attribute vec3 p3; attribute vec3 p4;
  attribute float aRand;
  attribute float aTone;
  uniform float uT;          // 0 .. SHAPES-1
  uniform float uTime;
  uniform float uSize;
  uniform float uPixel;
  varying float vTone;
  varying float vAlpha;

  vec3 pick(int i) {
    if (i == 0) return p0; if (i == 1) return p1; if (i == 2) return p2; if (i == 3) return p3;
    return p4;
  }

  void main() {
    int i = int(floor(uT));
    int j = int(min(float(i + 1), ${SHAPES - 1}.0));
    float f = fract(uT);
    // each particle starts moving a little earlier/later for a ragged, organic morph
    float k = smoothstep(0.0, 1.0, clamp((f - aRand * 0.35) / 0.65, 0.0, 1.0));
    vec3 a = pick(i);
    vec3 b = pick(j);
    vec3 pos = mix(a, b, k);

    float scatter = sin(3.14159 * k) * (1.2 + aRand * 1.6);
    vec3 dir = normalize(vec3(aRand - 0.5, fract(aRand * 7.3) - 0.5, fract(aRand * 13.1) - 0.5) + 0.0001);
    pos += dir * scatter;
    // idle shimmer
    pos += 0.025 * vec3(
      sin(uTime * 0.9 + aRand * 40.0),
      cos(uTime * 0.8 + aRand * 31.0),
      sin(uTime * 0.7 + aRand * 17.0)
    );

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixel * (1.0 + aRand * 0.9) / -mv.z;
    vTone = aTone;
    // dust shape (index 0) is dimmer than the solid shapes
    float dust = (uT < 1.0) ? (1.0 - uT) : 0.0;
    vAlpha = mix(0.9, 0.35, dust);
  }
`

const fragment = /* glsl */ `
  precision mediump float;
  uniform vec3 uCyan; uniform vec3 uTeal; uniform vec3 uAmber;
  varying float vTone;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.05, d);
    vec3 col = vTone < 0.55 ? uCyan : (vTone < 0.93 ? uTeal : uAmber);
    gl_FragColor = vec4(col, soft * vAlpha);
  }
`

/* ---------- scene ---------- */

export function initScene(mount) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' })
  } catch {
    return // no WebGL: the page still works, just without the background
  }
  const count = window.innerWidth < 768 ? Math.round(COUNT * 0.55) : COUNT
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  mount.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.set(0, 0, 8)

  const shapes = [
    buildStarfield(count),
    samplePoints(buildBrowser(), count),
    samplePoints(buildKnot(), count),
    samplePoints(buildRocket(), count),
    samplePoints(buildGlobe(), count),
  ]
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  shapes.forEach((s, i) => geo.setAttribute(`p${i}`, new THREE.BufferAttribute(s, 3)))
  const rand = new Float32Array(count)
  const tone = new Float32Array(count)
  for (let i = 0; i < count; i++) { rand[i] = Math.random(); tone[i] = Math.random() }
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1))
  geo.setAttribute('aTone', new THREE.BufferAttribute(tone, 1))

  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uT: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: 26 },
      uPixel: { value: renderer.getPixelRatio() },
      uCyan: { value: new THREE.Color('#00c8ff') },
      uTeal: { value: new THREE.Color('#00e5c0') },
      uAmber: { value: new THREE.Color('#ffb347') },
    },
  })
  const points = new THREE.Points(geo, material)
  points.frustumCulled = false
  const holder = new THREE.Group()
  holder.add(points)
  scene.add(holder)

  const pointer = { x: 0, y: 0 }
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1
  }, { passive: true })

  let width = 1, height = 1
  const resize = () => {
    width = mount.clientWidth; height = mount.clientHeight
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  resize()
  window.addEventListener('resize', resize)

  // One shape per panel: map scroll position to panel index (fractional).
  const panels = [...document.querySelectorAll('.panel')]
  const target = () => {
    const vh = window.innerHeight
    const y = window.scrollY
    const idx = y / vh
    return Math.min(Math.max(idx, 0), SHAPES - 1)
  }
  let t = target()
  void panels

  let running = true, raf = 0
  const clock = new THREE.Clock()
  const tick = () => {
    if (!running) return
    raf = requestAnimationFrame(tick)
    const dt = Math.min(clock.getDelta(), 0.05)
    const elapsed = clock.elapsedTime
    t += (target() - t) * (1 - Math.exp(-dt * 4))
    material.uniforms.uT.value = t
    material.uniforms.uTime.value = reduced ? 0 : elapsed

    const desktop = width >= 900
    // Hero copy is on the left, later panels' copy is on the left too, so the form sits right.
    const tx = desktop ? 2.4 : 0
    const ty = desktop ? 0 : 1.1
    holder.position.x += (tx - holder.position.x) * (1 - Math.exp(-dt * 3))
    holder.position.y += (ty - holder.position.y) * (1 - Math.exp(-dt * 3))
    holder.scale.setScalar(desktop ? 1 : 0.7)
    if (!reduced) {
      holder.rotation.y = elapsed * 0.25 + t * 1.1 + pointer.x * 0.35
      holder.rotation.x = pointer.y * 0.2
    }
    renderer.render(scene, camera)
  }
  tick()

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { running = false; cancelAnimationFrame(raf) }
    else if (!running) { running = true; clock.getDelta(); tick() }
  })
}
