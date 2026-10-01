/** Isolated read-only X01 probe: deliver every distinct top-ten facet original to Qwen. */
import {readFile, mkdir, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {structuredAdditionalCases, structuredOutputInstruction, scoreStructured} from './sanity-context-benchmark-structured.mjs'
import {evidenceDocumentId, exactEvidenceQuery, semanticCandidatesQuery, sha256} from './sanity-content-lake-evidence.mjs'
import {fuseFacetCandidates} from './sanity-facet-retrieval.mjs'

const root = resolve(import.meta.dirname,'..')
const scope = {workspaceId:'synthetic-benchmark',scopeId:'payment-incident-2026-09-18'}
const endpoint = process.env.TRAMA_BENCHMARK_PILOT_GROQ_MCP_URL ?? 'https://api.sanity.io/v1/context/organizations/o6xohyg5w/mcp/trama-evidence-pilot-groq'
const envPath = process.env.TRAMA_BENCHMARK_ENV_FILE ?? resolve(process.env.USERPROFILE ?? '','Documents','trama','.env.local')
const fileEnv = Object.fromEntries((await readFile(envPath,'utf8')).split(/\r?\n/).flatMap(line => {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  return match ? [[match[1],match[2].trim().replace(/^(['"])(.*)\1$/,'$2')]] : []
}))
const token = process.env.SANITY_ORGANIZATION_TOKEN ?? fileEnv.SANITY_ORGANIZATION_TOKEN
if (!token) throw Error('Missing SANITY_ORGANIZATION_TOKEN.')
const question = structuredAdditionalCases.find(item => item.id === 'X01')
const phrases = ['release timeout change','Provider A latency','postal counterevidence','fraud counterevidence']
const model = 'qwen3:4b-instruct', numCtx = 4096

async function queryRows(query) {
  const response = await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/json, text/event-stream','Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method:'tools/call',params:{name:'groq_query',arguments:{query}}}),signal:AbortSignal.timeout(30_000)})
  const result = await response.json()
  if (!response.ok || result.error) throw Error(result.error?.message ?? `Context HTTP ${response.status}`)
  const tool = result.result
  const content = tool.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') ?? ''
  if (tool.isError) throw Error(`GROQ tool error: ${content.slice(0,300)}`)
  const parsed = JSON.parse(content)
  if (!Array.isArray(parsed.result)) throw Error('GROQ did not return an array.')
  return parsed.result
}

const facets = []
for (const phrase of phrases) facets.push({phrase,rows:await queryRows(semanticCandidatesQuery({...scope,question:phrase,limit:10}))})
const ranked = fuseFacetCandidates(facets.map(item => item.rows),40)
if (ranked.some(item => item._id !== evidenceDocumentId({...scope,sourceId:item.sourceId}))) throw Error('Unexpected candidate identity.')
const originals = new Map()
for (let index=0;index<ranked.length;index+=10) {
  const batch = ranked.slice(index,index+10)
  const rows = await queryRows(exactEvidenceQuery({...scope,ids:batch.map(item=>item._id)}))
  for (const row of rows) {
    if (row._id !== evidenceDocumentId({...scope,sourceId:row.sourceId}) || sha256(row.body) !== row.contentHash) throw Error('Original identity/hash mismatch.')
    originals.set(row._id,row)
  }
}
if (originals.size !== ranked.length) throw Error('An original was not returned.')
const pack = ranked.map(item => `SOURCE ID: ${item._id}\nSOURCE NAME: ${item.sourceId}\n${originals.get(item._id).body}`).join('\n\n')
const system = `You are an evidence-aware investigator. Use only supplied records. Distinguish evidence from inference, reject other incidents, preserve uncertainty, and answer the exact question.\n\n${structuredOutputInstruction(question)}`
const user = `ORIGINAL CONTENT LAKE EVIDENCE:\n\n${pack}\n\nQUESTION:\n${question.prompt}`
const artifact = {kind:'x01-all-facet-originals-probe',createdAt:new Date().toISOString(),model,numCtx,phrases,facetRanks:facets.map(item=>({phrase:item.phrase,sources:item.rows.map(row=>row.sourceId)})),uniqueOriginalCount:ranked.length,sourceNames:ranked.map(item=>item.sourceId),packChars:pack.length,systemChars:system.length,userChars:user.length,promptChars:system.length+user.length}
console.log(JSON.stringify({uniqueOriginalCount:artifact.uniqueOriginalCount,packChars:artifact.packChars,promptChars:artifact.promptChars},null,2))
if (process.env.TRAMA_X01_RUN_MODEL === '1') {
  const started = performance.now()
  try {
    const response = await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,stream:false,think:false,options:{temperature:0,num_ctx:numCtx},messages:[{role:'system',content:system},{role:'user',content:user}]}),signal:AbortSignal.timeout(120_000)})
    const result = await response.json()
    if (!response.ok) throw Error(result.error ?? `Ollama HTTP ${response.status}`)
    artifact.modelResult = {latencyMs:Math.round(performance.now()-started),promptTokens:result.prompt_eval_count??null,completionTokens:result.eval_count??null,answer:result.message?.content??'',score:scoreStructured(question,result.message?.content??'',{selectedSources:artifact.sourceNames,selectedIds:ranked.map(item=>item._id)})}
  } catch(error) { artifact.modelError = error instanceof Error ? error.message : String(error) }
}
const dir = resolve(root,'artifacts','sanity-context-benchmark')
await mkdir(dir,{recursive:true})
const path = resolve(dir,`x01-all-facets-${new Date().toISOString().replace(/[:.]/g,'-')}.json`)
await writeFile(path,`${JSON.stringify(artifact,null,2)}\n`,'utf8')
console.log(JSON.stringify({artifact:path,uniqueOriginalCount:artifact.uniqueOriginalCount,promptChars:artifact.promptChars,modelError:artifact.modelError??null,modelResult:artifact.modelResult?{latencyMs:artifact.modelResult.latencyMs,promptTokens:artifact.modelResult.promptTokens,completionTokens:artifact.modelResult.completionTokens,decision:artifact.modelResult.score.decision,pass:artifact.modelResult.score.strictPass}:null},null,2))
