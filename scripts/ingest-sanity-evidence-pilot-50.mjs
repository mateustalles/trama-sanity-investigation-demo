/** Additive synthetic-only stress corpus. Never overwrites existing evidence. */
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pilot50Distractors} from './fixtures/sanity-pilot-50-distractors.mjs'
import {pilot145Distractors} from './fixtures/sanity-pilot-145-distractors.mjs'
import {makeEvidenceDocument} from './sanity-content-lake-evidence.mjs'

const command = process.argv[2] ?? 'plan'
if (!['plan', 'ingest', 'verify'].includes(command)) throw new Error('Use plan, ingest, or verify.')
const targetCount = Number(process.argv[3] ?? '50')
if (![50,145].includes(targetCount)) throw new Error('Target count must be 50 or 145.')
const projectId = 'swuqfubs'
const dataset = 'trama-evidence-pilot'
const scope = {workspaceId: 'synthetic-benchmark', scopeId: 'payment-incident-2026-09-18'}
const envPath = process.env.TRAMA_BENCHMARK_ENV_FILE ?? resolve(process.env.USERPROFILE ?? '', 'Documents', 'trama', '.env.local')
const envText = await readFile(envPath, 'utf8')
const fileEnv = Object.fromEntries(envText.split(/\r?\n/).flatMap(line => {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  return match ? [[match[1], match[2].trim().replace(/^(['"])(.*)\1$/, '$2')]] : []
}))
const env = {...fileEnv, ...process.env}
if (env.NEXT_PUBLIC_SANITY_PROJECT_ID && env.NEXT_PUBLIC_SANITY_PROJECT_ID !== projectId) throw new Error('Project ID mismatch.')
if (env.TRAMA_PILOT_DATASET && env.TRAMA_PILOT_DATASET !== dataset) throw new Error('Pilot dataset mismatch.')
const additions = targetCount === 145 ? [...pilot50Distractors, ...pilot145Distractors] : pilot50Distractors
const documents = additions.map(item => makeEvidenceDocument({...scope, ...item, sourceLocator: `synthetic-stress/${item.sourceId}`}))
const registry = new Map(documents.map(item => [item._id, item]))
if (registry.size !== targetCount - 24) throw new Error('Distractor ID collision.')

async function request(path, options = {}) {
  if (!env.SANITY_API_WRITE_TOKEN) throw new Error('SANITY_API_WRITE_TOKEN is required.')
  const response = await fetch(`https://${projectId}.api.sanity.io/v2026-09-23${path}`, {
    ...options,
    headers: {Authorization: `Bearer ${env.SANITY_API_WRITE_TOKEN}`, Accept: 'application/json', ...options.headers},
    signal: AbortSignal.timeout(30_000),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body.error) throw new Error(`Sanity ${response.status}: ${body.error?.description ?? body.error?.message ?? 'request failed'}`)
  return body
}
async function scopedDocuments() {
  const query = '*[_type == "evidenceSource" && workspaceId == $workspaceId && scopeId == $scopeId]{_id,sourceId,body,contentHash}'
  const params = new URLSearchParams({query, '$workspaceId': JSON.stringify(scope.workspaceId), '$scopeId': JSON.stringify(scope.scopeId), perspective: 'published'})
  const response = await request(`/data/query/${dataset}?${params}`)
  if (!Array.isArray(response.result)) throw new Error('Scoped query did not return an array.')
  return response.result
}

if (command === 'plan') {
  console.log(JSON.stringify({command, targetCount, projectId, dataset, scope, addedSourceCount: documents.length, sources: documents.map(({_id, sourceId, contentHash}) => ({_id, sourceId, contentHash}))}, null, 2))
} else {
  const existing = await scopedDocuments()
  const unregistered = existing.filter(item => !registry.has(item._id))
  if (unregistered.length !== 24) throw new Error(`Expected exactly 24 existing original records; found ${unregistered.length}. Refusing to change an unexpected corpus.`)
  for (const item of existing.filter(item => registry.has(item._id))) {
    const expected = registry.get(item._id)
    if (item.sourceId !== expected.sourceId || item.body !== expected.body || item.contentHash !== expected.contentHash) throw new Error(`Existing distractor ${item._id} differs; refusing overwrite.`)
  }
  if (command === 'ingest') {
    const missing = documents.filter(item => !existing.some(remote => remote._id === item._id))
    if (missing.length) await request(`/data/mutate/${dataset}?visibility=sync`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({mutations: missing.map(item => ({createIfNotExists: item}))})})
    console.log(`Created ${missing.length} synthetic stress records in private dataset ${dataset}.`)
  }
  const after = await scopedDocuments()
  if (after.length !== targetCount || documents.some(item => !after.some(remote => remote._id === item._id && remote.contentHash === item.contentHash))) throw new Error(`Expected ${targetCount} scoped and verified records; found ${after.length}.`)
  console.log(JSON.stringify({command, targetCount, projectId, dataset, scope, verifiedCount: after.length, distractorCount: documents.length}, null, 2))
}
