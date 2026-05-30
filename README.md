# ESOS WebUI

Web UI for [ESOS](https://github.com/esos-project/esos) SAN administration — storage topology, targets, RAID, cluster HA, performance metrics, and remote terminal access over SSH.

Built with [Nuxt 4](https://nuxt.com/) (Vue 3, SSR). The server connects to one or more ESOS nodes via SSH and stores local settings (users, SAN credentials, alert thresholds) in SQLite.

## Features

- **Dashboard** — overview of targets, FC ports, volumes, and I/O throughput
- **Multi-SAN** — register and manage several ESOS nodes from a single UI
- **Topology & inventory** — visual storage layout and hardware inventory
- **Cluster HA** — cluster health, attention points, and recovery actions
- **Administration** — users (RBAC), auth providers (local / OIDC / LDAP), binary deployment catalog, alert thresholds
- **Terminal** — browser-based SSH terminal (WebSocket) for admins and operators

## Requirements

| Context | Requirements |
|---------|--------------|
| **Production (Docker)** | Docker Engine 24+ and Docker Compose v2 |
| **Local development** | Node.js **≥ 22**, npm; native build toolchain for `better-sqlite3`, `argon2`, and `ssh2` (Python 3, make, g++ on Linux/macOS; [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) on Windows) |
| **ESOS target** | SSH access to the SAN node(s) with a key or password |

## Installation (Docker — recommended)

### 1. Clone and configure

```bash
git clone <repository-url> esos-webui
cd esos-webui

cp .env.example .env
```

Edit `.env` and set at minimum:

- `NUXT_ENCRYPTION_KEY` — AES-256 key for encrypting SAN SSH credentials in the database
- `NUXT_JWT_SECRET` — HMAC secret for session tokens (32+ characters)
- `NUXT_SSH_HOST`, `NUXT_SSH_USER` — optional legacy single-SAN SSH settings (multi-SAN credentials are managed in the UI)

Generate secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. SSH key

Place the private key used to reach ESOS at `./keys/esos_rsa` (this path is mounted read-only into the container). Match `NUXT_SSH_KEY_PATH` in `.env` if you use a different mount target.

Alternatively, set `NUXT_SSH_PRIVATE_KEY` (base64-encoded key) or `NUXT_SSH_PASSWORD` in `.env` instead of a file mount.

### 3. Build and start

```bash
docker compose build app
docker compose up -d
```

The stack exposes the UI on **port 80** via the bundled nginx reverse proxy (`http://localhost/`). The app container listens on port 3000 internally.

Check health:

```bash
docker compose logs app
curl -s http://localhost/api/health
```

### Binary catalog volume

Uploaded deployment binaries are stored in `/opt/esos-webui/binaries` inside the app container (named volume `binaries-data`). The app runs as user **`esos` (UID/GID 1000)**.

See **[docs/deploy-binary-catalog.md](docs/deploy-binary-catalog.md)** for volume setup, permissions, and troubleshooting.

## Installation (local development)

```bash
git clone <repository-url> esos-webui
cd esos-webui

cp .env.example .env
```

Adjust `.env` for local use, for example:

```env
NODE_ENV=development
NUXT_PORT=3000
NUXT_HOST=127.0.0.1
DB_PATH=./data/esos-webui.db
NUXT_ENCRYPTION_KEY=<generated-hex>
NUXT_JWT_SECRET=<generated-hex>
NUXT_COOKIE_SECURE=false
NUXT_SSH_HOST=<your-esos-host>
NUXT_SSH_USER=root
NUXT_SSH_KEY_PATH=./keys/esos_rsa
```

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open **http://localhost:3000**. Hot reload is enabled; the SQLite database and migrations are created automatically on first start.

Production build locally:

```bash
npm run build
npm run start
```

## Configuration reference

All settings live in `.env` (never commit this file). See [`.env.example`](.env.example) for the full list. Common variables:

| Variable | Purpose |
|----------|---------|
| `NUXT_ENCRYPTION_KEY` | Required once at least one SAN is registered — encrypts SSH credentials in SQLite |
| `NUXT_JWT_SECRET` | Signs session JWTs; changing it invalidates all active sessions |
| `DB_PATH` | SQLite database path (default in Docker: `/app/data/esos-webui.db`) |
| `NUXT_SSH_*` | Default / legacy SSH connection to a single ESOS node |
| `NUXT_COOKIE_SECURE` | Set to `false` when serving over plain HTTP |
| `NUXT_PUBLIC_SSH_STATUS_POLL_MS` | Client polling interval for global SSH status (default 30s) |

Persistent Docker volumes:

- `db-data` → `/app/data` (SQLite, deployment catalog copies)
- `binaries-data` → `/opt/esos-webui/binaries` (binary catalog)

## Using the application

### First login

On the **first startup**, if no users exist, the server creates a default **`admin`** account and prints the generated password **once** in the container or terminal logs:

```bash
docker compose logs app   # Docker
# or watch the terminal where `npm run dev` / `npm run start` is running
```

Sign in at `/login`. You will be prompted to **change the password** immediately.

### Register ESOS SAN nodes

1. Log in as **admin** or **operator**.
2. Go to **Administration → SANs** (`/admin/sans`).
3. Click **Add SAN** and fill in label, host, SSH port, username, and authentication (private key or password).
4. Save — the UI tests connectivity and stores credentials encrypted with `NUXT_ENCRYPTION_KEY`.

Once a SAN is active, use the SAN selector in the header to switch context across dashboard, topology, RAID, performance, terminal, and other views.

### User roles

| Role | Capabilities |
|------|----------------|
| **admin** | Full access — users, auth providers, SAN management, binary deployment, system config |
| **operator** | Operational tasks — SAN management, terminal, most write actions |
| **viewer** | Read-only access to dashboards and inventory |

Manage accounts under **Administration → Users** (`/admin/users`).

### Language

The UI supports **French** (default) and **English**. Switch language from the user menu or profile page.

### Terminal access

The web terminal requires a working reverse proxy WebSocket setup. With the bundled nginx config this works out of the box on port 80. For external proxies (Traefik, etc.), see **[docs/deploy-terminal-websocket.md](docs/deploy-terminal-websocket.md)**.

## Development scripts

```bash
npm run dev          # Development server with hot reload
npm run build        # Production build → .output/
npm run start        # Run production build
npm run preview      # Preview production build
npm run test         # Run Vitest test suite
npm run test:watch   # Vitest in watch mode
```

## Additional documentation

- [Binary catalog storage (Docker)](docs/deploy-binary-catalog.md)
- [Terminal WebSocket proxy](docs/deploy-terminal-websocket.md)
- [Theming](docs/theming.md)
- [Internationalization (i18n)](docs/i18n.md)
