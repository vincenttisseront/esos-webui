# Terminal WebSocket deployment

The admin terminal uses **WebSocket** at `/ws/terminal` (not SSE). Flow:

1. `GET /api/san/{sanId}/terminal/ws-ticket` — session cookie + RBAC (admin/operator)
2. `wss://<host>/ws/terminal?sanId=…&ticket=…` — upgrade, then `{"type":"init","cols","rows"}`

## Reverse proxy checklist

### Nginx (repo `nginx/nginx.conf`)

- `proxy_http_version 1.1`
- `Upgrade` + `Connection` via `$connection_upgrade` map
- Forward `Cookie`, `X-Forwarded-Proto`, `X-Forwarded-For`
- Long `proxy_read_timeout` / `proxy_send_timeout` for interactive sessions
- `proxy_buffering off` on `/ws/`

Reload after change: `docker compose exec proxy nginx -s reload`

### Traefik (e.g. `esos-webui.ar-systems.fr`)

Traefik forwards WebSocket upgrades automatically **if** the route matches `/ws/terminal`.

- Router must use `PathPrefix(`/`)` or explicitly include `/ws` — do **not** restrict to `/api` only.
- Service must point at the container that runs Nitro (port **3000**) or the nginx proxy (port **80**).
- If TLS terminates at Traefik, backend can stay HTTP; the browser still uses `wss://`.

Example labels (adjust names/hosts):

```yaml
traefik.http.routers.esos-webui.rule=Host(`esos-webui.ar-systems.fr`)
traefik.http.routers.esos-webui.entrypoints=websecure
traefik.http.routers.esos-webui.tls=true
traefik.http.services.esos-webui.loadbalancer.server.port=80
```

No extra Traefik middleware is required for WebSocket; avoid buffering middleware on `/ws`.

## Server logs

On each connection attempt:

```text
[WS Terminal][connect] {"path":"/ws/terminal","sanId":"…","ticketPresent":true,"cookiePresent":true,"remote":"…"}
```

On auth failure:

```text
[WS Terminal][audit] {"outcome":"ticket_rejected","ticketValidation":"expired",…}
[WS Terminal] auth rejected — …
```

If you see **no** `[WS Terminal][connect]` lines when the UI fails, the request never reached the app (proxy/TLS/routing).

## Manual validation

| Step | Expected |
|------|----------|
| Admin opens System Config → Terminal | Ticket 200, then WS open, xterm prompt |
| `docker logs esos-webui-app 2>&1 \| grep 'WS Terminal'` | `[connect]` then `open accepted` |
| Viewer opens terminal | Ticket **403** or WS `esos:forbidden` |
| Expired session | Ticket **401** or WS session message |
| Wrong `sanId` | Ticket OK but WS `esos:san_not_found` (SSH), not “Erreur WebSocket” |
| Break nginx `Upgrade` header | UI shows upgrade/proxy error, **no** server `[connect]` logs |
| Traefik route without `/ws` | Same — immediate client failure, no backend logs |

## Production build

After `npm run build`, Nitro registers `server/routes/ws/terminal.ts` → `.output/server/chunks/routes/ws/terminal.mjs`. Smoke: `node scripts/batch3a-smoke.mjs`.
