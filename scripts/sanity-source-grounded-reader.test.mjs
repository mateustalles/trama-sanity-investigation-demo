import assert from 'node:assert/strict'
import {test} from 'node:test'
import {makeEvidenceDocument} from './sanity-content-lake-evidence.mjs'
import {readSourceGroundedEvidence} from './sanity-source-grounded-reader.mjs'

const workspaceId = 'synthetic-workspace'
const subjects = [
  {scopeId:'car-repair',sourceId:'battery-check.md',body:'The battery measured 12.4 volts after charging.',question:'What did the battery check find?'},
  {scopeId:'legal-matter',sourceId:'filing-receipt.md',body:'The court receipt records a filing on 2026-09-10.',question:'When was the filing received?'},
  {scopeId:'payment-incident',sourceId:'timeout-change.md',body:'The payment timeout changed from ten to four seconds.',question:'What changed in the payment timeout?'},
]

function fixture(subject) {
  const original = makeEvidenceDocument({...subject,workspaceId,title:subject.sourceId})
  const remote = {...original,_rev:`rev-${subject.scopeId}`}
  const entry = {knowledgeBase:`kb-${subject.scopeId}`,path:'evidence/primary'}
  return {
    original,
    remote,
    entry,
    options: {
      workspaceId,scopeId:subject.scopeId,question:subject.question,
      entries:[entry],selectedEntryKeys:[`${entry.knowledgeBase}:${entry.path}`],
      registry:new Map([[original._id,original]]),
      readKnowledgeBase:async () => `Generated interpretation must not be used as evidence.\n## Sources\n1. ${original._id} — Sanity document`,
      readOriginals:async () => [remote],
    },
  }
}

test('the same locator-to-original flow works across unrelated investigation subjects', async () => {
  for (const subject of subjects) {
    const {original,options} = fixture(subject)
    const result = await readSourceGroundedEvidence(options)
    assert.deepEqual(result.selectedIds,[original._id])
    assert.deepEqual(result.missingIds,[])
    assert.equal(result.revisions[0].contentHash,original.contentHash)
    assert.match(result.content,new RegExp(subject.body.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))
    assert.doesNotMatch(result.content,/Generated interpretation/)
    assert.match(result.knowledgeBaseResponses[0].text,/Generated interpretation/)
  }
})

test('generated claims, invented IDs, and out-of-outline paths never become evidence', async () => {
  const {options,original} = fixture(subjects[0])
  const unknownId = `evidenceSource.${'f'.repeat(64)}`
  const result = await readSourceGroundedEvidence({
    ...options,
    readKnowledgeBase:async () => `Invented claim mentions ${original._id}.\n## Sources\n1. ${unknownId} — Sanity document`,
    readOriginals:async () => { throw new Error('No exact read should occur.') },
  })
  assert.deepEqual(result.selectedIds,[])
  assert.deepEqual(result.unknownIds,[unknownId])
  assert.match(result.content,/Evidence gap/)
  await assert.rejects(readSourceGroundedEvidence({...options,selectedEntryKeys:['kb-other:evidence/primary']}),/authorized outline/)
})

test('exact reads reject cross-scope and tampered originals', async () => {
  const {options,remote} = fixture(subjects[1])
  await assert.rejects(readSourceGroundedEvidence({...options,readOriginals:async () => [{...remote,scopeId:'car-repair'}]}),/Scope or registry mismatch/)
  await assert.rejects(readSourceGroundedEvidence({...options,readOriginals:async () => [{...remote,body:'altered'}]}),/Content hash mismatch/)
})

test('source count is bounded and omitted whole sources are reported', async () => {
  const {options,remote} = fixture(subjects[2])
  const result = await readSourceGroundedEvidence({...options,maxSources:1,maxChars:256,readOriginals:async () => [remote]})
  assert.deepEqual(result.selectedIds,[])
  assert.deepEqual(result.omittedIds,[remote._id])
  assert.match(result.content,/Evidence gap/)
})

test('existing generic ranking prioritizes question-relevant originals before the source cap', async () => {
  const base = fixture(subjects[0])
  const distractor = makeEvidenceDocument({workspaceId,scopeId:subjects[0].scopeId,sourceId:'unrelated.md',title:'Unrelated note',body:'A garden irrigation log.'})
  const result = await readSourceGroundedEvidence({
    ...base.options,maxSources:1,
    registry:new Map([[base.original._id,base.original],[distractor._id,distractor]]),
    readKnowledgeBase:async () => `## Sources\n1. ${distractor._id} — Sanity document\n2. ${base.original._id} — Sanity document`,
    readOriginals:async () => [{...distractor,_rev:'rev-garden'},base.remote],
  })
  assert.deepEqual(result.selectedIds,[base.original._id])
  assert.deepEqual(result.omittedIds,[distractor._id])
})
