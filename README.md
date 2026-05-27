# esos-webui

Web UI for ESOS SAN administration.

## Docker deployment

```bash
cp .env.example .env
# Edit .env (NUXT_ENCRYPTION_KEY, NUXT_JWT_SECRET, SSH settings, …)
docker compose build app
docker compose up -d
```

### Binary catalog storage

Uploaded binaries are stored in `/opt/esos-webui/binaries` inside the app container (named volume `binaries-data`). The app runs as user **`esos` (UID/GID 1000)**.

See **[docs/deploy-binary-catalog.md](docs/deploy-binary-catalog.md)** for volume setup, permissions, and troubleshooting.

### Other docs

- [Terminal WebSocket proxy](docs/deploy-terminal-websocket.md)
