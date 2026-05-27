import { describe, expect, it } from 'vitest'
import type { DeploymentBinaryDto } from '~/types/deployment'
import type { MissingToolsReadiness } from '~/types/missing-tools'
import { buildSanBinaryDeploymentContext } from '~/utils/binary-deployment-compatibility'

function binary(partial: Partial<DeploymentBinaryDto> & Pick<DeploymentBinaryDto, 'id' | 'name' | 'filename'>): DeploymentBinaryDto {
  return {
    version: null,
    sourcePath: partial.filename,
    storedPath: `/opt/esos-webui/binaries/${partial.filename}`,
    sizeBytes: 1_000_000,
    sha256: 'a'.repeat(64),
    kind: 'rpm',
    installSpec: {},
    status: 'available',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  }
}

function readiness(partial: Partial<MissingToolsReadiness>): MissingToolsReadiness {
  return {
    sanId: 'san1',
    scannedAt: Date.now(),
    controller: {
      detected: true,
      vendor: 'dell_perc',
      model: 'PERC H730',
      pciAddress: '03:00.0',
      managementMode: 'read_only_limited',
    },
    tools: {
      perccli: false,
      perccli64: false,
      storcli: false,
      storcli64: false,
      arcconf: false,
      megacli64: false,
      resolvedPath: null,
      version: null,
    },
    recommendation: { action: 'install_perccli64', reason: 'test', packageKind: 'perccli_rpm' },
    ...partial,
  }
}

describe('buildSanBinaryDeploymentContext', () => {
  const perccliRpm = binary({
    id: 'b-perc',
    name: 'perccli-1.17.10',
    filename: 'perccli-1.17.10-1.noarch.rpm',
    installSpec: { installKind: 'perccli' },
  })
  const arcconfBin = binary({
    id: 'b-arc',
    name: 'arcconf',
    filename: 'arcconf-4.30.zip',
    kind: 'archive',
  })
  const unrelated = binary({
    id: 'b-other',
    name: 'custom-tool',
    filename: 'my-custom-tool.bin',
    kind: 'executable',
  })

  it('Dell PERC + perccli missing => perccli deployable', () => {
    const ctx = buildSanBinaryDeploymentContext({
      binaries: [perccliRpm, arcconfBin, unrelated],
      readiness: readiness({ controller: { detected: true, vendor: 'dell_perc', model: 'PERC', pciAddress: '1', managementMode: 'read_only_limited' } }),
    })
    expect(ctx.hardwareKnown).toBe(true)
    expect(ctx.missingToolGroups).toContain('megaraid_cli')
    expect(ctx.primaryDeployables.map(e => e.binary.id)).toEqual(['b-perc'])
    expect(ctx.otherCatalogBinaries.map(b => b.id)).not.toContain('b-perc')
  })

  it('Dell PERC + perccli installed => no primary deploy action', () => {
    const ctx = buildSanBinaryDeploymentContext({
      binaries: [perccliRpm],
      readiness: readiness({
        tools: {
          perccli: false,
          perccli64: true,
          storcli: false,
          storcli64: false,
          arcconf: false,
          megacli64: false,
          resolvedPath: '/opt/MegaRAID/perccli/perccli64',
          version: '1.17.10',
        },
        controller: { detected: true, vendor: 'dell_perc', model: 'PERC', pciAddress: '1', managementMode: 'full' },
        recommendation: { action: 'none', reason: 'ok', packageKind: null },
      }),
    })
    expect(ctx.primaryDeployables).toHaveLength(0)
    expect(ctx.installedToolGroups).toContain('megaraid_cli')
    expect(ctx.installedCompatible).toHaveLength(1)
    expect(ctx.advancedDeployables.some(e => e.binary.id === 'b-perc')).toBe(true)
  })

  it('Adaptec => arcconf deployable', () => {
    const ctx = buildSanBinaryDeploymentContext({
      binaries: [perccliRpm, arcconfBin],
      readiness: readiness({
        controller: { detected: true, vendor: 'adaptec_aacraid', model: 'Adaptec', pciAddress: '2', managementMode: 'read_only_limited' },
      }),
    })
    expect(ctx.primaryDeployables.map(e => e.binary.id)).toEqual(['b-arc'])
    expect(ctx.primaryDeployables.map(e => e.binary.id)).not.toContain('b-perc')
  })

  it('unrelated binary hidden from primary on Dell PERC', () => {
    const ctx = buildSanBinaryDeploymentContext({
      binaries: [perccliRpm, unrelated],
      readiness: readiness({}),
    })
    expect(ctx.primaryDeployables.every(e => e.binary.id !== 'b-other')).toBe(true)
    expect(ctx.otherCatalogBinaries.some(b => b.id === 'b-other')).toBe(true)
  })

  it('unknown hardware => no recommendation', () => {
    const ctx = buildSanBinaryDeploymentContext({
      binaries: [perccliRpm],
      readiness: readiness({
        controller: { detected: false, vendor: null, model: null, pciAddress: null, managementMode: null },
      }),
    })
    expect(ctx.hardwareKnown).toBe(false)
    expect(ctx.primaryDeployables).toHaveLength(0)
    expect(ctx.missingToolGroups).toHaveLength(0)
  })
})
