import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {advancedQuestions,searchQueryForDemoQuestion,suggestedQuestions} from '../../scripts/sanity-demo-prompts.mjs'
import {createNativeKnowledgeBaseDemoAdapters,demoKnowledgeBaseId,investigateNativeKnowledgeBaseQuestion,validateNativeDemoQuestion} from '../../scripts/sanity-kb-native-demo.mjs'

const question = suggestedQuestions[0].question
const fullText = `ENTRY 1\n${'Original MCP text stays intact. '.repeat(2000)}\nLAST ENTRY`

function fixture({answer={answer:'The KB suggests a short failure window.',conclusion:'Qualified finding',
  limitations:'The generated entry was not checked against originals.',entryRefs:['ENTRY 1']},
  searchText=fullText,searchError=null}={}) {
  const calls=[]
  const adapters={
    searchKnowledgeBase:async args => {
      calls.push({stage:'search',args})
      if (searchError) throw searchError
      return {arguments:args,raw:{result:{content:[{type:'text',text:searchText}]}},text:searchText}
    },
    generateJson:async input => {
      calls.push({stage:'answer',input})
      return {model:'gpt-6-sol',text:JSON.stringify(answer),usage:{inputTokens:123,outputTokens:45},latencyMs:25}
    },
  }
  return {calls,adapters}
}

test('curated prompts use prewritten queries and every free-form question goes verbatim',()=>{
  const prompts=[...suggestedQuestions,...advancedQuestions]
  assert.equal(prompts.length,6)
  assert.equal(new Set(prompts.map(item=>item.question)).size,6)
  for(const item of prompts) assert.deepEqual(searchQueryForDemoQuestion(item.question),{query:item.query,mode:'curated-keywords'})
  assert.doesNotMatch(suggestedQuestions[1].query,/09:58|timeout/)
  const free='What else happened to the checkout?'
  assert.deepEqual(searchQueryForDemoQuestion(free),{query:free,mode:'verbatim-question'})
  assert.equal(validateNativeDemoQuestion(`  ${free}  `),free)
  assert.throws(()=>validateNativeDemoQuestion('too short'),/12 and 600/)
})

test('native demo sends one fixed KB search and the complete unmodified text to the answer model',async()=>{
  const {calls,adapters}=fixture()
  const result=await investigateNativeKnowledgeBaseQuestion(question,adapters)
  assert.equal(calls.length,2)
  assert.deepEqual(calls[0],{stage:'search',args:{knowledgeBase:demoKnowledgeBaseId,
    query:suggestedQuestions[0].query,return:'entries',limit:5}})
  assert.equal(calls[1].input.stage,'kb-native-answer')
  assert.ok(calls[1].input.user.includes(fullText))
  assert.ok(calls[1].input.user.includes(`KNOWLEDGE BASE SEARCH RESPONSE (FULL, UNMODIFIED):\n${fullText}\n\nQUESTION:`))
  assert.match(calls[1].input.system,/generated interpretations, not independently verified original documents/)
  assert.equal(result.search.text,fullText)
  assert.deepEqual(result.search.raw,{result:{content:[{type:'text',text:fullText}]}})
  assert.deepEqual(result.answer.entryRefs,['ENTRY 1'])
  assert.deepEqual(result.trace.modelUsage,{inputTokens:123,outputTokens:45})
})

test('free-form question is not rewritten; empty or failed KB search cannot trigger an answer or fallback',async()=>{
  const free='What does the archive say about retries?'
  const {calls,adapters}=fixture()
  const result=await investigateNativeKnowledgeBaseQuestion(free,adapters)
  assert.equal(calls[0].args.query,free)
  assert.equal(result.trace.queryMode,'verbatim-question')
  for(const options of [{searchText:'   '},{searchError:new Error('MCP failed')}]) {
    const bad=fixture(options)
    await assert.rejects(investigateNativeKnowledgeBaseQuestion(question,bad.adapters))
    assert.deepEqual(bad.calls.map(item=>item.stage),['search'])
  }
})

test('answer contract requires qualified text but not original citations',async()=>{
  const noRefs=fixture({answer:{answer:'Some context.',conclusion:'Uncertain',limitations:'Needs original audit.'}})
  assert.deepEqual((await investigateNativeKnowledgeBaseQuestion(question,noRefs.adapters)).answer.entryRefs,[])
  for(const answer of [
    {answer:'',conclusion:'x',limitations:'y'},
    {answer:'x',conclusion:'y',limitations:''},
    {answer:'x',conclusion:'y',limitations:'z',entryRefs:['invented-path']},
    {answer:'x',conclusion:'y',limitations:'z',entryRefs:['ENTRY 1','ENTRY 1']},
  ]) {
    await assert.rejects(investigateNativeKnowledgeBaseQuestion(question,fixture({answer}).adapters),/presentation contract/)
  }
})

test('server adapters bind the KB and keep API keys outside the model request body',async()=>{
  const requests=[]
  const adapters=createNativeKnowledgeBaseDemoAdapters({mcpEndpoint:'https://sanity.test/mcp',organizationToken:'sanity-secret',
    openAiKey:'openai-secret',fetchImpl:async (url,options)=>{
      requests.push({url:String(url),options,body:JSON.parse(options.body)})
      if(String(url).startsWith('https://sanity.test/')) return {ok:true,status:200,json:async()=>({result:{content:[{type:'text',text:'ENTRY 1'}]}})}
      return {ok:true,status:200,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({answer:'x',conclusion:'y',limitations:'z'})}]}],usage:{input_tokens:10,output_tokens:4}})}
    }})
  await investigateNativeKnowledgeBaseQuestion(question,adapters)
  assert.equal(requests.length,2)
  assert.match(requests[0].url,/mode=knowledge_base/)
  assert.match(requests[0].url,/knowledgeBases=kbkpWkNaMVN6/)
  assert.equal(requests[0].body.params.name,'knowledge_base_search')
  assert.equal(requests[0].options.headers.Authorization,'Bearer sanity-secret')
  assert.equal(requests[1].options.headers.Authorization,'Bearer openai-secret')
  assert.equal(requests[1].body.store,false)
  assert.doesNotMatch(JSON.stringify(requests[1].body),/sanity-secret|openai-secret/)
})

test('public presentation labels KB prose as generated, not verified originals',()=>{
  const ui=readFileSync(new URL('../../apps/web/app/poc/sanity/investigate/investigation-demo.tsx',import.meta.url),'utf8')
  const route=readFileSync(new URL('../../apps/web/app/api/poc/sanity/investigate/route.ts',import.meta.url),'utf8')
  assert.match(ui,/Complete Knowledge Base response/)
  assert.match(ui,/does not reread or verify original documents/)
  assert.match(ui,/result\.search\.text/)
  assert.doesNotMatch(ui,/result\.sources|Original records the agent read/)
  assert.match(route,/investigateNativeKnowledgeBaseQuestion/)
  assert.doesNotMatch(route,/investigateDemoQuestion|createDemoAdapters/)
})
