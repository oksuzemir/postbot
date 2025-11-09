# Figma Plugin — Template Exporter

This folder contains the Figma plugin used to export a selected Frame as a template JSON and to apply image mappings to selection.

Quick developer guide

Prerequisites
- Node.js (>=16)
- npm

Install dependencies

```bash
cd figma-plugin
npm install
```

Build (one-off)

```bash
npm run build
# Produces dist/code.js which is referenced by manifest.json
```

Watch (development)

```bash
npm run watch
# Keeps rebuilding dist/code.js when you edit files
```

Reloading the plugin in Figma
1. In Figma desktop app: Menu → Plugins → Development → Import Plugin from Manifest...
2. Choose `figma-plugin/manifest.json` from the repo.
3. When you update code, re-run `npm run build` (or `npm run watch`) and re-open the plugin in Figma. If Figma shows a missing `dist/code.js`, re-import the manifest.

Notes
- We bundle the plugin with `esbuild` and inline `ui.html` as text into `dist/code.js`.
- The `manifest.json` points `main` to `dist/code.js` and `ui` to `ui.html` (the UI is bundled into the main file so that Figma can load the plugin without external files).
- If you see errors about missing `dist/code.js`, run `npm --prefix figma-plugin run build` or use the root npm alias added in the repo.

Troubleshooting
- If `figma.showUI` complains about undefined `__html__` or other bundling issues, ensure you have built the plugin and that `dist/code.js` exists.
- For fast iteration, use `npm run watch` in the plugin folder and re-open the plugin after the first build.

Contact
- For questions about the plugin code, open an issue or ping @oksuzemir.

## Contributing / Quick dev workflow

If you edit the plugin code, follow these steps to rebuild and re-import the plugin into Figma:

1. Install deps (first time):

```bash
cd figma-plugin
npm install
```

2. Build once (production minified build with source map):

```bash
npm run build
```

3. For active development (keep rebuilds running):

```bash
npm run watch
```

4. Re-import plugin into Figma (after the first successful build):
 - In the Figma desktop app: Menu → Plugins → Development → Import Plugin from Manifest...
 - Choose `figma-plugin/manifest.json` from the repo.
 - If Figma reports `dist/code.js` missing after changes, stop/start the plugin or re-import the manifest.

Notes:
- Use `npm run build:dev` to build a non-minified bundle with source maps for easier debugging.
- The repo root exposes helper scripts `npm run build:plugin` and `npm run watch:plugin` that forward to the plugin folder commands.
- We intentionally ignore `figma-plugin/dist/` in the repo (see `.gitignore`) to avoid committing built artifacts. If you prefer committing `dist/code.js` to make the plugin importable without a build step for other contributors, let me know and I can commit the bundle instead.
