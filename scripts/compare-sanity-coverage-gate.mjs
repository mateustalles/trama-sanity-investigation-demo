/** Read-only pilot: retrieve baseline, detect uncovered evidence facets, then search only those. */
import {readFile, mkdir, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {autoFacetHoldoutV2} from './fixtures/sanity-auto-facet-holdout-v2.mjs'
import {gatedFacetHoldout} from './fixtures/sanity-gated-facet-holdout.mjs'
import {evidenceDocumentId, semanticCandidatesQuery, sha256} from './sanity-content-lake-evidence.mjs'
import {parseCoveragePlan, routeRetrievalSources} from './sanity-facet-retrieval.mjs'

const root = resolve(import.meta.dirname,'..')
const scope = {workspaceId:'synthetic-benchmark',scopeId:'payment-incident-2026-09-18'}
const endpoint = process.env.TRAMA_BENCHMARK_PILOT_GROQ_MCP_URL ?? 'https://api.sanity.io/v1/context/organizations/o6xohyg5w/mcp/trama-evidence-pilot-groq'
const envPath = process.env.TRAMA_BENCHMARK_ENV_FILE ?? resolve(process.env.USERPROFILE ?? '','Documents','trama','.env.local')
const envText = await readFile(envPath,'utf8')
const fileEnv = Object.fromEntries(envText.split(/\r?\n/).flatMap(line=>{
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  return match ? [[match[1],match[2].trim().replace(/^(['"])(.*)\1$/,'$2')]] : []
}))
const token = process.env.SANITY_ORGANIZATION_TOKEN ?? fileEnv.SANITY_ORGANIZATION_TOKEN
if (!token) throw Error('Missing SANITY_ORGANIZATION_TOKEN.')
const suite = process.env.TRAMA_COVERAGE_GATE_SUITE ?? 'development'
if (!['development','prospective'].includes(suite)) throw Error('Unknown coverage-gate suite.')
const suiteCases = suite === 'prospective' ? gatedFacetHoldout : autoFacetHoldoutV2
const requestedIds = (process.env.TRAMA_COVERAGE_GATE_CASE_IDS ?? suiteCases.map(item=>item.id).join(',')).split(',').map(value=>value.trim()).filter(Boolean)
const cases = suiteCases.filter(item=>requestedIds.includes(item.id))
if (cases.length!==requestedIds.length || new Set(requestedIds).size!==requestedIds.length) throw Error('Unknown or duplicate case ID.')
const fixtureHash = sha256(JSON.stringify(cases.map(item=>({id:item.id,prompt:item.prompt,gold:item.gold}))))

async function groqResult(query) {
  const started = performance.now()
  const response = await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/json, text/event-stream','Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method:'tools/call',params:{name:'groq_query',arguments:{query}}}),signal:AbortSignal.timeout(30_000)})
  const body = await response.json()
  if (!response.ok || body.error) throw Error(body.error?.message ?? `Context HTTP ${response.status}`)
  const content = body.result.content?.filter(item=>item.type==='text').map(item=>item.text).join('\n') ?? ''
  if (body.result.isError) throw Error(`GROQ error: ${content.slice(0,300)}`)
  return {value:JSON.parse(content).result,latencyMs:Math.round(performance.now()-started)}
}

async function candidateRows(query) {
  const response = await groqResult(query)
  if (!Array.isArray(response.value) || response.value.some(row=>row._id!==evidenceDocumentId({...scope,sourceId:row.sourceId}))) throw Error('Invalid scoped candidate identity.')
  return {rows:response.value,latencyMs:response.latencyMs}
}

async function ollama(messages) {
  const started = performance.now()
  const response = await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(45_000),body:JSON.stringify({model:'qwen3:4b-instruct',stream:false,think:false,format:'json',options:{temperature:0,num_ctx:4096},messages})})
  const body = await response.json()
  if (!response.ok) throw Error(body.error ?? `Ollama HTTP ${response.status}`)
  return {content:body.message?.content ?? '',latencyMs:Math.round(performance.now()-started),promptTokens:body.prompt_eval_count??0,completionTokens:body.eval_count??0}
}

