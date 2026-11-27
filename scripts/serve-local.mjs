/**
 * Start the built Nitro server on 127.0.0.1 only.
 * NITRO_HOST and HOST are overwritten so the process cannot bind other interfaces.
 */
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

process.env.NITRO_HOST = '127.0.0.1'
process.env.HOST = '127.0.0.1'

const here = dirname(fileURLToPath(import.meta.url))
const candidates = [
  resolve(here, '../.output/server/index.mjs'),
  '/app/server/index.mjs',
]
const bundle = candidates.find(file => existsSync(file))
if (!bundle) {
  console.error('ESOS WebUI server bundle not found. Run npm run build first.')
  process.exit(1)
}

await import(pathToFileURL(bundle).href)
