import {readFile,readdir,mkdir,writeFile,rename} from 'node:fs/promises'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {Tokenizer} from '@huggingface/tokenizers'
import {benchmarkCases} from './sanity-context-benchmark-cases.mjs'
import {structuredAdditionalCases,scoreStructured,assertStructuredSpecs,structuredScoringRevision} from './sanity-context-benchmark-structured.mjs'
import {queryForCase,queryRevision} from './fixtures/sanity-kb-search-queries.mjs'
import {pilot50Distractors} from './fixtures/sanity-pilot-50-distractors.mjs'
import {pilot145Distractors} from './fixtures/sanity-pilot-145-distractors.mjs'
import {demoScope} from './sanity-demo-agent.mjs'
import {createKnowledgeBaseReader} from './sanity-kb-demo-agent.mjs'
import {makeEvidenceDocument,sha256,sourceIdsFromKnowledgeBaseEntry} from './sanity-content-lake-evidence.mjs'
import {comparisonArms,comparisonModels,comparisonJobs,comparisonMessages,createLocalKeywordSearch,summarizeComparison} from './sanity-kb-search-comparison.mjs'

const cases=[...benchmarkCases,...structuredAdditionalCases]
assertStructuredSpecs(cases)
const option=name=>process.argv.find(s=>s.startsWith(`--${name}=`))?.slice(name.length+3)
const readJson=async path=>JSON.parse(await readFile(path,'utf8'))
async function save(path,value) {
  await writeFile(`${path}.tmp`,JSON.stringify(value,null,2))
  await rename(`${path}.tmp`,path)
}

export function qwenContentTokens(tokenizer,messages) {
  return messages.reduce((sum,m)=>sum+tokenizer.encode(m.content,{add_special_tokens:false}).ids.length,0)
}