function baselineMetadata(rows) {
  return rows.map((row,index)=>({code:`B${index+1}`,sourceId:row.sourceId,title:row.title,excerpt:(row._embeddings??[]).flatMap(hit=>hit.fragments??[]).join(' ').slice(0,160)}))
}

async function detectCoverage(question, candidates) {
  const system = 'You are a conservative retrieval coverage detector, not an investigator. Return ONLY JSON: {"task":"brief answer operation","facets":[{"query":"one searchable evidence target","status":"covered|uncertain|missing","candidateCode":"B1 or null"}]}. Use 1-4 distinct concrete facets. Copy every query word from the question or scope; do not invent entities, dates, synonyms, or source names. Split slash-separated concepts. Do not turn answer instructions into facets. You see ONLY the first three baseline candidates. Status is covered ONLY when a listed title and snippet directly identify an original record for that facet in the same event and date. Shared words, another provider, another date, a generic guide, or a proposal are NOT coverage. If unsure, say uncertain. If no listed candidate is plausible, say missing; this does not mean the wider collection lacks evidence. A covered facet MUST cite a listed B-code; other statuses MUST use null. This judges candidate coverage only, never the truth of an answer. Example unrelated to this case: question "Compare engine heat and coolant test" with B1 engine heat measurement and no coolant record -> {"task":"compare","facets":[{"query":"engine heat","status":"covered","candidateCode":"B1"},{"query":"coolant test","status":"missing","candidateCode":null}]}.'
  const input = `Scope: ${scope.scopeId}\nQuestion: ${question}\n\nBASELINE CANDIDATES:\n${candidates.map(item=>`${item.code} | ${item.sourceId} | ${item.title} | ${item.excerpt}`).join('\n')}`
  let feedback = '', latencyMs = 0, promptTokens = 0, completionTokens = 0
  for (let attempt=0;attempt<2;attempt++) {
    const result = await ollama([{role:'system',content:system},{role:'user',content:`${input}${feedback}`}])
    latencyMs+=result.latencyMs;promptTokens+=result.promptTokens;completionTokens+=result.completionTokens
    try { return {...parseCoveragePlan(result.content,{question,scopeText:scope.scopeId,candidateCodes:candidates.map(item=>item.code)}),raw:result.content,attempts:attempt+1,latencyMs,promptTokens,completionTokens,inputChars:input.length} }
    catch(error) {
      if (attempt) throw Object.assign(Error(`${error.message} Last output: ${result.content.slice(0,500)}`),{latencyMs,promptTokens,completionTokens})
      feedback=`\nYour previous JSON was invalid: ${result.content.slice(0,500)}. Reason: ${error.message}. Correct it; use only question/scope terms and listed B-codes.`
    }
  }
}

const count = await groqResult(`count(*[_type == "evidenceSource" && workspaceId == ${JSON.stringify(scope.workspaceId)} && scopeId == ${JSON.stringify(scope.scopeId)}])`)
if (count.value!==145) throw Error(`Expected frozen 145-source scope; found ${count.value}.`)

