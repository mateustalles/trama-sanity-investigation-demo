import {readFile} from 'node:fs/promises'
import {parseEnv} from 'node:util'
import {fileURLToPath} from 'node:url'
import {createRequire} from 'node:module'
import {dirname} from 'node:path'
import {pathToFileURL} from 'node:url'

const [envPath, port='3001'] = process.argv.slice(2)
if (!envPath || !/^\d+$/.test(port)) throw new Error('Usage: node scripts/start-sanity-demo.mjs env-file [port]')
const env = parseEnv(await readFile(envPath,'utf8'))
for (const [key,value] of Object.entries(env)) if (key !== 'NODE_OPTIONS') process.env[key] = value
delete process.env.NODE_OPTIONS
process.env.PORT = port
process.chdir(fileURLToPath(new URL('../apps/web/',import.meta.url)))
const require = createRequire(new URL('../apps/web/package.json',import.meta.url))
process.env.NEXT_TEST_WASM_DIR = dirname(require.resolve('@next/swc-wasm-nodejs/package.json'))
process.argv = [process.execPath,require.resolve('next/dist/bin/next'),'dev','--webpack','--hostname','127.0.0.1']
await import(pathToFileURL(require.resolve('next/dist/bin/next')).href)
