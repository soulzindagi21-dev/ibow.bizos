import * as THREE from 'three'
import { BUILDERS, samplePoints, starfield } from './shapes.js'
import modules from './modules.json'

/*
 * One THREE.Points cloud. Shape 0 is a loose star field (hero); shapes 1..N are
 * the module icons. The vertex shader blends between neighbouring shapes using
 * the (smoothed) scroll position and blends the colour from one module's accent
 * to the next. Each particle moves slightly earlier/later for an organic morph.
 */

const N = modules.length + 1
const BASE = '#38e1ff'
const HERO_COLOR = new THREE.Color(BASE)

const attrs = Array.from({ length: N }, (_, i) => `attribute vec3 p${i};`).join('\n')
const picks = Array.from({ length: N }, (_, i) => `if (i == ${i}) return p${i};`).join('\n')

const vertex = /* glsl */ `
  ${attrs}
  attribute float aRand;
  uniform float uT;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixel;
  uniform vec3 uCols[${N}];
  varying vec3 vColor;
  varying float vAlpha;

  vec3 pick(int i) { ${picks} return p0; }
  vec3 col(int i) { return uCols[i]; }

  vec3 rotZ(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z); }
  vec3 rotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }

  // Per-icon idle animation, applied to each particle of the icon at rest.
  vec3 idle(int s, vec3 p, float t, float r) {
    if (s == 0) return rotY(p, t * 0.05);                                        // dust drifts
    if (s == 1) { p.y += 0.07 * sin(t * 2.2 + p.x * 3.0); return p; }            // bars ripple
    if (s == 2) { p = rotZ(p, 0.06 * sin(t * 1.6)); p.y += 0.04 * sin(t * 3.0 + p.y * 2.0); return p; } // pencil writes
    if (s == 3) { if (p.x > 0.7) p.x += 0.09 * sin(t * 4.0 - length(p.xy) * 4.0); return p; }  // sound waves pulse
    if (s == 4) { if (length(p) > 1.1) return rotY(p, t * 0.9); return p; }  // satellites orbit
    if (s == 5) { p.y += 0.06 * sin(t * 2.0 + p.x * 2.5); return p; }            // people bob
    if (s == 6) return rotZ(p, t * 0.45);                                         // gear turns
    if (s == 7) { return p * (1.0 + 0.035 * sin(t * 3.0)); }                      // warning pulses
    if (s == 8) { p.y += 0.06 * sin(t * 3.0 - p.x * 3.0); return p; }             // path flows
    if (s == 9) { p.y += 0.05 * sin(t * 1.6); p.x += 0.02 * sin(t * 1.1); return p; } // bubble floats
    p.y += (p.y > -0.2 ? 0.045 : 0.0) * sin(t * 2.0 + p.x * 2.0); return p;       // bridge cables sway
  }

  void main() {
    int i = int(floor(uT));
    int j = int(min(float(i + 1), ${N - 1}.0));
    float f = fract(uT);
    float k = smoothstep(0.0, 1.0, clamp((f - aRand * 0.3) / 0.7, 0.0, 1.0));

    vec3 pos = mix(idle(i, pick(i), uTime, aRand), idle(j, pick(j), uTime, aRand), k);
    float scatter = sin(3.14159 * k) * (0.9 + aRand * 1.5);
    vec3 dir = normalize(vec3(aRand - 0.5, fract(aRand * 7.3) - 0.5, fract(aRand * 13.1) - 0.5) + 0.0001);
    pos += dir * scatter;
    pos += 0.012 * vec3(sin(uTime * 0.9 + aRand * 40.0), cos(uTime * 0.8 + aRand * 31.0), sin(uTime * 0.7 + aRand * 17.0));

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixel * (0.8 + aRand * 0.7) / -mv.z;

    vec3 c = mix(col(i), col(j), k);
    // a small share of particles glow lighter for sparkle
    float spark = step(0.92, fract(aRand * 91.7));
    float twinkle = 0.55 + 0.45 * sin(uTime * 3.0 + aRand * 60.0);
    vColor = mix(c * 1.12, vec3(1.0), spark * twinkle * 0.7);
    float dust = (uT < 1.0) ? (1.0 - uT) : 0.0;
    vAlpha = mix(0.95, 0.45, dust);
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

export function initScene(mount) {
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

  const shapes = [starfield(count), ...modules.map((m) => samplePoints(BUILDERS[m.glyph === 'simu' ? 'simu' : m.glyph](), count))]
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  shapes.forEach((s, i) => geo.setAttribute(`p${i}`, new THREE.BufferAttribute(s, 3)))
  const rand = new Float32Array(count)
  for (let i = 0; i < count; i++) rand[i] = Math.random()
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1))

  const cols = [HERO_COLOR, ...modules.map((m) => new THREE.Color(m.accent))]
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

  // Shape index follows the panels: hero = 0, module k = k.
  const target = () => Math.min(Math.max(window.scrollY / window.innerHeight, 0), N - 1)
  let t = target()
  window.__sceneT = () => t // exposed so the page can highlight the active module

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
      // face the viewer and just sway, so every icon stays readable
      holder.rotation.y = Math.sin(elapsed * 0.6) * 0.4 + pointer.x * 0.3
      holder.rotation.x = pointer.y * 0.15
    }
    renderer.render(scene, camera)
  }
  tick()

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { running = false; cancelAnimationFrame(raf) }
    else if (!running) { running = true; clock.getDelta(); tick() }
  })
}
