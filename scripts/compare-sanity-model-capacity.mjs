import {createHash} from 'node:crypto'
import {readFile, mkdir, rename, writeFile} from 'node:fs/promises'
import {resolve, dirname} from 'node:path'
import {pathToFileURL} from 'node:url'
import {benchmarkCases} from './sanity-context-benchmark-cases.mjs'
import {scoreStructured, structuredAdditionalCases} from './sanity-context-benchmark-structured.mjs'

// Frozen before this model comparison. These cases span retrieval, inference,
// temporal separation, an operational decision, and the difficult X01 synthesis.
export const caseIds = ['R02', 'R03', 'R05', 'R06', 'I01', 'I02', 'I03', 'I04', 'T02', 'T04', 'D06', 'X01']
export const arms = ['sanity-groq-only', 'sanity-keyword-only']
const defaultSourcePath = resolve('artifacts/sanity-context-benchmark/v4-run-2026-09-26T02-28-29-960Z.json')
const casesById = new Map([...benchmarkCases, ...structuredAdditionalCases].map(item => [item.id, item]))

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function selectFrozenInputs(artifact, selectedCaseIds = caseIds, selectedArms = arms) {
  if (artifact.version !== 4 || artifact.structuredContractRevision !== 'v4.5' ||
      artifact.pilotRunIdentity?.stress145 !== true || artifact.pilotRunIdentity?.sourceCount !== 145 ||
      artifact.pilotRunIdentity?.sourceRevisions?.length !== 145 || artifact.repetitions !== 1) {
    throw Error('Expected the completed v4.5 single-repetition 145-source artifact.')
  }
  if (!selectedCaseIds.length || !selectedArms.length || new Set(selectedCaseIds).size !== selectedCaseIds.length ||
      new Set(selectedArms).size !== selectedArms.length) throw Error('Cases and arms must be nonempty and unique.')
  const inputs = []
  for (const id of selectedCaseIds) {
    const testCase = casesById.get(id)
    if (!testCase) throw Error(`Case ${id} is unknown.`)
    for (const arm of selectedArms) {
      const matches = artifact.results.filter(item => item.id === id && item.arm === arm)
      if (matches.length !== 1 || matches[0].modelCalls !== 1) throw Error(`Expected one completed ${arm}/${id} model call.`)
      const original = matches[0]
      const messages = original.modelTrace?.[0]?.messages
      if (!Array.isArray(messages) || messages.length !== 2 || messages[0].role !== 'system' || messages[1].role !== 'user') {
        throw Error(`Missing frozen system/user input for ${arm}/${id}.`)
      }
      const exactRead = original.toolCalls.find(item => item.name === 'sanity_evidence__exact_originals')
      if (!Array.isArray(exactRead?.selectedIds)) throw Error(`Missing exact-original IDs for ${arm}/${id}.`)
      inputs.push({
        id, arm, category: testCase.category, requiresState: Boolean(testCase.requiresState), messages,
        inputHash: sha256(JSON.stringify(messages)),
        selectedSources: original.selectedSources,
        selectedIds: exactRead.selectedIds,
        baseline: {
          answer: original.answer,
          score: original.score,
          promptTokens: original.promptTokens,
          completionTokens: original.completionTokens,
          inferenceLatencyMs: original.modelTrace[0].latencyMs,
        },
      })
    }
  }
  return inputs
}

export function extractOpenAIText(response) {
  return (response.output ?? [])
    .filter(item => item.type === 'message')
    .flatMap(item => item.content ?? [])
    .filter(item => item.type === 'output_text' && typeof item.text === 'string')
    .map(item => item.text)
    .join('')
}

export function summarize(results, selectedArms = arms) {
  const output = {}
  for (const arm of selectedArms) {
    const rows = results.filter(item => item.arm === arm)
    const total = rows.length
    const count = key => rows.filter(item => item.score?.[key] === true).length
    const mean = key => total ? Math.round(rows.reduce((sum, item) => sum + (item[key] ?? 0), 0) / total) : null
    output[arm] = {
      total,
      pass: count('strictPass'),
      decision: count('decisionPass'),
      facts: count('factsPass'),
      format: count('formatPass'),
      errors: rows.filter(item => item.error).length,
      meanPromptTokens: mean('promptTokens'),
      meanCompletionTokens: mean('completionTokens'),
      meanInferenceLatencyMs: mean('inferenceLatencyMs'),
    }
  }
  return output
}

