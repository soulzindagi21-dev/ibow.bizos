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
const OUTRO_BARS = 2

// Moves accelerate INTO the landing downbeat, so the shape snaps together on the beat
// (a decelerating ease would let it finish early and drift in). After the hit, the page
// glides the last few pixels to rest.
const rush = (x) => x * x * x                                   // loud bars: sharp rush into the hit
const swell = (x) => 0.5 * (1 - Math.cos((Math.PI * x) / 2)) + 0.5 * x * x // quiet bars: gentle swell
const easeOutQuad = (x) => 1 - (1 - x) * (1 - x)

/**
 * Build the timeline: for each of the 11 moves, when it departs, when it lands (always a
 * downbeat) and how it eases.
 *
 * Landings are spread evenly over the bars between the start and the finale. If the beat map
 * has `finaleAt` (the song's outro), the closing logo lands there and the song plays out on it;
 * otherwise the tour aims for TARGET_SECONDS and fades the music after a short outro.
 * A move departs early (a two-bar glide) in the song's quieter bars and late (a one-bar rush)
 * in its louder ones, measured against the song's own median loudness.
 */
export function planTour(map, stops) {
  const db = map.downbeats
  const barDur = db.length > 1 ? (db[db.length - 1] - db[0]) / (db.length - 1) : 2
  const moves = stops - 1
  const nearestBar = (t) => db.reduce((best, d, i) => (Math.abs(d - t) < Math.abs(db[best] - t) ? i : best), 0)
  const finaleBar = map.finaleAt != null
    ? nearestBar(map.finaleAt)
    : Math.min(db.length - 1 - OUTRO_BARS, Math.round(TARGET_SECONDS / barDur) - OUTRO_BARS)

  const energy = map.barEnergy.slice(0, finaleBar)
  const median = [...energy].sort((a, b) => a - b)[Math.floor(energy.length / 2)] ?? 0.5
  const loudAt = (b) => (map.barEnergy[b] ?? median) >= median

  const out = []
  let prevLand = 0 // the hero logo is "landed" on the first downbeat
  for (let m = 0; m < moves; m++) {
    const land = Math.round(((m + 1) * finaleBar) / moves)
    const slot = Math.max(1, land - prevLand)
    const loud = loudAt(land - 1)
    const travel = Math.min(slot, Math.max(1, Math.round(slot * (loud ? 0.35 : 0.65))))
    out.push({ from: m, to: m + 1, startBar: land - travel, landBar: land, loud })
    prevLand = land
  }
  const barTime = (b) => (b < db.length ? db[b] : db[db.length - 1] + (b - db.length + 1) * barDur)
  return {
    moves: out.map((m) => ({ ...m, t0: barTime(m.startBar), t1: barTime(m.landBar), ease: m.loud ? rush : swell })),
    end: map.finaleAt != null ? map.duration - 0.05 : Math.min(barTime(finaleBar + OUTRO_BARS), map.duration),
    barDur,
    naturalEnd: map.finaleAt != null,
  }
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
    const v0 = audio.volume, t0 = performance.now(), len = finished ? (plan.naturalEnd ? 200 : 1500) : 500
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
