import * as THREE from 'three'
import { BUILDERS, samplePoints } from './shapes.js'
import modules from './modules.json'
import logoUrl from './assets/logo.webp'

/*
 * One THREE.Points cloud with N shapes: the iBow logo (hero), the 10 module
 * icons, then the logo again (final section). The vertex shader blends between
 * neighbouring shapes using the smoothed scroll position. Logo particles carry
 * their own colour (sampled from the logo image); icon particles take the
 * module's accent colour.
 */

const N = modules.length + 2
const LAST = N - 1
const HERO_COLOR = new THREE.Color('#38e1ff')
const LOGO_WIDTH = 4.6

// shape 0 uses the built-in `position` attribute, which saves a vertex attribute slot.
const attrs = Array.from({ length: N - 1 }, (_, i) => `attribute vec3 p${i + 1};`).join('\n')
const picks = Array.from({ length: N - 1 }, (_, i) => `if (i == ${i + 1}) return p${i + 1};`).join('\n')

const vertex = /* glsl */ `
  ${attrs}
  attribute float aRand;
  attribute vec3 aLogoCol;
  uniform float uT;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixel;
  uniform vec3 uCols[${N}];
  varying vec3 vColor;
  varying float vAlpha;

  vec3 pick(int i) { ${picks} return position; }
  bool isLogo(int i) { return i == 0 || i == ${LAST}; }
  vec3 colOf(int i) { return isLogo(i) ? aLogoCol : uCols[i]; }

  vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
  vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }

  // Per-icon idle animation, applied to each particle of the icon at rest.
  vec3 idle(int s, vec3 p, float t) {
    if (s == 0 || s == ${LAST}) { p.z += 0.05 * sin(t * 1.4 + p.x * 2.0); p.y += 0.02 * sin(t * 1.1 + p.x * 1.5); return p; } // logo breathes
    if (s == 1) { p.y += 0.07 * sin(t * 2.2 + p.x * 3.0); return p; }            // bars ripple
    if (s == 2) { p = rotZ(p, 0.06 * sin(t * 1.6)); p.y += 0.04 * sin(t * 3.0 + p.y * 2.0); return p; } // pencil writes
    if (s == 3) { if (p.x > 0.7) p.x += 0.09 * sin(t * 4.0 - length(p.xy) * 4.0); return p; }  // sound waves pulse
    if (s == 4) { if (length(p) > 1.1) return rotY(p, t * 0.9); return p; }      // satellites orbit
    if (s == 5) { p.y += 0.06 * sin(t * 2.0 + p.x * 2.5); return p; }            // people bob
    if (s == 6) return rotZ(p, t * 0.45);                                         // gear turns
    if (s == 7) { return p * (1.0 + 0.035 * sin(t * 3.0)); }                      // warning pulses
    if (s == 8) { p.y += 0.06 * sin(t * 3.0 - p.x * 3.0); return p; }             // path flows
    if (s == 9) { p.y += 0.05 * sin(t * 1.6); p.x += 0.02 * sin(t * 1.1); return p; } // bubble floats
    p.y += (p.y > -0.2 ? 0.045 : 0.0) * sin(t * 2.0 + p.x * 2.0); return p;       // bridge cables sway
  }

  void main() {
    int i = int(floor(uT));
    int j = int(min(float(i + 1), ${LAST}.0));
    float f = fract(uT);
    float k = smoothstep(0.0, 1.0, clamp((f - aRand * 0.3) / 0.7, 0.0, 1.0));

    vec3 a = pick(i);
    vec3 b = pick(j);
    vec3 pos = mix(idle(i, a, uTime), idle(j, b, uTime), k);
    float scatter = sin(3.14159 * k) * (0.9 + aRand * 1.5);
    vec3 dir = normalize(vec3(aRand - 0.5, fract(aRand * 7.3) - 0.5, fract(aRand * 13.1) - 0.5) + 0.0001);
    pos += dir * scatter;
    pos += 0.012 * vec3(sin(uTime * 0.9 + aRand * 40.0), cos(uTime * 0.8 + aRand * 31.0), sin(uTime * 0.7 + aRand * 17.0));

    // how much of this particle's look is "logo" right now (0..1)
    float lw = (isLogo(i) ? 1.0 - k : 0.0) + (isLogo(j) ? k : 0.0);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixel * (0.8 + aRand * 0.7) * mix(1.0, 0.62, lw) / -mv.z;

    vec3 c = mix(colOf(i), colOf(j), k);
    float spark = step(0.92, fract(aRand * 91.7));
    float twinkle = 0.55 + 0.45 * sin(uTime * 3.0 + aRand * 60.0);
    vColor = mix(c * 1.12, vec3(1.0), spark * twinkle * 0.7);
    // light sweeps across the logo
    vColor *= 1.0 + lw * 0.35 * sin(uTime * 1.8 - pos.x * 1.6);
    vAlpha = 0.95;
  }
`

const fragment = /* glsl */ `
  precision mediump float;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor, smoothstep(0.5, 0.1, d) * vAlpha);
  }
`

/* ---------- logo sampling (image -> weighted points with colour + depth) ---------- */

