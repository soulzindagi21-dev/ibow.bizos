# iBow Business OS

Landing page with a scroll-driven 3D particle scene (Three.js + Vite).

```bash
npm install
npm run dev     # local dev server
npm run build   # production build to dist/
```

The scene lives in `src/scene.js`: each shape is sampled into the same number of surface points, and the vertex shader blends between shapes as you scroll.

## Music tour

"Play tour" plays `public/tour/track.mp3` and scrolls the page in time with it: every shape
finishes forming on a downbeat, loud bars move fast and quiet bars glide, and the particles
pulse on the beat. Any wheel, touch or key press stops it.

To use a new track:

```bash
pip install librosa soundfile
cp path/to/song.mp3 public/tour/track.mp3
python scripts/analyze_beats.py public/tour/track.mp3 src/tour/beats.json
```

While `beats.json` is marked `"placeholder": true` (the test click track), the tour buttons are
hidden; preview it with `?tour` in the URL. Running the script on a real track removes the flag.
