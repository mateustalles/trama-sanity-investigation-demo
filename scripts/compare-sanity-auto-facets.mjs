/** Read-only retrieval POC: Qwen plans facets and selects bounded Sanity candidates. */
import {readFile, mkdir, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {benchmarkCases} from './sanity-context-benchmark-cases.mjs'
import {structuredAdditionalCases} from './sanity-context-benchmark-structured.mjs'
import {autoFacetHoldout} from './fixtures/sanity-auto-facet-holdout.mjs'
import {autoFacetHoldoutV2} from './fixtures/sanity-auto-facet-holdout-v2.mjs'
import {evidenceDocumentId, semanticCandidatesQuery, sha256} from './sanity-content-lake-evidence.mjs'
import {parseRetrievalPlan, parseSelectorCodes, retrievalPlannerPrompt, retrievalSelectorPrompt, routeRetrievalSources} from './sanity-facet-retrieval.mjs'

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
const suite = process.env.TRAMA_AUTO_FACET_SUITE ?? 'development'
if (!['development','holdout','holdout-v2'].includes(suite)) throw Error('Unknown auto-facet suite.')
const suiteCases = suite === 'holdout' ? autoFacetHoldout : suite === 'holdout-v2' ? autoFacetHoldoutV2 : [...benchmarkCases,...structuredAdditionalCases]
const caseIds = (process.env.TRAMA_AUTO_FACET_CASE_IDS ?? (suite === 'development' ? 'X01,R01,R02,R03,R04,R05,R06,R07,R08' : suiteCases.map(item=>item.id).join(','))).split(',').map(value=>value.trim()).filter(Boolean)
const cases = suiteCases.filter(item=>caseIds.includes(item.id))
if (cases.length !== caseIds.length || new Set(caseIds).size !== caseIds.length) throw Error('Unknown or duplicate case ID.')
const gold = suite !== 'development' ? Object.fromEntries(suiteCases.map(item=>[item.id,item.gold])) : JSON.parse(await readFile(resolve(root,'scripts','fixtures','sanity-pilot-source-gold.json'),'utf8'))
if (suite === 'development') gold.X01 = ['01-deployment-record.md','02-provider-latency-log.md','03-postal-code-sample.md','04-fraud-score-report.md']
if (cases.some(item=>!gold[item.id])) throw Error('Missing source gold for a selected case.')
const fixtureHash = sha256(JSON.stringify(cases.map(item=>({id:item.id,prompt:item.prompt,gold:gold[item.id]}))))

async function groqResult(query) {
  const response = await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/json, text/event-stream','Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method:'tools/call',params:{name:'groq_query',arguments:{query}}}),signal:AbortSignal.timeout(30_000)})
  const body = await response.json()
  if (!response.ok || body.error) throw Error(body.error?.message ?? `Context HTTP ${response.status}`)
  const content = body.result.content?.filter(item=>item.type==='text').map(item=>item.text).join('\n') ?? ''
  if (body.result.isError) throw Error(`GROQ error: ${content.slice(0,300)}`)
  return JSON.parse(content).result
}

async function groqRows(query) {
  const rows = await groqResult(query)
  if (!Array.isArray(rows) || rows.some(row=>row._id!==evidenceDocumentId({...scope,sourceId:row.sourceId}))) throw Error('Invalid candidate identity.')
  return rows
}

async function ollama(messages, format) {
  const started = performance.now()
  const response = await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(90_000),body:JSON.stringify({model:'qwen3:4b-instruct',stream:false,think:false,format,options:{temperature:0,num_ctx:4096},messages})})
  const body = await response.json()
  if (!response.ok) throw Error(body.error ?? `Ollama HTTP ${response.status}`)
  return {content:body.message?.content ?? '',latencyMs:Math.round(performance.now()-started),promptTokens:body.prompt_eval_count??0,completionTokens:body.eval_count??0}
}

async function planFacets(question) {
  const system = retrievalPlannerPrompt
  let feedback = '', totalLatencyMs = 0, promptTokens = 0, completionTokens = 0
  for (let attempt=0;attempt<2;attempt++) {
    const result = await ollama([{role:'system',content:system},{role:'user',content:`Scope: ${scope.scopeId}\nQuestion: ${question}${feedback}`}],{type:'object',required:['task','facets'],properties:{task:{type:'string'},facets:{type:'array',minItems:1,maxItems:4,items:{type:'string'}}},additionalProperties:false})
    totalLatencyMs += result.latencyMs; promptTokens += result.promptTokens; completionTokens += result.completionTokens
    try { return {...parseRetrievalPlan(result.content,{question,scopeText:scope.scopeId}),attempts:attempt+1,latencyMs:totalLatencyMs,promptTokens,completionTokens} }
    catch(error) { if (attempt) throw Object.assign(Error(`${error.message} Last output: ${result.content.slice(0,500)}`),{latencyMs:totalLatencyMs,promptTokens,completionTokens}); feedback=`\nPrevious output was invalid: ${result.content.slice(0,500)}. Reason: ${error.message}. Return a corrected plan using only the original question and scope words.` }
  }
}

