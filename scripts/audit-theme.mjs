#!/usr/bin/env node
/**
 * Audit light-only theme classes. Exit 1 when findings exceed threshold (CI).
 * Allowlist: terminal, login brand panel, topology decorative hex.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const ALLOWLIST = [
  /TerminalPane\.vue$/,
  /pages\/login\.vue$/,
  /topology\.css$/,
  /tokens\.css$/,
]

const PATTERNS = [
  { name: 'bg-white without dark:', re: /\bbg-white\b/, needDark: /\bdark:bg-/ },
  { name: 'text-gray-900 without dark:', re: /\btext-gray-900\b/, needDark: /\bdark:text-/ },
  { name: 'bg-gray-50 without dark:', re: /\bbg-gray-50\b/, needDark: /\bdark:bg-/ },
  { name: 'hex background', re: /bg-\[#[0-9A-Fa-f]{3,8}\]/, needDark: /\bdark:/ },
]

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist' || ent.name === '.output') continue
    if (ent.isDirectory()) walk(p, out)
    else if (/\.(vue|css)$/.test(ent.name)) out.push(p)
  }
  return out
}

const findings = []
for (const file of walk(path.join(root, 'components')).concat(walk(path.join(root, 'pages')))) {
  if (ALLOWLIST.some((rx) => rx.test(file))) continue
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (line.includes('dark:')) return
    for (const { name, re, needDark } of PATTERNS) {
      if (re.test(line) && !needDark.test(line)) {
        findings.push({ file: path.relative(root, file), line: i + 1, name, snippet: line.trim().slice(0, 120) })
      }
    }
  })
}

console.log(`Theme audit: ${findings.length} potential light-only lines (no dark: on same line)`)
for (const f of findings.slice(0, 40)) {
  console.log(`  ${f.file}:${f.line} [${f.name}] ${f.snippet}`)
}
if (findings.length > 40) console.log(`  ... and ${findings.length - 40} more`)

const maxAllowed = Number(process.env.THEME_AUDIT_MAX ?? '99999')
if (findings.length > maxAllowed) {
  console.error(`FAIL: ${findings.length} > ${maxAllowed}`)
  process.exit(1)
}
