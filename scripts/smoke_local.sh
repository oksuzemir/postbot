#!/usr/bin/env bash
set -u

# scripts/smoke_local.sh
# Run a quick local smoke test (intended for Git Bash / WSL / POSIX shells)
# Steps:
#  - start Redis via docker compose (if available)
#  - build & start worker container
#  - start server (host) in background and wait for it
#  - enqueue a job via scripts/enqueue_example.js
#  - wait for ./out/<jobid>.png up to a timeout
#  - cleanup started services

LOG_DIR="./logs"
OUT_DIR="./out"
mkdir -p "$LOG_DIR" "$OUT_DIR"

started_redis=0
started_worker=0
started_server=0
server_pid=""
exit_code=0

trap 'echo "Smoke script interrupted. Cleaning up..."; cleanup; exit 130' INT TERM

cleanup() {
  if [ -n "$server_pid" ]; then
    echo "Stopping server (pid $server_pid)" || true
    kill "$server_pid" 2>/dev/null || true
    rm -f "$LOG_DIR/server.pid" || true
  fi
  if [ "$started_worker" -eq 1 ]; then
    echo "Stopping worker container..." || true
    docker compose stop worker 2>/dev/null || true
    docker compose rm -f worker 2>/dev/null || true
  fi
  if [ "$started_redis" -eq 1 ]; then
    echo "Stopping redis container..." || true
    docker compose stop redis 2>/dev/null || true
    docker compose rm -f redis 2>/dev/null || true
  fi
}

echo "Starting local smoke test..."

# If docker compose exists, start redis and worker container
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  echo "Using docker compose: starting redis..."
  docker compose up -d redis
  started_redis=1

  echo "Building and starting worker container..."
  docker compose build worker
  docker compose up -d worker
  started_worker=1
else
  echo "docker compose not found — ensure Redis and a worker are running for a full smoke test." >&2
fi

echo "Installing project dependencies (fast check)..."
npm install --silent || true

echo "Starting server (background). Logs -> $LOG_DIR/server.log"
nohup npm run dev > "$LOG_DIR/server.log" 2>&1 &
server_pid=$!
echo "$server_pid" > "$LOG_DIR/server.pid"
started_server=1

echo "Waiting for server to respond at http://localhost:3000 ..."
for i in $(seq 1 45); do
  if curl -sS http://localhost:3000/ >/dev/null 2>&1; then
    echo "Server is responding"
    break
  fi
  sleep 1
done

if ! curl -sS http://localhost:3000/ >/dev/null 2>&1; then
  echo "Server did not start within expected time. Check $LOG_DIR/server.log" >&2
  exit_code=4
  cleanup
  exit $exit_code
fi

echo "Enqueuing a test job..."
enqueue_output=$(node scripts/enqueue_example.js 2>&1 || true)
echo "$enqueue_output"

# Try to parse a job id from the enqueue output (first number found)
jobid=$(echo "$enqueue_output" | grep -o -E '[0-9]+' | head -n1 || true)
if [ -z "$jobid" ]; then
  echo "Failed to parse job id from enqueue output." >&2
  exit_code=2
  cleanup
  exit $exit_code
fi
echo "Enqueued job id: $jobid"

outpath="$OUT_DIR/${jobid}.png"
timeout=120
interval=2
elapsed=0
echo "Waiting up to ${timeout}s for ${outpath}..."
while [ $elapsed -lt $timeout ]; do
  if [ -f "$outpath" ]; then
    echo "Found ${outpath}" 
    echo "SMOKE TEST PASSED"
    exit_code=0
    break
  fi
  sleep $interval
  elapsed=$((elapsed + interval))
done

if [ $elapsed -ge $timeout ]; then
  echo "SMOKE TEST FAILED: ${outpath} not found after ${timeout}s" >&2
  exit_code=3
fi

echo "Cleaning up started services..."
cleanup

if [ $exit_code -eq 0 ]; then
  echo "Smoke test succeeded — output: $outpath"
else
  echo "Smoke test failed (code $exit_code). See $LOG_DIR for logs." >&2
fi

exit $exit_code
