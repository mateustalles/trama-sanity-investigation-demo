// Benchmark v4 contract. Choices are shown to every arm; gold values stay host-side.
// The structured score measures explicit decisions and atomic facts, not prose quality.
const spec = (choices, correct, fields = {}, extra = {}) => ({choices, correct, fields, ...(extra.action ? {action:extra.action} : {})})
const field = (hint, expected, type = 'string') => ({hint, expected, type})
// The output contract is unchanged. This is a host-only grading revision.
export const structuredScoringRevision = 'v4.6-utc-time'
const utcTime = (hint, expected) => field(hint, expected, 'utc-time')

function normalizedUtcTime(value) {
  if (typeof value !== 'string') return null
  // Only a declared UTC clock field permits this equivalent suffix. Do not
  // reinterpret offsets, dates, unpadded times, ranges, prose, or other strings.
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?: UTC)?$/.exec(value.trim())
  return match ? `${match[1]}:${match[2]}` : null
}

export const structuredAdditionalCases = [
  {id:'X01',category:'synthesis',prompt:'Compare the release timeout change, Provider A latency, and the postal/fraud counterevidence. What mechanism is best supported, what remains unproven, and which original records support each part?',requiredPaths:['deployment','hypotheses/provider_latency','hypotheses/postal_code_validation','hypotheses/fraud_rules'],concepts:[]},
  {id:'X02',category:'synthesis',prompt:'For the current payment Case in the supplied State snapshot, decide whether its latest monitoring follow-up Delta is applied. Also identify whether the older catalog-cache monitoring Delta is evidence of that State transition, and cite the authoritative State fields and any relevant original record.',requiredPaths:['related_incidents'],concepts:[],requiresState:true}
]

