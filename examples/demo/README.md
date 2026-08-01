# Public distribution demo

Build and serve the demo from the repository root:

```bash
npm run build
npm run demo
```

Open `http://127.0.0.1:4173/`. The server exposes only the demo, built `dist/`
artifacts, and the three declared DataTables peer packages. It applies a strict
same-origin Content Security Policy and does not use a CDN or jQuery.
