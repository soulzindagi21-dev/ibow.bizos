/*
 * Auto-scroll tour synced to the music.
 *
 * The track's beat map (src/tour/beats.json, made by scripts/analyze_beats.py) gives the
 * downbeats and how loud each bar is. We plan the tour on that grid:
 *   - every stop (logo, 10 modules, logo) finishes forming exactly on a downbeat;
 *   - loud bars get a quick one-bar transition, quiet bars a slower glide, so the scroll
 *     speed follows the music;
 *   - the audio element's clock drives the scroll, so the picture can't drift from the sound;
 *   - the particles pulse on every beat, harder on the downbeat.
 * Any wheel, touch or key press hands control back to the visitor.
 */
import beatMap from './tour/beats.json'
import { HOLD, sync } from './sync.js'

const TARGET_SECONDS = 60
const INTRO_BARS = 1
const OUTRO_BARS = 2

// Moves accelerate INTO the landing downbeat, so the shape snaps together on the beat
// (a decelerating ease would let it finish early and drift in). After the hit, the page
// glides the last few pixels to rest.
const rush = (x) => x * x * x                                   // loud bars: sharp rush into the hit
const swell = (x) => 0.5 * (1 - Math.cos((Math.PI * x) / 2)) + 0.5 * x * x // quiet bars: gentle swell
const easeOutQuad = (x) => 1 - (1 - x) * (1 - x)

/** Build the timeline: for each of the 11 moves, when it starts, when it lands (a downbeat), how it eases. */
export function planTour(map, stops) {
  const db = map.downbeats
  const barDur = db.length > 1 ? (db[db.length - 1] - db[0]) / (db.length - 1) : 2
  const moves = stops - 1
  const perMove = Math.max(1.5, (TARGET_SECONDS / barDur - INTRO_BARS - OUTRO_BARS) / moves)
  const energy = (b) => map.barEnergy[Math.min(b, map.barEnergy.length - 1)] ?? 0.5

  const build = (squeeze) => {
    const out = []
    let bar = INTRO_BARS
    for (let m = 0; m < moves; m++) {
      const loud = energy(bar) >= 0.5
      let travel = Math.max(1, Math.round(perMove * (loud ? 0.35 : 0.6)))
      let dwell = Math.max(1, Math.floor(perMove - travel + 0.25))
      if (squeeze) { travel = 1; dwell = m % 2 ? 0 : 1 }
      out.push({ from: m, to: m + 1, startBar: bar, landBar: bar + travel, loud })
      bar += travel + dwell
    }
    return { moves: out, endBar: bar - 1 + OUTRO_BARS }
  }
  let plan = build(false)
  if (plan.endBar >= db.length) plan = build(true) // short track: tighten everything
  const barTime = (b) => (b < db.length ? db[b] : db[db.length - 1] + (b - db.length + 1) * barDur)
  const moves_ = plan.moves.map((m) => ({
    ...m,
    t0: barTime(m.startBar),
    t1: barTime(m.landBar),
    ease: m.loud ? rush : swell,
  }))
  return { moves: moves_, end: Math.min(barTime(plan.endBar), map.duration), barDur }
}