async function selectCandidates(facets) {
  const groups = []
  for (let index=0;index<facets.length;index++) {
    const rows = await groqRows(semanticCandidatesQuery({...scope,question:facets[index],limit:10}))
    groups.push({facet:facets[index],candidates:rows.map((row,rank)=>({code:`F${index+1}C${rank+1}`,sourceId:row.sourceId,title:row.title,rank:rank+1,excerpt:(row._embeddings??[]).flatMap(hit=>hit.fragments??[]).join(' ').slice(0,220)}))})
  }
  const input = groups.map((group,index)=>`FACET ${index+1}: ${group.facet}\n${group.candidates.map(item=>`${item.code} | ${item.title} | ${item.excerpt}`).join('\n')}`).join('\n\n')
  const system = retrievalSelectorPrompt
  const result = await ollama([{role:'system',content:system},{role:'user',content:`Scope: ${scope.scopeId}.\n${input}`}],'json')
  const byCode = new Map(groups.flatMap(group=>group.candidates.map(item=>[item.code,item])))
  const {codes,selections,warning:selectorWarning} = parseSelectorCodes(result.content,[...byCode.keys()],groups.length)
  const anchors = groups.map(group=>group.candidates[0]?.sourceId).filter(Boolean)
  const selected = [...new Set(codes.map(code=>byCode.get(code).sourceId))]
  return {groups,selections,anchors,selected,selectorWarning,inputChars:input.length,latencyMs:result.latencyMs,promptTokens:result.promptTokens,completionTokens:result.completionTokens}
}

const scopedCount = await groqResult(`count(*[_type == "evidenceSource" && workspaceId == ${JSON.stringify(scope.workspaceId)} && scopeId == ${JSON.stringify(scope.scopeId)}])`)
if (scopedCount !== 145) throw Error(`Expected the frozen 145-source scope; found ${scopedCount}.`)
const results = []
for (const item of cases) {
  const baselineRows = await groqRows(semanticCandidatesQuery({...scope,question:item.prompt,limit:10}))
  const record = {id:item.id,question:item.prompt,gold:gold[item.id],baseline:baselineRows.map(row=>row.sourceId)}
  try {
    record.plan = await planFacets(item.prompt)
    if (record.plan.facets.length >= 3) {
      record.selection = await selectCandidates(record.plan.facets)
      record.foundSelected = record.gold.filter(source=>record.selection.selected.includes(source))
    } else {
      record.selection = null
      record.foundSelected = []
    }
    record.delivery = routeRetrievalSources({baseline:record.baseline,facetAnchors:record.selection?.anchors ?? [],facetSelected:record.selection?.selected ?? [],facetCount:record.plan.facets.length,limit:10})
  } catch(error) {
    record.error = error instanceof Error ? error.message : String(error)
    record.errorMetrics = {latencyMs:error.latencyMs??0,promptTokens:error.promptTokens??0,completionTokens:error.completionTokens??0}
    record.foundSelected = []
    record.delivery = routeRetrievalSources({baseline:record.baseline,facetSelected:[],facetCount:1,limit:10})
  }
  record.found = record.gold.filter(source=>record.delivery.sources.includes(source))
  results.push(record)
  console.log(`${item.id}: baseline ${record.gold.filter(source=>record.baseline.includes(source)).length}/${record.gold.length}; delivered ${record.found.length}/${record.gold.length} (${record.delivery.strategy})${record.error?` ERROR ${record.error}`:''}`)
}
const summary = {cases:results.length,baselineFound:results.reduce((sum,item)=>sum+item.gold.filter(source=>item.baseline.includes(source)).length,0),selectorEvaluated:results.filter(item=>item.selection).length,selectorWarnings:results.filter(item=>item.selection?.selectorWarning).length,selectorFoundEvaluated:results.reduce((sum,item)=>sum+item.foundSelected.length,0),deliveredFound:results.reduce((sum,item)=>sum+item.found.length,0),goldTotal:results.reduce((sum,item)=>sum+item.gold.length,0),plannerErrors:results.filter(item=>item.error).length,completeBaseline:results.filter(item=>item.gold.every(source=>item.baseline.includes(source))).length,completeDelivered:results.filter(item=>item.gold.every(source=>item.found.includes(source))).length,plannerPromptTokens:results.reduce((sum,item)=>sum+(item.plan?.promptTokens??item.errorMetrics?.promptTokens??0),0),selectorPromptTokens:results.reduce((sum,item)=>sum+(item.selection?.promptTokens??0),0)}
const artifact = {kind:'auto-facet-selector-poc',suite,fixtureHash,createdAt:new Date().toISOString(),model:'qwen3:4b-instruct',dataset:'trama-evidence-pilot',scope,sourceCount:scopedCount,limitPerFacet:10,selectorLimit:8,deliveredLimit:10,summary,results}
const dir = resolve(root,'artifacts','sanity-context-benchmark')
await mkdir(dir,{recursive:true})
const path = resolve(dir,`auto-facet-${suite}-${new Date().toISOString().replace(/[:.]/g,'-')}.json`)
await writeFile(path,`${JSON.stringify(artifact,null,2)}\n`,'utf8')
console.log(JSON.stringify({artifact:path,summary},null,2))
