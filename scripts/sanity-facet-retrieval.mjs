export const retrievalPlannerPrompt = `You are a retrieval planner, not an answerer. Return valid JSON with {"task":"short answer operation","facets":["searchable phrase"]}. The task says what to DO with evidence; facets say what evidence to FIND. Copy every facet word from the question or provided scope. Never invent dates, entities, synonyms, or source names. Name distinct concrete evidence targets, not both a hypothesis and the record that tests the same hypothesis. If the question explicitly names records, measurements, or events, prefer those as facets. Each facet must be ONE short phrase with no comma or embedded quote-separated list. Group related terms if there are more than four concepts. Split slash-separated evidence concepts into separate facets. Do not search for generic instructions such as "what mechanism is supported" or "cite records". Use one to four independent facets. Example unrelated to this case: question "Compare engine heat and coolant/thermostat counterevidence. Which mechanism is supported?" -> {"task":"compare and qualify","facets":["engine heat","coolant counterevidence","thermostat counterevidence"]}. Do not answer the investigation.`

export const retrievalSelectorPrompt = 'You are an evidence candidate selector, not an answerer. Choose one or two candidate codes for EACH facet, most likely to contain DIRECT evidence within the investigated scope. Prefer concrete primary observations, measured records, and direct counterevidence over generic guides, drafts, or analogous incidents with a different subject/date. Search rank is not a reliability guarantee. Return only JSON {"selectedCodes":["F1C1","F2C2",...]}, one FLAT list of distinct codes covering every facet. Do not answer the investigation question.'

/** Turn a model's search plan into bounded, independent semantic queries. */
export function parseFacetQueries(content, {maxQueries = 4, sourceQuestion = null} = {}) {
  let plan
  try { plan = JSON.parse(content) } catch { throw new Error('Facet planner did not return JSON.') }
  if (!plan || !Array.isArray(plan.queries)) throw new Error('Facet planner must return a queries array.')
  const rawQueries = plan.queries.map(value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '')
  const seen = new Set()
  const queries = rawQueries.filter(value => {
    const key = value.toLocaleLowerCase('en-US')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (!queries.length || queries.length > maxQueries || queries.some(value => value.length < 3 || value.length > 180 || value.includes(','))) throw new Error('Facet planner returned an invalid query count or length.')
  if (sourceQuestion !== null) {
    const sourceWords = new Set((sourceQuestion.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) ?? []))
    if (queries.some(query => (query.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) ?? []).some(word => !sourceWords.has(word)))) throw new Error('Facet planner invented terms absent from the question.')
  }
  return queries
}

const intentWords = new Set(['what','which','how','when','where','why','compare','explain','identify','cite','answer','question','mechanism','supported','unproven','original','records','part','qual','como','quando','onde','porque','compare','explique','identifique','cite','responda','pergunta','mecanismo','comprovado','registros'])

/** A retrieval plan names searchable aspects, never an answer instruction. */
export function parseRetrievalPlan(content, {question, scopeText = '', maxFacets = 4}) {
  let plan
  try { plan = JSON.parse(content) } catch { throw new Error('Retrieval planner did not return JSON.') }
  if (!plan || !Array.isArray(plan.facets)) throw new Error('Retrieval planner must return facets.')
  const instructionStart = /^(?:what|which|how|when|where|why|compare|explain|identify|cite|answer|qual|como|quando|onde|porque|explique|identifique|responda)\b/i
  let facets = plan.facets.filter(value => typeof value === 'string' && !instructionStart.test(value.trim()))
  const words = text => (text.toLocaleLowerCase('en-US').match(/[\p{L}\p{N}]+/gu) ?? [])
  const slashPairs = [...question.matchAll(/([\p{L}\p{N}]+)\/([\p{L}\p{N}]+)/gu)]
  for (const [,left,right] of slashPairs) {
    facets = facets.flatMap(facet => {
      const tokens = words(facet)
      if (!tokens.includes(left.toLocaleLowerCase('en-US')) || !tokens.includes(right.toLocaleLowerCase('en-US'))) return [facet]
      const slash = new RegExp(`${left}\\s*\\/\\s*${right}`,'i')
      if (slash.test(facet)) return [facet.replace(slash,left),facet.replace(slash,right)]
      return [facet.replace(new RegExp(`\\b${right}\\b`,'i'),''),facet.replace(new RegExp(`\\b${left}\\b`,'i'),'')]
    })
  }
  const queries = parseFacetQueries(JSON.stringify({queries:facets}),{maxQueries:maxFacets,sourceQuestion:`${question} ${scopeText}`})
  if (queries.some(query => !words(query).some(word => !intentWords.has(word)))) throw new Error('A facet contains only answer instructions.')
  for (const [,left,right] of slashPairs) {
    const leftFacets = queries.flatMap((query,index) => words(query).includes(left.toLocaleLowerCase('en-US')) ? [index] : [])
    const rightFacets = queries.flatMap((query,index) => words(query).includes(right.toLocaleLowerCase('en-US')) ? [index] : [])
    if (!leftFacets.length || !rightFacets.length || !leftFacets.some(index => !rightFacets.includes(index))) throw new Error('Slash-separated evidence aspects were not split.')
  }
  return {task:typeof plan.task === 'string' ? plan.task.trim() : '',facets:queries,rawFacets:plan.facets}
}

