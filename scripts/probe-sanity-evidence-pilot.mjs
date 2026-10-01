/** Read-only Context GROQ smoke check; never prints original source bodies or tokens. */
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {exactEvidenceQuery, knowledgeBaseDatasetQuery, semanticCandidatesQuery} from './sanity-content-lake-evidence.mjs'

const userProfile = process.env.USERPROFILE ?? ''
const envPath = process.env.TRAMA_BENCHMARK_ENV_FILE ?? resolve(userProfile, 'Documents', 'trama', '.env.local')
const localEnv = await readFile(envPath, 'utf8')
const parsed = Object.fromEntries(localEnv.split(/\r?\n/).flatMap(line => {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  return match ? [[match[1], match[2].trim().replace(/^(['"])(.*)\1$/, '$2')]] : []
}))
const token = process.env.SANITY_ORGANIZATION_TOKEN ?? parsed.SANITY_ORGANIZATION_TOKEN
const endpoint = 'https://api.sanity.io/v1/context/organizations/o6xohyg5w/mcp/trama-evidence-pilot-groq'
const scope = {workspaceId: 'synthetic-benchmark', scopeId: 'payment-incident-2026-09-18'}

async function call(method, params = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {Authorization: `Bearer ${token}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: crypto.randomUUID(), method, params}),
    signal: AbortSignal.timeout(30_000),
  })
  const body = await response.json()
  if (!response.ok || body.error) throw new Error(body.error?.message ?? `Context HTTP ${response.status}`)
  return body.result
}

const tools = (await call('tools/list')).tools?.map(tool => tool.name) ?? []
if (!tools.includes('groq_query')) throw new Error(`Pilot endpoint did not serve GROQ mode: ${tools.join(', ')}`)
const datasetResult = await call('tools/call', {name: 'groq_query', arguments: {query: knowledgeBaseDatasetQuery(scope)}})
const datasetText = datasetResult.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') ?? ''
if (datasetResult.isError) throw new Error(`KB source query error: ${datasetText.slice(0, 300)}`)
const datasetSources = JSON.parse(datasetText).result
if (!Array.isArray(datasetSources) || datasetSources.length !== 24 || datasetSources.some(item => !item.title.startsWith(`${item._id} | `))) {
  throw new Error('KB dataset source query did not return 24 identity-bearing source titles.')
}
const question = 'Why did payment failures increase after the checkout deployment?'
const query = semanticCandidatesQuery({...scope, question, limit: 5})
const result = await call('tools/call', {name: 'groq_query', arguments: {query}})
const content = result.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') ?? ''
if (result.isError) throw new Error(`GROQ tool error: ${content.slice(0, 300)}`)
const parsedResult = JSON.parse(content)
const candidates = parsedResult.result
if (!Array.isArray(candidates) || !candidates.length) throw new Error('Semantic query returned no candidates.')
const ids = candidates.slice(0, 3).map(candidate => candidate._id)
const exactResult = await call('tools/call', {name: 'groq_query', arguments: {query: exactEvidenceQuery({...scope, ids})}})
const exactText = exactResult.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') ?? ''
if (exactResult.isError) throw new Error(`Exact-source GROQ tool error: ${exactText.slice(0, 300)}`)
const exact = JSON.parse(exactText).result
console.log(JSON.stringify({mode: 'groq', tools, datasetSourceCount: datasetSources.length, candidateCount: candidates.length, candidateIds: ids, exactCount: exact.length, exactIds: exact.map(item => item._id), exactHashesPresent: exact.every(item => typeof item.contentHash === 'string' && item.contentHash.length === 64), metaKeys: Object.keys(parsedResult.meta ?? {})}, null, 2))
