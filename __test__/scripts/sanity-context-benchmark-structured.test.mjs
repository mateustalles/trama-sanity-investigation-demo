import assert from 'node:assert/strict'
import {describe,it} from 'node:test'
import {benchmarkCases} from '../../scripts/sanity-context-benchmark-cases.mjs'
import {assertStructuredSpecs,parseStructuredOutput,scoreStructured,structuredAdditionalCases,structuredOutputInstruction,structuredSpecs,structuredScoringRevision} from '../../scripts/sanity-context-benchmark-structured.mjs'

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

  it('accepts exact UTC clock values with or without the UTC suffix in declared clock fields', () => {
    for (const [id, item] of Object.entries(structuredSpecs)) {
      const clocks = Object.entries(item.fields).filter(([, value]) => value.type === 'utc-time')
      if (!clocks.length) continue
      const facts = Object.fromEntries(Object.entries(item.fields).map(([key, value]) => [key, value.expected]))
      for (const suffix of ['', ' UTC']) {
        const value = {answer:'The exact requested values are supported by the supplied records.',decision:item.correct,facts:{...facts}}
        for (const [key, expected] of clocks) value.facts[key] = `${expected.expected}${suffix}`
        const result = scoreStructured(byId(id), JSON.stringify(value))
        assert.equal(result.strictPass, true, `${id}: ${suffix}`)
        assert.equal(result.scoringRevision, structuredScoringRevision)
        for (const [key, expected] of clocks) {
          assert.equal(result.factResults[key].actual, `${expected.expected}${suffix}`)
          assert.equal(result.factResults[key].normalizedActual, expected.expected)
        }
      }
    }
  })

  it('rejects shifted times, offsets, dates, partial values and clock prose rather than broadening semantics', () => {
    for (const start of ['10:01 UTC', '09:00 UTC', '10:00+00:00', '10:00 UTC+00:00', '07:00-03:00', '2026-09-18T10:00:00Z', '10:00:00', '10:00 GMT', '10:00Z', '10:00 utc', 'at 10:00 UTC', '10:00 UTC (confirmed)', '10:00–10:15 UTC', '10:0 UTC', 10, null]) {
      const result = scoreStructured(byId('R01'), JSON.stringify({answer:'The payment incident occurred in the supplied interval.',decision:'payment_failures',facts:{start_utc:start,end_utc:'10:15 UTC'}}))
      assert.equal(result.strictPass, false, `${start}`)
      assert.equal(result.factResults.start_utc.pass, false, `${start}`)
      assert.equal(result.factResults.end_utc.pass, true)
    }
  })

  it('does not normalize timestamps or arbitrary strings and retains exact numeric checks', () => {
    const timestamp = scoreStructured(byId('S03'), JSON.stringify({answer:'The latest monitoring Delta is applied.',decision:'applied',facts:{applied_at:'2026-09-21T17:42:16.476Z UTC'}}))
    assert.equal(timestamp.strictPass, false)
    const revisions = scoreStructured(byId('S04'), JSON.stringify({answer:'Two applied Deltas use the expected revisions.',decision:'two_applied',facts:{applied_count:2,base_revisions:'1,2 UTC'}}))
    assert.equal(revisions.strictPass, false)
    for (const [actual, pass] of [['4', true], ['4 UTC', false], [4.1, false]]) {
      const result = scoreStructured(byId('R02'), JSON.stringify({answer:'The deployment reduced the timeout.',decision:'timeout_reduced',facts:{old_seconds:10,new_seconds:actual}}))
      assert.equal(result.strictPass, pass)
    }
  })

  it('keeps decisions and actions exact even when a UTC fact is equivalent', () => {
    const wrongDecision = scoreStructured(byId('R01'), JSON.stringify({answer:'The payment incident occurred at this interval.',decision:'unknown',facts:{start_utc:'10:00 UTC',end_utc:'10:15 UTC'}}))
    assert.equal(wrongDecision.factsPass, true)
    assert.equal(wrongDecision.strictPass, false)
    for (const action of ['applied', 'none', 'proposed UTC']) {
      const result = scoreStructured(byId('D01'), JSON.stringify({answer:'Only draft the monitoring follow-up for human approval.',decision:'draft_only',facts:{},action}))
      assert.equal(result.strictPass, false)
      assert.equal(result.expectedAction, 'proposed')
      assert.equal(result.actualAction, action)
    }
  })
})
