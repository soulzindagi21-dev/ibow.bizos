import { initScene } from './scene.js'
import modules from './modules.json'

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))

const sections = modules.map((m, i) => `
  <section id="${m.id}" class="panel" style="--c:${m.accent}" data-i="${i + 1}">
    <div class="copy">
      <span class="label">${String(i + 1).padStart(2, '0')} · ${esc(m.category)}</span>
      <h2>${esc(m.name)}</h2>
      <p>${esc(m.line)}</p>
      <ul class="chips">${m.capabilities.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    </div>
  </section>`).join('')

const dots = modules.map((m, i) =>
  `<a href="#${m.id}" class="dot-nav" style="--c:${m.accent}" data-i="${i + 1}" aria-label="${esc(m.name)}"><span>${esc(m.name)}</span></a>`).join('')

document.getElementById('modules').innerHTML = sections
document.getElementById('dots').innerHTML = dots
initScene(document.getElementById('scene'))

// Highlight the active module in the side nav and tint the top bar with its colour.
const dotEls = [...document.querySelectorAll('.dot-nav')]
const root = document.documentElement
const update = () => {
  const idx = Math.round(window.scrollY / window.innerHeight)
  dotEls.forEach((d) => d.classList.toggle('on', Number(d.dataset.i) === idx))
  const m = modules[idx - 1]
  root.style.setProperty('--live', m ? m.accent : '#38e1ff')
}
update()
window.addEventListener('scroll', update, { passive: true })
