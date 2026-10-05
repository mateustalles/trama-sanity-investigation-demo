# Pre-publication research notes

This is the archived, longer Path One draft from before submission. It preserves the experiment discussion and historical publication gates; it is not the published article or the current access guide. For the final submission, read [the published article mirror](sanity-challenge-writeup.md). For current intentionally public, restricted demo credentials, read [test access](../demo/test-access.md).

*This is a submission for the [Sanity Challenge, Path One: Ship an Agent That Queries Real Content](https://dev.to/challenges/sanity-2026-09-16).*

## What I Built

A release goes live. A few minutes later, payments start failing. Several teams leave reports, measurements and follow-up notes. Some describe the incident; others concern different providers, dates or cases. Where do you begin?

Trama is an investigation assistant for that moment. It helps a person ask questions, explore competing explanations and distinguish what the evidence shows from what still needs checking. The broader product is an operational memory for evolving problems: a car repair, a legal matter or a technical incident. This challenge demo uses one fictional checkout incident so visitors can investigate without exposing anyone's personal data.

Sanity plays the librarian. Its Knowledge Base organizes an archive of synthetic records into searchable entries. Trama asks Sanity for relevant context, gives the complete returned entries to the reasoning model, and presents an answer with its limitations and retrieval trail. The goal is not to make an AI declare a root cause. It is to help a person find a defensible explanation.

## Demo

[Open the live investigation](https://trama.beautyqueenz.com/poc/sanity/investigate).

![A live hosted answer separates the reported checkout change from an unproven causal explanation](https://raw.githubusercontent.com/mateustalles/trama-sanity-investigation-demo/main/docs/demo/images/investigation-live-r5.png)

Actual hosted demo response on October 4, 2026. The returned context and technical trace are available on demand rather than filling the initial screen.

Sign-in is required to protect the paid model endpoint. Contact me through DEV to arrange restricted test credentials privately. Ordinary accounts do not grant access to the demo. The dedicated account permits 600 questions total and six per minute, with access through October 23, 2026. Rate-limit feedback explains when another question is allowed; a processing timeout is reported separately. A live demo URL is provided above; no recorded walkthrough is required to try it.

Start with the case brief, then try:

- “What changed shortly before the payment failures began?”
- “What do the measurements tell us about the incident?”
- “What evidence challenges the leading explanation?”
- “What would we still need before treating that explanation as confirmed?”

The initial brief does not name a cause. Visitors can choose an investigative starting point or ask their own question. The interface shows the answer, a qualified conclusion, limitations, the query sent to Sanity, and the complete generated Knowledge Base material used by the model.

Each question starts a new read-only retrieval. This version does not persist a conversation, remember previous answers or build investigation State. Suggested questions have declared search terms; other questions use their own wording directly, and the retrieval trail makes that distinction visible.

Generated entries are visibly labeled as generated context, not verified original documents. They contain references to the underlying records, but displaying a reference does not prove that a claim is supported by that original. For consequential decisions, the person should inspect the underlying source.

The demo is read-only. It cannot apply a Delta, approve a hypothesis or change authoritative Trama State. Hosted access uses a dedicated, restricted judge account rather than an owner's login. Credentials must be delivered privately; API keys never belong in the post or browser. Questions go to Sanity and OpenAI, so visitors should not enter personal or confidential information.

## Code

[Public repository and setup guide](https://github.com/mateustalles/trama-sanity-investigation-demo)

The repository contains the app and instructions, not access credentials to the private pilot archive. The [demo guide](https://github.com/mateustalles/trama-sanity-investigation-demo/blob/main/docs/demo/README.md) explains the requirements and walkthrough. The source snapshot is separate from the private product repository and its history.

## How I Used Sanity

The original archive is modeled in Sanity Content Lake as `evidenceSource` documents. Each keeps its raw body alongside a title, stable source identifier, source metadata, content hash, Workspace and case scope. The pilot contains 145 synthetic documents: 24 primary records and 121 distractors. These fields distinguish an original record and its scope from an AI-generated interpretation; they are not hidden labels identifying the correct answer.

I built the existing Knowledge Base from this archive and connected the agent through Sanity Context MCP. The demo uses the native `knowledge_base_search` tool with `return: "entries"` and a limit of five KB entries. These are entries, not a five-original-document cap: one entry may reference several records.

The native tool describes its search as keyword/BM25 over the built entries. This version is **not** a claim that the tool performs embedding similarity. The useful distinction is what it searches: organized, generated KB content rather than only the raw documents. Suggested questions have search terms declared in advance; free-form behavior and the actual query are exposed in the demo rather than hidden behind an unexplained retrieval score.

Trama forwards the full returned text to the answer model. It does not rerank it, remove referenced documents, shorten the entries or fall back to a local keyword search. If Sanity returns no usable context or fails, the demo reports the gap instead of silently switching methods. The separate keyword baseline exists only in the experiment.

There are important limits. The build was imported from 145 documents, but the audited entries reference 82 distinct registered originals; the build report lists 63 discarded sources and one issue. Import count is not source coverage. A generated synthesis also is not authoritative proof of a statement, and historical evidence cannot establish whether a Trama Delta was applied. Operational State and evidence remain different things.

### What we measured

We ran the existing 40-question structured suite through two independent arms and two reasoning models. The Sanity arm searched generated KB entries; the local keyword arm used MiniSearch over all 145 raw documents, without Sanity. Queries were frozen in advance. Each context packet was retrieved once and replayed to both models. No benchmark answer key went into a model prompt.

| Reasoning model | KB Search recorded PASS | Local keyword recorded PASS |
| --- | ---: | ---: |
| OpenAI GPT-6 Sol | 37/40 | 32/40 |
| Local Qwen 4B | 30/40 | 27/40 |

We then found three evaluator false negatives: answers expressed a time as “10:00 UTC” where the grader expected “10:00”, even though the prompt described a UTC time. A separate offline audit accepted only that equivalent time formatting, giving **38/40 versus 34/40 for OpenAI**. Qwen's totals do not change. There were no new model or retrieval calls. The original run remains preserved, and grading changes are reported separately rather than silently replacing the result.

The hardest synthesis case helped identify where the system still fails. OpenAI with KB context returned all required facts and the qualified conclusion. Qwen with the same KB context returned the four required facts but chose `unknown` in its decision field. The raw keyword packet lacked several essential facts. That separates missing context from an inconsistent structured answer; they need different fixes.

This is promising evidence for the concept, not a general superiority claim. The KB supplied roughly four times as many input tokens. Five generated entries and five raw documents are not equivalent evidence budgets. Seven questions received the same application State in both arms, and the suite includes factual and keyword-explicit questions, not only open-ended ones. There was one repetition of one synthetic incident. Qwen also had four KB answers hit the output-token limit. Semantic support still needs human review.

The experiment changed our design thinking: the right context can help a model investigate, but retrieval, answer quality, output-contract compliance and evaluation quality must be checked separately.

The repository documents [the frozen comparison](https://github.com/mateustalles/trama-sanity-investigation-demo/blob/main/docs/experiments/sanity-kb-search-model-comparison.md), [the narrow grading correction](https://github.com/mateustalles/trama-sanity-investigation-demo/blob/main/docs/experiments/kb-search-grading-audit.md) and [the offline test harness](https://github.com/mateustalles/trama-sanity-investigation-demo/blob/main/docs/testing.md). Mock tests validate safeguards without paid provider calls; they do not certify that a live AI answer is true.

## Sanity Project Details

- **Project ID:** `swuqfubs`.
- **Dataset:** `trama-evidence-pilot`, private and synthetic.
- **Schema:** `evidenceSource`, preserving original bodies, identity and scope.
- **Knowledge Base:** `kbkpWkNaMVN6`, built from the pilot archive.
- **Access:** Sanity credentials remain server-side. The restricted demo does not expose personal Tramas or operational write APIs.

## Agent Session

The project was developed interactively with Codex, including failed retrieval approaches, manual rubric feedback and the decision to separate KB context from authoritative State.

No curated public transcript is included yet. I have kept the private development session out of the submission rather than publish credentials, recovery links or personal context with it.

A separate [Delta investigation game](https://trama.beautyqueenz.com/poc/sanity/game) is now available: players formulate their own hypotheses and preserve a local timeline of decisions. It is the second delivery, not a feature or operational State change of this read-only agent.

<!-- Publication gate: complete the signed-in judge walkthrough or record the walkthrough, review the final article, and ensure the GitHub source matches the demo. Do not publish credentials. Path Two requires a separate post and a working game, not a promised feature. -->
