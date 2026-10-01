import {createDemoAdapters, investigateDemoQuestion} from './sanity-demo-agent.mjs'

const examples = {
  synthesis: 'Compare the release timeout change, Provider A latency, and the postal/fraud counterevidence. What mechanism is best supported, what remains unproven, and which original records support each part?',
  separation: 'A Provider A maintenance report from July uses the same vendor name. Should it influence this September incident?',
}
const example = process.argv[2] ?? 'synthesis'
if (!Object.hasOwn(examples, example)) throw new Error('Use synthesis or separation as the smoke-test example.')
const question = examples[example]
const organizationToken = process.env.SANITY_ORGANIZATION_TOKEN
const openAiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_API_KEY
if (!organizationToken || !openAiKey) {
  throw new Error('Set SANITY_ORGANIZATION_TOKEN and OPENAI_API_KEY (or OPEN_API_KEY) in the process environment.')
}

const adapters = createDemoAdapters({
  mcpEndpoint: process.env.SANITY_CONTEXT_PILOT_GROQ_MCP_URL ??
    process.env.TRAMA_BENCHMARK_PILOT_GROQ_MCP_URL ??
    'https://api.sanity.io/v1/context/organizations/o6xohyg5w/mcp/trama-evidence-pilot-groq',
  organizationToken,
  openAiKey,
})
const result = await investigateDemoQuestion(question, adapters)
console.log(JSON.stringify({
  example,
  strategy: result.trace.strategy,
  facets: result.trace.facets,
  sourceIds: result.sources.map(source => source.sourceId),
  citedSourceIds: result.answer.sourceIds,
  conclusion: result.answer.conclusion,
  limitations: result.answer.limitations,
  calls: result.trace.calls.map(({kind, facet, returned, latencyMs}) => ({kind, facet, returned, latencyMs})),
  modelCalls: result.trace.modelCalls,
  missingIds: result.trace.missingIds,
  omittedIds: result.trace.omittedIds,
  totalLatencyMs: result.trace.totalLatencyMs,
}, null, 2))