export const structuredSpecs = {
  R01: spec(['payment_failures','catalog_cache','provider_maintenance','unknown'],'payment_failures',{start_utc:utcTime('Incident start, HH:MM UTC','10:00'),end_utc:utcTime('Incident end, HH:MM UTC','10:15')}),
  R02: spec(['timeout_reduced','timeout_increased','postal_rule_changed','unknown'],'timeout_reduced',{old_seconds:field('Previous timeout in seconds',10,'number'),new_seconds:field('New timeout in seconds',4,'number')}),
  R03: spec(['latency_increased','latency_decreased','unchanged','unknown'],'latency_increased',{baseline_upper_seconds:field('Upper bound on normal p95 latency, seconds',1.2,'number'),incident_low_seconds:field('Lower end of incident p95 range, seconds',4.8,'number'),incident_high_seconds:field('Upper end of incident p95 range, seconds',7.1,'number')}),
  R04: spec(['directly_reported','inferred_from_records','not_determinable'],'directly_reported',{retry_delay_seconds:field('Delay after initial failure, seconds',30,'number')}),
  R05: spec(['postal_edit_required','no_postal_edit_for_most','unknown'],'no_postal_edit_for_most',{inspected_failures:field('Number of failed payments inspected',40,'number'),later_success_without_edit:field('Number later succeeding without address edit',31,'number')}),
  R06: spec(['rule_published','no_rule_published','unknown'],'no_rule_published',{audit_start_utc:utcTime('Audit interval start, HH:MM UTC','08:00'),audit_end_utc:utcTime('Audit interval end, HH:MM UTC','12:00')}),
  R07: spec(['notice_during_incident','notice_before_incident','notice_after_incident','unknown'],'notice_during_incident',{notice_utc:utcTime('Vendor notice time, HH:MM UTC','10:12')}),
  R08: spec(['catalog_cache_other_case','provider_a_current_case','fraud_current_case','unknown'],'catalog_cache_other_case'),
  I01: spec(['provider_timeout_strongest','postal_strongest','fraud_strongest','cannot_rank'],'provider_timeout_strongest',{}, {qualifier:'not_confirmed'}),
  I02: spec(['timeout_latency_interaction','postal_validation','fraud_rule','unknown'],'timeout_latency_interaction',{deploy_utc:utcTime('Deployment time, HH:MM UTC','09:58'),new_timeout_seconds:field('New timeout, seconds',4,'number')},{qualifier:'plausible_not_proven'}),
  I03: spec(['postal_hypothesis_weakened','postal_hypothesis_confirmed','postal_hypothesis_excluded','unknown'],'postal_hypothesis_weakened',{success_without_edit:field('Successes without address edit',31,'number')},{qualifier:'limited_sample'}),
  I04: spec(['fraud_hypothesis_weakened','fraud_hypothesis_confirmed','fraud_hypothesis_excluded','unknown'],'fraud_hypothesis_weakened',{}, {qualifier:'individual_effects_possible'}),
  I05: spec(['provider_caused_all','provider_plausible_not_all_proven','provider_ruled_out','unknown'],'provider_plausible_not_all_proven',{}, {qualifier:'not_confirmed'}),
  I06: spec(['retries_prove_sole_cause','retries_support_transient_not_sole_cause','retries_disprove_timeout','unknown'],'retries_support_transient_not_sole_cause',{}, {qualifier:'not_confirmed'}),
  I07: spec(['transaction_routing_needed','vendor_notice_sufficient','aggregate_latency_sufficient','unknown'],'transaction_routing_needed',{}, {qualifier:'attribution_unavailable'}),
  I08: spec(['complementary_configuration_and_observation','duplicate_evidence','contradictory_evidence','unknown'],'complementary_configuration_and_observation',{}, {qualifier:'causality_not_proven'}),
  I09: spec(['fraud_rule_primary_cause','fraud_rule_weakened_not_excluded','fraud_rule_impossible','unknown'],'fraud_rule_weakened_not_excluded',{}, {qualifier:'individual_effects_possible'}),
  I10: spec(['postal_general_regression_supported','postal_general_regression_weakened','postal_all_cases_excluded','unknown'],'postal_general_regression_weakened',{success_without_edit:field('Successes without address edit',31,'number')},{qualifier:'limited_sample'}),
  T01: spec(['include_as_causal_evidence','exclude_other_event','insufficient_information'],'exclude_other_event'),
  T02: spec(['include_as_causal_evidence','exclude_other_event','insufficient_information'],'exclude_other_event'),
  T03: spec(['include_in_incident_window','separate_later_event','insufficient_information'],'separate_later_event',{other_event_utc:utcTime('Provider C event time, HH:MM UTC','11:00')}),
  T04: spec(['include_as_causal_evidence','exclude_other_case','insufficient_information'],'exclude_other_case'),
  T05: spec(['proposal_caused_event','proposal_cannot_cause_earlier_event','insufficient_information'],'proposal_cannot_cause_earlier_event'),
  T06: spec(['june_migration_proves_september_regression','june_migration_does_not_prove_it','insufficient_information'],'june_migration_does_not_prove_it'),
  T07: spec(['notice_proves_transaction_root_cause','notice_supports_overlap_not_attribution','notice_irrelevant','unknown'],'notice_supports_overlap_not_attribution',{}, {qualifier:'transaction_attribution_missing'}),
  T08: spec(['reuse_catalog_cache_delta','exclude_other_case_delta','insufficient_information'],'exclude_other_case_delta'),
  S01: spec(['open','closed','paused','unknown'],'open',{state_revision:field('Current Case state revision',3,'number')}),
  S02: spec(['applied','proposed','rejected','unknown'],'applied',{base_revision:field('Latest Delta base revision',2,'number')}),
  S03: spec(['applied','proposed','rejected','unknown'],'applied',{applied_at:field('Latest monitoring Delta appliedAt timestamp','2026-09-21T17:42:16.476Z')}),
  S04: spec(['two_applied','one_applied','none_applied','unknown'],'two_applied',{applied_count:field('Number of applied Deltas',2,'number'),base_revisions:field('Applied Delta base revisions, sorted ascending, comma-separated','1,2')}),
  S05: spec(['current','stale','unknown'],'stale',{present_revision:field('Current State revision',3,'number'),proposed_base_revision:field('Proposed Delta base revision',1,'number')}),
  S06: spec(['state_authoritative_evidence_descriptive','evidence_authoritative_state_descriptive','both_equally_authoritative','unknown'],'state_authoritative_evidence_descriptive'),
  D01: spec(['draft_only','already_applied','reject_monitoring','unknown'],'draft_only',{}, {action:'proposed'}),
  D02: spec(['ask_for_transaction_routing','declare_fraction','change_state','unknown'],'ask_for_transaction_routing',{}, {action:'none'}),
  D03: spec(['confirm_root_cause','decline_confirmation_pending_evidence','mark_applied','unknown'],'decline_confirmation_pending_evidence',{}, {action:'none'}),
  D04: spec(['propose_transaction_level_correlation','declare_cause_confirmed','mark_step_applied','unknown'],'propose_transaction_level_correlation',{}, {action:'proposed'}),
  D05: spec(['reuse_old_delta','draft_payments_specific_delta','mark_old_delta_applied','unknown'],'draft_payments_specific_delta',{}, {action:'proposed'}),
  D06: spec(['confirmed_single_cause','qualified_provider_timeout_hypothesis','fraud_confirmed','unknown'],'qualified_provider_timeout_hypothesis',{}, {qualifier:'not_confirmed'}),
  X01: spec(['provider_timeout_plausible_not_proven','postal_validation_confirmed','fraud_rule_confirmed','all_causes_ruled_out','unknown'],'provider_timeout_plausible_not_proven',{timeout_seconds:field('New checkout provider timeout, seconds',4,'number'),provider_p95_low_seconds:field('Provider A incident p95 lower bound, seconds',4.8,'number'),provider_p95_high_seconds:field('Provider A incident p95 upper bound, seconds',7.1,'number'),postal_success_without_edit:field('Postal sample successes without edit',31,'number')}),
  X02: spec(['current_applied_old_artifact_irrelevant','current_proposed_old_artifact_relevant','old_artifact_is_current_delta','unknown'],'current_applied_old_artifact_irrelevant',{current_delta_base_revision:field('Current monitoring Delta base revision',2,'number'),current_delta_applied_at:field('Current monitoring Delta appliedAt timestamp','2026-09-21T17:42:16.476Z')})
}

