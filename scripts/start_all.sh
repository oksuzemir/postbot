#!/usr/bin/env bash
set -euo pipefail

# Start all services for local development quickly.
# Usage: from the repo root run: bash ./scripts/start_all.sh

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[postbot] Starting all services from $ROOT_DIR"

mkdir -p logs

echo "[postbot] Installing root dependencies (this may take a while)..."
npm install

echo "[postbot] Installing admin dependencies..."
npm --prefix admin install

# Ensure PUPPETEER_EXECUTABLE_PATH is always defined to avoid 'unbound variable' errors
# Default to the common Windows path used in this project so developers can run start:all
if [ -z "${PUPPETEER_EXECUTABLE_PATH:-}" ]; then
  export PUPPETEER_EXECUTABLE_PATH="/c/Program Files/Google/Chrome/Application/chrome.exe"
fi

# If other common binaries exist, prefer those (override the default)
if command -v google-chrome >/dev/null 2>&1; then
  export PUPPETEER_EXECUTABLE_PATH="$(command -v google-chrome)"
elif command -v chromium-browser >/dev/null 2>&1; then
  export PUPPETEER_EXECUTABLE_PATH="$(command -v chromium-browser)"
elif [ -f "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" ]; then
  export PUPPETEER_EXECUTABLE_PATH="/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"
fi

echo "[postbot] PUPPETEER_EXECUTABLE_PATH=${PUPPETEER_EXECUTABLE_PATH:-}"

