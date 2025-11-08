# Copilot Instructions and Project Tracker

This document is the single source of truth for the `postbot` project coordination, progress tracking, and onboarding. Keep it updated with short, frequent entries describing what changed and why.

## Project overview

- Name: postbot
- Purpose: (short) A bot for posting content or managing posts — fill in details as the project grows.
- Scope: Start with a minimal MVP that can authenticate, post, and schedule messages. Expand later with integrations.
- Success criteria:
  - Able to authenticate with target service(s)
  - Able to create and delete posts
  - Able to schedule future posts

## Project organization (what's in this repo)

Top-level layout (important files and purpose):

- `copilot-instructions.md` — this file. Project tracker, roadmap, run instructions, and all implementation notes.
- `package.json` — Node dependencies and npm scripts for the renderer and tools.
- `Dockerfile` — container image for headless rendering (Chromium-for-testing + app).
- `docker-compose.yml` — local development compose file (services: renderer, redis, worker).
- `README_RENDERER.md` — quickstart for the renderer, Docker and CI notes.
- `templates/` — place exported Figma JSON templates here (we include `sample_template.json`).
- `examples/` — sample mapping(s) such as `examples/mapping.json`.
- `src/` — core server/renderer/queue code:
  - `src/server.js` — Express endpoint `POST /render` (accepts templatePath or template JSON + mapping).
  - `src/renderer.js` — rendering glue that converts template+mapping to HTML and captures PNG using Puppeteer (now uses a browser pool).
  - `src/template_to_html.js` — small HTML generator from template JSON and mapping data.
  - `src/browserPool.js` — simple Chromium page-pool implementation with concurrency control.
  - `src/queue.js` — BullMQ enqueue + worker wrapper (renders jobs, writes PNG, optionally uploads to S3).
- `scripts/` — developer scripts and helpers:
  - `scripts/render.js` — CLI runner that renders a template -> PNG.
  - `scripts/ci_check.js` — CI smoke-check used in GitHub Actions.
  - `scripts/wait-for-redis.js` — Redis-ready TCP wait helper.
  - `scripts/start_worker.js` — waits for Redis then starts the queue worker.
  - `scripts/enqueue_example.js` — enqueues a test job into the BullMQ queue.
- `figma-plugin/` — the Figma plugin used to export templates to JSON.

## What we implemented so far (detailed chronology)

1) Figma plugin inspection and export support
  - Added/inspected `figma-plugin/code.ts`. It exports a template JSON describing layers, positions, fonts, background and exported image dataURIs.
  - Documented the template shape and mapping rules (text keys via `{{KEY}}`, image placeholders prefixed with `IMG_`, loose name matching).

2) Renderer scaffold (Puppeteer-based)
  - Added a minimal renderer that:
    - Converts template JSON + mapping to an HTML string (`src/template_to_html.js`).
    - Launches headless Chromium via `puppeteer-core` and captures a PNG (`src/renderer.js`).
    - Uses `src/browserPool.js` to reuse browser pages and limit concurrency (default POOL_MAX_CONCURRENCY=2).
  - CLI runner `scripts/render.js` and `README_RENDERER.md` with quickstart.

3) CI & Docker
  - `Dockerfile` that installs Chrome-for-testing and runs tests/ci_check.
  - `docker-compose.yml` with `redis` and `worker` services for local dev.
  - GitHub Actions workflow `.github/workflows/ci-render.yml` that installs Chrome on the runner and runs `scripts/ci_check.js`.

4) Job queue (BullMQ) + Worker
  - Added BullMQ-based queue implementation in `src/queue.js` (enqueue + worker).
  - Worker renders templates and writes PNGs to `./out/<jobid>.png`. Optionally uploads to S3 when `AWS_S3_BUCKET` + `AWS_REGION` are set.
  - Example enqueue script `scripts/enqueue_example.js`.

5) Startup robustness
  - Added `scripts/wait-for-redis.js` and updated `scripts/start_worker.js` to wait for Redis before starting worker.
  - Adjusted queue module to lazily initialize (avoids connect-at-require-time errors).

6) Versions & dependency notes
  - We use `puppeteer-core` (no automatic Chromium download); set `PUPPETEER_EXECUTABLE_PATH` to point to your Chrome/Chromium binary locally or rely on the image's bundled binary in Docker.
  - BullMQ chosen for persistent queue. We pinned a working bullmq version from the registry (`5.63.0`).

