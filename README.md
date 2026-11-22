# iBow Business OS

Landing page with a scroll-driven 3D particle scene (Three.js + Vite).

```bash
npm install
npm run dev     # local dev server
npm run build   # production build to dist/
```

The scene lives in `src/scene.js`: each shape is sampled into the same number of surface points, and the vertex shader blends between shapes as you scroll.

## Narrated tour

"Play tour" plays `public/tour/track.mp3`, a voice-over made in Suno (a male tech presenter
over a ~98 BPM music bed, script in `src/tour/narration.json`), and scrolls the page in time
with it:

- each module stays on screen for as long as the narrator talks about it;
- in the pause before the next paragraph the page moves on, and the next shape finishes
  forming on a beat (a downbeat where one is close) just before the narrator says its name;
- the particles pulse on the beat; any wheel, touch or key press stops the tour.

The timing lives in `src/tour/cues.json`, built from two Suno outputs for the track:

```bash
python scripts/build_tour_cues.py scripts/narration-spans.json scripts/suno-narration-analysis.json src/tour/cues.json
```

- `scripts/narration-spans.json`: each paragraph's first-word start and last-word end, from
  Suno's word alignment of the narration;
- `scripts/suno-narration-analysis.json`: Suno's audio-analysis (every beat and its bar position).

To change the script, regenerate the narration in Suno, replace `track.mp3`, update both
files from the new clip's alignment and analysis, and rebuild `cues.json`.