async function sampleLogo(count) {
  const img = new Image()
  img.src = logoUrl
  await img.decode()
  const w = img.naturalWidth, h = img.naturalHeight
  const cv = document.createElement('canvas')
  cv.width = w; cv.height = h
  const ctx = cv.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const data = ctx.getImageData(0, 0, w, h).data

  // cumulative weight over pixels, brighter pixels get more particles
  const cum = new Float32Array(w * h)
  let total = 0
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255
    const lum = Math.max(r, g, b)
    const sat = lum - Math.min(r, g, b)
    const isText = lum > 0.8 && sat < 0.25 // white wordmark gets extra particles so thin strokes stay crisp
    total += lum > 0.3 ? Math.pow(lum, 1.8) * (isText ? 2.6 : 1) : 0
    cum[i] = total
  }
  const pos = new Float32Array(count * 3)
  const col = new Float32Array(count * 3)
  const scale = LOGO_WIDTH / w
  for (let n = 0; n < count; n++) {
    const u = Math.random() * total
    let lo = 0, hi = cum.length - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < u) lo = mid + 1; else hi = mid }
    const px = lo % w, py = (lo / w) | 0
    const r = data[lo * 4] / 255, g = data[lo * 4 + 1] / 255, b = data[lo * 4 + 2] / 255
    const lum = Math.max(r, g, b)
    pos[n * 3] = (px + Math.random() - w / 2) * scale
    pos[n * 3 + 1] = -(py + Math.random() - h / 2) * scale
    // brighter surfaces sit slightly forward; gives the ribbon relief when the logo sways
    pos[n * 3 + 2] = (lum - 0.5) * 0.4 + (Math.random() - 0.5) * 0.02
    col[n * 3] = Math.min(r * 1.25, 1); col[n * 3 + 1] = Math.min(g * 1.25, 1); col[n * 3 + 2] = Math.min(b * 1.25, 1)
  }
  return { pos, col }
}

/* ---------- scene ---------- */

export async function initScene(mount) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' })
  } catch {
    return // no WebGL: the page still works without the background
  }
  const mobile = window.innerWidth < 768
  const count = mobile ? 20000 : 42000
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  mount.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
  camera.position.set(0, 0, 8)

  let logo
  try {
    logo = await sampleLogo(count)
  } catch {
    // fall back to a soft dust ball if the image can't be read
    logo = { pos: new Float32Array(count * 3).map(() => (Math.random() - 0.5) * 5), col: new Float32Array(count * 3).fill(0.6) }
  }
  const shapes = [logo.pos, ...modules.map((m) => samplePoints(BUILDERS[m.glyph](), count)), logo.pos]

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(shapes[0], 3))
  for (let i = 1; i < N; i++) geo.setAttribute(`p${i}`, new THREE.BufferAttribute(shapes[i], 3))
  const rand = new Float32Array(count)
  for (let i = 0; i < count; i++) rand[i] = Math.random()
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1))
  geo.setAttribute('aLogoCol', new THREE.BufferAttribute(logo.col, 3))

  const cols = [HERO_COLOR, ...modules.map((m) => new THREE.Color(m.accent)), HERO_COLOR]
  const material = new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uT: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: mobile ? 16 : 14 },
      uPixel: { value: renderer.getPixelRatio() },
      uCols: { value: cols },
    },
  })
  const points = new THREE.Points(geo, material)
  points.frustumCulled = false
  const holder = new THREE.Group()
  holder.add(points)
  scene.add(holder)

  // faint ambient star dust behind everything
  const dustCount = mobile ? 1200 : 2800
  const dustPos = new Float32Array(dustCount * 3)
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 22
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 12
    dustPos[i * 3 + 2] = -Math.random() * 8 - 1
  }
  const dustGeo = new THREE.BufferGeometry()
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0x7fe9ff, size: 0.028, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending,
  }))
  scene.add(dust)

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

  // Shape index follows the panels: hero = 0, module k = k, final = 11.
  const target = () => Math.min(Math.max(window.scrollY / window.innerHeight, 0), LAST)
  let t = target()

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
    const tx = desktop ? 2.5 : 0
    const ty = desktop ? 0 : 1.2
    holder.position.x += (tx - holder.position.x) * (1 - Math.exp(-dt * 3))
    holder.position.y += (ty - holder.position.y) * (1 - Math.exp(-dt * 3))
    holder.scale.setScalar(desktop ? 1.15 : 0.8)
    if (!reduced) {
      // face the viewer and sway, so every icon stays readable and the logo shows its depth
      const lw = t < 1 ? 1 - t : Math.max(0, t - (LAST - 1)) // 1 while the logo is showing
      const amp = 0.4 - 0.24 * lw
      holder.rotation.y = Math.sin(elapsed * 0.6) * amp + pointer.x * (0.3 - 0.18 * lw)
      holder.rotation.x = pointer.y * 0.15
      dust.rotation.y = elapsed * 0.01
    }
    renderer.render(scene, camera)
  }
  tick()

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { running = false; cancelAnimationFrame(raf) }
    else if (!running) { running = true; clock.getDelta(); tick() }
  })
}