async function callOllama(model, messages, {numGpu, numBatch, numPredict, timeoutMs}) {
  const started = performance.now()
  const response = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST', headers: {'content-type': 'application/json'},
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({model, stream: false, think: false, options: {temperature: 0, num_ctx: 4096, ...(numGpu === null ? {} : {num_gpu: numGpu}), ...(numBatch === null ? {} : {num_batch: numBatch}), ...(numPredict === null ? {} : {num_predict: numPredict})}, messages}),
  })
  const body = await response.json()
  if (!response.ok) throw Error(body.error ?? `Ollama HTTP ${response.status}`)
  return {
    answer: body.message?.content ?? '', promptTokens: body.prompt_eval_count ?? null,
    completionTokens: body.eval_count ?? null, inferenceLatencyMs: Math.round(performance.now() - started),
    modelResponseId: null,
  }
}

async function callOpenAI(model, messages, {timeoutMs}) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw Error('OPENAI_API_KEY is not configured. Do not paste it into a command or the benchmark artifact.')
  const started = performance.now()
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {'content-type': 'application/json', authorization: `Bearer ${key}`},
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({model, input: messages, reasoning: {effort: 'low'}, max_output_tokens: 2048, store: false}),
  })
  const body = await response.json()
  if (!response.ok) throw Error(`OpenAI HTTP ${response.status}: ${body.error?.message ?? 'request failed'}`)
  return {
    answer: extractOpenAIText(body), promptTokens: body.usage?.input_tokens ?? null,
    completionTokens: body.usage?.output_tokens ?? null,
    inferenceLatencyMs: Math.round(performance.now() - started), modelResponseId: body.id ?? null,
    responseStatus: body.status ?? null,
  }
}

