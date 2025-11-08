# Renderer quickstart

This folder contains a minimal Node.js renderer that converts a Figma-exported template JSON and a mapping into a PNG using Puppeteer.

Install:

```bash
npm install
```

Render a sample template:

```bash
npm run render
```

Or run the server locally:

```bash
npm start
# POST /render with JSON: { "templatePath": "templates/sample_template.json", "mapping": { ... } }
```

You can paste a template exported from the Figma plugin into `templates/` and provide a mapping in `examples/mapping.json`.

Docker (recommended for CI / isolated headless rendering):

Build the image and run the CI check:

```bash
docker build -t postbot-renderer .
docker run --rm postbot-renderer
```

Or use docker-compose for local development:

```bash
docker-compose run --rm renderer
```

CI: there's a GitHub Actions workflow at `.github/workflows/ci-render.yml` that runs a smoke-check on push/PR. It installs Chrome in the runner and runs `scripts/ci_check.js`.

Notes:
- The Dockerfile installs a Chrome-for-testing binary and sets `PUPPETEER_EXECUTABLE_PATH` so `puppeteer-core` can use it.
- If you run locally without Chromium, set `PUPPETEER_EXECUTABLE_PATH` to your Chrome path.

Local dev with Redis (recommended for queue testing)

1. Ensure Docker Desktop is running on your machine.
2. Start Redis with docker-compose:

```bash
cd /c/Users/USER/Documents/GitHub/postbot
docker-compose up -d redis
```

3. Start the worker (it will wait for Redis to be ready):

```bash
PUPPETEER_EXECUTABLE_PATH="/c/Program Files/Google/Chrome/Application/chrome.exe" node scripts/start_worker.js
```

4. Enqueue a test job from another shell:

```bash
node scripts/enqueue_example.js
# check ./out/<jobid>.png after completion
```

If you'd rather run Redis locally without Docker, install Redis for your OS and make sure it's listening on `127.0.0.1:6379`.


