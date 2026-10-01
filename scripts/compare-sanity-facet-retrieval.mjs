/** Retrieval-only experiment: Qwen plans independent semantic searches; Sanity ranks originals. */
import {readFile, mkdir, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {benchmarkCases} from './sanity-context-benchmark-cases.mjs'
import {structuredAdditionalCases} from './sanity-context-benchmark-structured.mjs'
import {evidenceDocumentId, semanticCandidatesQuery} from './sanity-content-lake-evidence.mjs'
import {parseFacetQueries, fuseFacetCandidates} from './sanity-facet-retrieval.mjs'

const root = resolve(import.meta.dirname, '..')
const scope = {workspaceId: 'synthetic-benchmark', scopeId: 'payment-incident-2026-09-18'}
const endpoint = process.env.TRAMA_BENCHMARK_PILOT_GROQ_MCP_URL ?? 'https://api.sanity.io/v1/context/organizations/o6xohyg5w/mcp/trama-evidence-pilot-groq'
const envPath = process.env.TRAMA_BENCHMARK_ENV_FILE ?? resolve(process.env.USERPROFILE ?? '', 'Documents', 'trama', '.env.local')
const envText = await readFile(envPath, 'utf8')
const localEnv = Object.fromEntries(envText.split(/\r?\n/).flatMap(line => {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  return match ? [[match[1],match[2].trim().replace(/^(['"])(.*)\1$/,'$2')]] : []
}))
const token = process.env.SANITY_ORGANIZATION_TOKEN ?? localEnv.SANITY_ORGANIZATION_TOKEN
if (!token) throw new Error('SANITY_ORGANIZATION_TOKEN is required; no credential is stored in the artifact.')
const model = process.env.TRAMA_FACET_MODEL ?? 'qwen3:4b-instruct'
const selectedIds = (process.env.TRAMA_FACET_CASE_IDS ?? 'X01,R01,R02,R03,R04,R05,R06,R07,R08').split(',').map(value => value.trim()).filter(Boolean)
const gold = JSON.parse(await readFile(resolve(root,'scripts','fixtures','sanity-pilot-source-gold.json'),'utf8'))
const x01 = structuredAdditionalCases.find(item => item.id === 'X01')
const cases = [...benchmarkCases, x01].filter(item => selectedIds.includes(item.id))
if (!x01 || cases.length !== selectedIds.length || cases.some(item => !item)) throw new Error('Unknown or duplicate requested case.')
const expectedSources = id => id === 'X01'
  ? ['01-deployment-record.md','02-provider-latency-log.md','03-postal-code-sample.md','04-fraud-score-report.md']
  : gold[id]
if (cases.some(item => !expectedSources(item.id))) throw new Error('Missing retrieval gold for selected case.')

async function request(method, params = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {Authorization:`Bearer ${token}`, Accept:'application/json, text/event-stream', 'Content-Type':'application/json'},
    body: JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method,params}),
    signal: AbortSignal.timeout(30_000),
  })
  const body = await response.json()
  if (!response.ok || body.error) throw new Error(body.error?.message ?? `Context HTTP ${response.status}`)
  return body.result
}

async function queryRows(query) {
  const started = performance.now()
  const tool = await request('tools/call',{name:'groq_query',arguments:{query}})
  const text = tool.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') ?? ''
  if (tool.isError) throw new Error(`GROQ tool error: ${text.slice(0,300)}`)
  const parsed = JSON.parse(text)
  if (!Array.isArray(parsed.result)) throw new Error('GROQ did not return an array.')
  for (const row of parsed.result) {
    if (typeof row.sourceId !== 'string' || row._id !== evidenceDocumentId({...scope,sourceId:row.sourceId})) throw new Error('Unexpected candidate identity.')
  }
  return {rows:parsed.result, latencyMs:Math.round(performance.now()-started)}
}

async function planQueries(question) {
  const started = performance.now()
  let feedback = '', promptTokens = 0, completionTokens = 0
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch('http://127.0.0.1:11434/api/chat',{
    method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(90_000),
    body:JSON.stringify({model,stream:false,think:false,format:{type:'object',required:['queries'],properties:{queries:{type:'array',minItems:1,maxItems:4,items:{type:'string'}}},additionalProperties:false},options:{temperature:0,num_ctx:4096},messages:[
      {role:'system',content:'You are a search planner, not an answerer. Extract one to four independent evidence-search facets from the question. Return JSON with a queries array. Every word in every query MUST be copied from the question; never introduce dates, years, subjects, synonyms, or document names. Separate distinct aspects, including alternatives and counterevidence, into separate queries. Do not infer the answer or use comma-joined lists.'},
      {role:'user',content:`${question}${feedback}`},
    ]}),
    })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error ?? `Ollama HTTP ${response.status}`)
    promptTokens += body.prompt_eval_count ?? 0
    completionTokens += body.eval_count ?? 0
    try { return {queries:parseFacetQueries(body.message?.content ?? '',{sourceQuestion:question}),latencyMs:Math.round(performance.now()-started),promptTokens,completionTokens,attempts:attempt+1} }
    catch (error) { if (attempt) throw error; feedback='\n\nYour previous plan invented terms or violated the format. Copy only words present in the original question, split distinct aspects, and try again.' }
  }
}

