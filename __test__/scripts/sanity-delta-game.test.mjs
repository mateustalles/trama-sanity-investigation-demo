import {test} from 'node:test'
import assert from 'node:assert/strict'
import {nativeContextClues,verifyClueReceipt,validateGameSelection,retrieveGameClues,reviewGameSelection,reviewFormat} from '../../scripts/sanity-delta-game.mjs'
import {gameQuestions} from '../../scripts/sanity-game-options.mjs'
import {demoKnowledgeBaseId} from '../../scripts/sanity-kb-native-demo.mjs'
const now=1791162000000,key='offline-test-key',text='# First clue\nWhole first body\n\n\n---\n\n# Second clue\nWhole second body'
const clues=()=>nativeContextClues(text,{query:'fixture query',receiptKey:key,now})
const starter=[{id:'source-1',title:'Frozen record',text:'Authentic body',provenance:'Fixture',kind:'frozen-source'}]
test('cards preserve every character and distinguish generated sections from originals',()=>{
 const cards=clues();assert.equal(cards.length,2);assert.equal(cards.map(item=>item.text).join(''),text)
 assert.equal(cards[1].title,'Second clue');assert.match(cards[0].provenance,/not a verified original/)
 assert.equal(clues()[0].id,cards[0].id);assert.equal(verifyClueReceipt(cards[0],key,now),true)
})
test('receipt rejects changed bodies, titles, provenance, key, expiry and future issuance',()=>{
 const clue=clues()[0]
 for(const field of ['id','text','title','provenance','kind'])assert.equal(verifyClueReceipt({...clue,[field]:'forged'},key,now),false)
 assert.equal(verifyClueReceipt(clue,'wrong',now),false)
 assert.equal(verifyClueReceipt(clue,key,now+8*3600000+1),false)
 assert.equal(verifyClueReceipt(clue,key,now-6000),false)
})
test('frozen inputs resolve server-owned bodies; generated inputs require valid receipts',()=>{
 const selection=validateGameSelection({hypothesisId:'timeout-latency',evidence:[{id:'source-1',text:'Forged'}]},starter,key,now)
 assert.equal(selection.evidence[0].text,'Authentic body')
 assert.equal(validateGameSelection({hypothesisId:'timeout-latency',evidence:clues()},starter,key,now).evidence.length,2)
 for(const evidence of [[],[clues()[0],clues()[0]],[{...clues()[0],receipt:undefined}]])assert.throws(()=>validateGameSelection({hypothesisId:'timeout-latency',evidence},starter,key,now))
 assert.throws(()=>validateGameSelection({hypothesisId:'invented',evidence:starter},starter,key,now))
 assert.throws(()=>validateGameSelection({hypothesisId:'timeout-latency',evidence:Array.from({length:11},(_,i)=>({id:String(i)}))},starter,key,now))
})
test('oversize context fails explicitly rather than shortening it',()=>{
 assert.throws(()=>nativeContextClues('x'.repeat(100001),{query:'fixture',receiptKey:key,now}),/not truncated/)
 const big=nativeContextClues('# A\n'+'x'.repeat(61000)+'\n\n---\n\n# B\n'+'y'.repeat(61000),{query:'fixture',receiptKey:key,now})
 assert.throws(()=>validateGameSelection({hypothesisId:'timeout-latency',evidence:big},starter,key,now),/nothing will be clipped/)
})
test('predefined question makes one native search and zero answer model calls',async()=>{
 let calls=0
 const result=await retrieveGameClues('timeline',{searchKnowledgeBase:async arguments_=>{
  calls++;assert.deepEqual(arguments_,{knowledgeBase:demoKnowledgeBaseId,query:gameQuestions.find(item=>item.id==='timeline').query,return:'entries',limit:5})
  return {arguments:arguments_,text}
 }},{receiptKey:key,now})
 assert.equal(calls,1);assert.equal(result.modelCalls,0);assert.equal(result.search.text,text)
 await assert.rejects(()=>retrieveGameClues('arbitrary',{searchKnowledgeBase:()=>{throw Error('should not run')}},{receiptKey:key,now}),/predefined/)
})
test('native search failure propagates without keyword or model fallback',async()=>{
 await assert.rejects(()=>retrieveGameClues('timeline',{searchKnowledgeBase:async()=>{throw Error('offline')}},{receiptKey:key,now}),error=>error.stage==='search'&&error.cause.message==='offline')
})
const proposal={verdict:'partial',rationale:'Selected record suggests a contribution, not proof.',limitations:'Timing alone is insufficient.',nextCheck:'Compare provider observations.',evidenceIds:['source-1']}
test('review uses strict schema and only selected records; never accepts a Delta',async()=>{
 const selection=validateGameSelection({hypothesisId:'timeout-latency',evidence:starter},starter,key,now)
 const result=await reviewGameSelection(selection,{generateJson:async input=>{
  assert.deepEqual(input.format,reviewFormat);assert.equal(input.format.strict,true)
  const parsed=JSON.parse(input.user);assert.deepEqual(parsed.selectedClues,starter)
  assert.match(input.system,/ONLY the selected clues/);assert.match(input.system,/never accepts/)
  return {text:JSON.stringify(proposal),model:'offline-model',usage:null,latencyMs:5}
 }})
 assert.deepEqual(result.review,proposal);assert.equal(selection.evidence.length,1);assert.equal(result.delta,undefined)
})
test('review rejects invented references, invalid enums, extra fields and empty support',async()=>{
 const selection=validateGameSelection({hypothesisId:'timeout-latency',evidence:starter},starter,key,now)
 for(const invalid of [{...proposal,evidenceIds:['unselected']},{...proposal,evidenceIds:[]},{...proposal,verdict:'victory'},{...proposal,hiddenAnswer:1}]){
  await assert.rejects(()=>reviewGameSelection(selection,{generateJson:async()=>({text:JSON.stringify(invalid)})}),/contract/)
 }
})
