import * as THREE from 'three'
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js'

/* Icon-style shapes, each facing the camera so they read clearly.
   Every shape is built from simple primitives and sampled into surface points. */

const MAT = new THREE.MeshBasicMaterial()
const mesh = (geo, pos = [0, 0, 0], rot = [0, 0, 0]) => {
  const m = new THREE.Mesh(geo, MAT)
  m.position.set(...pos)
  m.rotation.set(...rot)
  return m
}
const box = (w, h, d, pos, rot) => mesh(new THREE.BoxGeometry(w, h, d), pos, rot)
const cyl = (rt, rb, h, pos, rot, seg = 32, open = false) =>
  mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), pos, rot)
const sph = (r, pos) => mesh(new THREE.SphereGeometry(r, 24, 24), pos)
const torus = (R, t, pos, rot, arc = Math.PI * 2) =>
  mesh(new THREE.TorusGeometry(R, t, 12, 90, arc), pos, rot)
const tube = (pts, r) =>
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 40, r, 8))
const link = (a, b, r = 0.05) => {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b)
  const len = A.distanceTo(B)
  const m = mesh(new THREE.CylinderGeometry(r, r, len, 10))
  m.position.copy(A).add(B).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize())
  return m
}
const group = (parts, rot = [0, 0, 0]) => {
  const g = new THREE.Group()
  parts.forEach((p) => g.add(p))
  g.rotation.set(...rot)
  g.updateMatrixWorld(true)
  return g
}

/* 1 LedgerLogic: rising bars + coin */
const ledger = () => group([
  box(0.55, 0.9, 0.4, [-1.5, -0.95, 0]),
  box(0.55, 1.5, 0.4, [-0.75, -0.65, 0]),
  box(0.55, 2.1, 0.4, [0, -0.35, 0]),
  box(0.55, 2.8, 0.4, [0.75, 0, 0]),
  box(3.6, 0.12, 0.4, [-0.3, -1.46, 0]),
  cyl(0.7, 0.7, 0.18, [1.75, 1.2, 0], [Math.PI / 2, 0, 0], 40),
  torus(0.45, 0.04, [1.75, 1.2, 0.1]),
])

/* 2 DesignForge: pencil */
const design = () => group([
  cyl(0.42, 0.42, 2.6, [0, 0.3, 0], [0, 0, 0], 6),
  cyl(0.42, 0.0, 0.95, [0, -1.47, 0], [0, 0, 0], 6),
  cyl(0.44, 0.44, 0.22, [0, 1.75, 0], [0, 0, 0], 6),
  cyl(0.42, 0.42, 0.35, [0, 2.0, 0], [0, 0, 0], 6),
  box(0.06, 2.4, 0.9, [0, 0.3, 0]),
], [0, 0, 0.75])

/* 3 MarketPulse: megaphone with sound waves */
const market = () => group([
  cyl(1.25, 0.35, 1.9, [0.2, 0, 0], [0, 0, -Math.PI / 2], 32, true),
  cyl(0.38, 0.38, 0.9, [-1.2, 0, 0], [0, 0, Math.PI / 2], 24),
  box(0.4, 1.1, 0.35, [-0.8, -0.9, 0], [0, 0, 0.35]),
  torus(1.5, 0.05, [1.5, 0, 0], [0, 0, -Math.PI / 4], Math.PI / 2),
  torus(2.0, 0.05, [1.5, 0, 0], [0, 0, -Math.PI / 4], Math.PI / 2),
  torus(2.5, 0.05, [1.5, 0, 0], [0, 0, -Math.PI / 4], Math.PI / 2),
])

/* 4 ClientOrbit: planet with orbiting satellites */
const client = () => {
  const a = 1.9
  const sats = [0.5, 2.6, 4.7].map((ang) => sph(0.2, [Math.cos(ang) * a, Math.sin(ang) * a * 0.4, 0]))
  return group([
    sph(0.85, [0, 0, 0]),
    ...sats,
    torus(a, 0.03, [0, 0, 0], [Math.PI / 2.6, 0, 0]),
  ], [0, 0, 0.35])
}

/* 5 PeopleGrid: three people */
const people = () => group([
  sph(0.42, [0, 0.95, 0.3]),
  mesh(new THREE.CapsuleGeometry(0.5, 0.9, 6, 16), [0, -0.35, 0.3]),
  sph(0.32, [-1.5, 0.55, 0]),
  mesh(new THREE.CapsuleGeometry(0.38, 0.6, 6, 16), [-1.5, -0.55, 0]),
  sph(0.32, [1.5, 0.55, 0]),
  mesh(new THREE.CapsuleGeometry(0.38, 0.6, 6, 16), [1.5, -0.55, 0]),
])

