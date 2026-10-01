/**
 * Pre-registered retrieval holdout for the 145-source synthetic payment scope.
 * Questions and exact primary-source IDs were written from the local originals
 * before running semantic retrieval on these questions. Distractor paraphrases
 * are not substitutes for the named original records.
 */
export const autoFacetHoldout = [
  {
    id: 'H01',
    prompt: 'Reconstruct the payment event timeline from the incident overview, checkout deployment, and Provider A latency measurement. Which original records establish the event window, configuration change, and measured slowdown?',
    gold: ['00-scenario.md','01-deployment-record.md','02-provider-latency-log.md'],
  },
  {
    id: 'H02',
    prompt: 'Distinguish Provider A\'s live regional status notice, its incident-time latency observation, and its older July maintenance. Which originals describe the investigated event, and which one is historical?',
    gold: ['05-provider-status-update.md','02-provider-latency-log.md','06-provider-a-july-maintenance.md'],
  },
  {
    id: 'H03',
    prompt: 'Check whether address validation or risk rules explain the checkout failures while accounting for the release note\'s stated scope. Which originals contain the postal sample, fraud publication audit, and deployed change?',
    gold: ['03-postal-code-sample.md','04-fraud-score-report.md','01-deployment-record.md'],
  },
  {
    id: 'H04',
    prompt: 'Compare the Provider B timeout earlier in September, Provider C latency at 11:00, and the investigated payment-failure window. Which original records establish that these are separate events?',
    gold: ['07-provider-b-timeout.md','15-provider-c-latency.md','00-scenario.md'],
  },
  {
    id: 'H05',
    prompt: 'Separate the shipped checkout timeout change from the later timeout follow-up and the later fraud tuning proposal. Which original records distinguish the deployed configuration from proposals?',
    gold: ['01-deployment-record.md','19-checkout-release-followup.md','09-fraud-tuning-proposal.md'],
  },
  {
    id: 'H06',
    prompt: 'Place the vendor status notice beside the Provider A latency and retry observation, then contrast both with the later generic regional note. Which original records support each distinction?',
    gold: ['05-provider-status-update.md','02-provider-latency-log.md','18-provider-a-regional-note.md'],
  },
  {
    id: 'H07',
    prompt: 'Keep the old catalog-cache monitoring Delta, the later monitoring-owner draft, and the current payments latency observation separate. Which original records describe these three different matters?',
    gold: ['16-monitoring-delta-old.md','23-monitoring-owner-draft.md','02-provider-latency-log.md'],
  },
]

if (autoFacetHoldout.length !== 7 || new Set(autoFacetHoldout.map(item=>item.id)).size !== autoFacetHoldout.length || autoFacetHoldout.some(item=>item.gold.length !== 3 || new Set(item.gold).size !== 3)) throw new Error('Invalid pre-registered holdout.')
