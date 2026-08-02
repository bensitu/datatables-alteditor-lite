# Distribution example

The published demonstration is available at
[bensitu.github.io/datatables-alteditor-lite](https://bensitu.github.io/datatables-alteditor-lite/examples/demo/).

The GitHub Pages workflow runs `npm run build:pages`, builds the ignored `dist/`
directory, and publishes a self-contained site from `.pages/`. Distribution files
therefore do not need to be committed.

Before the first deployment, select **GitHub Actions** as the repository's Pages
source. The workflow then builds and uploads the site artifact on pushes to `main`
or a manual workflow run.

The main DataTable loads `data/employees.json` through the public Ajax option. Its
editor demonstrates asynchronous operations and failures. The field type gallery
uses a separate DataTable and synchronous client-side mappings for password, time,
datetime-local, radio, file, and hidden controls.

For an optional local preview from the repository root:

```bash
npm run build
npm run demo
```

Open `http://127.0.0.1:4173/examples/demo/`. The preview server exposes only the
example and built `dist/` artifacts.

After `npm run build`, a general static server can also open
`http://127.0.0.1:5500/examples/demo/index.html`. The example's own stylesheet,
script, Ajax data, library bundle, and language JSON paths are relative to that
page. The ignored `dist/` directory is present on GitHub Pages because the workflow
builds and copies it into the deployment artifact; it is not read directly from
the repository branch. Optional DataTables extensions load from the official
DataTables CDN with integrity metadata; the runtime does not load jQuery.
