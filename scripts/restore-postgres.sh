#!/bin/sh
set -eu

if [ "$#" -ne 2 ] || [ "$2" != "--confirm" ]; then
  echo "Usage: $0 /absolute/path/to/backup.dump --confirm" >&2
  echo "This replaces the application database and stops the API and web services." >&2
  exit 2
fi

backup_path=$1
case "$backup_path" in
  /*) ;;
  *) echo "Backup path must be absolute" >&2; exit 2 ;;
esac
if [ ! -r "$backup_path" ]; then
  echo "Backup is not readable: $backup_path" >&2
  exit 1
fi

APP_ROOT=${APP_ROOT:-/opt/mimo-studio}
COMPOSE_FILE=${COMPOSE_FILE:-$APP_ROOT/compose.yml}
ENV_FILE=${ENV_FILE:-$APP_ROOT/.env}
PROJECT_NAME=${PROJECT_NAME:-mimo-studio}
APP_DATA_DIR=${APP_DATA_DIR:-$APP_ROOT/data/postgres}

compose() {
  APP_DATA_DIR="$APP_DATA_DIR" APP_ENV_FILE="$ENV_FILE" \
    docker compose --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

postgres_id=$(compose ps -q postgres)
if [ -z "$postgres_id" ] || [ "$(docker inspect -f '{{.State.Running}}' "$postgres_id")" != "true" ]; then
  echo "PostgreSQL is not running" >&2
  exit 1
fi
docker exec -i "$postgres_id" sh -c 'exec pg_restore --list' < "$backup_path" >/dev/null

compose stop api web
docker exec "$postgres_id" sh -c 'dropdb --force --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker exec -i "$postgres_id" sh -c 'exec pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' < "$backup_path"
compose start api web

echo "Database restore completed from $backup_path"
