import test from 'node:test'
import assert from 'node:assert/strict'
import {parseFacetQueries, parseRetrievalPlan, fuseFacetCandidates, routeRetrievalSources, parseSelectorCodes, parseCoveragePlan} from '../../scripts/sanity-facet-retrieval.mjs'

test('accepts bounded independent queries, not a comma-joined single query', () => {
  assert.deepEqual(parseFacetQueries('{"queries":["release timeout", "postal validation", "fraud rule"]}'), ['release timeout', 'postal validation', 'fraud rule'])
  assert.throws(() => parseFacetQueries('{"queries":["release timeout, postal validation, fraud rule"]}'), /invalid query/)
  assert.deepEqual(parseFacetQueries('{"queries":["fraud rule", "Fraud Rule"]}'), ['fraud rule'])
  assert.throws(() => parseFacetQueries('{"queries":[]}'), /invalid query/)
  assert.throws(() => parseFacetQueries('{"queries":["postal delivery"]}',{sourceQuestion:'postal/fraud counterevidence'}), /invented terms/)
  assert.deepEqual(parseFacetQueries('{"queries":["postal counterevidence", "fraud counterevidence"]}',{sourceQuestion:'postal/fraud counterevidence'}), ['postal counterevidence','fraud counterevidence'])
})

test('round-robin fusion protects facets and deduplicates sources', () => {
  const lists = [
    [{_id:'a'}, {_id:'shared'}, {_id:'b'}],
    [{_id:'shared'}, {_id:'c'}],
    [{_id:'d'}, {_id:'e'}],
  ]
  assert.deepEqual(fuseFacetCandidates(lists, 5).map(item => [item._id,item.facet,item.facetRank]), [
    ['a',0,1], ['shared',1,1], ['d',2,1], ['c',1,2], ['e',2,2],
  ])
})

test('retrieval plan separates searchable aspects from answer instructions', () => {
  const question = 'Compare engine heat and coolant/thermostat counterevidence. What mechanism is best supported?'
  assert.deepEqual(parseRetrievalPlan('{"task":"compare","facets":["engine heat","coolant counterevidence","thermostat counterevidence"]}',{question}).facets,['engine heat','coolant counterevidence','thermostat counterevidence'])
  assert.deepEqual(parseRetrievalPlan('{"facets":["engine heat","coolant/thermostat counterevidence","What mechanism is best supported"]}',{question}).facets,['engine heat','coolant counterevidence','thermostat counterevidence'])
  assert.throws(() => parseRetrievalPlan('{"facets":["engine heat","coolant counterevidence","thermostat evidence in 2024"]}',{question}),/invented terms/)
})

test('routes narrow questions to whole-question search and diversifies multi-aspect questions within a fixed budget', () => {
  const baseline = ['a','b','c','d']
  assert.deepEqual(routeRetrievalSources({baseline,facetAnchors:['y'],facetSelected:['x'],facetCount:2,limit:4}),{strategy:'whole-question',sources:baseline})
  assert.deepEqual(routeRetrievalSources({baseline,facetAnchors:['x','b'],facetSelected:['y','c'],facetCount:3,limit:4}),{strategy:'multi-facet-with-baseline-fill',sources:['x','b','y','c']})
  assert.deepEqual(routeRetrievalSources({baseline,facetAnchors:['x','y','z'],facetSelected:[],facetCount:3,limit:4}),{strategy:'multi-facet-with-baseline-fill',sources:['x','y','z','a']})
  assert.deepEqual(routeRetrievalSources({baseline,facetSelected:[],facetCount:4,limit:4}),{strategy:'whole-question',sources:baseline})
})

test('selector contract keeps valid partial choices and fails closed on malformed codes', () => {
  const allowed = ['F1C1','F1C2','F2C1','F3C1']
  assert.deepEqual(parseSelectorCodes('{"selectedCodes":["F1C2","F3C1"]}',allowed,3).selections,[['F1C2'],[],['F3C1']])
  assert.match(parseSelectorCodes('{"selectedCodes":["F1C2","F3C1"]}',allowed,3).warning,/lacked/)
  assert.deepEqual(parseSelectorCodes('{"selectedCodes":["F1C2","F9C1"]}',allowed,3).codes,[])
  assert.deepEqual(parseSelectorCodes('not json',allowed,3).codes,[])
  assert.deepEqual(parseSelectorCodes('{"selectedCodes":["F1C1","F1C2","F1C1"]}',allowed,3).codes,[])
})

test('coverage plan validates atomic facets and candidate-backed coverage', () => {
  const question = 'Compare release timing, vendor latency, and postal sample.'
  const options = {question,candidateCodes:['B1','B2']}
  assert.deepEqual(parseCoveragePlan('{"task":"compare","facets":[{"query":"release timing","status":"covered","candidateCode":"B1"},{"query":"vendor latency","status":"uncertain","candidateCode":null},{"query":"postal sample","status":"missing","candidateCode":null}]}',options).facets,[
    {query:'release timing',status:'covered',candidateCode:'B1'},
    {query:'vendor latency',status:'uncertain',candidateCode:null},
    {query:'postal sample',status:'missing',candidateCode:null},
  ])
  assert.throws(()=>parseCoveragePlan('{"facets":[{"query":"vendor latency","status":"covered","candidateCode":"B9"}]}',options),/valid baseline candidate/)
  assert.throws(()=>parseCoveragePlan('{"facets":[{"query":"fraud audit","status":"missing","candidateCode":null}]}',options),/invented terms/)
  assert.throws(()=>parseCoveragePlan('{"facets":[{"query":"postal sample","status":"uncertain","candidateCode":"B1"}]}',options),/must not claim/)
  assert.equal(parseCoveragePlan('{"facets":[{"query":"postal sample","status":"uncertain","candidateCode":"null"}]}',options).facets[0].candidateCode,null)
})
