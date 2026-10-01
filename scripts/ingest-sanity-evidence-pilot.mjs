/**
 * Isolated synthetic-data pilot. `plan` is local/read-only; `ingest` is the
 * only write command. It refuses to target the production dataset.
 */
import {readFile, readdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {makeEvidenceDocument, verifyExactEvidenceDocuments} from './sanity-content-lake-evidence.mjs'

const PROJECT_ID = 'swuqfubs'
const DATASET = 'trama-evidence-pilot'
const SCOPE = {workspaceId: 'synthetic-benchmark', scopeId: 'payment-incident-2026-09-18'}
const API_VERSION = 'v2026-09-23'
const command = process.argv[2] ?? 'plan'
if (!['plan', 'ingest', 'verify'].includes(command)) throw new Error('Use plan, ingest, or verify.')

const userProfile = process.env.USERPROFILE ?? ''
const corpusDir = resolve(userProfile, 'Documents', 'studio-trama', 'knowledge-base', 'payment-incident')
const envPath = process.env.TRAMA_BENCHMARK_ENV_FILE ?? resolve(userProfile, 'Documents', 'trama', '.env.local')
const fileEnv = Object.fromEntries((await readFile(envPath, 'utf8').catch(() => '')).split(/\r?\n/).flatMap(line => {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  return match ? [[match[1], match[2].trim().replace(/^(['"])(.*)\1$/, '$2')]] : []
}))
const env = {...fileEnv, ...process.env}
if (env.NEXT_PUBLIC_SANITY_PROJECT_ID && env.NEXT_PUBLIC_SANITY_PROJECT_ID !== PROJECT_ID) throw new Error('Project ID mismatch.')
if (env.TRAMA_PILOT_DATASET && env.TRAMA_PILOT_DATASET !== DATASET) throw new Error('Pilot dataset mismatch; production is forbidden.')

const names = (await readdir(corpusDir)).filter(name => name.endsWith('.md') && name !== 'README.md').sort()
if (names.length !== 24) throw new Error(`Expected exactly 24 synthetic originals; found ${names.length}.`)
const documents = await Promise.all(names.map(async name => {
  const body = await readFile(resolve(corpusDir, name), 'utf8')
  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? name
  return makeEvidenceDocument({
    ...SCOPE,
    sourceId: name,
    title,
    body,
    sourceLocator: `knowledge-base/payment-incident/${name}`,
  })
}))
const registry = new Map(documents.map(document => [document._id, document]))
if (registry.size !== 24) throw new Error('Source identity collision.')

function endpoint(path) { return `https://${PROJECT_ID}.api.sanity.io/${API_VERSION}${path}` }
async function request(path, options = {}) {
  if (!env.SANITY_API_WRITE_TOKEN) throw new Error(`SANITY_API_WRITE_TOKEN is required for ${command}.`)
  const response = await fetch(endpoint(path), {
    ...options,
    headers: {Authorization: `Bearer ${env.SANITY_API_WRITE_TOKEN}`, Accept: 'application/json', ...options.headers},
    signal: AbortSignal.timeout(30_000),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok || body.error) throw new Error(`Sanity ${response.status}: ${body.error?.description ?? body.error?.message ?? 'request failed'}`)
  return body
}
async function readRemote() {
  const query = `*[_type == "evidenceSource" && _id in $ids]{_id,_rev,_updatedAt,workspaceId,scopeId,sourceId,title,body,contentHash}`
  const params = new URLSearchParams({query, '$ids': JSON.stringify(documents.map(document => document._id)), perspective: 'published'})
  const result = await request(`/data/query/${DATASET}?${params}`)
  if (!Array.isArray(result.result)) throw new Error('Query did not return an evidence array.')
  return result.result
}

if (command === 'plan') {
  console.log(JSON.stringify({command, projectId: PROJECT_ID, dataset: DATASET, scope: SCOPE, sourceCount: documents.length, sources: documents.map(({_id, sourceId, contentHash}) => ({_id, sourceId, contentHash}))}, null, 2))
} else {
  const existing = await readRemote()
  for (const remote of existing) {
    const original = registry.get(remote._id)
    if (!original || remote.workspaceId !== SCOPE.workspaceId || remote.scopeId !== SCOPE.scopeId || remote.sourceId !== original.sourceId || remote.contentHash !== original.contentHash || remote.body !== original.body) {
      throw new Error(`Existing pilot document ${remote._id} differs from its original; refusing to overwrite it.`)
    }
  }
  if (command === 'ingest') {
    const missing = documents.filter(document => !existing.some(remote => remote._id === document._id))
    if (missing.length) await request(`/data/mutate/${DATASET}?visibility=sync`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({mutations: missing.map(document => ({createIfNotExists: document}))})})
    console.log(`Created ${missing.length} synthetic evidence documents in private pilot dataset ${DATASET}.`)
  }
  const remote = await readRemote()
  const verified = verifyExactEvidenceDocuments({requestedIds: documents.map(document => document._id), documents: remote, registry, ...SCOPE})
  if (verified.missingIds.length) throw new Error(`${verified.missingIds.length} pilot originals are missing.`)
  console.log(JSON.stringify({command, projectId: PROJECT_ID, dataset: DATASET, scope: SCOPE, verifiedCount: verified.documents.length, revisions: verified.documents.map(({_id, _rev, contentHash}) => ({_id, _rev, contentHash}))}, null, 2))
}