## How to run everything locally (step-by-step)

Prereqs: Node 18+, Docker Desktop (optional but recommended for Redis and containerized Chromium), local Chrome/Chromium installed.

1) Install Node deps:

```bash
cd /c/Users/USER/Documents/GitHub/postbot
npm install
```

2) Quick render (no queue):

```bash
PUPPETEER_EXECUTABLE_PATH="/c/Program Files/Google/Chrome/Application/chrome.exe" npm run render
# writes out.png
```

3) Start Redis (Docker Compose):

```bash
docker-compose up -d redis
```

4) Start worker (will wait for Redis):

```bash
PUPPETEER_EXECUTABLE_PATH="/c/Program Files/Google/Chrome/Application/chrome.exe" node scripts/start_worker.js
```

5) Enqueue a test job (in another shell):

```bash
node scripts/enqueue_example.js
# check ./out/<jobid>.png when completed
```

6) Full Docker run (optional):

```bash
docker-compose up --build
```

## Development notes, tips and troubleshooting

- If the worker logs `ECONNREFUSED 127.0.0.1:6379`, make sure Redis is up (docker-compose or local install).
- If Puppeteer fails to launch, set `PUPPETEER_EXECUTABLE_PATH` to a valid Chrome/Chromium binary. In Docker the `Dockerfile` sets `/usr/bin/chrome`.
- To change concurrency:
  - Set `POOL_MAX_CONCURRENCY` env var (e.g. `POOL_MAX_CONCURRENCY=4`) before running the worker.
- If you need to debug HTML/CSS rendering, modify `src/template_to_html.js` to print the generated HTML to a temp file; then open it in your browser.

## Full roadmap (next milestones)

Short term (next 2 weeks):
- Add an HTTP enqueue endpoint (`POST /enqueue`) in `src/server.js` to let a frontend push jobs.
- Add job status endpoints (`GET /jobs/:id`) to query job state.
- Improve text rendering fidelity: load custom fonts (assets/fonts + @font-face), support letter-spacing and line-height from template.

Medium term (1-2 months):
- Add a persistent file store (S3) integration with presigned URLs and optional caching.
- Add an authenticated frontend admin UI that lists templates, allows uploading mapping values, and previews rendered images.
- Benchmark throughput and add a worker autoscaler or switch to a multi-worker deployment with Redis and a job rate limiter.

Long term:
- Add Instagram publishing integration with OAuth and scheduled posting.
- Build template editing UI (visual mapping) that integrates directly with the Figma plugin's exported JSON.

## File-by-file quick map (for newcomers)

- `copilot-instructions.md` — this doc.
- `README_RENDERER.md` — renderer quickstart and Docker/CI instructions.
- `Dockerfile` / `docker-compose.yml` — container and compose for local/CI testing.
- `src/renderer.js` — main render entrypoint (exports `renderFromTemplate`).
- `src/browserPool.js` — reuses a browser instance and pages.
- `src/template_to_html.js` — produces HTML for Puppeteer.
- `src/server.js` — basic express server (POST /render).
- `src/queue.js` — BullMQ enqueue/worker logic.
- `scripts/` — helpers and scripts (render, startup checks, ci_check, enqueue example, start worker).
- `templates/` and `examples/` — sample template and mapping.
- `figma-plugin/` — Figma plugin used to export templates.

## Changelog (more granular)

- 2025-11-08 | Copilot | Created initial `copilot-instructions.md` and project tracker
- 2025-11-09 | Copilot | Added renderer scaffold (Puppeteer), browser pool, and basic HTML generator
- 2025-11-09 | Copilot | Added Dockerfile, docker-compose, and GitHub Actions CI workflow for smoke-checks
- 2025-11-09 | Copilot | Added BullMQ queue + worker skeleton, enqueue example, and Redis wait helper

---

If you'd like, I will now:
- Reorganize source files into `src/services/` and `src/workers/` for a cleaner layout.
- Add the HTTP enqueue endpoint and job-status endpoints next.
- Add font-loading and improved text metrics.

Tell me which of those you'd like me to do next and I'll implement it and update the docs.

## How to use this file

- Use the 'Todo' section below to write short progress entries.
- When you complete a task, add a one-line changelog entry with a date and author.

## Development workflow (starter)

1. Fork or clone the repository.
2. Create a feature branch: `git checkout -b feat/short-description`.
3. Commit small changes with clear messages.
4. Open a Pull Request against `main` and use this file to describe the scope.

