import {createHash} from 'node:crypto'
import {readFile, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {scoreStructured, structuredSpecs, structuredScoringRevision} from './sanity-context-benchmark-structured.mjs'
import {summarizeComparison} from './sanity-kb-search-comparison.mjs'

const passes = row => Boolean(row.score?.strictPass && row.score?.formatPass && !row.error)

/** Offline grading replay. Original prompts, packets, outputs and scores stay untouched. */
export function auditUtcGrading(original, {sourceSha256, sourcePath}) {
  if (original.kind !== 'native-kb-search-versus-local-keyword' || original.status !== 'complete' || original.expected !== 160 || original.results?.length !== 160 ||
      !original.identity || !/^[a-f0-9]{64}$/.test(sourceSha256) || typeof sourcePath !== 'string') throw new Error('A complete identified 160-answer artifact and source hash are required.')
  const caseById = new Map(original.manifest?.cases?.map(testCase => [testCase.id, testCase]) ?? [])
  const keys = original.results.map(row => `${row.model}/${row.arm}/${row.id}`)
  if (caseById.size !== 40 || new Set(keys).size !== 160 || summarizeComparison(original.results).some(group => group.total !== 40)) throw new Error('Unexpected case/model/arm matrix.')
  const oldRevisions = [...new Set(original.results.filter(row => row.score).map(row => row.score.scoringRevision))]
  if (oldRevisions.length !== 1 || oldRevisions[0] !== 'v4.5') throw new Error('This narrow replay requires original v4.5 scores.')
  const rescored = original.results.map(row => {
    if (row.error) return {...row} // An incomplete/provider-error response never becomes a PASS.
    if (!row.score || !caseById.has(row.id)) throw new Error('Missing original score or case.')
    const score = scoreStructured(caseById.get(row.id), row.answer, {selectedIds:row.selectedIds ?? [], stateAvailable:Boolean(row.stateAvailable)})
    if (score.decisionPass !== row.score.decisionPass || score.formatPass !== row.score.formatPass) throw new Error(`Unexpected non-fact change for ${row.id}.`)
    for (const [key, fact] of Object.entries(score.factResults ?? {})) {
      if (fact.pass === row.score.factResults?.[key]?.pass) continue
      if (structuredSpecs[row.id]?.fields[key]?.type !== 'utc-time' || !fact.pass || row.score.factResults?.[key]?.pass !== false) throw new Error(`Unexpected non-UTC grading change for ${row.id}.${key}.`)
    }
    return {...row, score}
  })
  const records = rescored.map((row, index) => {
    const old = original.results[index]
    return {id:row.id,model:row.model,provider:row.provider,arm:row.arm,inputHash:row.inputHash ?? null,
      executionError:row.error ?? null,oldPass:passes(old),newPass:passes(row),passChanged:passes(old) !== passes(row),
      oldScore:old.score ?? null,newScore:row.score ?? null,
      rationale:{decision:{expected:row.score?.correctDecision ?? null,actual:row.score?.decision ?? null,pass:row.score?.decisionPass ?? false},
        action:{expected:row.score?.expectedAction ?? null,actual:row.score?.actualAction ?? null,required:row.score?.expectedAction != null},
        facts:row.score?.factResults ?? {},format:row.score?.formatPass ?? false,
        executionError:row.error ?? null,semanticSupportRequiresManualAudit:true}}
  })
  return {kind:'offline-utc-grading-audit',source:{path:sourcePath,sha256:sourceSha256,runIdentity:original.identity},
    oldGraderRevision:oldRevisions[0],newGraderRevision:structuredScoringRevision,
    normalization:'Only declared UTC clock fields accept the same HH:MM with an optional literal UTC suffix. No offsets, date/time conversion, enum or semantic normalization.',
    inferenceCalls:0,retrievalCalls:0,originalArtifactMutated:false,
    oldSummary:summarizeComparison(original.results),newSummary:summarizeComparison(rescored),
    passChanges:records.filter(row => row.passChanged).map(({id,model,arm,oldPass,newPass}) => ({id,model,arm,oldPass,newPass})),records}
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length !== 2) throw new Error('Usage: node scripts/regrade-kb-search-utc.mjs ORIGINAL_FINAL.json NEW_AUDIT.json')
  const sourcePath = resolve(args[0]), outputPath = resolve(args[1])
  if (sourcePath === outputPath) throw new Error('The audit must be written to a separate file.')
  const source = await readFile(sourcePath)
  const audit = auditUtcGrading(JSON.parse(source.toString('utf8')), {sourcePath, sourceSha256:createHash('sha256').update(source).digest('hex')})
  // Exclusive creation protects prior audits and all existing benchmark files.
  await writeFile(outputPath, JSON.stringify({...audit,auditedAt:new Date().toISOString()},null,2)+'\n', {flag:'wx'})
  console.log(JSON.stringify({outputPath,sourceSha256:audit.source.sha256,passChanges:audit.passChanges,summary:audit.newSummary},null,2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {console.error(error.message);process.exitCode=1})