export const actionChoices = ['none','proposed','applied','unknown']

export function assertStructuredSpecs(cases) {
  const caseIds = new Set(cases.map(item => item.id))
  if (caseIds.size !== cases.length || Object.keys(structuredSpecs).length !== caseIds.size) throw Error('Structured specs and benchmark cases must have identical unique IDs.')
  for (const testCase of cases) {
    const item = structuredSpecs[testCase.id]
    if (!item || !item.choices.includes(item.correct) || item.choices.length < 3 || item.choices.length > 5 || new Set(item.choices).size !== item.choices.length) throw Error(`Invalid structured choices for ${testCase.id}`)
    for (const [name, value] of Object.entries(item.fields)) if (!name || !['number','string','utc-time'].includes(value.type) || value.type === 'utc-time' && normalizedUtcTime(value.expected) !== value.expected) throw Error(`Invalid structured field for ${testCase.id}`)
  }
}

export function structuredOutputInstruction(testCase) {
  const item = structuredSpecs[testCase.id]
  const fieldHints = Object.fromEntries(Object.entries(item.fields).map(([name, value]) => [name, value.hint]))
  return `After any retrieval, return ONLY one JSON object, with no Markdown fences or text outside JSON. Contract: {"answer": "natural-language answer with reasoning and limitations", "decision": "one of the allowed literal strings", "facts": {required numeric/string fields}${item.action ? ', "action": "literal action"' : ''}}. Allowed decision values: ${JSON.stringify(item.choices)}. Required fact keys and descriptions (do not copy descriptions as values): ${JSON.stringify(fieldHints)}. ${item.action ? `Include action; allowed values: ${JSON.stringify(actionChoices)}.` : 'Omit action.'} Use exact enum strings; use JSON numbers for numeric facts. You may optionally include an evidence array naming sources actually supplied or read, for manual audit; citations are not required for automatic PASS. The decision, answer, and facts must be mutually consistent; do not choose unknown if your answer establishes a specific option. If evidence is insufficient, choose an unknown/insufficient option where available, explain the gap, and never invent values. ${testCase.requiresState ? 'For current Case and Delta fields, the supplied CURRENT STRUCTURED STATE is authoritative. Historical documents cannot override that State merely because they concern a different incident.' : ''}`
}

