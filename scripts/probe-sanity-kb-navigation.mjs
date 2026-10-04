import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {parseKnowledgeBaseOutline} from '../apps/web/lib/sanity/context-mcp-policy.ts'
import {createDemoAdapters,demoScope} from './sanity-demo-agent.mjs'
import {createKnowledgeBaseReader,createLocalKnowledgeBaseGenerator,investigateKnowledgeBaseQuestion} from './sanity-kb-demo-agent.mjs'
import {evidenceDocumentId,sourceIdsFromKnowledgeBaseEntry} from './sanity-content-lake-evidence.mjs'

const mode = process.argv[2] ?? 'audit'
if (!['audit','run','run-local'].includes(mode)) throw new Error('Use audit, run (five OpenAI investigations), or run-local (five Ollama investigations).')
const knowledgeBaseId = process.env.TRAMA_DEMO_KB_ID ?? 'kbkpWkNaMVN6'
const organizationToken = process.env.SANITY_ORGANIZATION_TOKEN
const openAiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_API_KEY
const adapters = createDemoAdapters({
  mcpEndpoint:process.env.TRAMA_BENCHMARK_PILOT_GROQ_MCP_URL ?? 'https://api.sanity.io/v1/context/organizations/o6xohyg5w/mcp/trama-evidence-pilot-groq',
  organizationToken,openAiKey,
})
const kb = createKnowledgeBaseReader({mcpEndpoint:process.env.SANITY_CONTEXT_EVIDENCE_MCP_URL,organizationToken,knowledgeBaseId})
const provider = mode === 'run-local' ? 'ollama' : 'openai'
const generateJson = provider === 'ollama' ? createLocalKnowledgeBaseGenerator() : adapters.generateJson
const stamp = new Date().toISOString().replace(/[:.]/g,'-')
const outputDir = resolve('artifacts','sanity-context-benchmark',`kb-navigation-${stamp}`)
await mkdir(outputDir,{recursive:true})
const save = async (name,value) => writeFile(resolve(outputDir,name),JSON.stringify(value,null,2))
console.log(JSON.stringify({event:'started',mode,provider,knowledgeBaseId,outputDir}))
const initialContext = await kb.initialContext()
const entries = parseKnowledgeBaseOutline(initialContext)
if (!entries.length || entries.some(entry => entry.knowledgeBase !== knowledgeBaseId)) throw new Error('The requested KB did not serve its authorized outline.')
const documents = await adapters.groqRows(`*[_type == "evidenceSource" && workspaceId == ${JSON.stringify(demoScope.workspaceId)} && scopeId == ${JSON.stringify(demoScope.scopeId)}][0...146]{_id,_rev,workspaceId,scopeId,sourceId,title,contentHash}`)
if (documents.length !== 145 || new Set(documents.map(document => document._id)).size !== 145) throw new Error(`Expected 145 distinct originals; received ${documents.length}.`)
for (const document of documents) {
  if (document._id !== evidenceDocumentId({...demoScope,sourceId:document.sourceId}) ||
      document.workspaceId !== demoScope.workspaceId || document.scopeId !== demoScope.scopeId ||
      !/^[a-f0-9]{64}$/.test(document.contentHash) || !document._rev) throw new Error('Invalid original-source registry metadata.')
}
const registry = new Map(documents.map(document => [document._id,document]))
const allEntries = await kb.readKnowledgeBase({knowledgeBase:knowledgeBaseId,paths:entries.map(entry => entry.path)})
const references = sourceIdsFromKnowledgeBaseEntry(allEntries,new Set(registry.keys()))
const audit = {knowledgeBaseId,checkedAt:new Date().toISOString(),scope:demoScope,originalCount:documents.length,
  entries,initialContext,allEntries,registeredSourceIds:references.ids,unknownIds:references.unknownIds,
  referencedSourceNames:references.ids.map(id => registry.get(id).sourceId),sourceRevisions:documents.map(document => ({id:document._id,revision:document._rev,contentHash:document.contentHash}))}
