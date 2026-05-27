export function getDeploymentConfig() {
  return {
    binariesDir: process.env.ESOS_BINARIES_DIR || '/opt/esos-webui/binaries',
    catalogDir: process.env.ESOS_DEPLOYMENT_CATALOG_DIR || '/app/data/deployment-binaries',
    maxBytes: Number(process.env.NUXT_DEPLOYMENT_MAX_BYTES ?? 524_288_000),
  }
}
