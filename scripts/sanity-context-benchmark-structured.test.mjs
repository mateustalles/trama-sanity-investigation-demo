import assert from 'node:assert/strict'
import {describe,it} from 'node:test'
import {benchmarkCases} from './sanity-context-benchmark-cases.mjs'
import {assertStructuredSpecs,parseStructuredOutput,scoreStructured,structuredAdditionalCases,structuredOutputInstruction,structuredSpecs} from './sanity-context-benchmark-structured.mjs'

const allCases = [...benchmarkCases,...structuredAdditionalCases]
const byId = id => allCases.find(item => item.id === id)

describe('structured benchmark v4', () => {
  it('covers every benchmark case with three to five distinct choices', () => {
    assert.doesNotThrow(() => assertStructuredSpecs(allCases))
    assert.equal(Object.keys(structuredSpecs).length,allCases.length)
  })

  it('does not leak the host-only correct choice in the output instruction', () => {
    const instruction = structuredOutputInstruction(byId('S04'))
    assert.ok(instruction.includes('two_applied'))
    assert.ok(!instruction.includes('"correct"'))
    assert.ok(!instruction.includes('"expected"'))
  })

  it('accepts exact structured S04 fields independently of punctuation in prose', () => {
    const answer = JSON.stringify({answer:'Two applied Deltas use base revision: 1 and base revision: 2.',decision:'two_applied',facts:{applied_count:2,base_revisions:'1,2'},evidence:['State snapshot']})
    const result = scoreStructured(byId('S04'), answer, {stateAvailable:true})
    assert.equal(result.strictPass,true)
    assert.equal(result.factResults.base_revisions.pass,true)
  })

  it('rejects wrong or missing values even when prose mentions the right words', () => {
    const answer = JSON.stringify({answer:'The present revision is 3; revision 1 is stale.',decision:'current',facts:{present_revision:3,proposed_base_revision:1},evidence:['State snapshot']})
    const result = scoreStructured(byId('S05'), answer, {stateAvailable:true})
    assert.equal(result.formatPass,true)
    assert.equal(result.decisionPass,false)
    assert.equal(result.strictPass,false)
  })

  it('records citation validity separately without using it to fail a correct structured answer', () => {
    const answer = JSON.stringify({answer:'The timeout dropped from ten seconds to four seconds.',decision:'timeout_reduced',facts:{old_seconds:10,new_seconds:4},evidence:['01-deployment-record.md']})
    assert.equal(scoreStructured(byId('R02'),answer,{selectedSources:['01-deployment-record.md']}).strictPass,true)
    assert.equal(scoreStructured(byId('R02'),answer,{selectedSources:['02-provider-latency-log.md']}).evidencePass,false)
    assert.equal(scoreStructured(byId('R02'),answer,{selectedSources:['02-provider-latency-log.md']}).strictPass,true)
  })

  it('counts S03 structured decision and facts as a correct answer even when citation fails', () => {
    const answer = JSON.stringify({answer:'The follow-up Delta was applied on September 21, 2026.',decision:'applied',facts:{applied_at:'2026-09-21T17:42:16.476Z'},evidence:['19-checkout-release-followup.md']})
    const result = scoreStructured(byId('S03'),answer,{stateAvailable:true,selectedSources:['19-checkout-release-followup.md']})
    assert.equal(result.decisionPass,true)
    assert.equal(result.factsPass,true)
    assert.equal(result.answerPass,true)
    assert.equal(result.evidencePass,false)
    assert.equal(result.strictPass,true)
  })

  it('does not require an evidence array or long prose for v4.5 PASS', () => {
    const answer=JSON.stringify({answer:'Reduced timeout.',decision:'timeout_reduced',facts:{old_seconds:10,new_seconds:4}})
    const result=scoreStructured(byId('R02'),answer)
    assert.equal(result.strictPass,true)
    assert.equal(result.evidencePass,false)
    assert.equal(result.explanationPass,false)
    assert.equal(result.formatPass,true)
  })

  it('accepts a retrieved original ID and scores R04 delay through a numeric fact', () => {
    const originalId='evidenceSource.28a3f4b51286366cfedebe6073590e147fb04ab3cdb9eb00b4298c5344cc117b'
    const answer=JSON.stringify({answer:'A sampled successful retry occurred 30 seconds after the failure.',decision:'directly_reported',facts:{retry_delay_seconds:30},evidence:[originalId]})
    assert.equal(scoreStructured(byId('R04'),answer,{selectedIds:[originalId]}).strictPass,true)
    assert.equal(scoreStructured(byId('R04'),answer,{selectedIds:[]}).evidencePass,false)
    assert.equal(scoreStructured(byId('R04'),answer,{selectedIds:[]}).strictPass,true)
  })

  it('rejects non-JSON responses instead of extracting a convenient object', () => {
    assert.equal(parseStructuredOutput('```json\n{}\n```').error,'invalid JSON')
    assert.equal(scoreStructured(byId('S04'),'not JSON',{stateAvailable:true}).formatPass,false)
  })
})
