/** Deterministic, synthetic hard negatives; never derived from user Tramas. */
const contexts = [
  {date:'2026-06-04', region:'North', channel:'mobile', owner:'Operations'},
  {date:'2026-07-11', region:'South', channel:'web', owner:'Support'},
  {date:'2026-08-03', region:'West', channel:'partner', owner:'Engineering'},
  {date:'2026-09-02', region:'East', channel:'sandbox', owner:'Risk'},
  {date:'2026-10-06', region:'Central', channel:'batch', owner:'Finance'},
]

const topics = [
  ['provider-a-maintenance','Provider A maintenance','Provider A had a scheduled service window; it is not a transaction trace for the September 18 checkout incident.'],
  ['provider-b-timeout','Provider B timeout','Provider B requests timed out in a separate event; Provider A was not on this route.'],
  ['provider-c-latency','Provider C latency','Provider C response time rose for this cohort, outside the investigated payment window.'],
  ['postal-import','Postal import validation','A customer address import rejected a malformed postal code; checkout billing validation was not involved.'],
  ['address-help','Address format help','This reference explains accepted address formats but records no September 18 deployment or failed payment.'],
  ['fraud-draft','Fraud rule draft','A proposed risk threshold was discussed but not published into the incident-time configuration.'],
  ['fraud-review','Fraud review queue','Manual review wait time increased; this is not evidence of an authorization rule change.'],
  ['retry-study','Retry behavior study','Some retries succeeded after thirty seconds in a different cohort and provider route.'],
  ['timeout-design','Timeout design note','An unshipped design considered changing timeout behavior; no production deployment followed from this note.'],
  ['vendor-status','Vendor status notice','A vendor advisory describes regional service health without merchant transaction-level attribution.'],
  ['monitoring-followup','Monitoring follow-up','A monitoring change belongs to another Case and cannot establish the current payments State.'],
  ['cache-display','Catalog cache display','Stale catalog information affected displayed products, not payment authorization.'],
  ['login-errors','Account login errors','An authentication defect prevented sign-in for a subset of users, not provider authorization.'],
  ['receipt-email','Receipt email lag','Email receipts were delayed after purchases had already been authorized.'],
  ['settlement-delay','Settlement processing delay','Settlement batches completed late after authorization; checkout availability was unaffected.'],
  ['refund-backlog','Refund backlog','Refund processing queued after a worker interruption; new payment requests used another path.'],
  ['tax-adjustment','Tax calculation adjustment','A tax-rate correction changed invoice totals in staging, not provider response latency.'],
  ['vehicle-service','Vehicle service record','A separate fictional Trama concerns a car repair and has no payment-platform evidence.'],
  ['legal-filing','Legal filing record','A separate fictional Trama concerns document filing and has no checkout evidence.'],
]

export const pilot145Distractors = contexts.flatMap((context, contextIndex) => topics.map(([slug,label,observation], topicIndex) => {
  const number = String(contextIndex * topics.length + topicIndex + 1).padStart(3,'0')
  const sourceId = `z${number}-${slug}.md`
  const title = `${label} — ${context.region} ${context.channel}, ${context.date}`
  const body = `# ${title}\n\nRecorded by: ${context.owner}. Scope: fictional ${context.region} ${context.channel} cohort on ${context.date}. ${observation}\n\nThis record is a separate observation; it does not establish the cause, timing, or State of the September 18 10:00–10:15 UTC checkout incident.\n`
  return {sourceId,title,body}
}))

if (pilot145Distractors.length !== 95 || new Set(pilot145Distractors.map(item=>item.sourceId)).size !== 95) throw new Error('Expected exactly 95 distinct synthetic stress records.')
