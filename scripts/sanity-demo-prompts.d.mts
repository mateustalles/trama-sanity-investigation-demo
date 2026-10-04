export interface DemoQuestion {
  readonly id: string
  readonly label: string
  readonly question: string
  readonly query: string
  readonly description?: string
}

export const suggestedQuestions: readonly DemoQuestion[]
export const advancedQuestions: readonly DemoQuestion[]
export function searchQueryForDemoQuestion(question: string): {query: string; mode: 'curated-keywords' | 'verbatim-question'}