### Useful commands

Replace with your package manager commands once the project has one.

- Install dependencies: `npm install` or `pip install -r requirements.txt`
- Run tests: `npm test` or `pytest`
- Start dev server: `npm run dev` or `python app.py`

## Task tracking (short-lived)

Use this section to quickly list current tasks and their statuses.

- [ ] Create `copilot-instructions.md` (in-progress)
- [ ] Add project overview and goals
- [ ] Add development workflow and commands
- [ ] Add task tracking format
- [ ] Add contribution and communication guidelines
- [ ] Add PR and issue templates
- [ ] Link README and next steps

## Templates

### Changelog entry

Date | Author | Change
---|---|---
2025-11-08 | Copilot | Created initial `copilot-instructions.md` and project tracker

### PR description template

Short summary (1-2 lines)

What changed

Why this change is needed

Testing notes

Related issues

### Issue template

Title:

Description:

Steps to reproduce:

Expected behavior:

Actual behavior:

Environment (OS, Node/Python version):

Additional context:

## Communication & contribution

- Preferred workflow: small PRs, automated tests where possible.
- For questions or design decisions, open an issue and tag @oksuzemir.

## Next steps

1. Flesh out project goals and milestones. (owner: @oksuzemir)
2. Add a minimal README and quickstart.
3. Create skeleton app code and CI configuration.

---

If you want me to expand any section or convert these templates into actual GitHub PR/issue templates, tell me which ones and I'll add them.

## Figma plugin inspection (summary)

- Location: `figma-plugin/` (main file: `code.ts`). The plugin exports a JSON "template" for a selected Frame and can apply a mapping of keys -> dataURLs to selected nodes in the document.
- Exported template shape (high level):
  - `template_id`, `version`, `size: {w,h}`, `fonts:[]`, `layers:[]`, `metadata`, `backgroundImage` (dataURI), `neonBorder`.
  - Each layer has a `type` (`text`, `image`, `rect`, `line`), `name`, `x`,`y`,`w`,`h`, optional `rotation`, `key` (for text or named image placeholders), `originalText`, `font`, `shape`/`isEllipse`, `cornerRadius`, and `dataUri` for exported image assets.
- Important mapping rules used by the plugin:
  - Text keys are detected from text content using the regex `{{ KEY }}` (alphanumeric + underscore). Keys are case-insensitive when exported, but normalized to uppercase when matching.
  - Image placeholders are derived either from an explicit name prefix like `IMG_PLAYER_PHOTO` or via exported image fills. The plugin normalizes node names and mapping keys using a loose matching strategy to tolerate `-`, spaces, `_copy`, numeric suffixes, etc.
  - When applying a mapping, the plugin expects mapping values to be data URLs (e.g. `data:image/png;base64,...`) for images. For text values the mapping can be a plain string.

This plugin gives us exactly the input we need: a JSON template describing positions, sizes, and placeholder keys. Our renderer will take that JSON plus a mapping object and produce a final image.

## Roadmap & implementation plan (fast, minimal, practical)

Goal: Given a saved Figma template JSON and an API that returns a football player's data (including a photo URL), render a ready-to-post Instagram image (PNG) that combines the template and the player's data.

Phases (short):
1. Template export & inspection (done) — use the Figma plugin to export templates into `templates/` as JSON files.
2. Data ingestion & mapping — fetch player data from your API, convert the player photo to a data URI, and map API fields to template keys.
3. Rendering pipeline — produce a PNG from template + mapping. (MVP)
4. Instagram delivery — later: push composed image to Instagram API or automation (deferred).

Primary choice (fastest, easiest to match Figma visuals):
- Use Node.js + headless Chromium (Puppeteer or Playwright) to render an HTML/CSS representation of the template then capture a PNG screenshot. Rationale: CSS easily handles positioning, object-fit (cover), border-radius, rotation, and fonts; it's quick to iterate and gives pixel-perfect results.

Alternative approaches (tradeoffs):
- node-canvas / pure raster drawing: faster and less resource-heavy, but text layout, wrapping, and exact visual parity (masks/corner radii) are harder to implement.
- Generate SVG: precise vector output and text support, but font availability and complex layout features can still be tricky.

