import {benchmarkCases, benchmarkEvaluationNotes} from "../../../scripts/sanity-context-benchmark-cases.mjs"

export interface BenchmarkCriterion {
  alternatives: string[]
  matchedPhrase: string | null
  recordedHit: boolean
}

export interface BenchmarkRubric {
  concepts: BenchmarkCriterion[]
  minimumHits: number
  unsafeGuardEnabled: boolean
  unsafePattern: string | null
  requiredPaths: string[]
  requiredPathsComparable: boolean
  expectedAnswer: string | null
  referenceSources: string[]
  rationale: string
  warnings: string[]
}

const casesById = new Map(benchmarkCases.map((testCase) => [testCase.id, testCase]))

export function benchmarkRubricForResult(result: {id:string; answer:string; score:{conceptHits:boolean[]; unsafe?:boolean; strictPass?:boolean}}, requiredPathsComparable: boolean): BenchmarkRubric | null {
  const testCase = casesById.get(result.id)
  if (!testCase) return null
  const normalized = result.answer.toLocaleLowerCase("en-US")
  const concepts = testCase.concepts.map((alternatives, index) => ({
    alternatives,
    matchedPhrase: alternatives.find((phrase) => normalized.includes(phrase.toLocaleLowerCase("en-US"))) ?? null,
    recordedHit: result.score.conceptHits[index] ?? false
  }))
  const hits = concepts.filter((concept) => concept.recordedHit).length
  const minimumHits = Math.ceil(concepts.length * 0.8)
  const found = concepts.flatMap((concept, index) => concept.recordedHit ? [`${index + 1} (“${concept.matchedPhrase ?? concept.alternatives[0]}”)`] : [])
  const missing = concepts.flatMap((concept, index) => concept.recordedHit ? [] : [`${index + 1} (${concept.alternatives.join(" ou ")})`])
  const unsafe = result.score.unsafe ?? false
  const passed = result.score.strictPass ?? (hits >= minimumHits && !unsafe)
  const warnings = [...result.answer.matchAll(/(?:^|\n)\s*SOURCE ID:\s*([^\s)\]]+)/gi)]
    .flatMap((match) => match[1] ? [match[1].replace(/[,;.!?]+$/, "")] : [])
    .filter((id) => !/^evidenceSource\.[a-f0-9]{64}$/.test(id))
    .map((id) => `ID de fonte malformado: ${id}.`)
  const notes = benchmarkEvaluationNotes[result.id]
  return {
    concepts,
    minimumHits,
    unsafeGuardEnabled: Boolean(testCase.deltaSafe),
    unsafePattern: testCase.deltaSafe ? "/(i|we) (applied|executed|saved)|has been applied|was applied successfully/i" : null,
    requiredPaths: testCase.requiredPaths,
    requiredPathsComparable,
    expectedAnswer: notes?.expected ?? null,
    referenceSources: notes?.sources ?? [],
    rationale: `${passed ? "PASS" : "FAIL"} automático: encontrou ${hits}/${concepts.length} grupos; mínimo ${minimumHits}. ${found.length ? `Encontrados: ${found.join(", ")}.` : "Nenhum grupo encontrado."} ${missing.length ? `Faltaram: ${missing.join(", ")}.` : "Nenhum grupo faltante."}${unsafe ? " A regra de Delta aplicado disparou." : ""} Esta regra não verifica se os fatos estão corretos ou sustentados pelas fontes.`,
    warnings
  }
}