export function setupTour({ audio, buttons, progress, panels }) {
  // While the track is still the test click track, keep the tour hidden on the live site.
  // It can be previewed by adding ?tour to the URL.
  if (beatMap.placeholder && !new URLSearchParams(location.search).has('tour')) {
    buttons.forEach((b) => { b.hidden = true })
    return null
  }
  const plan = planTour(beatMap, panels.length)
  const beats = beatMap.beats
  const downs = new Set(beatMap.downbeats.map((t) => t.toFixed(3)))
  let playing = false, raf = 0, beatIdx = 0
  let lastAudioT = -1, lastPerf = 0

  const centreY = (i) => {
    const r = panels[i].getBoundingClientRect()
    return window.scrollY + r.top + r.height / 2 - window.innerHeight / 2
  }
  /*
   * Where the page should be at music time t, as (from stop, to stop, fraction of the way).
   * While moving, the fraction reaches 1 - HOLD exactly on the landing downbeat: that is the
   * moment the shape is complete (see sync.js). After landing it settles the last few pixels
   * to the exact centre over one beat, then waits for the next move.
   */
  const positionAt = (t) => {
    const mv = plan.moves
    if (t < mv[0].t0) return { from: 0, to: 1, frac: 0 }
    for (let n = 0; n < mv.length; n++) {
      const m = mv[n], next = mv[n + 1]
      if (t < m.t1) return { from: m.from, to: m.to, frac: (1 - HOLD) * m.ease((t - m.t0) / (m.t1 - m.t0)) }
      if (!next || t < next.t0) {
        const s = Math.min(1, (t - m.t1) / (plan.barDur / 4))
        return { from: m.from, to: m.to, frac: 1 - HOLD + HOLD * easeOutQuad(s) }
      }
    }
    return { from: mv.length - 1, to: mv.length, frac: 1 }
  }

  const scrollToY = (y) => window.scrollTo({ top: Math.max(0, y), behavior: 'instant' })

  // audio.currentTime updates in coarse steps in some browsers; interpolate between updates
  const clock = () => {
    const now = performance.now()
    if (audio.currentTime !== lastAudioT) { lastAudioT = audio.currentTime; lastPerf = now }
    return audio.paused ? audio.currentTime : lastAudioT + (now - lastPerf) / 1000
  }

  const setUi = (on) => {
    buttons.forEach((b) => {
      b.dataset.state = on ? 'on' : 'off'
      b.setAttribute('aria-pressed', on ? 'true' : 'false')
      b.querySelector('.tour-label').textContent = on ? 'Stop tour' : 'Play tour'
    })
    document.documentElement.classList.toggle('touring', on)
    sync.touring = on
  }

  const frame = () => {
    if (!playing) return
    raf = requestAnimationFrame(frame)
    const t = clock()

    const { from, to, frac } = positionAt(t)
    const y = centreY(from) + (centreY(to) - centreY(from)) * frac
    scrollToY(y)

    // beat pulse for the particles: strong on downbeats, light on other beats
    while (beatIdx < beats.length && beats[beatIdx] <= t) {
      sync.pulse = downs.has(beats[beatIdx].toFixed(3)) ? 1 : 0.35
      beatIdx++
    }

    if (progress) progress.style.transform = `scaleX(${Math.min(1, t / plan.end)})`
    if (t >= plan.end) stop(true)
  }

  const interrupt = (e) => {
    if (!playing) return
    if (e.type === 'keydown' && !['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Home', 'End', 'Escape'].includes(e.key)) return
    stop(false)
  }

  async function start() {
    scrollToY(centreY(0))
    audio.currentTime = 0
    audio.volume = 1
    beatIdx = 0
    try { await audio.play() } catch { return } // autoplay blocked: needs a tap, which this is
    playing = true
    setUi(true)
    raf = requestAnimationFrame(frame)
  }

  function stop(finished) {
    playing = false
    cancelAnimationFrame(raf)
    setUi(false)
    if (progress) progress.style.transform = 'scaleX(0)'
    // fade the music out rather than cutting it
    const v0 = audio.volume, t0 = performance.now(), len = finished ? 1500 : 500
    const fade = () => {
      const k = Math.min(1, (performance.now() - t0) / len)
      audio.volume = v0 * (1 - k)
      if (k < 1) requestAnimationFrame(fade)
      else { audio.pause(); audio.volume = 1 }
    }
    fade()
  }

  buttons.forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); playing ? stop(false) : start() }))
  window.addEventListener('wheel', interrupt, { passive: true })
  window.addEventListener('touchstart', interrupt, { passive: true })
  window.addEventListener('keydown', interrupt)

  return { plan }
}