const tools = (await request('tools/list')).tools?.map(item => item.name) ?? []
if (!tools.includes('groq_query')) throw new Error('Pilot endpoint lacks groq_query.')
const results = []
for (const item of cases) {
  const expected = expectedSources(item.id)
  const baseline = await queryRows(semanticCandidatesQuery({...scope,question:item.prompt,limit:10}))
  const plan = await planQueries(item.prompt)
  const facets = []
  for (const query of plan.queries) facets.push({query,...await queryRows(semanticCandidatesQuery({...scope,question:query,limit:10}))})
  const fused = fuseFacetCandidates(facets.map(item => item.rows),10)
  const ranks = rows => expected.map(sourceId => ({sourceId,rank:rows.findIndex(row => row.sourceId === sourceId)+1 || null}))
  const record = {id:item.id,question:item.prompt,expected,plan,baseline:{ranks:ranks(baseline.rows),sources:baseline.rows.map(row=>row.sourceId),latencyMs:baseline.latencyMs},facets:facets.map(facet=>({query:facet.query,sources:facet.rows.map(row=>row.sourceId),latencyMs:facet.latencyMs})),fused:{ranks:ranks(fused),sources:fused.map(row=>row.sourceId),origin:fused.map(row=>({sourceId:row.sourceId,facet:row.facet,facetRank:row.facetRank}))}}
  results.push(record)
  console.log(`${item.id}: baseline ${record.baseline.ranks.filter(rank=>rank.rank).length}/${expected.length}; facets ${record.fused.ranks.filter(rank=>rank.rank).length}/${expected.length}; queries=${plan.queries.length}`)
}
const summary = mode => ({completeCases:results.filter(item=>item[mode].ranks.every(rank=>rank.rank)).length,expectedFound:results.reduce((sum,item)=>sum+item[mode].ranks.filter(rank=>rank.rank).length,0),expectedTotal:results.reduce((sum,item)=>sum+item.expected.length,0)})
const artifact = {kind:'llm-facet-semantic-retrieval-poc',createdAt:new Date().toISOString(),dataset:'trama-evidence-pilot',scope,model,sourceCount:145,limit:10,facetLimit:4,baseline:summary('baseline'),fused:summary('fused'),note:'Retrieval-only; no final answer model. LLM planning tokens/latency are counted separately. Per-query semantic scores are not compared across facets.',results}
const dir = resolve(root,'artifacts','sanity-context-benchmark')
await mkdir(dir,{recursive:true})
const path = resolve(dir,`facet-retrieval-${new Date().toISOString().replace(/[:.]/g,'-')}.json`)
await writeFile(path,`${JSON.stringify(artifact,null,2)}\n`,'utf8')
console.log(JSON.stringify({artifact:path,baseline:artifact.baseline,fused:artifact.fused},null,2))
