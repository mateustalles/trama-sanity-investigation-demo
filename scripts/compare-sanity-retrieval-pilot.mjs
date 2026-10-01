/** Read-only retrieval comparison on the existing synthetic Content Lake pilot. */
import {readFile, mkdir, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {benchmarkCases} from './sanity-context-benchmark-cases.mjs'
import {structuredAdditionalCases} from './sanity-context-benchmark-structured.mjs'
import {evidenceDocumentId, keywordCandidatesQuery, semanticCandidatesQuery} from './sanity-content-lake-evidence.mjs'

const root = resolve(import.meta.dirname, '..')
const scope = {workspaceId: 'synthetic-benchmark', scopeId: 'payment-incident-2026-09-18'}
const endpoint = process.env.TRAMA_BENCHMARK_PILOT_GROQ_MCP_URL ?? 'https://api.sanity.io/v1/context/organizations/o6xohyg5w/mcp/trama-evidence-pilot-groq'
const envPath = process.env.TRAMA_BENCHMARK_ENV_FILE ?? resolve(process.env.USERPROFILE ?? '', 'Documents', 'trama', '.env.local')
const envText = await readFile(envPath, 'utf8')
const env = Object.fromEntries(envText.split(/\r?\n/).flatMap(line => {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  return match ? [[match[1], match[2].trim().replace(/^(['"])(.*)\1$/, '$2')]] : []
}))
const token = process.env.SANITY_ORGANIZATION_TOKEN ?? env.SANITY_ORGANIZATION_TOKEN
if (!token) throw new Error('SANITY_ORGANIZATION_TOKEN is required; no token is written to the artifact.')

async function request(method, params = {}) {
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

async function queryRows(query) {
  const started = performance.now()
  const tool = await request('tools/call', {name: 'groq_query', arguments: {query}})
  const content = tool.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') ?? ''
  if (tool.isError) throw new Error(`GROQ tool error: ${content.slice(0, 300)}`)
  const parsed = JSON.parse(content)
  if (!Array.isArray(parsed.result)) throw new Error('GROQ did not return a result array.')
  return {rows: parsed.result, latencyMs: Math.round(performance.now() - started)}
}

const gold = JSON.parse(await readFile(resolve(root, 'scripts', 'fixtures', 'sanity-pilot-source-gold.json'), 'utf8'))
const cases = benchmarkCases.filter(item => Object.hasOwn(gold, item.id)).map(item => ({id: item.id, prompt: item.prompt, expected: gold[item.id]}))
const x01 = structuredAdditionalCases.find(item => item.id === 'X01')
if (!x01 || cases.length !== 8) throw new Error('Expected eight labeled retrieval cases and X01.')
cases.push({id: 'X01', prompt: x01.prompt, expected: ['01-deployment-record.md', '02-provider-latency-log.md', '03-postal-code-sample.md', '04-fraud-score-report.md']})

const tools = (await request('tools/list')).tools?.map(item => item.name) ?? []
if (!tools.includes('groq_query')) throw new Error('Pilot endpoint does not expose groq_query.')

const results = []
for (const item of cases) {
  const expectedIds = item.expected.map(sourceId => evidenceDocumentId({...scope, sourceId}))
  const modes = {}
  for (const mode of ['keyword', 'semantic']) {
    const query = (mode === 'keyword' ? keywordCandidatesQuery : semanticCandidatesQuery)({...scope, question: item.prompt, limit: 10})
    const {rows, latencyMs} = await queryRows(query)
    if (rows.some(row => typeof row._id !== 'string' || typeof row.sourceId !== 'string' || row._id !== evidenceDocumentId({...scope, sourceId: row.sourceId}))) throw new Error(`Unexpected source identity in ${item.id}/${mode}.`)
    const ranks = item.expected.map((sourceId, index) => ({sourceId, rank: rows.findIndex(row => row._id === expectedIds[index]) + 1 || null}))
    modes[mode] = {
      query, latencyMs,
      candidates: rows.map(row => ({sourceId: row.sourceId, id: row._id, score: row._score ?? null})),
      expectedRanks: ranks,
      found: ranks.filter(rank => rank.rank !== null).length,
      allExpectedFound: ranks.every(rank => rank.rank !== null),
    }
  }
  results.push({id: item.id, prompt: item.prompt, expected: item.expected, modes})
  console.log(`${item.id}: keyword ${modes.keyword.found}/${item.expected.length}; semantic ${modes.semantic.found}/${item.expected.length}`)
}

const summarize = mode => ({
  allExpectedFound: results.filter(item => item.modes[mode].allExpectedFound).length,
  totalCases: results.length,
  expectedFound: results.reduce((sum, item) => sum + item.modes[mode].found, 0),
  totalExpected: results.reduce((sum, item) => sum + item.expected.length, 0),
  totalLatencyMs: results.reduce((sum, item) => sum + item.modes[mode].latencyMs, 0),
})
const artifact = {
  kind: 'retrieval-only-poc', createdAt: new Date().toISOString(),
  dataset: 'trama-evidence-pilot', scope, endpoint, limit: 10,
  note: 'Same full natural-language question, scope, fields, and top-10 budget. This measures document retrieval, not Llama answer accuracy. Scores are not comparable across queries or modes.',
  summary: {keyword: summarize('keyword'), semantic: summarize('semantic')}, results,
}
const dir = resolve(root, 'artifacts', 'sanity-context-benchmark')
await mkdir(dir, {recursive: true})
const path = resolve(dir, `retrieval-poc-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({artifact: path, summary: artifact.summary}, null, 2))
