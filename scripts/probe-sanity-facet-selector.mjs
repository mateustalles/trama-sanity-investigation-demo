/** Read-only X01 retrieval POC: select a compact, facet-covering set from Sanity candidates. */
import {readFile, mkdir, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {semanticCandidatesQuery, exactEvidenceQuery, evidenceDocumentId, sha256} from './sanity-content-lake-evidence.mjs'
import {structuredAdditionalCases, structuredOutputInstruction, scoreStructured} from './sanity-context-benchmark-structured.mjs'

const root = resolve(import.meta.dirname,'..')
const scope = {workspaceId:'synthetic-benchmark',scopeId:'payment-incident-2026-09-18'}
const terms = ['release timeout change','Provider A latency','postal counterevidence','fraud counterevidence']
const gold = ['01-deployment-record.md','02-provider-latency-log.md','03-postal-code-sample.md','04-fraud-score-report.md']
const endpoint = process.env.TRAMA_BENCHMARK_PILOT_GROQ_MCP_URL ?? 'https://api.sanity.io/v1/context/organizations/o6xohyg5w/mcp/trama-evidence-pilot-groq'
const envPath = process.env.TRAMA_BENCHMARK_ENV_FILE ?? resolve(process.env.USERPROFILE ?? '','Documents','trama','.env.local')
const envText = await readFile(envPath,'utf8')
const localEnv = Object.fromEntries(envText.split(/\r?\n/).flatMap(line => {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  return match ? [[match[1],match[2].trim().replace(/^(['"])(.*)\1$/,'$2')]] : []
}))
const token = process.env.SANITY_ORGANIZATION_TOKEN ?? localEnv.SANITY_ORGANIZATION_TOKEN
if (!token) throw Error('Missing SANITY_ORGANIZATION_TOKEN.')

async function groqRows(query) {
  const response = await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/json, text/event-stream','Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method:'tools/call',params:{name:'groq_query',arguments:{query}}}),signal:AbortSignal.timeout(30_000)})
  const body = await response.json()
  if (!response.ok || body.error) throw Error(body.error?.message ?? `Context HTTP ${response.status}`)
  const content = body.result.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') ?? ''
  if (body.result.isError) throw Error(`GROQ error: ${content.slice(0,300)}`)
  const rows = JSON.parse(content).result
  if (!Array.isArray(rows) || rows.some(row => row._id !== evidenceDocumentId({...scope,sourceId:row.sourceId}))) throw Error('Invalid GROQ candidate identity.')
  return rows
}

const groups = []
for (let index=0;index<terms.length;index++) {
  const rows = await groqRows(semanticCandidatesQuery({...scope,question:terms[index],limit:10}))
  groups.push({term:terms[index],candidates:rows.map((row,rank) => ({code:`F${index+1}C${rank+1}`,sourceId:row.sourceId,title:row.title,rank:rank+1,excerpt:(row._embeddings ?? []).flatMap(hit => hit.fragments ?? []).join(' ').slice(0,220)}))})
}
const candidateCodes = new Map(groups.flatMap(group => group.candidates.map(candidate => [candidate.code,candidate])))
const plannerInput = groups.map((group,index) => `FACET ${index+1}: ${group.term}\n${group.candidates.map(candidate => `${candidate.code} | ${candidate.title} | ${candidate.excerpt}`).join('\n')}`).join('\n\n')
const started = performance.now()
const response = await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(90_000),body:JSON.stringify({model:'qwen3:4b-instruct',stream:false,think:false,format:'json',options:{temperature:0,num_ctx:4096},messages:[
  {role:'system',content:'You are an evidence candidate selector, not an answerer. The four groups are independent retrieval facets for one investigated scope. For EACH group, choose exactly two candidate codes most likely to contain DIRECT evidence for that facet in the current investigated incident. Prefer a concrete primary observation or audit over a generic guide, draft, analogous provider, or different-date event. Do not assume search rank is reliable. Return only JSON: {"selections":[["F1C1","F1C2"],["F2C1","F2C2"],["F3C1","F3C2"],["F4C1","F4C2"]]}. Codes must belong to their own group. Never answer the investigation question.'},
  {role:'user',content:`Scope: ${scope.scopeId}. Select evidence for each facet from these candidate titles and matched snippets:\n\n${plannerInput}`},
]})})
const modelBody = await response.json()
if (!response.ok) throw Error(modelBody.error ?? `Ollama HTTP ${response.status}`)
const parsed = JSON.parse(modelBody.message?.content ?? '')
if (!Array.isArray(parsed.selections) || parsed.selections.length !== groups.length || parsed.selections.some((codes,index) => !Array.isArray(codes) || codes.length !== 2 || new Set(codes).size !== 2 || codes.some(code => !candidateCodes.has(code) || !code.startsWith(`F${index+1}C`)))) throw Error('Selector returned invalid facet selections.')
const selected = [...new Set(parsed.selections.flat().map(code => candidateCodes.get(code).sourceId))]
const artifact = {kind:'facet-selector-poc',createdAt:new Date().toISOString(),scope,terms,groups,selector:{inputChars:plannerInput.length,latencyMs:Math.round(performance.now()-started),promptTokens:modelBody.prompt_eval_count??null,completionTokens:modelBody.eval_count??null,selections:parsed.selections},selected,selectedCount:selected.length,gold,goldFound:gold.filter(source => selected.includes(source))}
if (process.env.TRAMA_FACET_ANSWER === '1') {
  const ids = selected.map(sourceId => evidenceDocumentId({...scope,sourceId}))
  const originals = await groqRows(exactEvidenceQuery({...scope,ids}))
  if (originals.length !== ids.length || originals.some(row => sha256(row.body) !== row.contentHash)) throw Error('A selected original is missing or its hash does not match.')
  const byId = new Map(originals.map(row => [row._id,row]))
  const pack = ids.map(id => `SOURCE ID: ${id}\nSOURCE NAME: ${byId.get(id).sourceId}\n${byId.get(id).body}`).join('\n\n')
  const testCase = structuredAdditionalCases.find(item => item.id === 'X01')
  const messages = [
    {role:'system',content:`You are an evidence-aware investigator. Use only supplied records, distinguish evidence from inference, reject other incidents, preserve uncertainty, and answer the exact question.\n\n${structuredOutputInstruction(testCase)}`},
    {role:'user',content:`ORIGINAL CONTENT LAKE EVIDENCE:\n\n${pack}\n\nQUESTION:\n${testCase.prompt}`},
  ]
  const answerStarted = performance.now()
  const answerResponse = await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(120_000),body:JSON.stringify({model:'qwen3:4b-instruct',stream:false,think:false,options:{temperature:0,num_ctx:4096},messages})})
  const answerBody = await answerResponse.json()
  if (!answerResponse.ok) artifact.answerError = answerBody.error ?? `Ollama HTTP ${answerResponse.status}`
  else {
    const answer = answerBody.message?.content ?? ''
    artifact.answerResult = {promptChars:messages.reduce((sum,item)=>sum+item.content.length,0),latencyMs:Math.round(performance.now()-answerStarted),promptTokens:answerBody.prompt_eval_count??null,completionTokens:answerBody.eval_count??null,answer,score:scoreStructured(testCase,answer,{selectedSources:selected,selectedIds:ids})}
  }
}
const dir = resolve(root,'artifacts','sanity-context-benchmark')
await mkdir(dir,{recursive:true})
const path = resolve(dir,`facet-selector-${new Date().toISOString().replace(/[:.]/g,'-')}.json`)
await writeFile(path,`${JSON.stringify(artifact,null,2)}\n`,'utf8')
console.log(JSON.stringify({artifact:path,selected,selectedCount:artifact.selectedCount,goldFound:artifact.goldFound,promptTokens:artifact.selector.promptTokens,latencyMs:artifact.selector.latencyMs,answerError:artifact.answerError??null,answerResult:artifact.answerResult?{promptChars:artifact.answerResult.promptChars,promptTokens:artifact.answerResult.promptTokens,completionTokens:artifact.answerResult.completionTokens,decision:artifact.answerResult.score.decision,pass:artifact.answerResult.score.strictPass}:null},null,2))
