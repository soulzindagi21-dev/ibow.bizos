# iBow Business OS

Landing page with a scroll-driven 3D particle scene (Three.js + Vite).

```bash
npm install
npm run dev     # local dev server
npm run build   # production build to dist/
```

The scene lives in `src/scene.js`: each shape is sampled into the same number of surface points, and the vertex shader blends between shapes as you scroll.

## Music tour

"Play tour" plays `public/tour/track.mp3` ("iBow Business OS Tour", made in Suno) and scrolls
the page in time with it: every shape finishes forming on a downbeat, the song's louder bars
get quick one-bar rushes and its quieter bars two-bar glides, the closing logo lands on the
song's outro, and the particles pulse on the beat. Any wheel, touch or key press stops it.

The beat grid comes from Suno's own analysis of the song (`scripts/suno-analysis.json`: every
beat with its position in the bar, plus the song's sections). To use a new track:

```bash
pip install librosa soundfile
cp path/to/song.mp3 public/tour/track.mp3
# with Suno's audio-analysis saved as JSON (recommended):
python scripts/analyze_beats.py public/tour/track.mp3 src/tour/beats.json --suno path/to/analysis.json
# or detect the beats from the audio alone:
python scripts/analyze_beats.py public/tour/track.mp3 src/tour/beats.json
```

If `beats.json` is marked `"placeholder": true`, the tour buttons are hidden unless the URL has
`?tour`.
