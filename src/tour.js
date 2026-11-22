/*
 * Narrated auto-scroll tour.
 *
 * The soundtrack (public/tour/track.mp3, made in Suno) is a voice-over with its own music bed.
 * The cue sheet (src/tour/cues.json, from scripts/build_tour_cues.py) says when the narrator
 * starts and finishes each stop's paragraph, and where the bed's beats and downbeats fall.
 *   - each stop stays on screen for as long as its paragraph takes;
 *   - in the pause before the next paragraph the page moves on, and the next shape finishes
 *     forming on the downbeat (or beat) nearest to the moment the narrator says its name;
 *   - the audio element's clock drives the scroll, so picture and voice can't drift apart;
 *   - the particles pulse on every beat, harder on the downbeat.
 * Any wheel, touch or key press hands control back to the visitor.
 */
import cues from './tour/cues.json'
import { HOLD, sync } from './sync.js'

const LEAD = 0.1        // land this long before the narrator starts the paragraph
const ON_TIME = 0.05    // ...and always at least this long before it: the shape is whole when its name is said
const EARLY_DEPART = 0.3 // a move may start during the last syllable of the previous paragraph
const MIN_TRAVEL = 0.9  // shortest move, in seconds
const MAX_TRAVEL = 2.4  // longest move
const SETTLE = 0.35     // after landing, glide the last few pixels to rest over this long
const DOWNBEAT_REACH = 0.5 // a downbeat this close to the cue beats a closer ordinary beat

// Moves accelerate INTO the landing beat, so the shape snaps together on the hit
// (a decelerating ease would let it finish early and drift in).
const rush = (x) => x * x * x                                               // short moves
const swell = (x) => 0.5 * (1 - Math.cos((Math.PI * x) / 2)) + 0.5 * x * x // longer glides
const easeOutQuad = (x) => 1 - (1 - x) * (1 - x)

/** For each move: when it departs, when it lands (on a beat by the narrator's cue) and how it eases. */
export function planTour(c, stops) {
  const paras = c.paragraphs
  const pick = (list, lo, hi, ideal) => {
    const inWindow = list.filter((t) => t >= lo && t <= hi)
    return inWindow.length ? inWindow.reduce((a, b) => (Math.abs(b - ideal) < Math.abs(a - ideal) ? b : a)) : null
  }
  const moves = []
  for (let k = 1; k < stops; k++) {
    const prevEnd = paras[k - 1].end
    const start = paras[k].start
    const ideal = start - LEAD
    const lo = prevEnd - EARLY_DEPART + MIN_TRAVEL
    const hi = start - ON_TIME
    // prefer a downbeat if one is close to the cue, otherwise the nearest beat
    const down = pick(c.downbeats, Math.max(lo, ideal - DOWNBEAT_REACH), Math.min(hi, ideal + DOWNBEAT_REACH), ideal)
    const land = down ?? pick(c.beats, lo, hi, ideal) ?? Math.max(lo, ideal)
    let depart = Math.max(prevEnd - EARLY_DEPART, land - MAX_TRAVEL)
    if (land - depart < MIN_TRAVEL) depart = land - MIN_TRAVEL
    moves.push({
      from: k - 1, to: k, t0: depart, t1: land,
      onDownbeat: c.downbeats.includes(land), onBeat: c.beats.includes(land),
      ease: land - depart < 1.5 ? rush : swell,
    })
  }
  return { moves, end: c.duration - 0.05 }
}

export function setupTour({ audio, buttons, progress, panels }) {
  // A placeholder soundtrack keeps the tour hidden on the live site (preview with ?tour).
  if (cues.placeholder && !new URLSearchParams(location.search).has('tour')) {
    buttons.forEach((b) => { b.hidden = true })
    return null
  }
  const plan = planTour(cues, panels.length)
  const beats = cues.beats
  const downs = new Set(cues.downbeats.map((t) => t.toFixed(3)))
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
        const s = Math.min(1, (t - m.t1) / SETTLE)
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
    const v0 = audio.volume, t0 = performance.now(), len = finished ? 200 : 500
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
