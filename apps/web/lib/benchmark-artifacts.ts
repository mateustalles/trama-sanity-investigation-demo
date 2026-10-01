import "server-only"
import {existsSync} from "node:fs"
import {readdir, readFile} from "node:fs/promises"
import path from "node:path"
import {benchmarkRubricForResult, type BenchmarkRubric} from "./benchmark-rubric"
import {retainArtifactResults} from "./benchmark-artifact-selection"

export type BenchmarkArm = "oracle-evidence" | "raw-full" | "raw-bounded" | "raw-scarce" | "sanity-context" | "sanity-guided" | "sanity-outline" | "sanity-index-visible" | "sanity-source-grounded" | "sanity-full-context" | "sanity-full-enum" | "sanity-full-bounded" | "sanity-groq-only" | "sanity-faceted-groq" | "sanity-keyword-only" | "sanity-kb-groq"

export interface LexicalBenchmarkScore {kind?:never; conceptHits: boolean[]; conceptRate: number; retrievalRecall: number | null; sourceIdRecall?: number | null; sourceCitationResolution?: number | null; requiredSourceIds?: string[] | null; citedSourceIds?: string[]; unsafe: boolean; strictPass: boolean; rationale?: {kind:string; hitCount:number; totalGroups:number; minimumHits:number; matchedGroups:Array<{group:number;phrase:string|undefined}>; missingGroups:Array<{group:number;accepted:string[]}>; unsafeGuardTriggered:boolean; referenceAnswer:string|null; referenceSources:string[]; caveat:string}}
export interface StructuredBenchmarkScore {kind:"structured-v4"; scoringRevision?:"v4.5"; answerPass?:boolean; strictPass:boolean; decisionPass:boolean; factsPass:boolean; formatPass:boolean; evidencePass:boolean; explanationPass:boolean; correctDecision?:string; decision?:string|null; factResults?:Record<string,{expected:string|number;actual:unknown;pass:boolean}>; expectedAction?:string|null; evidence?:string[]; output?:unknown; error?:string}

export interface BenchmarkResult {
  run: number
  id: string
  category: string
  prompt: string
  arm: BenchmarkArm
  answer: string
  latencyMs: number
  promptTokens: number
  completionTokens: number
  modelCalls: number
  retrievalMetrics?: {plannerPromptTokens:number; plannerCompletionTokens:number; plannerCalls:number; selectorPromptTokens:number; selectorCompletionTokens:number; selectorCalls:number} | null
  toolCalls: Array<{name: string; arguments: Record<string, unknown>; resolvedPaths?: string[]; candidateIds?: string[]; selectedIds?: string[]; missingIds?: string[]; omittedIds?: string[]; unknownIds?: string[]; revisions?: Array<{_id: string; _rev: string; contentHash: string}>; query?: string; result?: string}>
  selectedSources: string[]
  score: LexicalBenchmarkScore | StructuredBenchmarkScore
  rubric: BenchmarkRubric | null
  numCtx: number
  knowledgeBaseId: string | null
  error?: string
  artifact: string
}

export interface BenchmarkAuditData {
  results: BenchmarkResult[]
  artifacts: Array<{name: string; createdAt: string; arms: string[]; numCtx: number; knowledgeBaseId: string | null; scoring: string}>
}

function repositoryRoot() {
  const candidates = [process.cwd(), path.resolve(process.cwd(), "../.."), path.resolve(process.cwd(), "../../..")]
  return candidates.find((candidate) => existsSync(path.join(candidate, "pnpm-workspace.yaml"))) ?? process.cwd()
}

export async function loadBenchmarkAuditData(): Promise<BenchmarkAuditData> {
  const directory = path.join(repositoryRoot(), "artifacts", "sanity-context-benchmark")
  if (!existsSync(directory)) return {results: [], artifacts: []}
  const names = (await readdir(directory)).filter((name) => /^v[34]-run-.*\.json$/.test(name)).sort()
  const runs = await Promise.all(names.map(async (name) => {
    try {
      const parsed = JSON.parse(await readFile(path.join(directory, name), "utf8")) as {version?:number; scoring?:string; createdAt?: string; arms?: string[]; numCtx?: number; knowledgeBaseId?: string; pilotKnowledgeBaseId?: string | null; requiredPathLabelsComparable?: boolean; results?: Array<Omit<BenchmarkResult, "artifact" | "rubric" | "numCtx" | "knowledgeBaseId">>}
      const results = (parsed.results ?? []).map((result) => ({
        ...result,
        rubric: parsed.version === 4 ? null : benchmarkRubricForResult(result as BenchmarkResult & {score:LexicalBenchmarkScore}, result.arm !== "sanity-groq-only" && result.arm !== "sanity-kb-groq" && (parsed.requiredPathLabelsComparable ?? false)),
        numCtx: parsed.numCtx ?? 0,
        knowledgeBaseId: result.arm === "sanity-groq-only" || result.arm === "sanity-faceted-groq" || result.arm === "sanity-keyword-only" ? null : result.arm === "sanity-kb-groq" ? parsed.pilotKnowledgeBaseId ?? null : parsed.knowledgeBaseId ?? null,
        toolCalls: result.toolCalls.map((call) => call.resolvedPaths
          ? {...call, arguments: {...call.arguments, hostResolvedPaths: call.resolvedPaths}}
          : call)
      }))
      return {name, createdAt: parsed.createdAt ?? "", arms: parsed.arms ?? [], numCtx: parsed.numCtx ?? 0, knowledgeBaseId: parsed.knowledgeBaseId ?? null, scoring:parsed.scoring??"lexical-v3", results}
    } catch { return null }
  }))
  const valid = runs.filter((run): run is NonNullable<typeof run> => Boolean(run)).sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  return {
    results: retainArtifactResults(valid),
    artifacts: valid.map(({name, createdAt, arms, numCtx, knowledgeBaseId, scoring}) => ({name, createdAt, arms, numCtx, knowledgeBaseId, scoring}))
  }
}
