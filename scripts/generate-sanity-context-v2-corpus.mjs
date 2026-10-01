import {mkdir, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'

const output = resolve(process.cwd(), 'artifacts', 'sanity-context-benchmark-v2', 'sources')
const distractors = [
  ['06-provider-a-july-maintenance.md','July maintenance','2026-07-11 01:00–02:00 UTC','Provider A planned maintenance caused a separate outage. This is not the September checkout incident.'],
  ['07-provider-b-timeout.md','Provider B timeout','2026-09-02 14:00–14:20 UTC','Provider B timeouts occurred before the investigated release and used a ten-second timeout.'],
  ['08-address-format-review.md','Address format review','2026-08-28','A quarterly postal-code formatting review found no production change during September.'],
  ['09-fraud-tuning-proposal.md','Fraud tuning proposal','2026-09-19','A proposed fraud tuning was never published and occurred after the incident window.'],
  ['10-retry-dashboard.md','Retry dashboard','2026-09-18 16:00 UTC','A later dashboard proposal discusses retry metrics but contains no incident root-cause evidence.'],
  ['11-provider-a-april-status.md','Provider A April status','2026-04-03','An historical Provider A incident is unrelated to the September regional latency notice.'],
  ['12-checkout-cache-regression.md','Checkout cache regression','2026-09-10','A resolved cache bug affected product display, not authorization requests.'],
  ['13-fraud-quarterly-report.md','Fraud quarterly report','2026 Q3','Aggregate fraud trends are not evidence of configuration publication in the incident window.'],
  ['14-postal-code-migration.md','Postal-code migration','2026-06-01','A completed migration predates the checkout release by months.'],
  ['15-provider-c-latency.md','Provider C latency','2026-09-18 11:00–11:20 UTC','Provider C latency began after the investigated 10:00–10:15 window.'],
  ['16-monitoring-delta-old.md','Old monitoring Delta','2026-08-01','An applied Delta for a different Case set a catalog-cache alert threshold. Do not attach it to payments.'],
  ['17-payment-decline-baseline.md','Payment decline baseline','2026-09-17','Baseline declines are not equivalent to the checkout timeout spike.'],
  ['18-provider-a-regional-note.md','Provider A regional note','2026-09-18 13:00 UTC','A later regional note contains no transaction-level attribution.'],
  ['19-checkout-release-followup.md','Checkout release follow-up','2026-09-19','A follow-up proposes testing a five-second timeout; it is not proof of the September root cause.'],
  ['20-address-support-ticket.md','Address support ticket','2026-09-20','One later address complaint is outside the sampled incident window.'],
  ['21-fraud-audit-history.md','Fraud audit history','2026-08-01','An older fraud publication is outside the 08:00–12:00 audit window.'],
  ['22-provider-b-retry-study.md','Provider B retry study','2026-08-15','A different provider retry study must not be used to explain Provider A latency.'],
  ['23-monitoring-owner-draft.md','Monitoring owner draft','2026-09-21','A draft owner assignment has not been approved and is unrelated to the Case State.']
]
await mkdir(output, {recursive:true})
for (const [file,title,window,body] of distractors) await writeFile(resolve(output,file), `# ${title}\n\n**Incident/window:** ${window}\n\n${body}\n`)
console.log(output)
