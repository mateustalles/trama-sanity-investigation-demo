import assert from 'node:assert/strict'
import {test} from 'node:test'
import {makeEvidenceDocument} from '../../scripts/sanity-content-lake-evidence.mjs'
import {demoScope} from '../../scripts/sanity-demo-agent.mjs'
import {createKnowledgeBaseReader,createLocalKnowledgeBaseGenerator,investigateKnowledgeBaseQuestion} from '../../scripts/sanity-kb-demo-agent.mjs'

const question = 'Which explanation is supported and what remains uncertain?'
const original = {...makeEvidenceDocument({...demoScope,sourceId:'observation.md',title:'Observation',body:'A measurement alone does not establish causation.'}),_rev:'r1'}
const entry = {knowledgeBase:'kbExample123',path:'observations/core',description:'Measurement and uncertainty',centrality:'core'}
function fixture({selection={codes:['K1'],reason:'Read the relevant observation.'},tamper=false,missing=false,badCitation=false} = {}) {
  const prompts = [],queries = []
  return {prompts,queries,adapters:{
    entries:[entry],registry:new Map([[original._id,original]]),
    readKnowledgeBase:async () => `Generated interpretation SECRET_KB_PROSE.\n## Sources\n1. ${original._id} — Sanity document`,
    groqRows:async query => { queries.push(query); return missing ? [] : [{...original,...(tamper ? {body:'tampered'} : {})}] },
    generateJson:async input => {
      prompts.push(input)
      return {model:'fixed-test-model',usage:{inputTokens:1,outputTokens:1},latencyMs:1,text:JSON.stringify(input.stage === 'kb-select' ? selection :
        {answer:'The measurement is insufficient to establish causation.',conclusion:'Uncertain',limitations:'More evidence is needed.',sourceIds:[badCitation ? 'invented.md' : original.sourceId]})}
    },
  }}
}

test('KB navigation uses allowlisted entries and exact originals, not semantic ranking or KB prose',async () => {
  const {adapters,prompts,queries} = fixture()
  const result = await investigateKnowledgeBaseQuestion(question,adapters)
  assert.equal(result.trace.strategy,'knowledge-base-to-originals')
  assert.deepEqual(result.trace.selectedEntryKeys,['kbExample123:observations/core'])
  assert.equal(result.sources[0].contentHash,original.contentHash)
  assert.ok(queries.every(query => query.includes('_id in') && query.includes(demoScope.scopeId) && !query.includes('semanticSimilarity')))
  assert.doesNotMatch(prompts.find(input => input.stage === 'answer').user,/SECRET_KB_PROSE/)
  assert.doesNotMatch(prompts.find(input => input.stage === 'kb-select').user,/A measurement alone/)
  assert.match(result.trace.knowledgeBaseResponses[0].text,/SECRET_KB_PROSE/)
})

test('invented, duplicate and over-limit KB selections fail before original reads',async () => {
  for (const codes of [['K99'],['K1','K1'],Array(6).fill('K1'),[]]) {
    const {adapters,queries} = fixture({selection:{codes,reason:'x'}})
    await assert.rejects(investigateKnowledgeBaseQuestion(question,adapters),/out-of-outline/)
    assert.equal(queries.length,0)
  }
})

test('tampered bodies and invented answer citations fail closed',async () => {
  await assert.rejects(investigateKnowledgeBaseQuestion(question,fixture({tamper:true}).adapters),/hash mismatch/)
  await assert.rejects(investigateKnowledgeBaseQuestion(question,fixture({badCitation:true}).adapters),/citation check/)
})

test('a missing original produces a gap without asking the model to fabricate an answer',async () => {
  const {adapters,prompts} = fixture({missing:true})
  const result = await investigateKnowledgeBaseQuestion(question,adapters)
  assert.equal(result.answer.conclusion,'Insufficient evidence')
  assert.deepEqual(result.trace.missingIds,[original._id])
  assert.deepEqual(prompts.map(input => input.stage),['kb-select'])
})

test('cross-scope registries and mixed-KB outlines are rejected before model calls',async () => {
  const {adapters,prompts} = fixture()
  await assert.rejects(investigateKnowledgeBaseQuestion(question,{...adapters,registry:new Map([[original._id,{...original,scopeId:'other'}]])}),/unauthorized scope/)
  await assert.rejects(investigateKnowledgeBaseQuestion(question,{...adapters,entries:[entry,{...entry,knowledgeBase:'kbOther'}]}),/unambiguous/)
  assert.equal(prompts.length,0)
})

test('KB adapter fixes its mode and ID and rejects MCP tool errors',async () => {
  const calls = []
  const reader = createKnowledgeBaseReader({mcpEndpoint:'https://sanity.test/mcp',knowledgeBaseId:'kbExample123',organizationToken:'fake-secret',fetchImpl:async (url,options) => {
    calls.push({url:String(url),options})
    return {ok:true,status:200,json:async () => ({result:{content:[{type:'text',text:'outline'}]}})}
  }})
  assert.equal(await reader.initialContext(),'outline')
  assert.match(calls[0].url,/mode=knowledge_base/)
  assert.match(calls[0].url,/knowledgeBases=kbExample123/)
  assert.equal(calls[0].options.headers.Authorization,'Bearer fake-secret')
  assert.throws(() => reader.readKnowledgeBase({knowledgeBase:'kbOther',paths:['x']}),/unauthorized/)
  const failing = createKnowledgeBaseReader({mcpEndpoint:'https://sanity.test/mcp',knowledgeBaseId:'kbExample123',organizationToken:'fake-secret',fetchImpl:async () => ({ok:true,status:200,json:async () => ({result:{isError:true,content:[{type:'text',text:'error'}]}})})})
  await assert.rejects(failing.initialContext(),/read failed/)
})

test('local diagnostic generator bounds memory/output and rejects truncated JSON',async () => {
  const calls = []
  const generate = createLocalKnowledgeBaseGenerator({fetchImpl:async (url,options) => {
    calls.push({url,body:JSON.parse(options.body)})
    return {ok:true,json:async () => ({done:true,message:{content:'{"codes":["K1"]}'},prompt_eval_count:5,eval_count:3})}
  }})
  assert.equal((await generate({stage:'kb-select',system:'s',user:'u',maxOutputTokens:900})).usage.inputTokens,5)
  assert.equal(calls[0].body.options.num_ctx,4096)
  assert.equal(calls[0].body.options.num_gpu,20)
  assert.equal(calls[0].body.think,false)
  assert.equal(calls[0].body.format,'json')
  const truncated = createLocalKnowledgeBaseGenerator({fetchImpl:async () => ({ok:true,json:async () => ({done:true,done_reason:'length',message:{content:'{}'}})})})
  await assert.rejects(truncated({stage:'answer',system:'s',user:'u',maxOutputTokens:2200}),/truncated/)
})
