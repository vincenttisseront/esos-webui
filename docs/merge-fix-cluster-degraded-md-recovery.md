# Merge conflict resolution: `fix/cluster-degraded-md-recovery`

Use this when merging `fix/cluster-degraded-md-recovery` (or `cursor/cluster-degraded-md-recovery-1661`) into a branch that already has MD metadata diagnostics, advanced cleanup UI, or cluster MD work.

Remote branch: `origin/fix/cluster-degraded-md-recovery`

## Quick options

### A — Abort and merge from remote (cleanest if you have few local commits on `fix/*`)

```powershell
git merge --abort
git fetch origin
git merge origin/fix/cluster-degraded-md-recovery
```

Resolve any remaining conflicts with the rules below.

### B — Finish the merge in progress

For each file, remove all conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) and apply the rules below.

---

## Per-file rules (keep **both** sides’ intent)

| File | Resolution |
|------|------------|
| `server/api/raid/software/arrays/assemble.post.ts` | **Incoming (fix)**: must include `assertClusteredSanAllowsMutation` + `runClusterAssembleMdArray` block before standalone path. Standalone return should be `{ mode: 'standalone', ...result }`. |
| `server/api/raid/software/arrays/zero-superblocks.post.ts` | **Incoming (fix)**: cluster block with `runClusterZeroMdSuperblocks`; reject `mode === 'advanced'` with wipe-signatures message; standalone path unchanged otherwise. |
| `server/utils/raid-preflight.ts` | **Both**: `options?: { sanId?: string }` param; `blockerRefs` in `create_md` case; keep any extra cases from your branch (e.g. wipe/assemble tweaks). |
| `stores/raid.ts` | **Both**: cluster methods (`planStopMdArray`, `planAssembleMdArray`, `clusterStoragePreflight`, `stopMdArray` with `clusterExecution`); getters `mdSoftwareCount`, `mdDetectionItems`, `peerMdDetection`; `pendingAdvancedCleanup` / advanced wipe helpers from your branch. |
| `pages/admin/sans/[id]/raid.vue` | **Both**: `openClusterMdActionModal` + clustered stop/assemble/cleanup handlers **and** advanced cleanup handlers (`handleAdvancedCleanupStoppedMd`, `arrayNeedsAdvancedCleanup`, etc.). Prefer the version that contains **all** of these symbols. |
| `components/raid/StoppedMdArrayCard.vue` | **Both**: advanced cleanup button/props from your branch; keep cluster notice text if only on one side. |
| `i18n/locales/fr.json` & `en.json` | **Both**: keep `raid.md_detection.*`, full `raid.cluster_md.*` including `raid.cluster_md.recovery.*`, and `raid.stopped_md.advanced_cleanup*`. Validate JSON (no duplicate keys). |
| `tests/raid.test.ts` | **Both**: keep `blockerRefs` / md0 block device test from fix **and** any tests only on your branch. |

---

## i18n merge tip

In `raid.cluster_md`, ensure this block exists (from fix branch):

- `recovery.node_state.*`
- `recovery.mode.*`
- `recovery.stop_active_only_*`
- `status.skipped`

In `raid.stopped_md`, keep your branch’s `advanced_cleanup*` keys.

---

## Verify after merge

```powershell
npm run build
npm test -- tests/raid-cluster-md-recovery.test.ts tests/raid-cluster-md-stop.test.ts tests/raid.test.ts
git add -A
git commit -m "merge: fix/cluster-degraded-md-recovery"
```
