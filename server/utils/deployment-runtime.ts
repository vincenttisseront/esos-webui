/** Process identity for binary catalog diagnostics (POSIX only). */
export function getRuntimeIdentity(): {
  user: string
  uid: number | null
  gid: number | null
} {
  const uid = typeof process.getuid === 'function' ? process.getuid() : null
  const gid = typeof process.getgid === 'function' ? process.getgid() : null
  const user = process.env.ESOS_RUNTIME_USER
    ?? process.env.USER
    ?? process.env.USERNAME
    ?? (uid != null ? String(uid) : 'unknown')
  return { user, uid, gid }
}

export const BINARIES_VOLUME_HINT
  = 'Montez un volume writable sur /opt/esos-webui/binaries (volume Docker binaries-data ou bind mount avec chown 1000:1000).'
