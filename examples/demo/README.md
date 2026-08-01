# Public distribution demo

Build and serve the demo from the repository root:

```bash
npm run build
npm run demo
```

Open `http://127.0.0.1:4173/`. The server exposes only the demo and built `dist/`
artifacts. DataTables 3.0.1, Buttons 4.0.1, and Select 4.0.0 load from the official
DataTables CDN with SHA-384 integrity metadata. The Content Security Policy allows
that exact CDN origin for scripts and styles; the runtime still does not load
jQuery.
