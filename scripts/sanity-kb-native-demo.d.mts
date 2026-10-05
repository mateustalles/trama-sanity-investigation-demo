export interface NativeDemoAnswer {
  answer: string
  conclusion: string
  limitations: string
  entryRefs: string[]
}

export interface NativeDemoResult {
  question: string
  knowledgeBaseId: string
  answer: NativeDemoAnswer
  model: string
  search: {
    arguments: {knowledgeBase: string; query: string; return: 'entries'; limit: number}
    raw: unknown
    text: string
  }
  trace: {
    queryMode: 'curated-keywords' | 'verbatim-question'
    searchLatencyMs: number
    modelLatencyMs: number
    modelUsage: {inputTokens: number; outputTokens: number} | null
    totalLatencyMs: number
  }
}

export interface NativeDemoAdapters {
  searchKnowledgeBase(input: {knowledgeBase: string; query: string; return: 'entries'; limit: number}): Promise<NativeDemoResult['search']>
  generateJson(input: {stage: string; system: string; user: string; maxOutputTokens: number;format?:Record<string,unknown>}): Promise<{
    model: string
    text: string
    usage: {inputTokens: number; outputTokens: number} | null
    latencyMs: number
  }>
}

export const demoKnowledgeBaseId: string
export function validateNativeDemoQuestion(value: unknown): string
export function investigateNativeKnowledgeBaseQuestion(question: string,adapters: NativeDemoAdapters,
  options?: {knowledgeBaseId?: string}): Promise<NativeDemoResult>
export function createNativeKnowledgeBaseDemoAdapters(config: {
  mcpEndpoint: string
  organizationToken: string
  openAiKey: string
  knowledgeBaseId?: string
  model?: string
  fetchImpl?: typeof fetch
}): NativeDemoAdapters
