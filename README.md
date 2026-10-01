# Trama × Sanity

## Find the evidence. Test the story.

A release goes live. Checkout payments start failing. Was the deployment
responsible, was a provider slow, or is something else hiding in the records?

**You are the investigator.** Ask your own questions, follow the clues, and
inspect the original documents before accepting an explanation.

Trama helps connect the evidence. Sanity helps find it in a noisy archive.
The agent explains what the records support—and what is still unknown.

## What can I do?

- Start with a short case brief.
- Ask a question or choose a suggested starting point.
- Read the answer alongside its original sources.
- Follow up, challenge an explanation, and look for missing evidence.

Try: *“What changed shortly before the payment failures began?”*
Then ask: *“What evidence challenges that explanation?”*

The incident and archive are fictional. This demo is read-only: it cannot
change your personal data or apply an investigation decision.

## Try it

[Get the demo running](docs/demo/README.md) ·
[Read the project story](docs/experiments/sanity-challenge-writeup.md)

This repository contains the app, not a publicly hosted service. Running it
requires authorized server-side credentials and access to the pilot archive.
The setup guide explains the requirements; cloning alone does not grant access.

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
