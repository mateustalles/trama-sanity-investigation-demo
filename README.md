# Trama × Sanity

## Find the evidence. Test the story.

A release goes live. Checkout payments start failing. Was the deployment
responsible, was a provider slow, or is something else hiding in the records?

**You are the investigator.** Ask your own questions, follow the clues, and
inspect the Knowledge Base context behind each explanation.

Trama helps connect the evidence. Sanity's Knowledge Base helps find relevant
context in a noisy archive. The agent explains what the records support—and
what is still unknown.

## What can I do?

- Start with a short case brief.
- Ask a question or choose a suggested starting point.
- Read the answer alongside the complete Knowledge Base context it used.
- Follow up, challenge an explanation, and look for missing evidence.

Try: *“What changed shortly before the payment failures began?”*
Then ask: *“What evidence challenges that explanation?”*

The incident and archive are fictional. Knowledge Base entries are generated
summaries with source references, not independently verified originals. This
demo is read-only: it cannot change your personal data or apply an investigation
decision.

## Try it

[Open the hosted demo](https://trama.beautyqueenz.com/poc/sanity/investigate) ·
[Run it locally](docs/demo/README.md) ·
[Read the project story](docs/experiments/sanity-challenge-writeup.md) ·
[Walkthrough and submission checklist](docs/demo/delivery-one-checklist.md)

The hosted demo requires approved test access; ordinary accounts cannot use
the paid endpoint. Contact the author to arrange restricted credentials privately;
the password handoff is still being finalized. A recorded walkthrough is also
being prepared. Running your own instance requires authorized server-side credentials
and access to the pilot archive; cloning alone does not grant that access.

## Build your own investigation

A separate Delta game is being integrated at `/poc/sanity/game`. Build a
hypothesis, choose evidence, explain your reasoning and preserve each decision
as a step you can later challenge or branch from. Its triangle connects
hypothesis, evidence and rationale; it does not score whether you found the truth.

The game stores its notebook in your browser, not in real Trama State. Six
frozen synthetic source excerpts provide a starting point; optional live
Sanity retrieval adds clearly labeled generated context. Public game deployment
is not yet verified. [Game walkthrough and limits](docs/demo/game.md).

## How do we know it works?

We test the retrieval and answer-handling safeguards with fixed examples,
evaluate real model behavior separately, and manually check whether the
sources support important claims. These are different checks: a passing unit
test is not proof that every AI answer is correct.

[How we test the agent](docs/testing.md) · [Browse the tests](__test__/README.md)

## For builders

[Setup and walkthrough](docs/demo/README.md) ·
[Retrieval architecture](docs/experiments/sanity-live-agent-demo.md)

Please do not submit personal or confidential information. Questions are sent
to Sanity and OpenAI, and live investigations may incur provider charges.
