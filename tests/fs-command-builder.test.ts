import { describe, expect, it } from 'vitest'
import {
  buildCreateFilesystemCommands,
  buildCreateVdiskCommands,
  buildFstabLine,
  buildMkfsCommand,
  mkfsDevicePath,
} from '~/utils/fs-command-builder'

describe('fs-command-builder', () => {
  it('mkfs device path with gpt on raw disk', () => {
    expect(mkfsDevicePath('/dev/sdb', 'gpt')).toBe('/dev/sdb1')
    expect(mkfsDevicePath('/dev/mapper/vg-lv', 'gpt')).toBe('/dev/mapper/vg-lv')
  })

  it('builds xfs mkfs command', () => {
    expect(buildMkfsCommand('/dev/sdb1', 'xfs', 'fs01')).toContain('mkfs.xfs')
    expect(buildMkfsCommand('/dev/sdb1', 'xfs', 'fs01')).toContain('-L')
  })

  it('fstab line format', () => {
    const line = buildFstabLine('abc-uuid', '/mnt/vdisks/fs01', 'xfs')
    expect(line).toContain('UUID=abc-uuid')
    expect(line).toContain('/mnt/vdisks/fs01')
    expect(line).toContain('defaults')
  })

  it('create filesystem command sequence', () => {
    const cmds = buildCreateFilesystemCommands({
      backendPath: '/dev/md0',
      fsType: 'xfs',
      label: 'fs01',
      mountPoint: '/mnt/vdisks/fs01',
      partitionStrategy: 'none',
    })
    expect(cmds.some(c => c.includes('mkfs.xfs'))).toBe(true)
    expect(cmds.some(c => c.includes('mkdir'))).toBe(true)
    expect(cmds.some(c => c.includes('mount'))).toBe(true)
  })

  it('vdisk fallocate command', () => {
    const cmds = buildCreateVdiskCommands('/mnt/vdisks/fs01/a.img', 1_000_000, 'fallocate')
    expect(cmds[0]).toContain('fallocate')
  })
})