async function saveCheckpoint(path, value) {
  await mkdir(dirname(path), {recursive: true})
  const temporary = `${path}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {flag: 'w'})
  await rename(temporary, path)
}

function option(name) {
  return process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
}

async function main() {
  const sourcePath = resolve(option('source') ?? defaultSourcePath)
  const sourceText = await readFile(sourcePath, 'utf8')
  const sourceHash = sha256(sourceText)
  const sourceArtifact = JSON.parse(sourceText)
  const requestedCases = option('cases') === 'all' ? sourceArtifact.caseIds : option('cases')?.split(',') ?? caseIds
  const requestedArms = option('arms')?.split(',') ?? arms
  const selectedCaseIds = requestedCases.map(value => value.trim()).filter(Boolean)
  const selectedArms = requestedArms.map(value => value.trim()).filter(Boolean)
  const inputs = selectFrozenInputs(sourceArtifact, selectedCaseIds, selectedArms)
  if (process.argv.includes('--plan')) {
    console.log(JSON.stringify({sourcePath, sourceHash, caseIds: selectedCaseIds, arms: selectedArms, inputCount: inputs.length,
      inputs: inputs.map(({id, arm, inputHash, selectedSources}) => ({id, arm, inputHash, selectedSources}))}, null, 2))
    return
  }
  const provider = option('provider')
  const model = option('model')
  const out = option('out')
  const numGpuOption = option('num-gpu')
  const numGpu = numGpuOption === undefined ? null : Number(numGpuOption)
  const numBatchOption = option('num-batch')
  const numBatch = numBatchOption === undefined ? null : Number(numBatchOption)
  const numPredictOption = option('num-predict')
  const numPredict = numPredictOption === undefined ? null : Number(numPredictOption)
  const timeoutMs = Number(option('timeout-ms') ?? '120000')
  if (!['ollama', 'openai'].includes(provider) || !model || !out) {
    throw Error('Usage: node scripts/compare-sanity-model-capacity.mjs --source=PATH --cases=all|ID,... --arms=ARM,... --provider=ollama|openai --model=MODEL --out=PATH (or --plan)')
  }
  if (numGpuOption !== undefined && (provider !== 'ollama' || !Number.isSafeInteger(numGpu) || numGpu < 0) ||
      numBatchOption !== undefined && (provider !== 'ollama' || !Number.isSafeInteger(numBatch) || numBatch < 1) ||
      numPredictOption !== undefined && (provider !== 'ollama' || !Number.isSafeInteger(numPredict) || numPredict < 1) ||
      !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000) {
    throw Error('Invalid --num-gpu, --num-batch, or --num-predict (Ollama only), or --timeout-ms option.')
  }
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) throw Error('OPENAI_API_KEY is not configured.')
  const outputPath = resolve(out)
  if (outputPath === sourcePath) throw Error('The output path must not overwrite the frozen source artifact.')
  const settings = provider === 'ollama' ? {think: false, temperature: 0, numCtx: 4096, numGpu: numGpu ?? 'auto', numBatch: numBatch ?? 'auto', numPredict: numPredict ?? 'auto', timeoutMs} : {reasoningEffort: 'low', maxOutputTokens: 2048, store: false, timeoutMs}
  let checkpoint
  try {
    checkpoint = JSON.parse(await readFile(outputPath, 'utf8'))
    if (checkpoint.sourceHash !== sourceHash || checkpoint.provider !== provider || checkpoint.model !== model ||
        checkpoint.caseIds?.join(',') !== selectedCaseIds.join(',') || checkpoint.arms?.join(',') !== selectedArms.join(',') ||
        (checkpoint.settings?.numGpu ?? 'auto') !== (settings.numGpu ?? 'auto') ||
        (checkpoint.settings?.numBatch ?? 'auto') !== (settings.numBatch ?? 'auto') ||
        (checkpoint.settings?.numPredict ?? 'auto') !== (settings.numPredict ?? 'auto') ||
        (checkpoint.settings?.timeoutMs ?? 120_000) !== timeoutMs) throw Error('Existing checkpoint identity differs; refusing to overwrite it.')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    checkpoint = {
      version: 1, kind: 'frozen-evidence-model-comparison', sourcePath, sourceHash,
      corpus: 'synthetic 145-source pilot', provider, model, caseIds: selectedCaseIds, arms: selectedArms,
      settings,
      startedAt: new Date().toISOString(), status: 'running', results: [],
    }
    await saveCheckpoint(outputPath, checkpoint)
  }
  const done = new Set(checkpoint.results.map(item => `${item.id}/${item.arm}`))
  for (const item of inputs) {
    const key = `${item.id}/${item.arm}`
    if (done.has(key)) continue
    const response = provider === 'ollama' ? await callOllama(model, item.messages, {numGpu, numBatch, numPredict, timeoutMs}) : await callOpenAI(model, item.messages, {timeoutMs})
    const testCase = casesById.get(item.id)
    const score = scoreStructured(testCase, response.answer, {
      selectedSources: item.selectedSources, selectedIds: item.selectedIds,
      stateAvailable: item.requiresState,
    })
    checkpoint.results.push({...item, ...response, score})
    checkpoint.summary = summarize(checkpoint.results, selectedArms)
    checkpoint.updatedAt = new Date().toISOString()
    await saveCheckpoint(outputPath, checkpoint)
    console.log(`${checkpoint.results.length}/${inputs.length} ${item.arm} ${item.id} PASS=${score.strictPass} decision=${score.decisionPass} facts=${score.factsPass} format=${score.formatPass} tokens=${response.promptTokens ?? '?'}+${response.completionTokens ?? '?'} latency=${response.inferenceLatencyMs}ms`)
  }
  checkpoint.status = 'complete'
  checkpoint.completedAt = new Date().toISOString()
  await saveCheckpoint(outputPath, checkpoint)
  console.log(JSON.stringify({outputPath, model, provider, summary: checkpoint.summary}, null, 2))
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
