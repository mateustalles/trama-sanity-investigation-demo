import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import {extractOpenAIText, selectFrozenInputs, summarize} from '../../scripts/compare-sanity-model-capacity.mjs'

function frozenArtifact() {
  const makeResult = arm => ({
    id: 'R02', arm, modelCalls: 1,
    modelTrace: [{messages: [{role: 'system', content: 'Return JSON.'}, {role: 'user', content: 'Original evidence and question.'}], latencyMs: 100}],
    toolCalls: [{name: 'sanity_evidence__exact_originals', selectedIds: ['evidenceSource.abc']}],
    selectedSources: ['deployment.md'], answer: '{}', score: {strictPass: false}, promptTokens: 20, completionTokens: 5,
  })
  return {
    version: 4, structuredContractRevision: 'v4.5', repetitions: 1,
    pilotRunIdentity: {stress145: true, sourceCount: 145, sourceRevisions: Array.from({length: 145}, (_, index) => ({_id: String(index)}))},
    results: [makeResult('sanity-groq-only'), makeResult('sanity-keyword-only')],
  }
}

describe('frozen model comparison', () => {
  it('replays exactly the recorded inputs for both retrieval arms', () => {
    const inputs = selectFrozenInputs(frozenArtifact(), ['R02'])
    assert.equal(inputs.length, 2)
    assert.deepEqual(inputs[0].messages, inputs[1].messages)
    assert.equal(inputs[0].inputHash, inputs[1].inputHash)
    assert.deepEqual(inputs[0].selectedIds, ['evidenceSource.abc'])
  })

  it('rejects a corpus identity change and missing arm', () => {
    const artifact = frozenArtifact()
    artifact.pilotRunIdentity.sourceCount = 50
    assert.throws(() => selectFrozenInputs(artifact, ['R02']), /145-source/)
    artifact.pilotRunIdentity.sourceCount = 145
    artifact.results.pop()
    assert.throws(() => selectFrozenInputs(artifact, ['R02']), /sanity-keyword-only\/R02/)
  })

  it('accepts a frozen faceted arm and preserves the State requirement', () => {
    const artifact = frozenArtifact()
    artifact.results = [{...artifact.results[0], id: 'X02', arm: 'sanity-faceted-groq'}]
    const inputs = selectFrozenInputs(artifact, ['X02'], ['sanity-faceted-groq'])
    assert.equal(inputs.length, 1)
    assert.equal(inputs[0].requiresState, true)
    assert.equal(inputs[0].arm, 'sanity-faceted-groq')
    assert.deepEqual(inputs[0].selectedIds, ['evidenceSource.abc'])
  })

  it('extracts only visible OpenAI output text, not reasoning items', () => {
    assert.equal(extractOpenAIText({output: [
      {type: 'reasoning', content: [{type: 'output_text', text: 'private'}]},
      {type: 'message', content: [{type: 'output_text', text: '{"decision":"ok"}'}]},
    ]}), '{"decision":"ok"}')
  })

  it('reports answer dimensions separately from execution errors', () => {
    const report = summarize([{arm: 'sanity-groq-only', score: {strictPass: true, decisionPass: true, factsPass: true, formatPass: false}, promptTokens: 100, completionTokens: 30, inferenceLatencyMs: 1000}])
    assert.equal(report['sanity-groq-only'].total, 1)
    assert.equal(report['sanity-groq-only'].pass, 1)
    assert.equal(report['sanity-groq-only'].decision, 1)
    assert.equal(report['sanity-groq-only'].facts, 1)
    assert.equal(report['sanity-groq-only'].format, 0)
    assert.equal(report['sanity-groq-only'].errors, 0)
    assert.equal(report['sanity-groq-only'].meanPromptTokens, 100)
    assert.equal(report['sanity-keyword-only'].total, 0)
    assert.deepEqual(Object.keys(summarize([{arm: 'sanity-faceted-groq', score: {strictPass: true}}], ['sanity-faceted-groq'])), ['sanity-faceted-groq'])
  })
})
