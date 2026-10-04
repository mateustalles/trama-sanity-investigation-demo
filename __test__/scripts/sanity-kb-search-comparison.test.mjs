import assert from 'node:assert/strict'
import {test} from 'node:test'
import {benchmarkCases} from '../../scripts/sanity-context-benchmark-cases.mjs'
import {structuredAdditionalCases} from '../../scripts/sanity-context-benchmark-structured.mjs'
import {questionTerms,queryForCase} from '../../scripts/fixtures/sanity-kb-search-queries.mjs'
import {makeEvidenceDocument} from '../../scripts/sanity-content-lake-evidence.mjs'
import {comparisonArms,comparisonJobs,comparisonMessages,createLocalKeywordSearch,summarizeComparison} from '../../scripts/sanity-kb-search-comparison.mjs'
import {createKnowledgeBaseReader} from '../../scripts/sanity-kb-demo-agent.mjs'
import {qwenContentTokens} from '../../scripts/run-kb-search-model-comparison.mjs'

test('the fixed matrix contains exactly 40 questions, two independent arms and two models',()=>{
  const cases=[...benchmarkCases,...structuredAdditionalCases]
  const jobs=comparisonJobs(cases)
  assert.equal(jobs.length,160)
  assert.equal(new Set(jobs.map(j=>`${j.id}/${j.arm}/${j.model}`)).size,160)
  assert.deepEqual([...new Set(jobs.map(j=>j.arm))],comparisonArms)
  assert.equal(Object.keys(questionTerms).length,40)
  assert.ok(cases.every(c=>queryForCase(c.id).length>10))
  assert.throws(()=>comparisonJobs(cases.slice(1)),/40-case/)
  assert.throws(()=>queryForCase('invented'),/predeclared/)
})

test('keyword retrieval runs entirely locally and rejects tampered originals',()=>{
  const rows=[makeEvidenceDocument({workspaceId:'w',scopeId:'s',sourceId:'a',title:'Vehicle',body:'A battery failed.'}),
    makeEvidenceDocument({workspaceId:'w',scopeId:'s',sourceId:'b',title:'Court',body:'A hearing was scheduled.'})]
  const search=createLocalKeywordSearch(rows,{limit:5})
  assert.deepEqual(search('battery').hits.map(h=>h.sourceId),['a'])
  assert.equal(search('battery').networkCalls,0)
  assert.equal(search('missing-word-xyz').hits.length,0)
  assert.match(search('battery').text,/A battery failed\./)
  assert.throws(()=>createLocalKeywordSearch([{...rows[0],body:'tampered'}]),/Invalid local corpus/)
  assert.throws(()=>createLocalKeywordSearch([rows[0],rows[0]]),/Invalid local corpus/)
})

test('native entries response is returned intact without read-path or keyword fallback',async()=>{
  const requests=[],fullText='FIRST ENTRY\n'+'preserved text '.repeat(2000)+'\nLAST ENTRY'
  const raw={jsonrpc:'2.0',id:1,result:{content:[{type:'text',text:fullText}],structuredContent:{total:2}}}
  const reader=createKnowledgeBaseReader({mcpEndpoint:'https://sanity.test/mcp',knowledgeBaseId:'kbExample123',organizationToken:'test-only',fetchImpl:async (_url,options)=>{
    requests.push(JSON.parse(options.body));return {ok:true,status:200,json:async()=>raw}
  }})
  const result=await reader.searchKnowledgeBase({knowledgeBase:'kbExample123',query:'open question terms',return:'entries',limit:5})
  assert.equal(result.text,fullText)
  assert.deepEqual(result.raw,raw)
  assert.deepEqual(requests.map(r=>r.params.name),['knowledge_base_search'])
  assert.equal(requests[0].params.arguments.return,'entries')
  const c=benchmarkCases.find(c=>c.id==='I01')
  const messages=comparisonMessages(c,{arm:'sanity-kb-search',text:result.text})
  assert.ok(messages[1].content.includes(fullText))
  assert.doesNotMatch(messages[1].content,/expectedDecision|correctDecision/)
})

test('invalid search scope/limits and native tool failures do not trigger alternative calls',async()=>{
  let calls=0
  const reader=createKnowledgeBaseReader({mcpEndpoint:'https://sanity.test/mcp',knowledgeBaseId:'kbExample123',organizationToken:'test-only',fetchImpl:async()=>{
    calls++;return {ok:true,status:200,json:async()=>({result:{isError:true,content:[{type:'text',text:'failed'}]}})}
  }})
  for(const args of [{knowledgeBase:'kbOther',query:'x'},{knowledgeBase:'kbExample123',query:''},{knowledgeBase:'kbExample123',query:'x',limit:21}]) {
    await assert.rejects(reader.searchKnowledgeBase(args),/unauthorized/)
  }
  assert.equal(calls,0)
  await assert.rejects(reader.searchKnowledgeBase({knowledgeBase:'kbExample123',query:'x'}),/read failed/)
  assert.equal(calls,1)
})

test('current State is shared explicitly and cannot be substituted by KB prose',()=>{
  const c=benchmarkCases.find(c=>c.id==='S01')
  assert.throws(()=>comparisonMessages(c,{arm:'keyword-local',text:'no state'}),/State is required/)
  const state={case:{status:'open',stateRevision:3}}
  for(const arm of comparisonArms)assert.match(comparisonMessages(c,{arm,text:'full material'},state)[1].content,/CURRENT STRUCTURED STATE:\n\{"case"/)
})

test('execution failures never count as a model PASS even if a score is present',()=>{
  const results=[{id:'R01',arm:'sanity-kb-search',model:'gpt-6-sol',error:'overflow',score:{strictPass:true,formatPass:true}}]
  assert.equal(summarizeComparison(results).find(r=>r.arm==='sanity-kb-search'&&r.provider==='openai').pass,0)
})

test('local context preflight counts every message without shortening it',()=>{
  const messages=[{content:'long packet'},{content:'question'}],seen=[]
  const tokenizer={encode:text=>{seen.push(text);return {ids:Array(text.length).fill(1)}}}
  assert.equal(qwenContentTokens(tokenizer,messages),19)
  assert.deepEqual(seen,['long packet','question'])
})
