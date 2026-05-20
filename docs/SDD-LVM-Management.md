# SDD — LVM Management (ESOS WebUI)

## Scope

SAN-scoped LVM management: PV / VG / LV lifecycle, preflight + typed confirmation, SCST `vdisk_blockio` binding, cluster read-only symmetry hints.

## APIs

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/lvm/overview?sanId=` | Scan PV/VG/LV, candidates, peer `clusterLvmDetection` |
| POST | `/api/lvm/preflight` | Validate action |
| POST | `/api/lvm/pv/create` | `pvcreate` |
| POST | `/api/lvm/vg/create` | `vgcreate` |
| POST | `/api/lvm/lv/create` | `lvcreate` |
| DELETE | `/api/lvm/pv` | `pvremove` |
| DELETE | `/api/lvm/vg` | `vgremove` |
| DELETE | `/api/lvm/lv` | `lvremove` |
| POST | `/api/lvm/lv/bind-scst` | Create SCST device from LV path |
| POST | `/api/lvm/*/create/plan` | Cluster execution plan (no writes) |
| POST | `/api/lvm/*/create/cluster` | Execute cluster plan on all nodes |
| GET | `/api/lvm/cluster/inventory?clusterId=` | Per-node LVM + candidates + MD arrays |
| POST | `/api/lvm/cluster/preflight` | Cluster-wide preflight + disk mappings |

## Cluster

- **local_symmetric**: per-node PV/VG/LV on each node; symmetry by name, size, and structure (PV/VG/LV UUIDs may differ).
- **Mapping**: `/dev/mdN` maps to the same path on peers when MD arrays match structurally (`server/utils/lvm-cluster-preflight.ts`).
- **Mutations on clustered SAN**: require `clusterExecution` in body; standalone create returns **409**.
- **clvmd / shared VG**: blocked for mutations; warning in overview.
- **Wizards**: `LvmClusterPvWizard`, `LvmClusterVgWizard`, `LvmClusterLvWizard` with `LvmClusterPlanReview`, mapping/preflight panels, and per-node execution results.
- **Sync config**: does not create PV/VG/LV on peers; operators must use cluster wizards.
- **Commands**: `pvcreate -y -v`, `vgcreate -v`, `lvcreate -y -v` (non-interactive + verbose).

## UI

RAID page tab **LVM** (`pages/admin/sans/[id]/raid.vue`), store `stores/lvm.ts`, wizards under `components/lvm/`.

## Reference

[ESOS wiki — LVM Configuration](https://github.com/quantum/esos/wiki/33_LVM_Configuration)
