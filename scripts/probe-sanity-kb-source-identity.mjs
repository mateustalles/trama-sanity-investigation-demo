import {readFile, readdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {evidenceDocumentId, sourceIdsFromKnowledgeBaseEntry} from './sanity-content-lake-evidence.mjs'
import {parseKnowledgeBaseOutline} from '../apps/web/lib/sanity/context-mcp-policy.ts'

const userProfile = process.env.USERPROFILE ?? ''
const envPath = process.env.TRAMA_BENCHMARK_ENV_FILE ?? resolve(userProfile, 'Documents', 'trama', '.env.local')
const localEnv = await readFile(envPath, 'utf8')
const fileEnv = Object.fromEntries(localEnv.split(/\r?\n/).flatMap(line => {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  return match ? [[match[1], match[2].trim().replace(/^(['"])(.*)\1$/, '$2')]] : []
}))
const env = {...fileEnv, ...process.env}
const knowledgeBaseId = env.TRAMA_BENCHMARK_PILOT_KB_ID
if (!knowledgeBaseId || !env.SANITY_ORGANIZATION_TOKEN || !env.SANITY_CONTEXT_EVIDENCE_MCP_URL) {
  throw Error('Pilot KB ID, organization token, and evidence MCP URL are required.')
}
const sourceDir = env.TRAMA_BENCHMARK_CORPUS_DIR ?? resolve(userProfile, 'Documents', 'studio-trama', 'knowledge-base', 'payment-incident')
const sourceFiles = (await readdir(sourceDir)).filter(file => file.endsWith('.md') && file !== 'README.md')
if (sourceFiles.length !== 24) throw Error(`Expected 24 scoped source files; found ${sourceFiles.length}.`)
const allowedIds = new Set(sourceFiles.map(sourceId => evidenceDocumentId({workspaceId: 'synthetic-benchmark', scopeId: 'payment-incident-2026-09-18', sourceId})))
const endpoint = new URL(env.TRAMA_BENCHMARK_PILOT_KB_MCP_URL ?? env.SANITY_CONTEXT_EVIDENCE_MCP_URL)
endpoint.searchParams.set('mode', 'knowledge_base')
endpoint.searchParams.set('knowledgeBases', knowledgeBaseId)

async function request(method, params) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {Authorization: `Bearer ${env.SANITY_ORGANIZATION_TOKEN}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: crypto.randomUUID(), method, params}),
  })
  const body = await response.json()
  if (!response.ok || body.error) throw Error(body.error?.message ?? `Context HTTP ${response.status}`)
  return body.result
}
async function call(name, args = {}) {
  const result = await request('tools/call', {name, arguments: args})
  return result.content?.map(item => item.text ?? '').join('\n') ?? ''
}

const tools = (await request('tools/list', {})).tools ?? []
if (!tools.some(tool => tool.name === 'knowledge_base_read')) throw Error('Pilot endpoint does not advertise knowledge_base_read.')
const outline = parseKnowledgeBaseOutline(await call('initial_context'))
if (!outline.length || outline.some(entry => entry.knowledgeBase !== knowledgeBaseId)) throw Error('Pilot endpoint did not return only the requested KB outline.')
const rows = []
const found = new Set()
for (const entry of outline) {
  const content = await call('knowledge_base_read', {knowledgeBase: knowledgeBaseId, paths: [entry.path]})
  const references = sourceIdsFromKnowledgeBaseEntry(content, allowedIds)
  rows.push({path: entry.path, sourceIds: references.ids, unknownIds: references.unknownIds})
  for (const id of references.ids) found.add(id)
}
const report = {knowledgeBaseId, entries: rows, uniqueSourceIds: found.size, expectedSourceIds: allowedIds.size, identityAvailable: found.size > 0, unknownIds: [...new Set(rows.flatMap(row => row.unknownIds))]}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
if (!report.identityAvailable || report.unknownIds.length) process.exitCode = 1