/* 6 OpsPilot: gear */
const ops = () => {
  const teeth = []
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2
    teeth.push(box(0.45, 0.6, 0.55, [Math.cos(ang) * 1.75, Math.sin(ang) * 1.75, 0], [0, 0, ang - Math.PI / 2]))
  }
  return group([
    torus(1.35, 0.4, [0, 0, 0]),
    ...teeth,
    cyl(0.45, 0.45, 0.55, [0, 0, 0], [Math.PI / 2, 0, 0]),
  ])
}

/* 7 RiskRadar: warning triangle */
const risk = () => {
  const V = [[0, 1.75, 0], [-2, -1.4, 0], [2, -1.4, 0]]
  const edges = [[0, 1], [1, 2], [2, 0]].map(([i, j]) => link(V[i], V[j], 0.14))
  const corners = V.map((v) => sph(0.2, v))
  return group([
    ...edges, ...corners,
    box(0.28, 1.1, 0.3, [0, 0.2, 0]),
    sph(0.19, [0, -0.7, 0]),
  ])
}

/* 8 SimuPath: branching decision path */
const simu = () => {
  const n = { s: [-1.9, 0, 0], b: [-0.4, 0, 0], u: [1.3, 1.2, 0], m: [1.3, 0, 0], d: [1.3, -1.2, 0] }
  return group([
    sph(0.28, n.s), sph(0.28, n.b), sph(0.28, n.u), sph(0.28, n.m), sph(0.28, n.d),
    sph(0.55, [2.1, 1.2, 0]),
    link(n.s, n.b), link(n.b, n.u), link(n.b, n.m), link(n.b, n.d),
    link(n.u, [2.1, 1.2, 0]),
  ])
}

/* 9 SupportSync: chat bubbles */
const support = () => group([
  box(3.2, 1.9, 0.35, [0, 0.35, 0]),
  mesh(new THREE.ConeGeometry(0.45, 0.8, 4), [-0.9, -1.0, 0], [0, 0, Math.PI]),
  sph(0.18, [-0.8, 0.35, 0.3]),
  sph(0.18, [0, 0.35, 0.3]),
  sph(0.18, [0.8, 0.35, 0.3]),
])

/* 10 VendorBridge: suspension bridge */
const vendor = () => {
  const z = [0.35, -0.35]
  const parts = [box(4.6, 0.16, 0.9, [0, -0.7, 0])]
  z.forEach((zz) => {
    parts.push(box(0.2, 2.2, 0.2, [-1.2, 0.3, zz]), box(0.2, 2.2, 0.2, [1.2, 0.3, zz]))
    parts.push(tube([[-2.3, -0.65, zz], [-1.2, 1.35, zz], [0, 0.1, zz]], 0.05))
    parts.push(tube([[0, 0.1, zz], [1.2, 1.35, zz], [2.3, -0.65, zz]], 0.05))
    for (const x of [-1.8, -0.6, 0.6, 1.8]) parts.push(link([x, -0.65, zz], [x, x < 0 ? 0.55 : 0.55, zz], 0.025))
  })
  return group(parts)
}

export const BUILDERS = { ledger, design, market, client, people, ops, risk, simu, support, vendor }

export function starfield(count) {
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

export function samplePoints(root, count) {
  const meshes = []
  root.traverse((o) => o.isMesh && meshes.push(o))
  const areas = meshes.map((m) => {
    m.geometry.computeBoundingBox()
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry
    const p = g.attributes.position
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
    const s = new THREE.Vector3().setFromMatrixScale(m.matrixWorld)
    let total = 0
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2)
      total += b.sub(a).cross(c.sub(a)).length() * 0.5
    }
    return total * s.x * s.y
  })
  const sum = areas.reduce((x, y) => x + y, 0)
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
  // centre the shape around the origin so it sits where the page expects it
  const box3 = new THREE.Box3()
  for (let i = 0; i < count; i++) box3.expandByPoint(v.set(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]))
  const c = box3.getCenter(new THREE.Vector3())
  const size = box3.getSize(new THREE.Vector3())
  const k = 3.6 / Math.max(size.x, size.y)
  for (let i = 0; i < count; i++) {
    out[i * 3] = (out[i * 3] - c.x) * k
    out[i * 3 + 1] = (out[i * 3 + 1] - c.y) * k
    out[i * 3 + 2] = (out[i * 3 + 2] - c.z) * k
  }
  return out
}