await save('audit.json',audit)
console.log(JSON.stringify({event:'audit-complete',outlineEntries:entries.length,originalCount:documents.length,referencedOriginals:references.ids.length,unknownIds:references.unknownIds.length,auditPath:resolve(outputDir,'audit.json')}))
if (references.unknownIds.length || !references.ids.length) throw new Error('KB source identity audit failed; no model calls will be made.')
if (mode !== 'audit') {
  // Acceptance hints stay in this runner. They are never supplied to the agent.
  const cases = [
    {id:'timeline',question:'What happened to checkout payments between 10:00 and 10:15 UTC on September 18, 2026?',requiredSources:['00-scenario.md']},
    {id:'change',question:'What changed in checkout shortly before the September 18 payment failures began?',requiredSources:['01-deployment-record.md']},
    {id:'open',question:'Which explanation of the September checkout failures is best supported, and what evidence could challenge it?',requiredSources:['01-deployment-record.md','02-provider-latency-log.md','03-postal-code-sample.md','04-fraud-score-report.md']},
    {id:'synthesis',question:'Compare the release timeout change, Provider A latency, and the postal/fraud counterevidence. What mechanism is best supported, what remains unproven, and which original records support each part?',requiredSources:['01-deployment-record.md','02-provider-latency-log.md','03-postal-code-sample.md','04-fraud-score-report.md']},
    {id:'separation',question:'A Provider A maintenance report from July uses the same vendor name. Should it influence this September incident?',requiredSources:[]},
  ]
  // Reject stale acceptance filenames before spending provider quota.
  for (const item of cases) for (const sourceId of item.requiredSources) {
    if (!documents.some(document => document.sourceId === sourceId)) throw new Error(`Acceptance source not in corpus: ${sourceId}`)
  }
  const results = []
  for (const item of cases) {
    console.log(JSON.stringify({event:'question-started',id:item.id,question:item.question}))
    const modelStages = []
    const recordedGenerateJson = async input => {
      const stage = {input,startedAt:new Date().toISOString()}
      modelStages.push(stage)
      await save(`${item.id}-model-stages.json`,modelStages)
      try {
        stage.output = await generateJson(input)
        stage.finishedAt = new Date().toISOString()
        await save(`${item.id}-model-stages.json`,modelStages)
        return stage.output
      } catch (error) {
        stage.error = error.message
        await save(`${item.id}-model-stages.json`,modelStages)
        throw error
      }
    }
    try {
      const result = await investigateKnowledgeBaseQuestion(item.question,{...adapters,...kb,generateJson:recordedGenerateJson,entries,registry})
      const sources = result.sources.map(source => source.sourceId)
      const check = {expectedSources:item.requiredSources,missingExpectedSources:item.requiredSources.filter(source => !sources.includes(source)),
        contractAndIntegrity:'pass',semanticAnswerReview:'pending-manual-review'}
      results.push({id:item.id,result,check})
      await save(`${item.id}.json`,results.at(-1))
      console.log(JSON.stringify({event:'question-completed',id:item.id,selectedEntries:result.trace.selectedEntryKeys,
        candidateCount:result.trace.candidateIds.length,sources,citedSources:result.answer.sourceIds,answer:result.answer,
        missingExpectedSources:check.missingExpectedSources,missingOriginals:result.trace.missingIds.length,unknownIds:result.trace.unknownIds.length,
        omittedOriginals:result.trace.omittedIds.length,overLimitOriginals:result.trace.overLimitIds.length,modelCalls:result.trace.modelCalls,totalLatencyMs:result.trace.totalLatencyMs}))
    } catch (error) {
      results.push({id:item.id,error:error.message})
      await save(`${item.id}.json`,results.at(-1))
      console.log(JSON.stringify({event:'question-failed',id:item.id,error:error.message}))
      if (/no credits|insufficient.quota|billing|unauthorized|invalid.*key/i.test(error.message)) {
        await save('final.json',{knowledgeBaseId,mode,provider,status:'blocked-provider',completed:results.length,expected:cases.length,results})
        process.exitCode = 1
        console.log(JSON.stringify({event:'provider-blocked',artifactPath:resolve(outputDir,'final.json')}))
        break
      }
    }
    await save('checkpoint.json',{knowledgeBaseId,mode,completed:results.length,expected:cases.length,results})
  }
  if (results.length === cases.length) await save('final.json',{knowledgeBaseId,mode,provider,completed:results.length,expected:cases.length,results})
  console.log(JSON.stringify({event:'finished',artifactPath:resolve(outputDir,'final.json'),completed:results.length,executionErrors:results.filter(item => item.error).length}))
  if (results.some(item => item.error)) process.exitCode = 1
}