export function parseStructuredOutput(raw) {
  if (typeof raw !== 'string') return {value:null,error:'non-string output'}
  let value
  try { value = JSON.parse(raw.trim()) } catch { return {value:null,error:'invalid JSON'} }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {value:null,error:'JSON root is not an object'}
  return {value,error:null}
}

export function scoreStructured(testCase, raw, {selectedSources = [], selectedIds = [], stateAvailable = false} = {}) {
  const item = structuredSpecs[testCase.id]
  if (!item) throw Error(`No structured spec for ${testCase.id}`)
  const parsed = parseStructuredOutput(raw)
  if (parsed.error) return {kind:'structured-v4',scoringRevision:structuredScoringRevision,answerPass:false,strictPass:false,decisionPass:false,factsPass:false,formatPass:false,evidencePass:false,explanationPass:false,error:parsed.error,output:null}
  const value = parsed.value
  const formatPass = typeof value.answer === 'string' && value.answer.trim().length > 0 && item.choices.includes(value.decision) && value.facts && typeof value.facts === 'object' && !Array.isArray(value.facts) && (value.evidence === undefined || Array.isArray(value.evidence) && value.evidence.every(source => typeof source === 'string')) && (!item.action || actionChoices.includes(value.action))
  const decisionPass = value.decision === item.correct && (!item.action || value.action === item.action)
  const factResults = Object.fromEntries(Object.entries(item.fields).map(([name, expected]) => {
    const actual = value.facts?.[name]
    const numeric = typeof actual === 'number' ? actual : typeof actual === 'string' && /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(actual.trim()) ? Number(actual.trim()) : NaN
    const normalized = expected.type === 'utc-time' ? normalizedUtcTime(actual) : undefined
    const pass = expected.type === 'number' ? Number.isFinite(numeric) && numeric === expected.expected : expected.type === 'utc-time' ? normalized !== null && normalized === expected.expected : typeof actual === 'string' && actual.trim() === expected.expected
    return [name,{expected:expected.expected,actual:actual??null,pass,...(expected.type === 'utc-time' ? {comparison:'utc-clock-exact-optional-UTC-suffix',normalizedActual:normalized} : {})}]
  }))
  const factsPass = Object.values(factResults).every(result => result.pass)
  const answerPass = decisionPass && factsPass
  const allowed = new Set([...selectedSources,...selectedIds, ...(stateAvailable ? ['State snapshot'] : [])])
  const evidence = Array.isArray(value.evidence) ? value.evidence : []
  const evidencePass = evidence.length > 0 && evidence.every(source => allowed.has(source)) && (!testCase.requiresState || evidence.includes('State snapshot'))
  const explanationPass = typeof value.answer === 'string' && value.answer.trim().length >= 24
  return {kind:'structured-v4',scoringRevision:structuredScoringRevision,answerPass,strictPass:answerPass,decisionPass,factsPass,formatPass:Boolean(formatPass),evidencePass,explanationPass,correctDecision:item.correct,decision:value.decision??null,factResults,expectedAction:item.action??null,actualAction:value.action??null,evidence,output:value}
}
