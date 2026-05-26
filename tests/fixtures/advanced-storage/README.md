# Advanced Storage fixtures

Captured shapes for unit tests. When validating on a live ESOS node, compare command output and update fixtures if paths differ.

## Manual validation checklist (Phase A)

1. SAN with DRBD — resources visible; `/dev/drbd*` in block backends table.
2. `rc.drbd_enable` and `rc.drbd` service status match UI service row.
3. Multipath maps listed when `multipath -ll` is non-empty.
4. Node without ZFS — card shows not installed; page still loads.
5. Deprecated section only when lessfs / EnhanceIO / BTIER detected.
6. Viewer can open page and refresh; no mutation controls.
7. EN/FR — all `advanced_storage.*` labels translated.
8. Block backends link to RAID page for the same SAN.

## Known ESOS path variance

- mhVTL: `/etc/mhvtl/devices.conf`, `/dev/mhvtl/*`, `vtlcmd`
- Ceph RBD: `/etc/ceph/rbdmap`, `/dev/rbd/*`
- bcache sysfs: `/sys/fs/bcache`

Document any drift found during lab validation in this file.