Recommended stack (MVP)
- Node.js (>=18)
- Express (small API) or just a script for local testing
- Puppeteer or Playwright (headless Chromium) to render HTML and capture PNG
- axios or node-fetch to call external APIs
- sharp (optional) for post-processing/optimizing PNGs
- dotenv for environment variables (API keys)

Example npm packages to install:

- puppeteer
- express
- axios
- sharp
- dotenv

Data contract and mapping

- Template JSON (excerpt from plugin):

  {
    "template_id": "player_card",
    "size": {"w": 1080, "h": 1080},
    "layers": [
      { "type": "text", "key": "PLAYER_NAME", "x": 120, "y": 80, "w": 840, "h": 120, "font": { "family": "Inter", "style": "Bold", "size": 48 }, "originalText": "{{PLAYER_NAME}}" },
      { "type": "image", "key": "PLAYER_PHOTO", "x": 60, "y": 220, "w": 360, "h": 360, "shape": "circle" },
      { "type": "text", "key": "GOALS", "x": 460, "y": 260, "w": 560, "h": 80 }
    ],
    "backgroundImage": "data:image/png;base64,..."
  }

- Mapping object (what renderer expects):

  {
    "PLAYER_NAME": "K. Mbappé",
    "GOALS": "23",
    "PLAYER_PHOTO": "data:image/jpeg;base64,/9j/4AAQ..."
  }

Implementation steps (detailed)

1) Save templates
  - Export desired Instagram post frame from Figma using the in-repo plugin and save the JSON under `templates/`.

2) Create a small Node service (or script)
  - A single endpoint: `POST /render` that accepts `{ template: "player_card.json", mapping?: {...}, playerId?: "123" }`.
  - If `playerId` is provided, the service will call your player API (using API_KEY from env), build the mapping, and continue.

3) Build mapping from API data
  - Fetch player JSON from your API. Extract fields (name, photo_url, statistics).
  - For images: download the photo bytes and convert to a data URI (base64). Use axios with responseType:'arraybuffer' and then `Buffer.from(...).toString('base64')`.
  - Compose mapping keys matching the template's `key` values. For example `PLAYER_PHOTO` => player photo dataURI.

4) Create an HTML renderer using the template JSON
  - Build a small HTML page with a container sized to `template.size` (e.g., 1080x1080) and absolutely positioned children for each layer.
  - For backgroundImage, render an <img> covering the container (object-fit: cover).
  - For image layers, render <img> elements with CSS:
    - position: absolute; left: Xpx; top: Ypx; width: Wpx; height: Hpx;
    - object-fit: cover; border-radius: use `cornerRadius` or 50% for circles; transform: rotate(...deg) if rotation exists.
  - For text layers, render <div> or <span> with inline style for font-size (from layer.font.size), font-family (try to load font if present), color, line-height, letter-spacing. Replace placeholders with mapping values.
  - Make sure to sanitize/escape mapping text when inserting into HTML.

5) Use Puppeteer to render
  - Launch headless Chromium, load the HTML (serve via Express or load via data URL), wait for images/fonts to load, then capture a screenshot of the container element at the template size. Return PNG buffer.
  - Optionally pipe buffer to `sharp` for resizing/quality adjustments.

6) Return the PNG (or save to disk/S3)

Edge cases and notes
- Fonts: the template includes `fonts:[]` but Figma fonts may be custom. We can:
  - Use generic fallbacks and accept visual differences, or
  - Bundle required fonts by name (add to `assets/fonts/`) and load with @font-face in the renderer HTML.
- Missing mapping keys: render placeholders empty or use fallback text like "—". Log warnings.
- Photos with different aspect ratios: use object-fit: cover to match Figma's scaleMode:'FILL' behavior.
- High-volume rendering: use a Chromium pool (e.g., puppeteer-cluster) or switch to a node-canvas pipeline for throughput.

Minimal example flow (quick checklist)

1. Export template via Figma plugin -> `templates/player_card.json`.
2. Implement `scripts/render.js`:
   - Load JSON template, call player API, build mapping, build HTML, launch Puppeteer, capture PNG.
3. Test locally with a saved template and one API response.

Next actions I can take for you

- Scaffold a minimal Node.js renderer (Express + Puppeteer) and an example `scripts/render.js` that accepts a template JSON and a test mapping and returns a PNG. (recommended next task)
- Create an example `templates/player_card.json` (if you supply an exported JSON from the plugin I can include it in the repo and wire it into the scaffold).
- Add GitHub issue/PR templates and link `README.md` to `copilot-instructions.md`.

