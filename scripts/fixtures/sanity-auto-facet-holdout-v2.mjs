/** Prospective second holdout, frozen before any semantic search for H08-H14. */
export const autoFacetHoldoutV2 = [
  {
    id: 'H08',
    prompt: 'Which original records establish the September vendor notice time, the checkout timeout deployed just before the incident, and the absence of a fraud-rule publication during the investigated window?',
    gold: ['05-provider-status-update.md','01-deployment-record.md','04-fraud-score-report.md'],
  },
  {
    id: 'H09',
    prompt: 'Distinguish the earlier postal-code migration, the later address support complaint, and the payment-incident postal sample. Which originals belong to each period?',
    gold: ['14-postal-code-migration.md','20-address-support-ticket.md','03-postal-code-sample.md'],
  },
  {
    id: 'H10',
    prompt: 'Separate the historical monitoring Delta, the current payment incident overview, and the checkout release follow-up. Which files establish those three different matters?',
    gold: ['16-monitoring-delta-old.md','00-scenario.md','19-checkout-release-followup.md'],
  },
  {
    id: 'H11',
    prompt: 'Compare the prior Provider B retry study, the current Provider A retry observation, and the later retry dashboard proposal. Which original records should not be conflated?',
    gold: ['22-provider-b-retry-study.md','02-provider-latency-log.md','10-retry-dashboard.md'],
  },
  {
    id: 'H12',
    prompt: 'For fraud evidence, separate the quarterly trend report, incident-window decision comparison, and post-incident tuning proposal. Which three originals serve these roles?',
    gold: ['13-fraud-quarterly-report.md','04-fraud-score-report.md','09-fraud-tuning-proposal.md'],
  },
  {
    id: 'H13',
    prompt: 'Provider A appears in an April status, a July maintenance record, and a September regional latency notice. Identify the original document for each distinct event.',
    gold: ['11-provider-a-april-status.md','06-provider-a-july-maintenance.md','05-provider-status-update.md'],
  },
  {
    id: 'H14',
    prompt: 'How do the prior payment-decline baseline, the investigated event overview, and the Provider A latency measurement differ as evidence? Identify their original records.',
    gold: ['17-payment-decline-baseline.md','00-scenario.md','02-provider-latency-log.md'],
  },
]

if (autoFacetHoldoutV2.length !== 7 || new Set(autoFacetHoldoutV2.map(item=>item.id)).size !== autoFacetHoldoutV2.length || autoFacetHoldoutV2.some(item=>item.gold.length !== 3 || new Set(item.gold).size !== 3)) throw new Error('Invalid second holdout.')
