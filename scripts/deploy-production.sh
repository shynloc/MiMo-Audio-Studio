#!/bin/sh
set -eu

APP_ROOT=${APP_ROOT:-/opt/mimo-studio}
SOURCE_DIR=${SOURCE_DIR:-$APP_ROOT}
COMPOSE_FILE=${COMPOSE_FILE:-$APP_ROOT/compose.yml}
ENV_FILE=${ENV_FILE:-$APP_ROOT/.env}
APP_DATA_DIR=${APP_DATA_DIR:-$APP_ROOT/data/postgres}
PROJECT_NAME=${PROJECT_NAME:-mimo-studio}
AUDIOPLAYER_RELEASE=${AUDIOPLAYER_RELEASE:?Set AUDIOPLAYER_RELEASE to an immutable release tag}
WEB_IMAGE_REPO=${WEB_IMAGE_REPO:-audioplayer-web}
API_IMAGE_REPO=${API_IMAGE_REPO:-audioplayer-api}
VITE_APP_BASE_PATH=${VITE_APP_BASE_PATH:-/audioplayer}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:8787/audioplayer/api/health}
PUBLIC_URL=${PUBLIC_URL:-}
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

compose() {
  APP_DATA_DIR="$APP_DATA_DIR" APP_ENV_FILE="$ENV_FILE" AUDIOPLAYER_RELEASE="$AUDIOPLAYER_RELEASE" \
    WEB_IMAGE_REPO="$WEB_IMAGE_REPO" API_IMAGE_REPO="$API_IMAGE_REPO" \
    docker compose --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

if [ ! -r "$ENV_FILE" ]; then
  echo "Environment file is not readable: $ENV_FILE" >&2
  exit 1
fi
permissions=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || true)
case "$permissions" in
  600|400) ;;
  *) echo "Refusing deployment: $ENV_FILE must use mode 0600 or 0400" >&2; exit 1 ;;
esac

cd "$SOURCE_DIR"
docker build --build-arg "VITE_APP_BASE_PATH=$VITE_APP_BASE_PATH" -t "$WEB_IMAGE_REPO:$AUDIOPLAYER_RELEASE" .
docker build -f Dockerfile.api -t "$API_IMAGE_REPO:$AUDIOPLAYER_RELEASE" .
compose config >/dev/null

postgres_before=$(compose ps -q postgres)
if [ -n "$postgres_before" ] && [ "$(docker inspect -f '{{.State.Running}}' "$postgres_before")" = "true" ]; then
  APP_ROOT="$APP_ROOT" APP_DATA_DIR="$APP_DATA_DIR" COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE="$ENV_FILE" PROJECT_NAME="$PROJECT_NAME" "$SCRIPT_DIR/backup-postgres.sh"
fi

compose up -d postgres
postgres_id=$(compose ps -q postgres)
attempt=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$postgres_id" 2>/dev/null || true)" = "healthy" ]; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then echo "PostgreSQL did not become healthy" >&2; exit 1; fi
  sleep 2
done

if [ -z "$postgres_before" ]; then
  APP_ROOT="$APP_ROOT" APP_DATA_DIR="$APP_DATA_DIR" COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE="$ENV_FILE" PROJECT_NAME="$PROJECT_NAME" "$SCRIPT_DIR/backup-postgres.sh"
fi

compose run --rm --no-deps api node dist/server-api/scripts/migrate.js
compose up -d --no-deps api

attempt=0
until wget -q --spider "$HEALTH_URL"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then echo "API health check failed: $HEALTH_URL" >&2; exit 1; fi
  sleep 2
done

compose up -d --no-deps web
if [ -n "$PUBLIC_URL" ]; then
  wget -q --spider "$PUBLIC_URL"
fi

echo "Deployment completed: $AUDIOPLAYER_RELEASE"
