#!/usr/bin/env bash
set -euo pipefail

# Wait for a docker-compose service to report healthy via `docker compose ps --services --filter "health=healthy"`.
# Usage: wait_for_docker_health.sh <service> [timeout_seconds]

SERVICE=${1:-render-admin-static}
TIMEOUT=${2:-60}

echo "Waiting up to ${TIMEOUT}s for docker-compose service '${SERVICE}' to become healthy..."

end=$((SECONDS + TIMEOUT))
while [ ${SECONDS} -le ${end} ]; do
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker not found in PATH; cannot wait for service health. Exiting with success (CI may not have docker)."
    exit 0
  fi

  unhealthy=$(docker compose ps --services --filter "health=unhealthy" 2>/dev/null || true)
  if [ -n "$unhealthy" ]; then
    echo "Service reported unhealthy: $unhealthy"
    docker compose logs ${SERVICE} --no-color || true
    exit 1
  fi

  healthy=$(docker compose ps --services --filter "health=healthy" 2>/dev/null || true)
  if echo "$healthy" | grep -q "${SERVICE}"; then
    echo "${SERVICE} is healthy"
    exit 0
  fi

  sleep 2
done

echo "Timed out waiting for ${SERVICE} to become healthy after ${TIMEOUT}s"
docker compose ps || true
exit 2
