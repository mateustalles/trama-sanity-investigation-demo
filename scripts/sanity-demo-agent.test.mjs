import assert from 'node:assert/strict'
import {describe,it} from 'node:test'
import {makeEvidenceDocument} from './sanity-content-lake-evidence.mjs'
import {createDemoAdapters,demoScope,investigateDemoQuestion,parseGroqResult,validateDemoQuestion,verifyDemoOriginals} from './sanity-demo-agent.mjs'

const question = 'Compare release timeout, Provider A latency, postal evidence and fraud evidence.'
const inputs = [
  ['release.md','# Release\nThe checkout timeout changed from 10 to 4 seconds.'],
  ['latency.md','# Latency\nProvider A latency rose during the payment window.'],
  ['postal.md','# Postal\nThirty-one payments succeeded without editing postal code.'],
  ['fraud.md','# Fraud\nNo fraud rule was published during the incident.'],
]
const docs = inputs.map(([sourceId,body]) => ({...makeEvidenceDocument({...demoScope,sourceId,title:sourceId,body}),_rev:`revision-${sourceId}`}))
const candidate = document => ({_id:document._id,sourceId:document.sourceId,title:document.title,_embeddings:[]})

function fakeAdapters({tamper=false,badCitation=false} = {}) {
  const queries = []
  const prompts = []
  const adapters = {
    groqRows:async query => {
      queries.push(query)
      if (query.includes('_id in')) return tamper ? [{...docs[0],body:'Changed without updating hash'},...docs.slice(1)] : docs
      if (query.includes('text::query')) return [candidate(docs[0]),candidate(docs[2])]
      if (query.includes('semanticSimilarity("release timeout")')) return [candidate(docs[0])]
      if (query.includes('semanticSimilarity("Provider A latency")')) return [candidate(docs[1])]
      if (query.includes('semanticSimilarity("postal evidence")')) return [candidate(docs[2])]
      if (query.includes('semanticSimilarity("fraud evidence")')) return [candidate(docs[3])]
      return [candidate(docs[0])]
    },
    generateJson:async ({stage,system}) => { prompts.push({stage,system}); return {model:'test-model',usage:{inputTokens:10,outputTokens:10},latencyMs:1,text:JSON.stringify(
      stage==='plan' ? {task:'compare',facets:['release timeout','Provider A latency','postal evidence','fraud evidence']} :
      stage==='select' ? {selectedCodes:['F1C1','F2C1','F3C1','F4C1']} :
      {answer:'The timeout and latency interaction is plausible; postal and fraud causes remain unconfirmed.',conclusion:'Plausible, not proven.',limitations:'Transaction-level attribution is missing.',sourceIds:badCitation?['invented.md']:docs.map(item=>item.sourceId)}
    )} },
  }
  return {adapters,queries,prompts}
}

describe('live Sanity pilot demo agent',() => {
  it('validates the input and Context GROQ envelope',() => {
    assert.equal(validateDemoQuestion(`  ${question}  `),question)
    assert.throws(() => validateDemoQuestion('too short'))
    assert.deepEqual(parseGroqResult(JSON.stringify({result:[{_id:'a'}],meta:{returnedCount:1}})),[{_id:'a'}])
    assert.throws(() => parseGroqResult('{"result":[]} trailing'))
    assert.throws(() => parseGroqResult(JSON.stringify({result:[],meta:{returnedCount:1}})))
  })

  it('checks stable identity, scope, body hash, and revision before using originals',() => {
    assert.deepEqual(verifyDemoOriginals([docs[0]._id],[docs[0]]).missingIds,[])
    assert.throws(() => verifyDemoOriginals([docs[0]._id],[{...docs[0],body:'changed'}]),/failed/)
    assert.throws(() => verifyDemoOriginals([docs[0]._id],[{...docs[0],scopeId:'another'}]),/failed/)
    assert.throws(() => verifyDemoOriginals([docs[0]._id],[{...docs[0],_rev:''}]),/failed/)
    assert.throws(() => verifyDemoOriginals([docs[0]._id,docs[0]._id],[]),/invalid/)
  })

  it('runs scoped semantic facets, a keyword comparison, exact reads, and a cited answer',async () => {
    const {adapters,queries,prompts} = fakeAdapters()
    const result = await investigateDemoQuestion(question,adapters)
    assert.equal(result.trace.strategy,'multi-facet-with-baseline-fill')
    assert.equal(result.trace.facets.length,4)
    assert.equal(result.sources.length,4)
    assert.equal(result.trace.keywordCandidates.length,2)
    assert.equal(result.trace.calls.length,7)
    assert.equal(result.answer.sourceIds.length,4)
    assert.ok(result.sources.every(source => source.claimedByAnswer))
    assert.ok(queries.every(query => query.includes('workspaceId == "synthetic-benchmark"') && query.includes('scopeId == "payment-incident-2026-09-18"')))
    assert.ok(queries.some(query => query.includes('_id in')))
    assert.match(prompts.find(prompt => prompt.stage === 'answer').system,/Answer the exact question in English/)
  })

  it('uses an English, evidence-limited fallback when no original is available',async () => {
    const result = await investigateDemoQuestion('What happened during the September checkout incident?',{
      groqRows:async () => [],
      generateJson:async () => ({model:'test-model',usage:null,latencyMs:1,text:JSON.stringify({task:'locate',facets:['September checkout incident']})}),
    })
    assert.equal(result.answer.conclusion,'Insufficient evidence')
    assert.match(result.answer.answer,/could not find a verifiable original/)
    assert.deepEqual(result.sources,[])
  })

  it('fails closed on tampered originals and invented answer citations',async () => {
    await assert.rejects(() => investigateDemoQuestion(question,fakeAdapters({tamper:true}).adapters),/failed/)
    await assert.rejects(() => investigateDemoQuestion(question,fakeAdapters({badCitation:true}).adapters),/was not read/)
  })

  it('keeps credentials server-side in both API adapters',async () => {
    const calls = []
    const fetchImpl = async (url,options) => {
      calls.push({url,options})
      if (url.includes('sanity')) return {ok:true,json:async () => ({result:{content:[{type:'text',text:JSON.stringify({result:[]})}]}})}
      return {ok:true,json:async () => ({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"ok":true}'}]}],usage:{input_tokens:2,output_tokens:3}})}
    }
    const adapters = createDemoAdapters({mcpEndpoint:'https://api.sanity.test/mcp',organizationToken:'sanity-secret',openAiKey:'openai-secret',fetchImpl})
    assert.deepEqual(await adapters.groqRows('*[]'),[])
    assert.equal((await adapters.generateJson({stage:'test',system:'Return JSON',user:'Hello',maxOutputTokens:20})).text,'{"ok":true}')
    assert.equal(calls[0].options.headers.Authorization,'Bearer sanity-secret')
    assert.equal(calls[1].options.headers.Authorization,'Bearer openai-secret')
    assert.equal(JSON.parse(calls[0].options.body).params.name,'groq_query')
    assert.equal(JSON.parse(calls[1].options.body).store,false)
    assert.equal(JSON.parse(calls[1].options.body).text.format.type,'json_object')
  })
})
