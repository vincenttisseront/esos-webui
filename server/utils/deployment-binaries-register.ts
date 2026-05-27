import { readFile } from 'node:fs/promises'
import type { DeploymentInstallSpec } from '~/types/deployment'

function parseDeployManifest(raw: string): DeploymentInstallSpec {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>
    const spec: DeploymentInstallSpec = {}
    if (typeof j.version === 'string') spec.version = j.version
    if (typeof j.remotePath === 'string') spec.remotePath = j.remotePath
    if (j.installKind === 'copy_executable' || j.installKind === 'rpm' || j.installKind === 'perccli') {
      spec.installKind = j.installKind
    }
    return spec
  } catch {
    return {}
  }
}

export async function loadInstallSpecForFile(sourceFile: string, filename: string): Promise<DeploymentInstallSpec> {
  const sidecar = `${sourceFile}.deploy.json`
  try {
    const raw = await readFile(sidecar, 'utf-8')
    return parseDeployManifest(raw)
  } catch {
    /* no sidecar */
  }
  const spec: DeploymentInstallSpec = {}
  const lower = filename.toLowerCase()
  if (lower.includes('perccli') && lower.endsWith('.rpm')) {
    spec.installKind = 'perccli'
  } else if (lower.endsWith('.rpm')) {
    spec.installKind = 'rpm'
  } else {
    spec.installKind = 'copy_executable'
    const base = filename.split('/').pop() ?? filename
    spec.remotePath = `/usr/local/sbin/${base}`
  }
  return spec
}
