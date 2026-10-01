export interface DemoSource {
  id: string
  sourceId: string
  title: string
  revision: string
  contentHash: string
  sourceTimestamp: string | null
  body: string
  claimedByAnswer: boolean
}

export interface DemoResult {
  question: string
  scope: {workspaceId: string; scopeId: string}
  answer: {answer: string; conclusion: string; limitations: string; sourceIds: string[]}
  model: string
  sources: DemoSource[]
  trace: {
    strategy: string
    facets: string[]
    plannerWarning: string | null
    selectorWarning: string | null
    candidates: Array<{facet: string; items: Array<{code: string; id: string; sourceId: string; rank: number}>}>
    selectedCodes: string[]
    baselineIds: string[]
    keywordCandidates: Array<{id: string; sourceId: string}>
    requestedIds: string[]
    selectedIds: string[]
    missingIds: string[]
    omittedIds: string[]
    calls: Array<{kind: string; facet: string | null; query: string; returned: number; latencyMs: number}>
    modelCalls: Array<{stage: string; model: string; usage: {inputTokens: number; outputTokens: number} | null; latencyMs: number}>
    totalLatencyMs: number
  }
}

export interface DemoAdapters {
  groqRows(query: string): Promise<unknown[]>
  generateJson(input: {stage: string; system: string; user: string; maxOutputTokens: number}): Promise<{
    model: string
    text: string
    usage: {inputTokens: number; outputTokens: number} | null
    latencyMs: number
  }>
}

export const demoScope: Readonly<{workspaceId: string; scopeId: string}>
export function validateDemoQuestion(value: unknown): string
export function parseGroqResult(text: string): unknown[]
export function verifyDemoOriginals(ids: string[], documents: unknown[]): {documents: unknown[]; missingIds: string[]}
export function investigateDemoQuestion(question: string, adapters: DemoAdapters): Promise<DemoResult>
export function createDemoAdapters(config: {
  mcpEndpoint: string
  organizationToken: string
  openAiKey: string
  model?: string
  fetchImpl?: typeof fetch
}): DemoAdapters
