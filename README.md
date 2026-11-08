# iBow Business OS

Landing page with a scroll-driven 3D particle scene (Three.js + Vite).

```bash
npm install
npm run dev     # local dev server
npm run build   # production build to dist/
```

The scene lives in `src/scene.js`: each shape is sampled into the same number of surface points, and the vertex shader blends between shapes as you scroll.
