#!/bin/sh
set -eu

APP_ROOT=${APP_ROOT:-/opt/mimo-studio}
COMPOSE_FILE=${COMPOSE_FILE:-$APP_ROOT/compose.yml}
ENV_FILE=${ENV_FILE:-$APP_ROOT/.env}
PROJECT_NAME=${PROJECT_NAME:-mimo-studio}
BACKUP_DIR=${BACKUP_DIR:-$APP_ROOT/backups/postgres}
APP_DATA_DIR=${APP_DATA_DIR:-$APP_ROOT/data/postgres}

compose() {
  APP_DATA_DIR="$APP_DATA_DIR" APP_ENV_FILE="$ENV_FILE" \
    docker compose --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

if [ ! -r "$COMPOSE_FILE" ]; then
  echo "Compose file is not readable: $COMPOSE_FILE" >&2
  exit 1
fi
if [ ! -r "$ENV_FILE" ]; then
  echo "Environment file is not readable: $ENV_FILE" >&2
  exit 1
fi

postgres_id=$(compose ps -q postgres)
if [ -z "$postgres_id" ] || [ "$(docker inspect -f '{{.State.Running}}' "$postgres_id")" != "true" ]; then
  echo "PostgreSQL is not running" >&2
  exit 1
fi

umask 077
mkdir -p "$BACKUP_DIR"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_path="$BACKUP_DIR/mimo-studio-$timestamp.dump"
partial_path="$backup_path.partial"

cleanup() {
  rm -f "$partial_path"
}
trap cleanup EXIT HUP INT TERM

docker exec "$postgres_id" sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$partial_path"
docker exec -i "$postgres_id" sh -c 'exec pg_restore --list' < "$partial_path" >/dev/null
mv "$partial_path" "$backup_path"
trap - EXIT HUP INT TERM
chmod 600 "$backup_path"
printf '%s\n' "$backup_path"
