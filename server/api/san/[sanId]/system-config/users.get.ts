import { runCommand } from '~~/server/utils/config-writer'

interface UserInfo {
  username:           string
  uid:                number
  shell:              string
  home:               string
  hasHomeDir:         boolean
  lastPasswordChange: string | null
}

export default defineEventHandler(async (event) => {
  const sanId = getRouterParam(event, 'sanId')!

  // For each member of root group, collect passwd fields + shadow last-change + /home existence
  const { stdout } = await runCommand(
    sanId,
    `getent group root | awk -F: '{print $4}' | tr ',' '\\n' | grep -v '^$' | grep -v '^root$' | while IFS= read -r u; do e=$(getent passwd "$u" 2>/dev/null); [ -z "$e" ] && continue; uid=$(echo "$e"|cut -d: -f3); home=$(echo "$e"|cut -d: -f6); sh=$(echo "$e"|cut -d: -f7); ld=$(grep "^\${u}:" /etc/shadow 2>/dev/null|cut -d: -f3); if [ -n "$ld" ] && [ "$ld" -gt 0 ] 2>/dev/null; then ldate=$(date -d "@$((ld*86400))" '+%Y-%m-%d' 2>/dev/null||echo ""); else ldate=""; fi; hh=0; [ -d "/home/$u" ] && hh=1; echo "$u|$uid|$home|$sh|$ldate|$hh"; done 2>/dev/null||true`,
  )

  const users: UserInfo[] = stdout
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map((line): UserInfo => {
      const p = line.split('|')
      return {
        username:           p[0] ?? '',
        uid:                parseInt(p[1] ?? '0') || 0,
        home:               p[2] ?? '/tmp',
        shell:              p[3] ?? '/bin/bash',
        lastPasswordChange: p[4] || null,
        hasHomeDir:         p[5] === '1',
      }
    })
    .filter(u => u.username)

  return { users }
})
