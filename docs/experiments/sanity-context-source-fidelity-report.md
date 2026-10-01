# Sanity Context Knowledge Base source-fidelity report

Status: draft for Sanity support; not submitted. Observed 2026-09-23.

## Summary

A Knowledge Base built from 24 fictional primary-evidence Markdown files can
serve an entry whose numbered citations point to the wrong source files. A
separate entry mentions a fact from a source absent from that entry's Sources
list. A targeted source-scoped instruction explicitly correcting the two
swapped citations was recognized by the Context Dashboard as contradicting the
entry, but the subsequent one-page rebuild kept the citation mismatch and
reintroduced an unsupported date. These outputs were observed through Sanity
Context's native `knowledge_base_read` MCP tool, before any local Llama model
generated an answer.

This is a suspected source-fidelity defect, not a proven diagnosis of Sanity's
internal cause. The role of the accumulated issue-resolution instructions and
the page-rewrite behavior still needs investigation. We are not treating
`ready` or zero open issues as proof that an entry's claims match its sources.

## Environment and scope

- Sanity CLI: `@sanity/cli/8.12.0`, Node.js `v24.19.0`, Windows x64.
- Organization ID: `o6xohyg5w`.
- Experimental Knowledge Base public ID: `kbesKgcIBIO2`.
- Full rebuild job: `ctx-build-986e2ff5-c2d3-415f-8924-6ad4d40da2f9-1790174181429`.
- Full rebuild revision: `0c3e4fe5-49b5-4070-b9a6-27b252ba7c70`.
- `sanity context imports list kbesKgcIBIO2 --json` returned 24/24 completed
  file imports, named `00-scenario.md` through `23-monitoring-owner-draft.md`.
  `README.md`, which contains evaluation material in the local corpus, is **not**
  imported. No expected answers were included as Knowledge Base sources.
- The original production-connected Knowledge Base and MCP endpoint were not
  changed during this investigation. The examples below concern only the
  experimental base.

## Reproduction and observations

1. Read `candidate_causes/fraud_rules` with the experimental Knowledge Base
   selected in the Context MCP endpoint:

   ```json
   {"knowledgeBase":"kbesKgcIBIO2","paths":["candidate_causes/fraud_rules"]}
   ```

2. Compare the entry's claim and numbered source references. The current
   native MCP response says that a **2026-09-19 unpublished fraud tuning
   proposal** is supported by `[3]`, and that **2026 Q3 aggregate fraud
   trends** are supported by `[4]`. Its Sources list instead names
   `13-fraud-quarterly-report.md` for `[3]` and
   `09-fraud-tuning-proposal.md` for `[4]`. In the Dashboard, opening the
   proposal's Source 3 displays `13-fraud-quarterly-report.md` and a quote
   about Q3 trends, confirming this is not merely a textual formatting issue
   in the MCP response.
3. Check the original files. `09-fraud-tuning-proposal.md` describes the
   unpublished 2026-09-19 proposal; `13-fraud-quarterly-report.md` describes
   the Q3 aggregate trends. The two citations are therefore reversed.
4. In the Dashboard's Instructions view, add a rule scoped to those two source
   files requiring those exact claim-to-file mappings. The Dashboard reports
   that the current fraud entry contradicts the rule and offers to rebuild one
   page. Accept that targeted rebuild. A fresh `knowledge_base_read` still
   returns the same swapped `[3]`/`[4]` mapping.
5. Compare the date claim with `04-fraud-score-report.md`. That source says
   the fraud configuration audit found no publication between 08:00 and 12:00
   UTC but **does not state a calendar date**. One targeted rewrite removed an
   unsupported 2026-09-18 date from the audit sentence; the later source-mapping
   rewrite again dated an 08:00–12:00 observation to 2026-09-18 while citing
   only the undated fraud report. `00-scenario.md` does establish the primary
   incident date of 2026-09-18, but that is a separate contextual source and
   does not itself date the fraud report's audit window.
6. Read `monitoring_and_dashboards`. It mentions an owner draft dated
   2026-09-21, but the entry's Sources list contains only
   `10-retry-dashboard.md`, which is dated 2026-09-18 16:00 UTC. The owner
   draft date is in `23-monitoring-owner-draft.md`, which is imported and cited
   by another Knowledge Base entry. Updating the one entry flagged as stale
   relative to its existing instruction did not add that source citation.

The Dashboard's Issues view showed no pending issues after the rebuild and
targeted rewrites. `sanity context get` reported `openIssueCount: 0` and
`state: ready` after the rewrites; neither signal identified the above
claim-to-citation mismatches. The full rebuild job reported three issues
created during its run, including two critical, but their relationship to the
post-rewrite citation errors is not established.

## Expected behavior

- A numbered citation attached to a claim resolves to the file that actually
  supports that claim.
- A generated entry does not add a date absent from its cited source without
  clearly attributing a separate source or labeling the statement as inference.
- When the Dashboard recognizes a source-scoped instruction/citation conflict
  and offers to rebuild the affected page, the new page either satisfies the
  instruction or surfaces a clear unresolved error.
- A cross-source fact included in an entry is cited to the imported source
  that supports it, or omitted from that entry.

## Impact and current containment

An agent can retrieve the correct entry yet produce an answer with false
provenance because the synthesized entry is already wrong. A benchmark that
scores only final-answer correctness may attribute these failures to retrieval
or Llama reasoning. The experimental Knowledge Base is therefore quarantined
from headline model comparisons; no live endpoint was switched and no new
benchmark was run on these revisions. The integration audit contains the
chronology and source-by-source findings:
[`sanity-context-integration-review.md`](sanity-context-integration-review.md).

## Questions for Sanity

1. Is the `[3]`/`[4]` inversion a known issue in Knowledge Base entry citation
   generation or MCP rendering, especially after a source-scoped page rewrite?
2. Can support inspect the entry and rewrite revisions for this Knowledge Base
   to determine whether the stored citation targets or only their numbering
   are wrong?
3. Why did the Dashboard recognize the explicit source-mapping contradiction
   yet leave it in the rebuilt page without an open issue?
4. Is there a supported API or workflow to verify claim-to-source provenance
   before an entry is exposed to agents, beyond the current Issues queue?
5. Should the unsupported date be handled by a different form of instruction,
   or is it expected that the Knowledge Base may infer it from a separate
   incident record without citing that record?

Before sharing externally, review the organization and Knowledge Base IDs and
the fictional corpus excerpts. Do not include organization tokens, local
`.env.local` contents, endpoint bearer URLs, or private benchmark artifacts.

Relevant Sanity documentation:
[Knowledge Bases](https://www.sanity.io/docs/ai/sanity-context-knowledge-bases),
[Resolve Knowledge Base issues](https://www.sanity.io/docs/ai/sanity-context-resolve-issues),
and [Context MCP tools](https://www.sanity.io/docs/ai/sanity-context-mcp-tools).
