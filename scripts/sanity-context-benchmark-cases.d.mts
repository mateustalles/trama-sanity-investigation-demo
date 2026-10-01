export interface BenchmarkCase {
  id: string
  category: string
  prompt: string
  requiredPaths: string[]
  concepts: string[][]
  requiresState?: boolean
  deltaSafe?: boolean
}

export const benchmarkCases: BenchmarkCase[]
export const forbiddenKnowledgeBasePaths: Set<string>
export const benchmarkEvaluationNotes: Record<string, {expected: string; sources: string[]}>
