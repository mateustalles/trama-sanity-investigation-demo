import assert from 'node:assert/strict'
import {test} from 'node:test'
import {pilot50Distractors} from './fixtures/sanity-pilot-50-distractors.mjs'
import {pilot145Distractors} from './fixtures/sanity-pilot-145-distractors.mjs'
import {
  evidenceDocumentId,
  exactEvidenceQuery,
  knowledgeBaseDatasetQuery,
  keywordCandidatesQuery,
  makeEvidenceDocument,
  originalEvidencePack,
  rankCandidateOriginals,
  semanticCandidatesQuery,
  sourceIdsFromKnowledgeBaseEntry,
  verifyExactEvidenceDocuments,
} from './sanity-content-lake-evidence.mjs'

const scope = {workspaceId: 'synthetic-workspace', scopeId: 'case-1'}
const source = makeEvidenceDocument({...scope, sourceId: 'original.md', title: 'Original', body: '# Original\nObserved fact.'}, '2026-09-23T00:00:00.000Z')
const remote = {...source, _rev: 'revision-1', _updatedAt: '2026-09-23T00:00:00.000Z'}
const registry = new Map([[source._id, source]])

test('50-document stress fixtures add 26 distinct, source-verifiable synthetic records', () => {
  assert.equal(pilot50Distractors.length, 26)
  const documents = pilot50Distractors.map(item => makeEvidenceDocument({...scope, ...item}))
  assert.equal(new Set(documents.map(item => item._id)).size, 26)
  assert.ok(documents.every(item => item._type === 'evidenceSource' && item.body.startsWith(`# ${item.title}`)))
})

test('145-document stress fixtures add 95 distinct synthetic hard negatives', () => {
  assert.equal(pilot145Distractors.length, 95)
  const all = [...pilot50Distractors, ...pilot145Distractors].map(item => makeEvidenceDocument({...scope, ...item}))
  assert.equal(new Set(all.map(item => item._id)).size, 121)
  assert.ok(all.every(item => item._type === 'evidenceSource' && item.body.startsWith(`# ${item.title}`)))
})

test('stable identity preserves exact source text and content hash', () => {
  assert.equal(source._id, evidenceDocumentId({...scope, sourceId: 'original.md'}))
  assert.equal(source.body, '# Original\nObserved fact.')
  assert.equal(source.contentHash.length, 64)
  assert.notEqual(source._id, evidenceDocumentId({...scope, sourceId: 'other.md'}))
  assert.throws(() => makeEvidenceDocument({...scope, sourceId: 'bad', title: 'Bad', body: 'text', contentHash: 'wrong'}), /SHA-256/)
})

test('host-owned GROQ is scoped and escapes untrusted values', () => {
  const hostile = 'case-1"] | * //'
  const exact = exactEvidenceQuery({...scope, scopeId: hostile, ids: [source._id]})
  assert.ok(exact.includes(`scopeId == ${JSON.stringify(hostile)}`))
  assert.ok(exact.includes(`_id in ${JSON.stringify([source._id])}`))
  assert.ok(knowledgeBaseDatasetQuery(scope).includes('sourceRevision'))
  const semantic = semanticCandidatesQuery({...scope, question: 'why "now"?\n*', limit: 3})
  assert.ok(semantic.includes(`text::semanticSimilarity(${JSON.stringify('why "now"?\n*')})`))
  assert.ok(semantic.includes('[0...3]'))
  assert.ok(semanticCandidatesQuery({...scope, question:'cross-source synthesis', limit:10}).includes('[0...10]'))
  const keyword = keywordCandidatesQuery({...scope, question: hostile, limit: 10})
  assert.ok(keyword.includes(`workspaceId == ${JSON.stringify(scope.workspaceId)}`))
  assert.ok(keyword.includes(`text::query(${JSON.stringify(hostile)})`))
  assert.ok(keyword.includes('[_score > 0]'))
  assert.ok(keyword.includes('[0...10]'))
  assert.throws(() => keywordCandidatesQuery({...scope, question:'valid question', limit:11}), /between 1 and 10/)
  assert.throws(() => exactEvidenceQuery({...scope, ids: [source._id, source._id]}), /Duplicate/)
  assert.throws(() => exactEvidenceQuery({...scope, ids: ['arbitrary']}), /stable evidence/)
})

test('KB citations only resolve explicit allowlisted source IDs in Sources section', () => {
  const entry = `## Claim\n${source._id} in generated prose is not a source.\n## Sources\n1. ${source._id} — Sanity document\n2. evidenceSource.${'f'.repeat(64)} — Sanity document\n`
  const result = sourceIdsFromKnowledgeBaseEntry(entry, new Set([source._id]))
  assert.deepEqual(result.ids, [source._id])
  assert.deepEqual(result.unknownIds, [`evidenceSource.${'f'.repeat(64)}`])
  assert.equal(sourceIdsFromKnowledgeBaseEntry('## Sources\n1. original.md — File', new Set([source._id])).identityAvailable, false)
})

test('exact read verifies scope, registry, hash, revision, and gaps before packing', () => {
  const verified = verifyExactEvidenceDocuments({requestedIds: [source._id], documents: [remote], registry, ...scope})
  assert.deepEqual(verified.missingIds, [])
  assert.equal(originalEvidencePack(verified.documents).selectedIds[0], source._id)
  assert.deepEqual(verifyExactEvidenceDocuments({requestedIds: [source._id], documents: [], registry, ...scope}).missingIds, [source._id])
  assert.throws(() => verifyExactEvidenceDocuments({requestedIds: [source._id], documents: [{...remote, workspaceId: 'other'}], registry, ...scope}), /Scope/)
  assert.throws(() => verifyExactEvidenceDocuments({requestedIds: [source._id], documents: [{...remote, body: 'tampered'}], registry, ...scope}), /hash/)
  assert.throws(() => verifyExactEvidenceDocuments({requestedIds: [source._id], documents: [{...remote, _rev: ''}], registry, ...scope}), /revision/)
  assert.throws(() => verifyExactEvidenceDocuments({requestedIds: [source._id], documents: [remote, remote], registry, ...scope}), /duplicate/)
})

test('whole sources are omitted rather than silently clipped', () => {
  const packed = originalEvidencePack([remote], {maxChars: 256})
  assert.deepEqual(packed.selectedIds, [])
  assert.deepEqual(packed.omittedIds, [source._id])
  assert.match(packed.content, /Evidence gap/)
})

test('original pack can include ten sources within its character budget', () => {
  const documents = Array.from({length:10},(_,index)=>({...remote,_id:`evidenceSource.${String(index).padStart(64,'0')}`,sourceId:`source-${index}.md`}))
  const packed = originalEvidencePack(documents,{maxChars:12000,maxSources:10})
  assert.equal(packed.selectedIds.length,10)
  assert.deepEqual(packed.omittedIds,[])
})

test('candidate ranking does not let unrelated KB entry order hide the exact source', () => {
  const documents = [
    {sourceId: 'fraud-audit.md', title: 'Fraud rule audit', body: 'A separate investigation.'},
    {sourceId: 'postal-code.md', title: 'Postal code sample', body: 'A separate address review.'},
    {sourceId: 'provider-b-timeout.md', title: 'Provider B timeout incident', body: 'Provider B timeout on 2026-09-02.'},
  ]
  assert.equal(rankCandidateOriginals(documents, 'Should the Provider B timeout on 2026-09-02 explain this event?')[0], documents[2])
  assert.deepEqual(rankCandidateOriginals(documents, 'Unrelated wording'), documents)
})
