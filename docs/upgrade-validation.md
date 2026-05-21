# ESOS Upgrade Assistant — manual validation

See also [theming.md](./theming.md) for UI theme checks.

## Prerequisites

- SSH-connected SAN(s) with admin account
- Optional: HA cluster with two nodes

## Phase A — Readiness

1. Open **Administration → SANs → [SAN] → System configuration** → tab **Upgrade / Mise à niveau** → **Readiness / Préparation**.
2. Standalone SAN with ≥ 5 GiB `/tmp` → overall **Prêt**.
3. Enable SAN read-only → **Bloqué**, check `SAN modifiable`.
4. Cluster: both nodes SSH up, Pacemaker healthy → **Prêt** or warnings if DRBD resync active.

## Phase B — Package (admin)

1. **Version ESOS** page: compare only; **Prepare upgrade** opens system config (`?tab=upgrade`).
2. Sign in as **operator** → Package sub-tab hidden.
3. Sign in as **admin** → upload small test zip (or real ESOS package).
4. Verify progress, `install.sh` path shown, no `install.sh` execution in logs.
5. DELETE staging → files removed on host.

## Phase C — Plan

1. On system config **Upgrade** tab, generate plan after readiness (and optional package).
2. Cluster (header scope): nodes ordered (secondary before primary when roles set).
3. Steps include `conf_sync` before `install` and `reboot`; commands copyable.
4. URL: `/admin/sans/:id/system-config?tab=upgrade&upgradeTab=plan`

## Phase D — Execute (future)

Placeholder tab only. Do not run `install.sh` via WebUI until Phase D ships.

## Automated tests

```bash
npm run test -- tests/upgrade-readiness.test.ts tests/upgrade-plan.test.ts tests/upgrade-package-transfer.test.ts
npm run test:rbac
```
