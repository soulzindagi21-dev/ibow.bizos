/*
 * Keeps the 3D scene and the page copy in lockstep.
 *
 * Instead of guessing from scrollY / innerHeight (which drifts on phones where the
 * browser toolbar changes the viewport height), we measure where each panel actually
 * sits on screen. The panel whose centre is nearest the viewport centre "owns" the scene:
 *
 *   - the animation follows the scroll continuously: moving from one panel centre to the next
 *     takes the shape from fully formed, through a dissolve, to fully formed as the next shape,
 *     in step with how far you have scrolled (no dead zones, no snapping);
 *   - only a very small hold either side of a panel centre keeps the finished shape steady;
 *   - the copy fades in as its shape forms and out as it dissolves.
 */

const clamp = (x, a, b) => Math.min(Math.max(x, a), b)
const smooth = (x) => x * x * (3 - 2 * x)

export const HOLD = 0.04 // tiny hold (fraction of the gap between panel centres) so a finished shape is steady
const COPY_FULL = 0.08  // copy is fully visible while its panel centre is within this many viewport heights
const COPY_GONE = 0.55  // and fully faded by this distance (about when the dissolve is at its peak)

export const sync = { t: 0, active: 0, freeBottom: 0, pulse: 0, touring: false } // pulse/touring: set by the music tour

export function startSync(panels) {
  const copies = panels.map((p) => p.querySelector('.copy'))

  const update = () => {
    const vh = window.innerHeight
    const vc = vh / 2
    const centres = panels.map((p) => {
      const r = p.getBoundingClientRect()
      return r.top + r.height / 2
    })

    // last panel whose centre has passed the viewport centre
    let k = 0
    for (let i = 0; i < centres.length; i++) if (centres[i] <= vc) k = i
    let t = k
    if (k < centres.length - 1) {
      const frac = (vc - centres[k]) / (centres[k + 1] - centres[k])
      t = k + clamp((frac - HOLD) / (1 - 2 * HOLD), 0, 1) // linear: progress matches scroll distance
    }
    sync.t = t
    sync.active = Math.round(t)

    // Where the copy starts (px from the top of the screen) once its panel is centred. The phone
    // layout fits the shape into the space above it, so shape and text never overlap.
    const copyTop = (i) => (copies[i] ? vc - panels[i].offsetHeight / 2 + copies[i].offsetTop : vh)
    const lo = Math.floor(t), hi = Math.min(lo + 1, panels.length - 1)
    sync.freeBottom = copyTop(lo) + (copyTop(hi) - copyTop(lo)) * (t - lo)

    panels.forEach((_, i) => {
      const el = copies[i]
      if (!el) return
      const d = Math.abs(centres[i] - vc) / vh
      const s = 1 - smooth(clamp((d - COPY_FULL) / (COPY_GONE - COPY_FULL), 0, 1))
      el.style.opacity = s.toFixed(3)
      el.style.transform = `translate3d(0, ${((centres[i] > vc ? 1 : -1) * (1 - s) * 28).toFixed(1)}px, 0)`
      el.style.pointerEvents = s > 0.5 ? 'auto' : 'none'
    })
  }

  update()
  const loop = () => { update(); requestAnimationFrame(loop) }
  requestAnimationFrame(loop)
  return update
}
