# Binary catalog storage (Docker)

The WebUI stores uploaded deployment binaries under **`/opt/esos-webui/binaries`** inside the container.

## Runtime user

| Property | Value |
|----------|--------|
| User | `esos` |
| UID / GID | **1000** / **1000** |
| Process | `node server/index.mjs` (non-root after entrypoint) |

The image entrypoint (`docker/docker-entrypoint.sh`) runs briefly as **root** to `chown` mounted volumes, then drops privileges with `su-exec esos`.

## Docker Compose volumes

Default (`docker-compose.yml`):

```yaml
volumes:
  - binaries-data:/opt/esos-webui/binaries
```

`binaries-data` is a **named local volume** — persistent across container recreates and writable by UID 1000 after entrypoint.

SQLite and other app data remain on `db-data:/app/data`.

## First-time setup

```bash
# Build and start (creates binaries-data automatically)
docker compose build app
docker compose up -d

# Verify from logs
docker compose logs app | grep '\[binaries\]'
# Expected: [binaries] Stockage OK: /opt/esos-webui/binaries (0 fichier(s), uid=1000)
```

Open **Administration → Catalogue des binaires** and confirm **Inscriptible: Oui**.

## Optional: seed from host directory (bind mount)

Only on Linux hosts where you can fix ownership:

```bash
mkdir -p ./binaries
sudo chown -R 1000:1000 ./binaries
```

Uncomment in `docker-compose.yml`:

```yaml
- ./binaries:/opt/esos-webui/binaries:rw
```

Comment out the `binaries-data` line for that service to avoid double-mounting the same path.

## Verify write access manually

Inside the running container:

```bash
docker compose exec app sh -c 'id && touch /opt/esos-webui/binaries/.probe && rm /opt/esos-webui/binaries/.probe && echo OK'
```

Or use the UI status panel / `GET /api/admin/binaries/status`.

## Environment

| Variable | Default |
|----------|---------|
| `ESOS_BINARIES_DIR` | `/opt/esos-webui/binaries` |
| `ESOS_RUNTIME_UID` / `ESOS_RUNTIME_GID` | `1000` (entrypoint only) |
| `ESOS_RUNTIME_USER` | `esos` (diagnostics display) |
| `NUXT_DEPLOYMENT_MAX_BYTES` | `524288000` (500 MiB) |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Writable: **no**, Exists: **yes** | Rebuild image (entrypoint), recreate container: `docker compose up -d --force-recreate app` |
| Bind mount from Windows host | Prefer `binaries-data` volume; or fix ACLs / use WSL2 path with `chown 1000:1000` |
| Upload 503 `BINARIES_DIR_NOT_WRITABLE` | Check volume mount and `docker compose logs app` for `[binaries]` warning |

After changing compose volumes, always recreate the app container:

```bash
docker compose up -d --force-recreate app
```