---

Changelog additions

2025-11-09 | Copilot | Added Figma plugin inspection summary and roadmap + implementation plan for rendering Instagram posts from templates

## Assistant changelog & chat guidance (detailed, timestamped)

This section is maintained automatically by the assistant during feature work and contains exact edits, commands run, and the context needed to continue work in follow-up chats.

- 2025-11-08T22:04:12Z | assistant | Created initial `copilot-instructions.md` with project overview, run steps, and roadmap.
- 2025-11-09T09:12:33Z | assistant | Inspected `figma-plugin/code.ts` and documented template JSON shape and mapping rules (keys, images, dataURI expectations).
- 2025-11-09T10:00:04Z | assistant | Added renderer scaffold: `src/template_to_html.js`, `src/browserPool.js`, `src/renderer.js`, and `scripts/render.js`. Switched to `puppeteer-core` and documented `PUPPETEER_EXECUTABLE_PATH` usage.
- 2025-11-09T10:35:21Z | assistant | Added Dockerfile, `docker-compose.yml`, and GitHub Actions CI smoke-check that runs `scripts/ci_check.js` (installed Chrome in CI runner).
- 2025-11-09T11:05:00Z | assistant | Implemented BullMQ-based queue and worker skeleton and added `scripts/enqueue_example.js`, `scripts/start_worker.js`, and `scripts/wait-for-redis.js`.
- 2025-11-09T11:20:42Z | assistant | Fixed BullMQ startup errors (lazy init, removed invalid constructor usage). Added `src/workers/queue_impl.js` and forwarder `src/queue.js`.
- 2025-11-09T11:45:10Z | assistant | Began repo reorganization: created `src/services/` and `src/workers/`. Added `*_impl.js` service files and standardized top-level forwarders to `src/services/*`.
- 2025-11-09T11:55:00Z | assistant | Completed repo reorganization: updated forwarders, removed circular requires, and verified no syntax errors in modified files. (Note: runtime checks requiring Redis/Chrome must be run locally.)

What the assistant tracks in this section
- Exact file edits (created/updated/deleted) with timestamps.
- Terminal commands executed by the assistant and their trimmed outputs (only when executed in the workspace).
- Runtime issues encountered (ECONNREFUSED for Redis, Chrome launch errors) and the corrective steps taken.

How to run a feature chat effectively with the assistant
1. Start the chat with the short goal: e.g., "Add POST /enqueue endpoint that enqueues a job and returns job id." Keep the goal single and specific.
2. If the change touches runtime services (Redis, Chrome), start Docker Compose locally before asking the assistant to run enqueue/start the worker.
3. Provide any missing credentials or file exports (for example: exported Figma template JSONs, AWS credentials if you want S3 upload tested). For secrets, provide them via environment variables locally, not pasted into chat.
4. Ask the assistant to run automated checks after edits: "Run lint/tests/ci_check" — the assistant will run quick checks and report back.

Quick troubleshooting card (assistant-friendly):
- Redis connect errors: run `docker compose up -d redis` or install Redis locally and confirm `redis-cli ping` returns PONG.
- Puppeteer launch errors: set `PUPPETEER_EXECUTABLE_PATH` to your Chrome binary and retry. In Windows: `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`.
- BullMQ Worker errors: check `scripts/start_worker.js` logs; worker will exit if Redis is unreachable after retries.

Audit log (recent terminal commands executed by the assistant in this session)
- `node scripts/enqueue_example.js` — result: ECONNREFUSED 127.0.0.1:6379 (Redis not running locally).
- `node scripts/start_worker.js` — used `scripts/wait-for-redis.js` to wait for Redis before starting worker (would start worker once Redis is available).

Next steps for the assistant (pick one in the chat):
- Add `POST /enqueue` and `GET /jobs/:id` endpoints in `src/services/server_impl.js` and tests. (recommended next step)
- Add graceful shutdown for the worker and browser pool and a healthcheck endpoint.
- Add GitHub PR/Issue templates and link `copilot-instructions.md` from `README.md`.

When you request work, prefix messages with the ticket-style summary and include any relevant sample data or env vars. Example:
"[feat] POST /enqueue — add endpoint that accepts templatePath/mapping and returns job id; test using templates/sample_template.json and examples/mapping.json"

---

2025-11-09 | assistant | End of assistant changelog

