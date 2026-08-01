# Distribution example

The GitHub Pages workflow runs `npm run build:pages`, builds the ignored `dist/`
directory, and publishes a self-contained site from `.pages/`. Distribution files
therefore do not need to be committed.

Before the first deployment, select **GitHub Actions** as the repository's Pages
source. The workflow then builds and uploads the site artifact on pushes to `main`
or a manual workflow run.

For a local preview from the repository root:

```bash
npm run build
npm run demo
```

Open `http://127.0.0.1:4173/examples/demo/`. The preview server exposes only the
example and built `dist/` artifacts.

After `npm run build`, a general static server or editor Live Server can also open
`http://127.0.0.1:5500/examples/demo/index.html`. The example's own stylesheet,
script, library bundle, and language JSON paths are relative to that page. Optional
DataTables extensions load from the official DataTables CDN with integrity
metadata; the runtime does not load jQuery.
