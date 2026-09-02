/**
 * Copy native Node addons into Nitro's server output.
 *
 * With legacyExternals (needed so Rollup does not parse ssh2's .node binary),
 * Nitro may leave bare imports for argon2/ssh2 without tracing the packages
 * into .output/server/node_modules — which breaks Docker (ERR_MODULE_NOT_FOUND).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outServer = join(root, '.output', 'server')
const outNm = join(outServer, 'node_modules')

/** Runtime packages that must be present next to server/index.mjs */
const PACKAGES = [
  'argon2',
  '@phc/format',
  'node-addon-api',
  'node-gyp-build',
  'ssh2',
  'asn1',
  'safer-buffer',
  'bcrypt-pbkdf',
  'tweetnacl',
  'cpu-features',
  'nan',
]

function pkgDir(name) {
  return join(...name.split('/'))
}

function copyPackage(name) {
  const src = join(root, 'node_modules', pkgDir(name))
  const dest = join(outNm, pkgDir(name))
  if (!existsSync(src)) {
    console.warn(`[copy-native-server-deps] skip missing: ${name}`)
    return false
  }
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest, { recursive: true })
  console.log(`[copy-native-server-deps] copied ${name}`)
  return true
}

if (!existsSync(outServer)) {
  console.error('[copy-native-server-deps] .output/server missing — run nuxt build first')
  process.exit(1)
}

mkdirSync(outNm, { recursive: true })

const copied = []
for (const name of PACKAGES) {
  if (copyPackage(name)) copied.push(name)
}

const pkgPath = join(outServer, 'package.json')
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const bundled = new Set(pkg.bundledDependencies || [])
  for (const name of copied) bundled.add(name)
  pkg.bundledDependencies = [...bundled].sort()
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
}

console.log(`[copy-native-server-deps] done (${copied.length} packages)`)
