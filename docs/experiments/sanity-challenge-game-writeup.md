---
title: "Delta: an investigation game where changing your mind creates a branch"
published: false
tags: devchallenge, sanitychallenge, sanity, ai
---

*This is a submission for the [Sanity Challenge, Path Two: Vibe-Code Something Strange](https://dev.to/challenges/sanity-2026-09-16).*

## What I Built

An explanation should be something you can revisit, not a message that vanishes when you change your mind.

Delta is an investigation board for a fictional checkout incident. A release happened near fifteen minutes of failed payments. Did a shorter timeout interact with provider latency? Did postal-code validation reject legitimate attempts? Did a fraud-rule change play a role?

You choose an explanation around a floating hypothesis orb, ask predefined investigative questions, and select clues around the evidence orb. A third orb invites the model to propose a rationale using only your selected material. You decide whether to adopt it and how strong a conclusion you can defend.

Accept a Delta and it becomes the smaller triangle on the left. A fresh draft takes the center. Return to an earlier decision to create a branch, or contest an assumption without deleting the history built on it. You can conclude a branch and reopen it when new evidence appears.

This is not a root-cause oracle or a percentage-correct meter. The model assesses support in your selection and explains limits. The player owns every accepted step.

## Demo

[Play the Delta game](https://www.apptrama.com/poc/sanity/game).

Use the [public restricted test login](https://github.com/mateustalles/trama-sanity-investigation-demo/blob/main/docs/demo/test-access.md). It grants demo access, not personal workspaces or provider keys. All visitors share six live actions per minute and 600 accepted requests total. Retrieving clues and requesting a rationale each count once; local decisions and branches are free.

A quick walkthrough:

1. Choose hypothesis A, B or C.
2. Read and select relevant records. Choose **Establish the timeline** or **Test alternatives**, then retrieve more context from Sanity.
3. Select clues and click **Explain this connection**. Read the rationale, limitations and next suggested check.
4. Adopt or dismiss the proposal, choose a qualified conclusion, and accept your Delta.
5. Build another step. Return to the first Delta, make a different choice, and preserve both branches.

The [full game guide](https://github.com/mateustalles/trama-sanity-investigation-demo/blob/main/docs/demo/game.md) explains provenance, quotas, export and reset.

![A preserved D03 and current D04 with hypothesis alternatives and orbiting selected clues](https://raw.githubusercontent.com/mateustalles/trama-sanity-investigation-demo/main/docs/demo/images/guided-delta-game-r7.jpg)

Actual hosted interface: the earlier Delta stays on the left, while the next one is built through the three orbs.

![A branch map preserves a contested D02 beside the active sibling D03](https://raw.githubusercontent.com/mateustalles/trama-sanity-investigation-demo/main/docs/demo/images/guided-delta-branches-r7.jpg)

## Code

[Public source and setup instructions](https://github.com/mateustalles/trama-sanity-investigation-demo).

The game is a separate Next.js route. Its Delta graph and ordered events live in browser storage. Server-side endpoints retrieve clues and propose a rationale; neither applies a real Trama Delta or writes operational investigation State.

## My Build Process

I built this with Codex, starting from the separate read-only Trama Investigator. My first idea was a chat-driven investigation. I wanted a triangle with three floating orbs and a history of evolving decisions, but asking players to compose every field produced a blank-page problem.

I changed the interaction: predefined questions, hypothesis alternatives and conclusion strengths. The player's meaningful choice is which material to connect and what they are willing to conclude. The model can propose the rationale, but cannot silently take over that choice.

Another important correction was separating retrieval from reasoning. A question now makes one native Sanity KB Search call and adds the returned context to the notebook, without making an OpenAI answer call first. A separate review sends only the selected clues to OpenAI with a strict structured-output contract.

The native response is Markdown with generated sections and source references. I did not relabel these as original documents. Presentation cards use its explicit section boundaries, preserve every character, and leave the full response inspectable. Five requested KB entries are not necessarily five original source files.

Live clues have authenticated, expiring receipts. Frozen excerpts resolve from host-owned text. A modified clue cannot pass as retrieved context, and a review cannot cite an item outside the selected set. These controls protect the input boundary; they do not certify that generated claims are true.

The deterministic part is the Delta lifecycle. Accepting validates required fields and references. Returning appends an event and changes the branch point without deleting descendants. Contesting an ancestor preserves affected steps but prevents them from anchoring new active reasoning. A new Delta can reopen a player-concluded branch.

Earlier valid notebooks remain readable. Drafts and pending proposals are not saved; accepted rationale and history are. Provider failures preserve selections, and the interface distinguishes search timeout, model timeout and quota cooldown. There are no automatic paid retries.

The implementation passed 277 offline tests—193 Vitest tests and 84 script tests—plus workspace typecheck and Windows/Linux production builds. A local browser walkthrough concluded and reopened branches. The hosted walkthrough retrieved five generated sections, explicitly adopted a model proposal, branched from D01 and contested D02 without deleting either sibling. Reload restored active D03, five events and eleven clues; JSON export was inspected. Mobile inspection found a checkbox layout bug, which was fixed and checked at 375 pixels without horizontal overflow.

A live review of three selected records returned support with causal qualifications in 5.3 seconds. A different selection contradicted the postal-change hypothesis in 3.6 seconds, instead of trying to justify it. These are small behavior checks, not an accuracy benchmark or proof that all model assessments are correct. Complete provenance and deployment checks are recorded in the guide.

The game remains a small browser-local reasoning prototype. Six frozen synthetic excerpts are visible from the start, so it is not a strict hidden-clue puzzle. There is no audited win condition, multi-user synchronization, Sanity App SDK or Workflows integration. A complete Delta can still be wrong, and generated evidence can mislead.

## Sanity Project Details

- **Project ID:** `swuqfubs`.
- **Dataset:** `trama-evidence-pilot`, private and synthetic, with 145 original research records.
- **Schema:** `evidenceSource`, retaining original bodies, identity, provenance and case scope.
- **Knowledge Base:** `kbkpWkNaMVN6`, the existing pilot build. No KB is rebuilt per player.
- **Retrieval:** native `knowledge_base_search`, declared query terms, `return: entries`, `limit: 5`. No local keyword fallback.
- **Model:** server-side OpenAI for selected-evidence review, not for accepting Deltas.
- **Writes:** game history is browser-local; the shared account's live request usage is metered server-side.

The native KB tool describes BM25 search over its generated entries. I am not claiming embedding similarity in this game route. Sanity's value here is its built, organized context and native retrieval—not a homemade keyword index disguised as a Sanity feature.

## Agent Session

Developed interactively with Codex. The build decisions above are a curated summary, not a verbatim transcript. No public transcript is included yet: the development sessions contain operational setup and need a sensitive-data review before sharing.

<!-- Publication gate: author reviews and publishes this post, adds verified current screenshots/video, and confirms challenge eligibility. Never publish provider keys, owner credentials or recovery links. -->