# Additional auto-detection: check WSL-style mounts and local puppeteer Chromium downloads
if [ -z "${PUPPETEER_EXECUTABLE_PATH:-}" ] || [ ! -x "${PUPPETEER_EXECUTABLE_PATH}" ] && [ ! -f "${PUPPETEER_EXECUTABLE_PATH}" ]; then
  # WSL mounted C: paths
  if [ -f "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" ]; then
    export PUPPETEER_EXECUTABLE_PATH="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
  elif [ -f "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" ]; then
    export PUPPETEER_EXECUTABLE_PATH="/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"
  fi

  # Prefer local puppeteer chromium if present in node_modules (common when puppeteer is installed)
  # Use nullglob so the pattern disappears if no match
  set +u
  shopt -s nullglob 2>/dev/null || true
  for c in node_modules/puppeteer/.local-chromium/*/chrome-win/chrome.exe node_modules/puppeteer/.local-chromium/*/chrome-linux/chrome node_modules/puppeteer/.local-chromium/*/chrome-mac/Chromium.app/Contents/MacOS/Chromium; do
    if [ -f "$ROOT_DIR/$c" ] || [ -f "$c" ]; then
      if [ -f "$ROOT_DIR/$c" ]; then
        export PUPPETEER_EXECUTABLE_PATH="$ROOT_DIR/$c"
      else
        export PUPPETEER_EXECUTABLE_PATH="$c"
      fi
      break
    fi
  done
  shopt -u nullglob 2>/dev/null || true
  set -u
fi

# Final sanity check: warn if the resolved path does not exist or is not executable
if [ -z "${PUPPETEER_EXECUTABLE_PATH:-}" ] || { [ ! -f "${PUPPETEER_EXECUTABLE_PATH}" ] && [ -z "$(command -v "${PUPPETEER_EXECUTABLE_PATH}" 2>/dev/null)" ]; }; then
  echo "[postbot][WARNING] PUPPETEER executable not found at '${PUPPETEER_EXECUTABLE_PATH:-}'"
  echo "[postbot][HINT] Set PUPPETEER_EXECUTABLE_PATH to a valid Chrome/Chromium binary if start fails. Example (Git Bash):"
  echo "  export PUPPETEER_EXECUTABLE_PATH=\"/c/Program Files/Google/Chrome/Application/chrome.exe\""
  # Fail-fast option: if the env var FAIL_FAST_ON_NO_CHROME is set (1/true), exit now
  if [ "${FAIL_FAST_ON_NO_CHROME:-}" = "1" ] || [ "${FAIL_FAST_ON_NO_CHROME:-}" = "true" ]; then
    echo "[postbot][FATAL] FAIL_FAST_ON_NO_CHROME is set and no Chrome/Chromium executable was found. Exiting."
    exit 2
  fi
fi

# Start Docker services (only redis is required). If docker is not available, skip.
if command -v docker >/dev/null 2>&1; then
  echo "[postbot] Starting docker compose (redis)..."
  # try both docker compose and docker-compose
  if docker compose version >/dev/null 2>&1; then
    docker compose up -d redis || true
  else
    docker-compose up -d redis || true
  fi
else
  echo "[postbot] Docker not found, skipping docker services. You can run Redis separately (port 6379)."
fi

# Start the server in background
echo "[postbot] Ensuring port 3000 is free (will attempt to stop any existing process)..."
if command -v lsof >/dev/null 2>&1; then
  pids=$(lsof -ti :3000 || true)
  if [ -n "$pids" ]; then
    echo "[postbot] Killing processes on port 3000: $pids"
    kill -9 $pids || true
  fi
elif command -v netstat >/dev/null 2>&1 && command -v awk >/dev/null 2>&1; then
  # try windows style netstat parse
  pid=$(netstat -ano | grep -E ":3000\s" | awk '{print $NF}' | head -n1 || true)
  if [ -n "$pid" ]; then
    echo "[postbot] Attempting to kill PID $pid listening on port 3000"
    if command -v taskkill >/dev/null 2>&1; then
      taskkill /PID $pid /F >/dev/null 2>&1 || true
    else
      kill -9 $pid || true
    fi
  fi
fi

# Temporarily disable 'set -u' to avoid unbound variable errors when expanding env vars below
set +u

echo "[postbot] Starting server (logs/server.log)"
# export PUPPETEER_EXECUTABLE_PATH should already be set above; pass it explicitly to ensure the server process inherits it
nohup env PUPPETE_EXECUTABLE_PATH="${PUPPETE_EXECUTABLE_PATH}" npm run start > logs/server.log 2>&1 &

# Start the worker in background (provides rendering queue processing)
echo "[postbot] Starting worker (logs/worker.log)"
nohup env PUPPETE_EXECUTABLE_PATH="${PUPPETE_EXECUTABLE_PATH}" node scripts/start_worker.js > logs/worker.log 2>&1 &

# Wait for server to become responsive before starting admin frontend to avoid frontend
# opening and immediately attempting API calls while the backend is still starting.
echo "[postbot] Waiting for server http://localhost:3000 to be ready"
for i in $(seq 1 60); do
  if command -v curl >/dev/null 2>&1; then
    if curl -sS --head http://localhost:3000 >/dev/null 2>&1; then
      echo "[postbot] Server is up"
      break
    fi
  fi
  sleep 1
done

# Start admin frontend (Vite dev server)
echo "[postbot] Starting admin frontend (Vite) (logs/admin.log)"
# Ensure VITE_API_BASE is set so the admin dev server talks to the backend rather than returning its own index.html
if [ -z "${VITE_API_BASE:-}" ]; then
  export VITE_API_BASE="http://localhost:3000"
fi
nohup env VITE_API_BASE="$VITE_API_BASE" npm --prefix admin run dev > logs/admin.log 2>&1 &

ADMIN_URL="http://localhost:5173"
echo "[postbot] Waiting for admin frontend to be ready at $ADMIN_URL"
for i in $(seq 1 60); do
  if command -v curl >/dev/null 2>&1; then
    if curl -sS --head "$ADMIN_URL" >/dev/null 2>&1; then
      echo "[postbot] Admin is up"
      break
    fi
  else
    # if curl not available, just sleep and proceed
    sleep 1
  fi
  sleep 1
done

open_url() {
  local url="$1"
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 &
  elif command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command "Start-Process '$url'" >/dev/null 2>&1 || true
  elif command -v cmd.exe >/dev/null 2>&1; then
    cmd.exe /c start "" "$url" >/dev/null 2>&1 || true
  else
    echo "Please open $url in your browser"
  fi
}

echo "[postbot] Opening admin frontend in browser..."
set -u
open_url "$ADMIN_URL"

echo "[postbot] All services started (or attempted). Tail logs in ./logs if something failed."
echo "[postbot] To stop docker services run: docker compose down"

exit 0