async function prepare(outputDir) {
  const sourceDir=option('corpus')
  const auditPath=option('audit')
  const stateArtifactPath=option('state-artifact')
  if (!sourceDir||!auditPath||!stateArtifactPath) throw new Error('prepare requires --corpus, --audit, --state-artifact and --out.')
  // These are local raw files and synthetic fixtures. Neither retrieval arm
  // downloads, rewrites or enriches the keyword corpus through Sanity.
  const files=(await readdir(sourceDir)).filter(f=>f.endsWith('.md')&&f!=='README.md').sort()
  if(files.length!==24) throw new Error('Expected 24 local primary records.')
  const rows=[...await Promise.all(files.map(async sourceId=>({sourceId,body:await readFile(join(sourceDir,sourceId),'utf8')}))),...pilot50Distractors,...pilot145Distractors]
  const documents=rows.map(({sourceId,body})=>makeEvidenceDocument({...demoScope,sourceId,body,title:body.match(/^#\s+(.+)$/m)?.[1]?.trim()??sourceId}))
  const audit=await readJson(auditPath)
  const hashes=new Map(audit.sourceRevisions?.map(r=>[r.id,r.contentHash]))
  if(documents.length!==145||hashes.size!==145||documents.some(d=>hashes.get(d._id)!==d.contentHash)) throw new Error('Local raw corpus differs from the verified 145-source KB corpus.')
  const previous=await readJson(stateArtifactPath)
  const stateMessage=previous.results?.find(r=>r.id==='S01')?.modelTrace?.[0]?.messages?.find(m=>m.role==='user')?.content
  const serializedState=stateMessage?.split('CURRENT STRUCTURED STATE:\n')[1]?.split('\n\nQUESTION:')[0]
  if(!serializedState) throw new Error('No frozen authoritative State in the supplied prior artifact.')
  const state=JSON.parse(serializedState).result
  if(state?.case?.stateRevision!==3||state?.case?.status!=='open'||state?.deltas?.filter(d=>d.status==='applied').length!==2||state.deltas[0].appliedAt!=='2026-09-21T17:42:16.476Z') throw new Error('Frozen State is incompatible with the unchanged v4.5 rubric.')
  const knowledgeBaseId='kbkpWkNaMVN6',limit=5
  const manifest={kind:'native-kb-search-versus-local-keyword',revision:1,queryRevision,knowledgeBaseId,limit,
    limitUnits:{'sanity-kb-search':'KB entries','keyword-local':'raw documents'},corpusCount:145,
    corpusHash:sha256(JSON.stringify(documents.map(d=>[d._id,d.contentHash]))),stateHash:sha256(JSON.stringify(state)),state,
    cases:cases.map(c=>({id:c.id,prompt:c.prompt,requiresState:Boolean(c.requiresState),query:queryForCase(c.id)})),
    arms:comparisonArms,models:comparisonModels,expected:comparisonJobs(cases).length,
    scoringRevision:structuredScoringRevision,repetitions:1,createdAt:new Date().toISOString(),
    settings:{ollama:{numCtx:16384,numGpu:99,numBatch:64,numPredict:2048,think:false,temperature:0},openai:{reasoningEffort:'low',maxOutputTokens:2048,store:false}},
    limitations:['Existing full suite includes keyword-explicit and State cases; it is not an open-question-only suite.',
      'KB generated entries versus raw originals is a representation-plus-retrieval comparison, not identical evidence packets.',
      'Five native entries and five raw documents are different units; full text is preserved and tokens must be reported.',
      'State is a shared frozen application fixture, not evidence retrieved by either arm.']}
  // Refuse to overwrite a prepared run, even if it has not started inference.
  await writeFile(join(outputDir,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'})
  await save(join(outputDir,'corpus.json'),documents)
  const kb=createKnowledgeBaseReader({mcpEndpoint:process.env.SANITY_CONTEXT_EVIDENCE_MCP_URL,knowledgeBaseId,organizationToken:process.env.SANITY_ORGANIZATION_TOKEN})
  const tools=await kb.listTools()
  const tool=tools.find(t=>t.name==='knowledge_base_search')
  if(!tool?.inputSchema?.properties?.return?.enum?.includes('entries')) throw new Error('Native knowledge_base_search with entries is unavailable. No fallback.')
  await save(join(outputDir,'native-tool.json'),tool)
  const initial=await kb.initialContext()
  if(!initial.includes(`Knowledge base id: \`${knowledgeBaseId}\``)) throw new Error('KB orientation identity mismatch.')
  await save(join(outputDir,'orientation.json'),{text:initial,hash:sha256(initial)})
  const keywordSearch=createLocalKeywordSearch(documents,{limit})
  const packets=[]
  const allowed=new Set(documents.map(d=>d._id))
  for(const c of manifest.cases) {
    const query=c.query
    for(const arm of comparisonArms) {
      const started=performance.now()
      let packet
      try {
        const response=arm==='sanity-kb-search'?await kb.searchKnowledgeBase({knowledgeBase:knowledgeBaseId,query,return:'entries',limit}):keywordSearch(query)
        const references=arm==='sanity-kb-search'?sourceIdsFromKnowledgeBaseEntry(response.text,allowed):null
        packet={id:c.id,arm,query,text:response.text,response,latencyMs:Math.round(performance.now()-started),
          selectedIds:references?.ids??response.hits.map(h=>h.id),unknownIds:references?.unknownIds??[],
          modelCalls:0,fallback:false,hostReranking:false,hostTruncation:false}
      } catch(error) {
        packet={id:c.id,arm,query,text:'',error:error.message,response:error.response??null,latencyMs:Math.round(performance.now()-started),
          selectedIds:[],fallback:false,hostReranking:false,hostTruncation:false}
      }
      packets.push(packet)
      await save(join(outputDir,'packets.json'),packets)
      console.log(JSON.stringify({event:'retrieval',id:c.id,arm,characters:packet.text.length,latencyMs:packet.latencyMs,error:packet.error??null}))
    }
  }
  // A lightweight tokenizer, not model weights. Cache provenance/hashes so no
  // model prompt is silently cropped to fit the local context window.
  const info=await fetch('https://huggingface.co/api/models/Qwen/Qwen3-4B-Instruct-2507',{signal:AbortSignal.timeout(30000)}).then(r=>{if(!r.ok)throw new Error('Tokenizer metadata unavailable');return r.json()})
  for(const file of ['tokenizer.json','tokenizer_config.json']) {
    const response=await fetch(`https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/resolve/${info.sha}/${file}`,{signal:AbortSignal.timeout(60000)})
    if(!response.ok) throw new Error('Tokenizer download failed; no context-safety fallback.')
    await save(join(outputDir,file),await response.json())
  }
  manifest.tokenizer={model:'Qwen/Qwen3-4B-Instruct-2507',revision:info.sha,
    tokenizerHash:sha256(await readFile(join(outputDir,'tokenizer.json'),'utf8')),
    configHash:sha256(await readFile(join(outputDir,'tokenizer_config.json'),'utf8'))}
  manifest.packetHash=sha256(JSON.stringify(packets))
  manifest.preparedAt=new Date().toISOString()
  await save(join(outputDir,'manifest.json'),manifest)
  console.log(JSON.stringify({event:'prepared',outputDir,packets:packets.length,expected:manifest.expected,retrievalErrors:packets.filter(p=>p.error).length}))
}

async function run(outputDir) {
  const manifest=await readJson(join(outputDir,'manifest.json'))
  const packets=await readJson(join(outputDir,'packets.json'))
  if(manifest.expected!==160||packets.length!==80||manifest.packetHash!==sha256(JSON.stringify(packets))||
      JSON.stringify(manifest.cases)!==JSON.stringify(cases.map(c=>({id:c.id,prompt:c.prompt,requiresState:Boolean(c.requiresState),query:queryForCase(c.id)})))) throw new Error('Frozen experiment identity mismatch.')
  const identity=sha256(JSON.stringify(manifest))
  const path=join(outputDir,'checkpoint.json')
  let checkpoint
  try{checkpoint=await readJson(path);if(checkpoint.identity!==identity)throw new Error('Checkpoint identity mismatch.')}
  catch(error){if(error.code!=='ENOENT')throw error;checkpoint={kind:manifest.kind,identity,status:'running',expected:160,startedAt:new Date().toISOString(),manifest,results:[]}}
  if(checkpoint.status==='complete') {console.log(JSON.stringify({event:'already-complete',outputDir}));return}
  if(manifest.scoringRevision!==structuredScoringRevision) throw new Error('Prepared grader revision differs from the current host grader. Preserve this run; use an explicit offline audit or prepare a separate experiment.')
  const apiKey=process.env.OPENAI_API_KEY??process.env.OPEN_API_KEY
  if(!apiKey)throw new Error('OpenAI API key is unavailable.')
  if(manifest.tokenizer.tokenizerHash!==sha256(await readFile(join(outputDir,'tokenizer.json'),'utf8'))||
      manifest.tokenizer.configHash!==sha256(await readFile(join(outputDir,'tokenizer_config.json'),'utf8')))throw new Error('Tokenizer cache changed.')
  const tokenizer=new Tokenizer(await readJson(join(outputDir,'tokenizer.json')),await readJson(join(outputDir,'tokenizer_config.json')))
  const done=new Set(checkpoint.results.map(r=>`${r.id}/${r.arm}/${r.model}`))
  const blocked=new Map()
  await save(path,checkpoint)
  console.log(JSON.stringify({event:'running',pid:process.pid,outputDir,expected:160,completed:checkpoint.results.length,models:comparisonModels,arms:comparisonArms}))
  for(const job of comparisonJobs(cases)) {
    const key=`${job.id}/${job.arm}/${job.model}`
    if(done.has(key))continue
    const c=cases.find(c=>c.id===job.id),packet=packets.find(p=>p.id===job.id&&p.arm===job.arm)
    const messages=comparisonMessages(c,packet,manifest.state)
    const row={...job,query:packet.query,inputHash:sha256(JSON.stringify(messages)),messages,
      retrievalLatencyMs:packet.latencyMs,retrievedCharacters:packet.text.length,selectedIds:packet.selectedIds,
      stateAvailable:Boolean(c.requiresState),hostTruncation:false,semanticAudit:'pending'}
    console.log(JSON.stringify({event:'question-started',...job,characters:packet.text.length}))
    const started=performance.now()
    try {
      if(packet.error)throw new Error(`Retrieval failure, no fallback: ${packet.error}`)
      if(!packet.text.trim())throw new Error('Retrieval returned empty content, no fallback.')
      if(blocked.has(job.provider))throw new Error(`Provider blocked: ${blocked.get(job.provider)}`)
      let payload,response
      if(job.provider==='openai') {
        response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
          body:JSON.stringify({model:job.model,input:messages,reasoning:{effort:'low'},max_output_tokens:2048,store:false,text:{format:{type:'json_object'}}}),signal:AbortSignal.timeout(120000)})
        payload=await response.json()
        row.providerResponse=payload
        if(!response.ok||payload.status!=='completed')throw new Error(`OpenAI ${response.status}: ${payload.error?.message??payload.status}`)
        row.answer=(payload.output??[]).filter(x=>x.type==='message').flatMap(x=>x.content??[]).filter(x=>x.type==='output_text').map(x=>x.text).join('')
        row.promptTokens=payload.usage?.input_tokens;row.completionTokens=payload.usage?.output_tokens
      } else {
        const settings=manifest.settings.ollama
        const tokenCount=qwenContentTokens(tokenizer,messages)
        row.preflightContentTokens=tokenCount
        if(tokenCount+96+settings.numPredict>settings.numCtx)throw new Error(`Context overflow: ${tokenCount} content tokens plus framing/output exceeds ${settings.numCtx}; nothing cropped.`)
        response=await fetch('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(240000),
          body:JSON.stringify({model:job.model,messages,stream:false,think:false,format:'json',keep_alive:'2m',
            options:{temperature:0,num_ctx:settings.numCtx,num_gpu:settings.numGpu,num_batch:settings.numBatch,num_predict:settings.numPredict}})})
        payload=await response.json()
        row.providerResponse=payload
        if(!response.ok||!payload.done)throw new Error(`Ollama ${response.status}: ${payload.error??'incomplete response'}`)
        row.answer=payload.message?.content??'';row.promptTokens=payload.prompt_eval_count;row.completionTokens=payload.eval_count
        if(payload.done_reason==='length')throw new Error('Model output truncated; not an answer PASS.')
        if(row.promptTokens+32<tokenCount)throw new Error('Possible local input truncation detected; not an answer PASS.')
      }
      row.inferenceLatencyMs=Math.round(performance.now()-started)
      row.providerResponse=payload
      row.score=scoreStructured(c,row.answer,{selectedIds:packet.selectedIds,stateAvailable:Boolean(c.requiresState)})
      row.rationale={decision:{expected:row.score.correctDecision,actual:row.score.decision,pass:row.score.decisionPass},facts:row.score.factResults,
        format:row.score.formatPass,evidenceRequiredForPass:false,semanticSupportRequiresManualAudit:true}
    } catch(error) {
      row.error=error.message;row.inferenceLatencyMs=Math.round(performance.now()-started)
      if(/no credits|insufficient.quota|billing|invalid.*key|out of memory|not enough.*memory/i.test(error.message))blocked.set(job.provider,error.message)
    }
    checkpoint.results.push(row)
    checkpoint.updatedAt=new Date().toISOString();checkpoint.summary=summarizeComparison(checkpoint.results)
    await save(path,checkpoint)
    console.log(JSON.stringify({event:'question-completed',...job,completed:checkpoint.results.length,expected:160,pass:Boolean(row.score?.strictPass&&row.score?.formatPass&&!row.error),
      decision:row.score?.decisionPass,facts:row.score?.factsPass,format:row.score?.formatPass,promptTokens:row.promptTokens,completionTokens:row.completionTokens,
      latencyMs:row.inferenceLatencyMs,error:row.error??null,answer:row.answer??null,rationale:row.rationale??null}))
  }
  checkpoint.status='complete';checkpoint.completedAt=new Date().toISOString()
  await save(path,checkpoint);await save(join(outputDir,'final.json'),checkpoint)
  console.log(JSON.stringify({event:'complete',outputDir,summary:checkpoint.summary}))
}

async function main() {
  const mode=process.argv[2],out=option('out')
  if(!['prepare','run'].includes(mode)||!out)throw new Error('Use prepare|run --out=DIR; preparation also needs --corpus, --audit, --state-artifact.')
  const outputDir=resolve(out)
  await mkdir(outputDir,{recursive:true})
  if(mode==='prepare')await prepare(outputDir);else await run(outputDir)
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{console.error(error.message);process.exitCode=1})