const results = []
for (const item of cases) {
  const baselineQuery = semanticCandidatesQuery({...scope,question:item.prompt,limit:10})
  const baseline = await candidateRows(baselineQuery)
  const record = {id:item.id,question:item.prompt,gold:item.gold,baseline:baseline.rows.map(row=>row.sourceId),baselineLatencyMs:baseline.latencyMs,baselineCandidates:baselineMetadata(baseline.rows),extraFacetQueries:[],counterfactualExtraQueries:[]}
  try {
    record.plan = await detectCoverage(item.prompt,record.baselineCandidates.slice(0,3))
    const facetRows = new Map()
    if (record.plan.facets.length>=3) {
      for (let index=0;index<record.plan.facets.length;index++) {
        const facet = record.plan.facets[index]
        if (facet.status==='covered') continue
        const response = await candidateRows(semanticCandidatesQuery({...scope,question:facet.query,limit:10}))
        facetRows.set(index,response.rows)
        record.extraFacetQueries.push({index,query:facet.query,latencyMs:response.latencyMs,topSource:response.rows[0]?.sourceId??null})
      }
    }
    const anchors = [...facetRows.values()].map(rows=>rows[0]?.sourceId).filter(Boolean)
    record.delivery = routeRetrievalSources({baseline:record.baseline,facetAnchors:anchors,facetCount:record.plan.facets.length,limit:10})
  } catch(error) {
    record.error = error instanceof Error ? error.message : String(error)
    record.errorMetrics = {latencyMs:error.latencyMs??0,promptTokens:error.promptTokens??0,completionTokens:error.completionTokens??0}
    record.delivery = {strategy:'whole-question-fallback',sources:record.baseline}
  }
  // Counterfactual uses the same detector plan; its extra reads never change the gated result.
  if (record.plan?.facets.length>=3 && !record.error) {
    try {
      const facetRows = new Map(record.extraFacetQueries.map(item=>[item.index,item.topSource]))
      for (let index=0;index<record.plan.facets.length;index++) {
        if (facetRows.has(index)) continue
        const facet = record.plan.facets[index]
        const response = await candidateRows(semanticCandidatesQuery({...scope,question:facet.query,limit:10}))
        facetRows.set(index,response.rows[0]?.sourceId??null)
        record.counterfactualExtraQueries.push({index,query:facet.query,latencyMs:response.latencyMs,topSource:response.rows[0]?.sourceId??null})
      }
      const allAnchors = record.plan.facets.map((_,index)=>facetRows.get(index)).filter(Boolean)
      record.alwaysFacetDelivery = routeRetrievalSources({baseline:record.baseline,facetAnchors:allAnchors,facetCount:record.plan.facets.length,limit:10})
    } catch(error) { record.counterfactualError = error instanceof Error ? error.message : String(error);record.alwaysFacetDelivery = {strategy:'unavailable',sources:record.baseline} }
  } else record.alwaysFacetDelivery = {strategy:'whole-question',sources:record.baseline}
  record.foundBaseline = item.gold.filter(source=>record.baseline.includes(source))
  record.foundGated = item.gold.filter(source=>record.delivery.sources.includes(source))
  record.foundAlwaysFacet = item.gold.filter(source=>record.alwaysFacetDelivery.sources.includes(source))
  results.push(record)
  console.log(`${item.id}: baseline ${record.foundBaseline.length}/${item.gold.length}; gated ${record.foundGated.length}/${item.gold.length}; always-anchor ${record.foundAlwaysFacet.length}/${item.gold.length}; extra GROQ ${record.extraFacetQueries.length}${record.error?` ERROR ${record.error}`:''}`)
}

const sum = key=>results.reduce((total,item)=>total+item[key].length,0)
const complete = key=>results.filter(item=>item.gold.every(source=>item[key].includes(source))).length
const summary = {cases:results.length,goldTotal:results.reduce((total,item)=>total+item.gold.length,0),baselineFound:sum('foundBaseline'),gatedFound:sum('foundGated'),alwaysFacetFound:sum('foundAlwaysFacet'),completeBaseline:complete('foundBaseline'),completeGated:complete('foundGated'),completeAlwaysFacet:complete('foundAlwaysFacet'),detectorErrors:results.filter(item=>item.error).length,detectorPromptTokens:results.reduce((total,item)=>total+(item.plan?.promptTokens??item.errorMetrics?.promptTokens??0),0),detectorCompletionTokens:results.reduce((total,item)=>total+(item.plan?.completionTokens??item.errorMetrics?.completionTokens??0),0),detectorLatencyMs:results.reduce((total,item)=>total+(item.plan?.latencyMs??item.errorMetrics?.latencyMs??0),0),gatedFacetCalls:results.reduce((total,item)=>total+item.extraFacetQueries.length,0),alwaysFacetCalls:results.reduce((total,item)=>total+item.extraFacetQueries.length+item.counterfactualExtraQueries.length,0),baselineCalls:results.length}
const artifact = {kind:'coverage-gated-facet-poc',suite,fixtureHash,createdAt:new Date().toISOString(),model:'qwen3:4b-instruct',dataset:'trama-evidence-pilot',scope,sourceCount:count.value,sourceLimit:10,summary,results}
const dir = resolve(root,'artifacts','sanity-context-benchmark')
await mkdir(dir,{recursive:true})
const path = resolve(dir,`coverage-gate-${suite}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`)
await writeFile(path,`${JSON.stringify(artifact,null,2)}\n`,'utf8')
console.log(JSON.stringify({artifact:path,summary},null,2))
