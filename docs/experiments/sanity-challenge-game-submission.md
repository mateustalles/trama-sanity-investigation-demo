---
title: "Delta: investigate, connect clues, change your mind"
published: false
tags: devchallenge, sanitychallenge, sanity, ai
---

*This is a submission for the [Sanity Challenge, Path Two: Vibe-Code Something Strange](https://dev.to/challenges/sanity-2026-09-16).*

## What I Built

What if changing your mind created a branch instead of erasing your previous explanation?

Delta is a small investigation game inside Trama. The case is fictional: payments failed for fifteen minutes shortly after a release. Your job is to investigate what happened, connect relevant clues, and decide what you can reasonably conclude.

Each decision is a triangle: **hypothesis, evidence, rationale**. Together they form a Delta—a preserved step in your investigation, not an unquestionable answer.

Sanity helps you find context. The model helps you explain the connection. You decide which clues matter, whether to accept the rationale, and how strong a conclusion you can defend. Confirming a Delta keeps it on the left and opens a new one. You can revisit an earlier step, build a different branch, or contest an assumption without deleting the history.

There is deliberately no magic correctness percentage. A model's assessment of selected material is useful feedback, not proof of the root cause.

## Demo

[Play Delta](https://trama.beautyqueenz.com/poc/sanity/game).

Public, restricted demo login:

- Email: `mateustalles+sanity-judge@gmail.com`
- Password: `Trama-Dw_UxMpBIKPBdOlBotIzA4tng1RM2rDy!`

This account cannot access personal workspaces or apply operational changes. All visitors share **6 live actions per minute and 600 accepted requests total**. Retrieval and model review each count once; selections, confirmed Deltas and branches are local and free.

Try it in a few steps:

1. Choose hypothesis A, B or C around the top sphere.
2. Read and select clues. In the evidence notebook, choose an investigation question and click **Retrieve clues from Sanity →** for additional context.
3. Select the clues you want to connect and click **Explain this connection →** to request a rationale.
4. Adopt or dismiss the proposal, choose your conclusion, and click **Accept my Delta →**.
5. Continue investigating, or return to an earlier Delta and explore another branch.

The [game guide](https://github.com/mateustalles/trama-sanity-investigation-demo/blob/main/docs/demo/game.md) explains full-text reading, provenance, export and reset.

![An accepted Delta stays on the left while a new hypothesis, evidence and rationale triangle is built](https://raw.githubusercontent.com/mateustalles/trama-sanity-investigation-demo/main/docs/demo/images/guided-delta-game-r7.jpg)

![A branch map preserves a contested decision beside an alternative active branch](https://raw.githubusercontent.com/mateustalles/trama-sanity-investigation-demo/main/docs/demo/images/guided-delta-branches-r7.jpg)

## Code

[Source code and setup instructions](https://github.com/mateustalles/trama-sanity-investigation-demo).

## My Build Process

I used Codex to turn an investigation-agent experiment into a visual game. My initial idea was a free-form chat. It could answer questions, but it did not make the player's own reasoning visible.

The important change was the triangle: choose an explanation, connect clues, then examine why that connection might hold. Predefined questions and hypothesis alternatives remove the blank-page problem without letting the model silently choose or accept the player's decision.

Another correction was separating retrieval from reasoning. Retrieving clues makes a native Knowledge Base Search call. It does not ask OpenAI to answer first, and it has no local keyword fallback. Reviewing a selection is a separate model call using only those selected clues.

Sanity returns generated KB context with references. The game presents complete response sections, not invented "original documents." Authenticated, expiring receipts protect retrieved clue bodies from client tampering; they do not certify that a generated interpretation is true.

The deterministic part is the decision graph. Confirming, returning and contesting have offline unit tests. History is preserved, affected branches cannot become valid anchors, and returning to an earlier Delta creates a new branch rather than rewriting the old one. Provider failures and quotas are tested separately from model quality.

The game is intentionally small: synthetic content, browser-local progress, no operational State writes, and a restricted shared account. Six curated source excerpts are initially available; live retrieval adds generated KB context. It is not a hidden-clue puzzle, a multiplayer game or an audited root-cause oracle. I did not use the Sanity App SDK or Workflows in this prototype.

## Sanity Project Details

- Project ID: `swuqfubs`
- Dataset: `trama-evidence-pilot`, with 145 synthetic source records
- Schema: `evidenceSource`, preserving original bodies, identity, provenance and case scope
- Knowledge Base: `kbkpWkNaMVN6`, reused across players
- Retrieval: native `knowledge_base_search`, declared query terms, `return: entries`, `limit: 5`

Five KB entries can reference more than five source files. The native tool searches built KB entries; this game does not claim embedding similarity or use a homemade fallback as if it were Sanity.

## Agent Session

Built interactively with Codex. The build-process section is a curated account, not a fabricated transcript. A public agent-session transcript is not included: the original conversations contain operational setup and need a sensitive-data review before sharing.

<!-- Before publishing: verify the deployed walkthrough, add an actual screenshot/video, review the post, and confirm challenge eligibility. Never include provider keys, owner credentials, recovery links, or private session content. -->
