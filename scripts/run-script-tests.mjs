import {readdir} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const directory = new URL('../__test__/scripts/',import.meta.url)
const files = (await readdir(directory)).filter(name=>name.endsWith('.test.mjs')).sort()
if (!files.length) throw new Error('No script unit tests were discovered')
const child = spawn(process.execPath,['--test',...files.map(name=>fileURLToPath(new URL(name,directory)))],{stdio:'inherit'})
child.on('error',error=>{console.error(error.message);process.exitCode=1})
child.on('exit',code=>{process.exitCode=code ?? 1})
