import assert from 'node:assert/strict'
import {describe,it} from 'node:test'
import {auditUtcGrading} from '../../scripts/regrade-kb-search-utc.mjs'
import {comparisonJobs} from '../../scripts/sanity-kb-search-comparison.mjs'
import {benchmarkCases} from '../../scripts/sanity-context-benchmark-cases.mjs'
import {scoreStructured,structuredAdditionalCases,structuredSpecs} from '../../scripts/sanity-context-benchmark-structured.mjs'

const cases = [...benchmarkCases,...structuredAdditionalCases]
const makeOriginal = () => ({kind:'native-kb-search-versus-local-keyword',identity:'original-run',status:'complete',expected:160,
  manifest:{cases},results:comparisonJobs(cases).map(job => {
    const spec = structuredSpecs[job.id]
    const facts = Object.fromEntries(Object.entries(spec.fields).map(([key,value])=>[key,value.expected]))
    const changed = job.provider === 'openai' && (job.id === 'R01' || job.id === 'R06' && job.arm === 'keyword-local')
    if (changed) for (const [key,value] of Object.entries(spec.fields)) if (value.type === 'utc-time') facts[key] += ' UTC'
    const answer = JSON.stringify({answer:'The supplied records establish the required choice and facts.',decision:spec.correct,facts,...(spec.action ? {action:spec.action} : {})})
    const score = scoreStructured(cases.find(item=>item.id===job.id),answer)
    score.scoringRevision = 'v4.5'
    if (changed) {
      score.factsPass = score.answerPass = score.strictPass = false
      for (const [key,value] of Object.entries(spec.fields)) if (value.type === 'utc-time') score.factResults[key].pass = false
    }
    if (job.id === 'I05' && job.provider === 'ollama' && job.arm === 'sanity-kb-search') return {...job,answer,error:'Model output truncated; not an answer PASS.'}
    return {...job,answer,score}
  })})
const provenance = {sourcePath:'C:/benchmarks/original-final.json',sourceSha256:'a'.repeat(64)}

describe('offline UTC grading audit',()=>{
  it('changes only the three equivalent UTC verdicts and never mutates source rows or promotes provider errors',()=>{
    const original = makeOriginal()
    const before = JSON.stringify(original)
    const audit = auditUtcGrading(original,provenance)
    assert.equal(JSON.stringify(original),before)
    assert.equal(audit.records.length,160)
    assert.equal(audit.passChanges.length,3)
    assert.deepEqual(audit.passChanges.map(row=>`${row.id}/${row.arm}`),['R01/sanity-kb-search','R01/keyword-local','R06/keyword-local'])
    assert.ok(audit.passChanges.every(row=>!row.oldPass && row.newPass))
    assert.equal(audit.records.find(row=>row.executionError).newPass,false)
    assert.equal(audit.source.sha256,provenance.sourceSha256)
    assert.equal(audit.oldGraderRevision,'v4.5')
    assert.equal(audit.newGraderRevision,'v4.6-utc-time')
    assert.equal(audit.inferenceCalls,0)
    assert.equal(audit.retrievalCalls,0)
  })

  it('rejects incomplete matrices, unsupported original revisions and malformed provenance',()=>{
    const missing = makeOriginal()
    missing.results.pop()
    assert.throws(()=>auditUtcGrading(missing,provenance),/complete/)
    const duplicate = makeOriginal()
    duplicate.results[1] = duplicate.results[0]
    assert.throws(()=>auditUtcGrading(duplicate,provenance),/matrix/)
    const revision = makeOriginal()
    revision.results[0].score.scoringRevision = 'unknown'
    assert.throws(()=>auditUtcGrading(revision,provenance),/v4.5/)
    assert.throws(()=>auditUtcGrading(makeOriginal(),{...provenance,sourceSha256:'not-a-hash'}),/source hash/)
  })

  it('fails closed if an unrelated decision grading difference is discovered',()=>{
    const original = makeOriginal()
    original.results[0].score.decisionPass = false
    assert.throws(()=>auditUtcGrading(original,provenance),/non-fact change/)
  })
})
