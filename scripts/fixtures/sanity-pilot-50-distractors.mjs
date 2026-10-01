/** Synthetic, adjacent but non-gold records for the 50-document retrieval stress test. */
const rows = [
  ['d01-provider-a-july-maintenance.md', 'Provider A July maintenance', 'A July 11 Provider A maintenance window affected a different merchant region. It ended before the September checkout release and cannot establish the September incident cause.'],
  ['d02-provider-b-september-timeout.md', 'Provider B September timeout', 'On September 2, Provider B authorization requests timed out during a separate incident. No Provider A requests or September 18 checkout release were involved.'],
  ['d03-provider-c-late-latency.md', 'Provider C later latency', 'Provider C latency increased at 11:00 UTC on September 18, after the investigated 10:00–10:15 UTC payment-failure window.'],
  ['d04-checkout-cache-regression.md', 'Checkout cache regression', 'A September 10 checkout cache regression caused stale product display data, not authorization failures. It was resolved before the payment incident.'],
  ['d05-fraud-tuning-proposal.md', 'Later fraud tuning proposal', 'Risk operations proposed a fraud threshold adjustment on September 19. It was not published during the September 18 incident.'],
  ['d06-postal-migration-june.md', 'June postal-code migration', 'A June migration normalized billing postal codes for a historical customer cohort. It did not ship in the September 18 release.'],
  ['d07-old-monitoring-delta.md', 'Older catalog monitoring follow-up', 'An August 1 catalog-cache Case applied a monitoring follow-up Delta. This is not the current payments Case or its State.'],
  ['d08-provider-a-april-status.md', 'Provider A April status', 'Provider A published an April 4 regional service notice after a scheduled maintenance window. This does not cover September 18.'],
  ['d09-provider-b-retry-study.md', 'Provider B retry study', 'A prior Provider B study found that retries after thirty seconds sometimes succeeded during a different routing experiment. Its sample does not establish outcomes for Provider A in September.'],
  ['d10-merchant-batch-settlement.md', 'Merchant settlement delay', 'A different merchant reported delayed batch settlement on September 18. Authorization was unaffected; settlement happens after checkout.'],
  ['d11-refund-queue.md', 'Refund queue backlog', 'Refund processing was backlogged on September 18 after a worker restart. Refunds do not explain failures to authorize new payments.'],
  ['d12-tax-calculation.md', 'Tax calculation correction', 'A September 15 tax calculation correction changed receipt totals in a staging environment. It was not in the checkout authorization path.'],
  ['d13-checkout-ui-copy.md', 'Checkout retry interface copy', 'The checkout interface changed retry-button wording on September 17. This note documents user-interface copy, not payment-provider latency or authorization outcomes.'],
  ['d14-address-import.md', 'Address import validation', 'A separate address-book import job rejected some malformed postal codes on September 20. It did not validate billing addresses during the September 18 incident.'],
  ['d15-fraud-review-backlog.md', 'Fraud review backlog', 'Manual fraud reviews accumulated on September 16. The backlog concerned review workflow timing rather than new fraud-rule publications.'],
  ['d16-provider-c-routing.md', 'Provider C routing experiment', 'An October routing experiment shifted traffic to Provider C for a small test cohort. It occurred after the September incident.'],
  ['d17-customer-login.md', 'Customer login errors', 'Login errors rose briefly on September 18 at 08:30 UTC. The authentication service recovered before the 10:00 UTC payment-failure window.'],
  ['d18-email-notifications.md', 'Payment email notifications', 'Payment-receipt email delivery lagged on September 18. Email delivery follows authorization and cannot account for checkout timeouts.'],
  ['d19-provider-a-contract.md', 'Provider A contract terms', 'The provider agreement lists a service-latency target and escalation contact. It contains no transaction observations for September 18.'],
  ['d20-postal-code-help.md', 'Postal-code help article', 'A general support article describes accepted postal-code formats for several countries. It is not evidence that rules changed in the September release.'],
  ['d21-fraud-policy-guide.md', 'Fraud policy guide', 'The standing fraud policy describes how approvals, reviews, and declines are classified. It does not record whether rules were published during the incident window.'],
  ['d22-timeout-design-draft.md', 'Old timeout design draft', 'A design draft from August considered reducing provider request timeout from ten to five seconds. It was never deployed.'],
  ['d23-payment-decline-baseline.md', 'Prior payment decline baseline', 'A prior monthly dashboard summarizes payment declines through August. It is not a transaction-level audit of September 18 failures.'],
  ['d24-support-ticket-provider-b.md', 'Provider B support ticket', 'A customer reported a Provider B decline on September 18 at 13:30 UTC. This is outside the investigated window and vendor route.'],
  ['d25-car-repair-note.md', 'Unrelated car repair note', 'A separate synthetic Trama concerns intermittent engine starting after a battery replacement. It has no relationship to checkout evidence.'],
  ['d26-legal-filing-note.md', 'Unrelated legal filing note', 'A separate synthetic Trama concerns a filing deadline and document receipt. It has no relationship to payment authorization.'],
]

export const pilot50Distractors = rows.map(([sourceId, title, body]) => ({sourceId, title, body: `# ${title}\n\n${body}\n`}))
if (pilot50Distractors.length !== 26 || new Set(pilot50Distractors.map(item => item.sourceId)).size !== 26) throw new Error('Expected exactly 26 distinct distractors.')
