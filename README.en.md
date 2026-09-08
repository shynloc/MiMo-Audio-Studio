<div align="center">

# MiMo Audio Studio

**A tactile, self-hostable TTS and ASR workstation for the MiMo Audio API**

English · [简体中文](README.md)

[![CI](https://github.com/shynloc/MiMo-Audio-Studio/actions/workflows/ci.yml/badge.svg)](https://github.com/shynloc/MiMo-Audio-Studio/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-f4511e.svg)](LICENSE)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![React 19](https://img.shields.io/badge/React-19-20232a?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-API-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite 6](https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white)](https://vite.dev/)
[![Hono](https://img.shields.io/badge/Hono-4-e36002?logo=hono&logoColor=white)](https://hono.dev/)
[![PostgreSQL 17](https://img.shields.io/badge/PostgreSQL-17-4169e1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Cloudflare R2](https://img.shields.io/badge/Cloudflare-R2-f38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/r2/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ed?logo=docker&logoColor=white)](https://www.docker.com/)

[Features](#features) · [Screenshots](#screenshots) · [Architecture](#architecture) · [Local development](#local-development) · [Production](#production-deployment) · [Operations](#backup-restore-and-rollback) · [Security](#security-model)

</div>

MiMo Audio Studio is a full-stack voice application built around the [MiMo Audio API](https://mimo.mi.com/docs/en-US/api/audio/tts). It combines speech synthesis, duration-aware speech, speech recognition, and a private audio library in a retro-modern hardware interface. The backend adds accounts, an administrator console, per-user encrypted credentials, private object storage, and a recoverable PostgreSQL data layer.

> [!IMPORTANT]
> This is a community project, not an official Xiaomi MiMo product. MiMo, related API names, and trademarks belong to their respective owners. Review API access, pricing, and terms before use.

## Screenshots

![MiMo Audio Studio workstation](docs/images/studio-overview.jpg)

<table>
  <tr>
    <td width="68%"><img src="docs/images/transport-detail.jpg" alt="Mechanical transport, cassette, status lamps, waveform, and timeline" /></td>
    <td width="32%"><img src="docs/images/inspector-detail.jpg" alt="Voice, delivery, speed, and output controls" /></td>
  </tr>
  <tr>
    <td align="center">Cassette transport, status lamps, physical controls, and seekable timeline</td>
    <td align="center">Voice, delivery, speed, and output controls</td>
  </tr>
</table>

The interface uses local textures, self-hosted fonts, Three.js hardware components, and short mechanical sound effects. It does not use a full-page screenshot as the UI background. Desktop and mobile layouts share the same functional state model.

## Features

- **Speech synthesis** — MiMo V2.5 preset voices, director instructions, delivery styles, five speed levels, and WAV / MP3 / PCM16 output.
- **Low-latency preview** — the API parses upstream SSE while the browser plays PCM16 chunks; the completed stream is wrapped and stored as WAV.
- **Voice design and cloning** — describe a target voice or upload an authorized MP3/WAV reference recording.
- **Duration-aware speech** — iteratively targets a requested duration for announcements, cues, and fixed-length narration.
- **Speech recognition** — MP3/WAV upload, streaming transcription, in-place editing, autosave, and plain-text/Markdown copy.
- **Unified player** — play, pause, stop, previous/next, live timeline updates, seeking, Range playback, and downloads.
- **Accounts and email** — registration, sign-in, email verification, password reset, secure cookies, and rate limits.
- **Per-user credential vault** — stores each MiMo API Key and Base URL separately; plaintext keys are never returned to the browser.
- **Approved API endpoints** — Commercial API and Token Plan CN are built in; administrators can manage additional HTTPS endpoints.
- **Administrator console** — user roles, endpoints, database/R2 health, job counts, and audio statistics.
- **Private media storage** — audio lives in a private Cloudflare R2 bucket and is served by the authenticated same-origin API with Range / HTTP 206 support.
- **Recoverable deployment** — immutable image tags, pre-migration database backups, health checks, persistent data directories, and guarded restore tooling.

## Architecture

```mermaid
flowchart LR
  B["Browser · React 19"] -->|"same-origin HTTPS"| P["Caddy / Nginx"]
  P --> W["Nginx · static UI"]
  P --> A["Hono API · Node.js 22"]
  A --> AUTH["Better Auth"]
  AUTH --> DB[("PostgreSQL 17")]
  A --> DB
  A --> M["MiMo Audio API"]
  A --> R["Cloudflare R2 · private"]
  A --> E["SMTP / Resend"]
  R -->|"authenticated stream · Range 206"| A
```

The browser only talks to the same-origin site and API. MiMo keys, R2 credentials, the database URL, and mail credentials stay on the server. Audio is not exposed through a public R2 URL: the API validates the session, object ownership, and Range request before proxying the object stream.

### Data and trust boundaries

| Data | Stored in | Plaintext visible to browser? |
| --- | --- | --- |
| MiMo API Key | PostgreSQL as AES-256-GCM ciphertext | No; only status and last four characters are returned |
| Accounts and sessions | PostgreSQL + secure cookies | Current-user profile only |
| Generated/uploaded audio | Private Cloudflare R2 | Only the owner's authenticated stream |
| Metadata and transcripts | PostgreSQL | Owner or authorized administrator only |
| R2, SMTP, and database credentials | Server-side `.env` | No |

## Technology stack

| Layer | Technology and responsibility |
| --- | --- |
| UI | React 19.2, React DOM, responsive single-page workstation |
| 3D / Motion | Three.js, React Three Fiber, Drei, Web Audio API, CSS motion |
| Design | IBM Plex Sans, Cormorant Garamond, Phosphor Icons, local textures and mechanical sounds |
| Build | Vite 6, React plugin, ES Modules |
| API | Node.js 22, TypeScript, Hono, Zod, native Fetch / Streams |
| Authentication | Better Auth, email/password, role plugin, secure cookies, verification, password reset |
| Database | PostgreSQL 17, `pg`, Better Auth migrations, idempotent SQL migrations |
| Credential vault | Node.js Crypto, AES-256-GCM, user/provider-bound AAD |
| Audio | MiMo V2.5 TTS/ASR, SSE, PCM16 → WAV, MP3/WAV uploads, HTTP Range |
| Object storage | Cloudflare R2, AWS SDK for JavaScript v3, private bucket |
| Email | Nodemailer SMTP or Resend HTTP API |
| Containers | Multi-stage Dockerfiles, non-root API user, Nginx frontend, Docker Compose |
| Hardening | Read-only Web/API roots, tmpfs, `no-new-privileges`, loopback-only ports |
| Quality | TypeScript checks, Node.js Test Runner, Worker compatibility tests, GitHub Actions |

## Repository layout

```text
.
├── src/                         # React UI, player, auth, and 3D hardware
│   └── lib/                     # Same-origin API and Better Auth clients
├── server/                      # Hono API, MiMo, R2, email, crypto, and database
│   ├── migrations/              # Application SQL migrations
│   ├── scripts/                 # Migration and connection checks
│   └── tests/                   # Crypto, SSE, and client stream tests
├── public/                      # Local textures and mechanical sounds
├── docs/
│   ├── images/                  # README screenshots
│   └── DEPLOYMENT.md            # Additional operations and recovery guidance
├── scripts/                     # Build, backup, restore, and deployment scripts
├── tests/                       # Worker/static-site compatibility tests
├── worker/                      # Static-site Worker entry point
├── Dockerfile                   # Multi-stage frontend image
├── Dockerfile.api               # Multi-stage API image
├── compose.dev.yml              # Local PostgreSQL
└── compose.prod.example.yml     # Production stack template
```

## Local development

### Requirements

- Node.js 22 or newer
- npm 10+
- Docker Engine/Desktop and Docker Compose v2
- A valid MiMo API Key
- A private Cloudflare R2 bucket for complete audio workflows
- SMTP or Resend when testing email verification and password reset

### 1. Clone and install

```bash
git clone https://github.com/shynloc/MiMo-Audio-Studio.git
cd MiMo-Audio-Studio
npm ci
```

### 2. Start PostgreSQL

```bash
docker compose -f compose.dev.yml up -d
docker compose -f compose.dev.yml ps
```

The development database binds only to `127.0.0.1:55432` and persists in the `mimo-postgres-data` volume.

### 3. Create local configuration

```bash
cp .env.example .env.local
chmod 600 .env.local
```

Minimal local settings:

```dotenv
NODE_ENV=development
PORT=8787
APP_ORIGIN=http://127.0.0.1:4173
API_ORIGIN=http://127.0.0.1:8787
APP_BASE_PATH=/
DATABASE_URL=postgresql://mimo:mimo_local_only@127.0.0.1:55432/mimo_audio
REQUIRE_EMAIL_VERIFICATION=false
ADMIN_EMAILS=admin@example.com
```

Development mode provides deterministic local-only auth/encryption secrets. Never copy them into production.

### 4. Migrate and start

```bash
npm run db:migrate
```

Terminal A:

```bash
npm run dev:api
```

Terminal B:

```bash
npm run dev
```

Open `http://127.0.0.1:4173`. Vite proxies `/api` to `127.0.0.1:8787`.

### 5. Configure an account

1. Register an account.
2. If its email appears in `ADMIN_EMAILS`, run `npm run db:migrate` again to synchronize the administrator role.
3. Open Connection Settings, choose or enter an approved Base URL, and store the MiMo API Key.
4. Run Test Connection.
5. Validate TTS with non-sensitive text, then use the generated WAV to validate ASR.

## Configuration

See [`.env.example`](.env.example) for the complete template. Never commit the production `.env`; mode `0600` is recommended.

| Variable | Production | Description |
| --- | --- | --- |
| `NODE_ENV` | Required | Use `production` |
| `PORT` | Required | API container port, default `8787` |
| `APP_ORIGIN` | Required | Public browser origin without a path |
| `API_ORIGIN` | Required | Public API origin; usually equal to `APP_ORIGIN` for same-origin deployment |
| `APP_BASE_PATH` | Required | `/` for a dedicated domain; e.g. `/audioplayer` for a subpath |
| `DATABASE_URL` | Required | PostgreSQL connection URL used by the API |
| `POSTGRES_*` | Compose | Database initialization; password must match `DATABASE_URL` |
| `BETTER_AUTH_SECRET` | Required | Independent random secret, at least 32 characters |
| `CREDENTIAL_ENCRYPTION_KEY` | Required | Base64-encoded 32-byte AES key |
| `ADMIN_EMAILS` | Recommended | Comma-separated administrator bootstrap emails |
| `REQUIRE_EMAIL_VERIFICATION` | Recommended | Set to `true` on the public internet |
| `EMAIL_FROM` | Email enabled | Sender name and address |
| `SMTP_*` / `RESEND_API_KEY` | Choose one | Verification and reset transport |
| `R2_ACCOUNT_ID` | Audio features | Cloudflare account ID, server-side only |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Audio features | S3 credentials scoped to one bucket |
| `R2_BUCKET` | Audio features | Private bucket name |
| `MIMO_API_BASE_URL` | Required | Default MiMo Base URL |
| `MIMO_CONNECT_TIMEOUT_MS` | Optional | Connection timeout policy |
| `MIMO_TOTAL_TIMEOUT_MS` | Optional | End-to-end generation/recognition timeout |
| `MAX_AUDIO_BYTES` | Optional | Server-side audio size limit |

Generate independent production secrets; never reuse one value:

```bash
openssl rand -base64 48   # BETTER_AUTH_SECRET
openssl rand -base64 32   # CREDENTIAL_ENCRYPTION_KEY
openssl rand -hex 32      # POSTGRES_PASSWORD
```

> [!CAUTION]
> Keep `CREDENTIAL_ENCRYPTION_KEY` and `BETTER_AUTH_SECRET` stable across releases. Losing or directly replacing the encryption key makes existing MiMo credentials undecryptable. Store these secrets in a password manager or Secret Manager, separately from database backups.

## Cloudflare R2

1. Create a **Private** bucket.
2. Create an S3 API token scoped to that bucket only.
3. Store the Account ID, access key, secret key, and bucket name in the server-side `.env`.
4. Run `npm run check:r2`.

The check writes a temporary object, reads it through a short-lived signed URL, and removes it. Normal playback does not require a public bucket or direct browser-to-R2 CORS. `/api/audio/:id/content` validates session and ownership, forwards Range requests, and streams the object through the same origin.

## Email transport

Choose SMTP or Resend. `REQUIRE_EMAIL_VERIFICATION=true` requires `EMAIL_FROM` and one working provider configuration.

```bash
npm run check:email             # verify transport without sending
npm run check:email -- --send   # send one test message to SMTP_USER
```

## Production deployment

Separate stable configuration, immutable releases, and persistent data:

```text
/opt/mimo-studio/
├── .env                         # Stable configuration, mode 0600
├── current -> releases/<sha>    # Active release
├── releases/<sha>/              # Read-only source release
├── data/postgres/               # Persistent PostgreSQL data
└── backups/postgres/            # Verified pg_dump archives
```

This example uses `https://voice.example.com/`, Web loopback port `5689`, and API loopback port `8787`.

### 1. Select and verify an immutable revision

```bash
git fetch --all --tags
git status --short
git rev-parse HEAD
npm ci
npm run typecheck
npm run test:api
npm run build
npm run test:sites
npm run build:api
```

Do not build from a working tree with uncommitted changes. Record the full commit SHA and source archive SHA-256.

### 2. Prepare the server and environment

```bash
sudo install -d -m 0700 /opt/mimo-studio
sudo install -d -m 0700 /opt/mimo-studio/releases
sudo install -d -m 0700 /opt/mimo-studio/data/postgres
sudo install -d -m 0700 /opt/mimo-studio/backups/postgres
sudo install -m 0600 .env.example /opt/mimo-studio/.env
sudoedit /opt/mimo-studio/.env
```

Export the verified commit to `/opt/mimo-studio/releases/<12-char-sha>`. Keep `.git`, `.env`, databases, backups, user media, and local caches out of the Docker build context.

For a root domain, set at least:

```dotenv
NODE_ENV=production
APP_ORIGIN=https://voice.example.com
API_ORIGIN=https://voice.example.com
APP_BASE_PATH=/
API_HOST_PORT=8787
WEB_HOST_PORT=5689
API_HEALTH_PATH=/api/health
```

Then add independent database/auth/encryption secrets plus mail and R2 settings. Replace every placeholder and never echo the completed `.env` into logs.

### 3. Deploy or upgrade

```bash
APP_ROOT=/opt/mimo-studio \
SOURCE_DIR=/opt/mimo-studio/releases/<SHORT_SHA> \
COMPOSE_FILE=/opt/mimo-studio/releases/<SHORT_SHA>/compose.prod.example.yml \
ENV_FILE=/opt/mimo-studio/.env \
APP_DATA_DIR=/opt/mimo-studio/data/postgres \
PROJECT_NAME=mimo-studio \
AUDIOPLAYER_RELEASE=<SHORT_SHA> \
WEB_IMAGE_REPO=mimo-studio-web \
API_IMAGE_REPO=mimo-studio-api \
VITE_APP_BASE_PATH=/ \
HEALTH_URL=http://127.0.0.1:8787/api/health \
PUBLIC_URL=https://voice.example.com/ \
/opt/mimo-studio/releases/<SHORT_SHA>/scripts/deploy-production.sh
```

The script rejects weak `.env` permissions, builds immutable images, validates Compose, creates and validates a pre-migration dump, waits for PostgreSQL/API health, runs migrations, and updates Web last. Update `current` only after candidate acceptance; do not automatically remove old releases, images, or backups.

### 4. Caddy reverse proxy

```caddy
voice.example.com {
    encode zstd gzip

    handle /api/* {
        reverse_proxy 127.0.0.1:8787 {
            flush_interval -1
        }
    }

    handle {
        reverse_proxy 127.0.0.1:5689
    }
}
```

`flush_interval -1` forwards TTS/ASR SSE promptly. Back up configuration, then:

```bash
sudo caddy fmt --overwrite /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

Reload Caddy; do not reboot the host. With Cloudflare proxying, use **Full (strict)** SSL/TLS, never Flexible.

### 5. Nginx reverse proxy

```nginx
server {
    listen 443 ssl http2;
    server_name voice.example.com;
    client_max_body_size 52m;

    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 210s;
    }

    location / {
        proxy_pass http://127.0.0.1:5689;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Terminate TLS and configure redirects/security headers at the proxy. Bind Web/API to `127.0.0.1` only and do not publish PostgreSQL.

### 6. Production acceptance

```bash
curl -fsS https://voice.example.com/api/health
curl -I https://voice.example.com/
curl -I https://voice.example.com/assets/<REAL_ASSET>.js
curl -I https://voice.example.com/assets/definitely-missing.js
```

Minimum acceptance checklist:

- all containers are healthy; database and R2 report `ready`;
- HTML, JS, CSS, fonts, textures, and sounds have correct MIME types; unknown assets return `404`;
- registration, verification, sign-in, reset, and administrator entry work;
- the browser only receives key status and last four characters;
- normal TTS, SSE preview, ASR streaming, editing, and autosave work;
- unauthenticated private audio returns `401`; authenticated Range requests return `206`;
- play, pause, stop, seeking, and download work;
- desktop/mobile have no horizontal overflow and no application console errors;
- API, Web, and proxy logs distinguish client-cancelled streams from service failures.

## Data persistence

- Keep PostgreSQL and `.env` outside immutable releases.
- Reuse `BETTER_AUTH_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` during upgrades.
- R2 stores audio; PostgreSQL stores ownership, object keys, configuration, usage, and transcript metadata.
- Password reset revokes sessions but does not delete keys, history, or audio.
- Development and production are independent; accounts and credentials do not migrate automatically.
- Ciphertext is bound to the original `user_id` and cannot be copied to another user.
- PostgreSQL dumps do not contain R2 objects; plan R2 lifecycle and off-site backup separately.

## Backup, restore, and rollback

### Create and validate a backup

```bash
APP_ROOT=/opt/mimo-studio \
COMPOSE_FILE=/opt/mimo-studio/current/compose.prod.example.yml \
ENV_FILE=/opt/mimo-studio/.env \
APP_DATA_DIR=/opt/mimo-studio/data/postgres \
PROJECT_NAME=mimo-studio \
/opt/mimo-studio/current/scripts/backup-postgres.sh
```

Backups use mode `0600`, are validated with `pg_restore --list`, and are never removed automatically.

### Restore PostgreSQL

Restore replaces the application database and temporarily stops API/Web. Verify the dump, checksum, and maintenance window first:

```bash
APP_ROOT=/opt/mimo-studio \
COMPOSE_FILE=/opt/mimo-studio/current/compose.prod.example.yml \
ENV_FILE=/opt/mimo-studio/.env \
APP_DATA_DIR=/opt/mimo-studio/data/postgres \
PROJECT_NAME=mimo-studio \
/opt/mimo-studio/current/scripts/restore-postgres.sh \
  /opt/mimo-studio/backups/postgres/mimo-studio-YYYYMMDDTHHMMSSZ.dump \
  --confirm
```

### Roll back the application

For additive, backward-compatible migrations, retain PostgreSQL and restart the previous Web/API images:

```bash
AUDIOPLAYER_RELEASE=<PREVIOUS_SHA> \
APP_DATA_DIR=/opt/mimo-studio/data/postgres \
APP_ENV_FILE=/opt/mimo-studio/.env \
docker compose --env-file /opt/mimo-studio/.env \
  -p mimo-studio \
  -f /opt/mimo-studio/releases/<PREVIOUS_SHA>/compose.prod.example.yml \
  up -d --no-deps api web
```

Revalidate health, sign-in, encrypted credentials, existing audio, and Range playback. Do not delete R2 objects, PostgreSQL columns, images, or old releases during rollback. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for more operational guidance.

## Security model

- MiMo keys use AES-256-GCM with AAD bound to user ID and provider.
- Credential APIs never return plaintext; Base URLs must be administrator-approved clean HTTPS URLs.
- URLs containing credentials, query strings, fragments, localhost, or private IPs are rejected.
- Cookies use `HttpOnly`, `Secure`, and `SameSite=Lax`; state changes validate trusted origins.
- Sign-in, sign-up, password reset, and generation routes are rate-limited.
- R2 remains private, media ownership is checked, and Range syntax is constrained.
- The API image runs as non-root; production supports read-only roots, tmpfs, and `no-new-privileges`.
- `.env`, databases, dumps, cookies, signed URLs, user audio, and uploads must never enter Git.

If a secret reaches Git history, rotate it first and clean every affected revision; deleting it only from the current tree is insufficient. Use **Security → Report a vulnerability** for private reports. See [`SECURITY.md`](SECURITY.md).

## Verification and commands

```bash
npm run typecheck
npm run test:api
npm run build
npm run test:sites
npm run build:api
npm audit --audit-level=high
```

> `npm run test:sites` requires `dist/client/index.html`; run `npm run build` first.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite frontend |
| `npm run dev:api` | Start/watch the Hono API |
| `npm run db:migrate` | Run Better Auth and application migrations |
| `npm run check:r2` | Verify R2 write/read/cleanup |
| `npm run check:email` | Verify the mail transport |
| `npm run check:email -- --send` | Send one configuration test message |
| `npm run build` | Build frontend and static-site output |
| `npm run build:api` | Compile the production API |
| `scripts/backup-postgres.sh` | Create and validate a PostgreSQL backup |
| `scripts/restore-postgres.sh` | Restore after explicit confirmation |
| `scripts/deploy-production.sh` | Versioned production deployment |

## Troubleshooting

**OFFLINE after sign-in** — check `/api/credentials/mimo`, API logs, the credential row, and whether the encryption key matches the previous release. A stale browser indicator does not prove data loss.

**The key saves but generation fails** — confirm that the Base URL is approved. Commercial and Token Plan keys must match their selected channel.

**Audio plays but seeking fails** — verify that the content endpoint forwards `Range` and returns `206`, `Accept-Ranges`, `Content-Range`, and the correct media type.

**SSE arrives only after completion** — disable proxy buffering and allow enough upstream read time.

**Accounts or keys disappear after upgrade** — verify the same host PostgreSQL directory, `.env`, auth secret, and encryption key are still in use. Never put the database inside a release directory.

## Contributing

Issues and pull requests are welcome. Run the full verification sequence before submitting. UI changes should cover desktop/mobile; audio changes should cover MIME, Range, SSE, and cancellation behavior.

Never submit real API keys, production topology, account identifiers, database dumps, R2 objects, or private audio as fixtures.

## License

Released under the [MIT License](LICENSE). Third-party packages and the MiMo service remain subject to their own licenses, terms, and usage policies.
