# Changelog

All notable changes made during the interactive session on 2025-11-09 / 2025-11-10.
This file is intended for quick review when creating a commit or PR.

## 2025-11-09 to 2025-11-10 — Interactive session edits (local/dev stability)

Summary
- Focus: stabilize the admin dev workflow and Puppeteer/Chromium startup for local development and CI.
- Key outcomes: fixed a frontend ReferenceError, added server-side request logging and a debug ping, hardened the start script to detect Chrome/Chromium and avoid shell "unbound variable" failures, and added a fail-fast option for CI.

Timestamped entries (local timezone)
- 2025-11-09T10:12:05+03:00 — Fixed `admin/src/RenderPlayer.jsx`:
  - Moved `url` and `reqUrl` declarations out of try/catch blocks so catch handlers can reference them safely.
  - Improved error logging and user notifications when fetches fail.

- 2025-11-09T10:18:30+03:00 — Enhanced server diagnostics in `src/services/server_impl.js`:
  - Added lightweight request-logging middleware that prints `[INCOMING] METHOD URL origin=... host=... remote=...` for every incoming HTTP request.
  - Added an unauthenticated `GET /debug/ping` endpoint that returns observed Origin/Host/IP for quick browser diagnostics.

- 2025-11-09T10:25:05+03:00 — Hardened `scripts/start_all.sh`:
  - Ensured `PUPPETEER_EXECUTABLE_PATH` is always defined to avoid `set -u` unbound-variable errors.
  - Added auto-detection candidates: `google-chrome`, `chromium-browser`, Program Files (x86) path on Windows, WSL-mounted paths under `/mnt/c/...`, and local Puppeteer Chromium under `node_modules/puppeteer/.local-chromium/*`.
  - Temporarily disabled `set -u` only during environment expansion for background `nohup` calls and re-enabled it afterwards.
  - Print a clear `[postbot][WARNING]` and usage hint if the resolved path does not exist.

- 2025-11-09T10:35:15+03:00 — Observed package install audit notes:
  - `npm --prefix admin install` may surface a couple of moderate vulnerabilities. This is informational; run `npm audit`/`npm audit fix` when doing security updates.

- 2025-11-09T10:40:00+03:00 — Fail-fast option for start script:
  - Added support for `FAIL_FAST_ON_NO_CHROME` env var. When set to `1` or `true` the start script exits with a clear error if no Chrome/Chromium binary is found. Useful for CI.

Files changed (exact)
- `admin/src/RenderPlayer.jsx` — bugfix (ReferenceError) and improved error context for failed fetches.
- `src/services/server_impl.js` — request-logging middleware and `GET /debug/ping` endpoint.
- `scripts/start_all.sh` — robust chrome detection, WSL/local-chromium checks, safe env expansion, and `FAIL_FAST_ON_NO_CHROME` fail-fast support.
- `README.md` — added "How I tested this" section with exact commands and expected outputs.
- `copilot-instructions.md` — added session activity and one-line files-changed summary.

How I tested this (commands & expected outputs)
- Start the full stack:

```bash
npm run start:all
# Expected: prints resolved PUPPETEER_EXECUTABLE_PATH or a WARNING; starts Redis, server, worker and admin; no shell 'unbound variable' errors
```

- Quick ping from admin-hosting environment:

```bash
curl -i http://localhost:3000/debug/ping
# Expected: HTTP/1.1 200 OK and JSON body like: {"ok":true,"origin":...,"host":...,"ip":"..."}
```

- List templates:

```bash
curl -i http://localhost:3000/templates
# Expected: HTTP/1.1 200 OK and JSON containing 'templates' array
```

- Render admin-static and save the PNG:

```bash
curl -sS -X POST -H "Content-Type: application/json" --data '{}' http://localhost:3000/render/admin-static -o admin_static.png
# Expected: admin_static.png exists and is a valid PNG
```

- Check server request logs:

```bash
sed -n '1,200p' logs/server.log
# Expected: lines starting with [INCOMING] for incoming requests
```

Notes and follow-ups
- If Puppeteer fails to launch: set `PUPPETEER_EXECUTABLE_PATH` explicitly (example Git Bash):

```bash
export PUPPETEER_EXECUTABLE_PATH="/c/Program Files/Google/Chrome/Application/chrome.exe"
```

- For CI: enable fail-fast:

```bash
export FAIL_FAST_ON_NO_CHROME=1
npm run start:all
```

- Optional next work I can do (pick one):
  - Add a small shell smoke-test script that runs the curl checks and exits non-zero on failures.
  - Promote this session summary into `CHANGELOG.md` (done) and open a PR.
  - Add more granular preflight CORS/fetch logging if browser still reports network errors.

---

_End of session summary._