/** Scores from distinct semantic queries are not comparable; allocate slots round-robin. */
export function fuseFacetCandidates(rankedLists, limit = 10) {
  if (!Array.isArray(rankedLists) || !rankedLists.length || !Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid facet ranking input.')
  const seen = new Set(), selected = []
  const maxRank = Math.max(...rankedLists.map(list => list.length))
  for (let rank = 0; rank < maxRank && selected.length < limit; rank++) {
    for (let facet = 0; facet < rankedLists.length && selected.length < limit; facet++) {
      const candidate = rankedLists[facet][rank]
      if (!candidate) continue
      if (typeof candidate._id !== 'string' || !candidate._id || seen.has(candidate._id)) continue
      seen.add(candidate._id)
      selected.push({...candidate, facet, facetRank: rank + 1})
    }
  }
  return selected
}

/** Reserve a first-ranked candidate for every facet before trusting a small model's picks. */
export function routeRetrievalSources({baseline, facetAnchors = [], facetSelected = [], facetCount, limit = 10}) {
  if (!Array.isArray(baseline) || !Array.isArray(facetAnchors) || !Array.isArray(facetSelected) || !Number.isSafeInteger(facetCount) || facetCount < 1 || !Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid retrieval routing input.')
  const strategy = facetCount >= 3 && facetAnchors.length ? 'multi-facet-with-baseline-fill' : 'whole-question'
  const sources = strategy === 'whole-question' ? baseline : [...facetAnchors, ...facetSelected, ...baseline]
  return {strategy, sources: [...new Set(sources.filter(source => typeof source === 'string' && source))].slice(0, limit)}
}

/** Malformed or partial small-model selections never discard deterministic facet anchors. */
export function parseSelectorCodes(content, allowedCodes, facetCount) {
  if (!Array.isArray(allowedCodes) || !Number.isSafeInteger(facetCount) || facetCount < 1) throw new Error('Invalid selector candidate contract.')
  const empty = () => Array.from({length:facetCount},()=>[])
  try {
    const parsed = JSON.parse(content)
    const codes = Array.isArray(parsed.selectedCodes) ? parsed.selectedCodes : Array.isArray(parsed.selections) ? parsed.selections.flat(Infinity) : []
    const allowed = new Set(allowedCodes)
    if (codes.length > facetCount * 2 || new Set(codes).size !== codes.length || codes.some(code=>typeof code!=='string'||!allowed.has(code))) throw Error('Unknown, duplicate, or excessive candidate codes.')
    const selections = empty().map((_,index)=>codes.filter(code=>code.startsWith(`F${index+1}C`)))
    if (selections.some(group=>group.length>2) || selections.flat().length!==codes.length) throw Error('Candidate codes do not respect facet groups.')
    return {codes,selections,warning:selections.some(group=>!group.length) ? 'One or more facets lacked a model selection; first-ranked facet anchors were retained.' : null}
  } catch(error) { return {codes:[],selections:empty(),warning:`${error.message} Output: ${String(content).slice(0,500)}`} }
}

/** Coverage is a routing judgment over short candidate metadata, not factual proof. */
export function parseCoveragePlan(content, {question, scopeText = '', candidateCodes, maxFacets = 4}) {
  if (!Array.isArray(candidateCodes) || new Set(candidateCodes).size!==candidateCodes.length) throw Error('Invalid coverage candidate codes.')
  let plan
  try { plan = JSON.parse(content) } catch { throw Error('Coverage detector did not return JSON.') }
  if (!plan || !Array.isArray(plan.facets) || plan.facets.some(facet=>!facet || typeof facet.query!=='string' || !['covered','uncertain','missing'].includes(facet.status))) throw Error('Coverage detector returned invalid facets.')
  const parsed = parseRetrievalPlan(JSON.stringify({task:plan.task,facets:plan.facets.map(facet=>facet.query)}),{question,scopeText,maxFacets})
  if (parsed.facets.length!==plan.facets.length) throw Error('Coverage facets must be distinct, atomic search phrases.')
  const allowed = new Set(candidateCodes)
  const facets = plan.facets.map((facet,index)=>{
    const code = facet.candidateCode==='null' ? null : facet.candidateCode
    if (facet.status==='covered' && (typeof code!=='string' || !allowed.has(code))) throw Error(`Covered facet ${index+1} lacks a valid baseline candidate code.`)
    if (facet.status!=='covered' && code!==null && code!==undefined) throw Error(`Uncovered facet ${index+1} must not claim a baseline source.`)
    return {query:parsed.facets[index],status:facet.status,candidateCode:facet.status==='covered'?code:null}
  })
  return {task:parsed.task,facets}
}
