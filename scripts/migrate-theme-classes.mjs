#!/usr/bin/env node
/**
 * One-off helper: add common dark: pairs on the same line when missing.
 * Skips lines that already contain "dark:".
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SKIP = [
  /TerminalPane\.vue$/,
  /pages\/login\.vue$/,
  /LoginCard\.vue$/,
  /topology\.css$/,
  /tokens\.css$/,
  /migrate-theme-classes/,
]

const REPLACERS = [
  [/\bbg-white\b/g, 'bg-white dark:bg-gray-900'],
  [/\btext-gray-900\b/g, 'text-gray-900 dark:text-gray-100'],
  [/\btext-gray-800\b/g, 'text-gray-800 dark:text-gray-200'],
  [/\btext-gray-700\b/g, 'text-gray-700 dark:text-gray-300'],
  [/\btext-gray-600\b/g, 'text-gray-600 dark:text-gray-400'],
  [/\btext-gray-500\b/g, 'text-gray-500 dark:text-gray-400'],
  [/\bbg-gray-50\b/g, 'bg-gray-50 dark:bg-gray-950'],
  [/\bbg-gray-100\b/g, 'bg-gray-100 dark:bg-gray-800'],
  [/\bborder-gray-200\b/g, 'border-gray-200 dark:border-gray-700'],
  [/\bborder-gray-100\b/g, 'border-gray-100 dark:border-gray-800'],
  [/\bbg-red-50\b/g, 'bg-red-50 dark:bg-red-950/40'],
  [/\bbg-amber-50\b/g, 'bg-amber-50 dark:bg-amber-950/40'],
  [/\bbg-yellow-50\b/g, 'bg-yellow-50 dark:bg-yellow-950/40'],
  [/\bbg-green-50\b/g, 'bg-green-50 dark:bg-green-950/40'],
  [/\bbg-blue-50\b/g, 'bg-blue-50 dark:bg-blue-950/40'],
  [/\bborder-red-200\b/g, 'border-red-200 dark:border-red-800'],
  [/\bborder-amber-200\b/g, 'border-amber-200 dark:border-amber-800'],
  [/\btext-red-700\b/g, 'text-red-700 dark:text-red-300'],
  [/\btext-red-800\b/g, 'text-red-800 dark:text-red-300'],
  [/\btext-amber-800\b/g, 'text-amber-800 dark:text-amber-300'],
  [/\btext-amber-950\b/g, 'text-amber-950 dark:text-amber-200'],
]

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (ent.name === 'node_modules' || ent.name === '.git') continue
    if (ent.isDirectory()) walk(p, out)
    else if (ent.name.endsWith('.vue')) out.push(p)
  }
  return out
}

let changed = 0
for (const file of walk(path.join(root, 'components')).concat(walk(path.join(root, 'pages')))) {
  if (SKIP.some((rx) => rx.test(file))) continue
  const original = fs.readFileSync(file, 'utf8')
  const lines = original.split('\n')
  let fileChanged = false
  const next = lines.map((line) => {
    if (!line.includes('class=') && !line.includes(':class=')) return line
    if (line.includes('dark:')) return line
    let l = line
    for (const [re, rep] of REPLACERS) {
      if (re.test(l)) {
        l = l.replace(re, rep)
      }
    }
    if (l !== line) fileChanged = true
    return l
  })
  if (fileChanged) {
    fs.writeFileSync(file, next.join('\n'))
    changed++
    console.log('updated', path.relative(root, file))
  }
}
console.log(`Done. ${changed} files updated.`)
