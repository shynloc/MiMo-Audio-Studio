# Production operations

This guide complements the root `README.md`. It focuses on preserving user accounts, encrypted API credentials, PostgreSQL records, and private audio objects during upgrades.

## Invariants

Before every release, verify all of the following:

1. PostgreSQL is backed by an explicit host directory or managed persistent volume.
2. `BETTER_AUTH_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` are unchanged from the active release.
3. The environment file is readable only by the deployment account.
4. A verified `pg_dump -Fc` exists outside the PostgreSQL data directory.
5. The current frontend and API image tags are recorded for rollback.
6. R2 lifecycle rules will not remove objects still referenced by `audio_assets`.

Changing `CREDENTIAL_ENCRYPTION_KEY` without a credential re-encryption migration makes existing user credentials unreadable. Restoring PostgreSQL alone cannot recover a lost encryption key.

## Release sequence

The supported path is:

```bash
APP_ROOT=/opt/mimo-studio \
AUDIOPLAYER_RELEASE=$(git rev-parse --short=12 HEAD) \
VITE_APP_BASE_PATH=/ \
HEALTH_URL=http://127.0.0.1:8787/api/health \
PUBLIC_URL=https://voice.example.com/ \
./scripts/deploy-production.sh
```

For immutable release directories, keep configuration and data outside the release and set `SOURCE_DIR`, `COMPOSE_FILE`, `ENV_FILE`, and `APP_DATA_DIR` explicitly. This prevents a release symlink change from selecting a different PostgreSQL directory.

The script builds immutable images, backs up the live database, starts PostgreSQL, runs additive migrations, updates the API, waits for health, and finally updates the frontend.

After deployment, compare pre-release and post-release counts for at least:

```sql
select count(*) from "user";
select count(*) from api_credentials;
select count(*) from generation_jobs;
select count(*) from audio_assets where deleted_at is null;
```

Also verify:

- `/api/health` (or `<APP_BASE_PATH>/api/health`) reports the database and object storage as ready;
- an existing account can sign in;
- its credential metadata still reports configured;
- one stored audio item receives a same-origin authenticated content URL;
- a valid `Range` request to that URL returns `206 Partial Content` with the correct media type;
- password reset revokes old sessions but retains credentials and audio history.

## Backup schedule

Run `scripts/backup-postgres.sh` at least daily and before every migration. Store copies on a different failure domain and monitor both job exit status and backup age.

Example cron entry:

```cron
17 3 * * * APP_ROOT=/opt/mimo-studio /opt/mimo-studio/scripts/backup-postgres.sh >>/var/log/mimo-studio-backup.log 2>&1
```

The backup script validates the dump catalog with `pg_restore --list`, uses mode `0600`, and never removes old files. Apply a separate reviewed retention policy only after backups have been copied and tested.

## Restore rehearsal

Do not make the production outage your first restore test. Restore a recent dump into an isolated PostgreSQL instance or temporary database, run the row-count queries above, and record the result.

For a real in-place restore:

```bash
APP_ROOT=/opt/mimo-studio \
./scripts/restore-postgres.sh /absolute/path/to/verified.dump --confirm
```

This is intentionally destructive: it stops API and Web, replaces the application database, restores the selected archive, then starts the services. Keep the selected dump and its checksum before running it.

## Application rollback

Database migrations in the current schema are additive. To roll back application containers without restoring PostgreSQL:

```bash
APP_ROOT=/opt/mimo-studio \
AUDIOPLAYER_RELEASE=<PREVIOUS_RELEASE> \
docker compose --env-file /opt/mimo-studio/.env \
  -p mimo-studio -f /opt/mimo-studio/compose.yml \
  up -d --no-deps api web
```

Do not delete R2 objects or drop newly added columns during an application rollback. If a future release contains destructive database changes, it must ship with a dedicated forward and reverse migration plan.

## Incident notes

- A missing credential indicator in the browser is not proof that the database row was deleted. Check the credential endpoint, API logs, database row, and encryption key fingerprint separately.
- Local development and production databases are independent. A production cutover must explicitly migrate accounts and media if continuity from the local prototype is required.
- Encrypted credential rows are bound to their original user IDs. Copying ciphertext between independently created accounts will fail authentication by design.
