/**
 * Parser rc.conf (services activés) — SDD v3.8 §3.3
 * Ligne type : rc.corosync_enable="YES"
 */

export interface ClusterRcConf {
  corosyncEnabled:  boolean
  pacemakerEnabled: boolean
  scstEnabled:      boolean
}

export function parseClusterRcConf(raw: string): ClusterRcConf {
  const isYes = (key: string): boolean => {
    const m = raw.match(new RegExp(String.raw`${key}=["']?(YES|NO)["']?`, 'i'))
    return m?.[1]?.toUpperCase() === 'YES'
  }

  return {
    corosyncEnabled:  isYes(String.raw`rc\.corosync_enable`),
    pacemakerEnabled: isYes(String.raw`rc\.pacemaker_enable`),
    scstEnabled:      isYes(String.raw`rc\.scst_enable`),
  }
}
