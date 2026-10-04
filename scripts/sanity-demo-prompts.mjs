// The six public starting questions have fixed, human-written native KB keyword
// queries. Free-form questions use their exact wording, with no hidden planner.
export const suggestedQuestions = Object.freeze([
  {id:'timeline',label:'Establish the timeline',description:'Start with the event itself, before looking for a cause.',
    question:'What happened to checkout payments between 10:00 and 10:15 UTC on September 18, 2026?',
    query:'checkout payment incident September 18 2026 timeline failed payments 10:00 10:15 UTC'},
  {id:'change',label:'Look for a change',description:'Find records from just before the failures began.',
    question:'What changed in checkout shortly before the September 18 payment failures began?',
    query:'checkout payment incident September 18 2026 change before failures'},
  {id:'observations',label:'Check a measurement',description:'Inspect an observation that overlaps the failure window.',
    question:'What did the Provider A latency observation record during the 10:00–10:15 UTC checkout failure window?',
    query:'Provider A latency observation 10:00 10:15 UTC September 18 checkout'},
  {id:'alternatives',label:'Test alternatives',description:'Compare two competing explanations in the archive.',
    question:'What do the postal-code and fraud audit records say about alternative explanations for the September 18 payment failures?',
    query:'postal code sample fraud audit counterevidence September 18 checkout'},
])

export const advancedQuestions = Object.freeze([
  {id:'synthesis',label:'Synthesize four evidence threads',
    question:'Compare the release timeout change, Provider A latency, and the postal/fraud counterevidence. What mechanism is best supported, what remains unproven, and which records support each part?',
    query:'checkout payment incident September 18 2026 release timeout Provider A latency postal fraud counterevidence mechanism uncertainty'},
  {id:'separation',label:'Spot a misleading look-alike',
    question:'A Provider A maintenance report from July uses the same vendor name. Should it influence this September incident?',
    query:'Provider A maintenance July September separate payment incident'},
])

const curated = new Map([...suggestedQuestions,...advancedQuestions].map(item => [item.question,item.query]))

export function searchQueryForDemoQuestion(question) {
  const fixed = curated.get(question)
  return {query:fixed ?? question,mode:fixed ? 'curated-keywords' : 'verbatim-question'}
}
