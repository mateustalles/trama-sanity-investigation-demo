---
title: "Delta is an investigation game where you can change your mind"
published: false
tags: devchallenge, sanitychallenge, sanity, ai
---

*This is a submission for the [Sanity Challenge, Path Two: Vibe-Code Something Strange](https://dev.to/challenges/sanity-2026-09-16).*

## What I Built

What if an investigation game did not ask you to guess a password or select the answer the designer wanted? What if the interesting part was seeing how your explanation changed?

Delta is a player-led investigation board for a fictional checkout incident. Payments started failing after a nearby release. Several reports seem relevant; one older outage mentions the same provider. You choose a hypothesis, select evidence, explain the link and decide what you can conclude.

The central visual is a triangle with three floating orbs: hypothesis, evidence and rationale. Accept a Delta and that step becomes the smaller triangle on the left. A new draft takes the center. Below it, a branch map preserves your earlier decisions rather than rewriting what you once believed.

The board is deliberately not a root-cause oracle. Its feedback checks whether you supplied the required parts, not whether your answer is true. You can conclude a branch, reopen it through a new step, return to an earlier decision or contest an assumption. Changing your mind becomes visible history instead of a deleted message.

## Demo

[Open the Delta game](https://trama.beautyqueenz.com/poc/sanity/game). It shares the protected application with the separate [read-only investigation agent](https://trama.beautyqueenz.com/poc/sanity/investigate). Contact me through DEV to arrange restricted review access privately; password handoff is being finalized. No provider key is needed in the browser.

![A preserved D03 triangle beside the new D04 draft, with hypothesis, evidence and rationale orbs](https://raw.githubusercontent.com/mateustalles/trama-sanity-investigation-demo/main/docs/demo/images/delta-progression.jpg)

Local production-build capture: an accepted Delta becomes the smaller triangle and a fresh draft takes the center. The game is now hosted, but this screenshot was taken locally.

![D01 branches to a contested D02 and the active D03 without deleting history](https://raw.githubusercontent.com/mateustalles/trama-sanity-investigation-demo/main/docs/demo/images/delta-branches.jpg)

Local production-build capture: the earlier branch remains visible after it is contested; D03 stays active.

The walkthrough will show one accepted Delta becoming the past, a new draft being built, a live Sanity question contributing context and an alternative branch preserving the old explanation. [The game guide](https://github.com/mateustalles/trama-sanity-investigation-demo/blob/main/docs/demo/game.md) describes the controls and limits. Approved test access is required for live provider calls; credentials and API keys are not part of the post.

## Code

[Trama and Sanity investigation demo](https://github.com/mateustalles/trama-sanity-investigation-demo)

The game is a separate Next.js route. Its browser-local model represents Deltas as nodes with parent references and decision events as an ordered history. Sanity-backed investigation is a read-only server route. The game has no direct operational database writes and does not apply real Trama Deltas.

## My Build Process

I built with Codex, starting from Trama's read-only investigation agent. The first delivery answered questions over Sanity context. For the second, I wanted the person to own the hypothesis and the decision rather than merely accept an AI-generated story.

My design instructions, paraphrased from the development conversation, were:

- Let the player formulate their own hypotheses rather than pick a prescribed explanation.
- Show the previous Delta as a small triangle and the current draft as a larger triangle, with hypothesis, evidence and rationale orbs.
- Keep a timeline and let the player return to an earlier Delta to create another branch.

That correction mattered. An earlier direction risked turning the game into a guided answer selector. I also initially imagined an agent telling the player how close a Delta was to the correct result. The MVP does not claim that capability: without an audited truth evaluator, a confidence meter would make the interface look more certain than the system is. Completeness feedback is narrower but honest.

I separated the game operations from inference. Accepting a Delta validates player-entered fields and evidence references. Returning to a node appends an event and changes the branch point; it does not remove later nodes. Contesting an ancestor preserves descendants but prevents their use as an uncontested branch point. A concluded branch can become open again through a new accepted Delta. These transitions can be checked with deterministic fixtures instead of asking an LLM to invent state changes.

The evidence notebook begins with six curated source excerpts from the frozen synthetic corpus. It is not the full archive and does not pretend that those excerpts were retrieved live. That makes the basic interaction usable without a model request, but also makes this a reasoning-board prototype rather than a strict hidden-clue puzzle.

Sanity becomes useful when the player asks for more context. The live agent calls native `knowledge_base_search` on the existing KB, passes its complete response to OpenAI and shows the answer alongside limitations. The player can keep the complete generated context in the notebook and choose it as material for a Delta. Nothing is accepted automatically.

This uses Sanity's built KB content, not a new keyword index authored by the game. The native tool describes BM25 search over generated entries; I am not claiming embedding similarity in this route. Generated context stays visibly different from original excerpts and is not certified proof. The player still has to articulate why it matters.

The MVP does not use Sanity App SDK or Workflows. Its accepted notebook and event history live in browser storage, not a Sanity workflow or authoritative Trama State. That is a deliberate boundary for a small demonstration; persistent multi-user investigations would need a separate authorization, provenance and audited-transition design.

There are practical limits too. Drafts are not persisted. Local storage is shared by users of the same browser origin and can be cleared. JSON export preserves the notebook, but there is no import control. A complete Delta can be wrong, and an AI response can misinterpret the KB. The live question consumes provider quota and must not contain personal data.

The integration passed 242 offline tests (167 Vitest and 75 Node script tests), typecheck and the local production build. The browser walkthrough accepted D01, concluded D02, returned to D01 to create an open sibling D03, then contested D02 without moving the active D03 branch. Reload restored the same head and five events. A responsive check at 375 pixels found no wider document than the viewport. These checks verify behavior, not the truth of a player's hypothesis.

The six starting excerpts were compared paragraph by paragraph with the frozen corpus, with zero mismatches. JSON export was verified by parsing the actual downloaded notebook: version 1, active D03, three Deltas, five events and six evidence items. The automation's download-event wait timed out, but the output existed and was checked rather than treating that timeout as the result.

The Linux production build passed too. The hosted game returned HTTP 200 for the restricted judge and redirected an anonymous visitor. Game POST and unrelated operational API requests were denied with 403. The shared native investigation API returned 200 with the full 14,093-character response and an OpenAI answer. This was an HTTP check, not a browser interaction with the game's live-context controls.

The optional live request has not yet been exercised through the game browser. The reset confirmation could not be exercised by automation, so it is not claimed as an end-to-end pass. Password-form testing and private credential handoff also remain pending. The first-delivery benchmark and agent smoke do not substitute for them.

## Sanity Project Details

- **Project ID:** `swuqfubs`.
- **Dataset:** `trama-evidence-pilot`, private and synthetic, with 145 original records in the research archive.
- **Schema:** `evidenceSource`, keeping original bodies, identity, provenance and case scope.
- **Knowledge Base:** `kbkpWkNaMVN6`, the existing pilot build used by the optional live agent.
- **Game content:** six frozen source excerpts are shipped locally; generated KB material is retrieved only when the player asks. No KB is rebuilt per player.
- **Write boundary:** game history is browser-local. No real Trama Case is approved, closed or reopened by a game action.

## Agent Session

The project was developed interactively with Codex. No curated public transcript is included yet; the private session contains operational setup and must be reviewed before sharing. The design corrections above summarize the relevant decisions without claiming to be a verbatim transcript.

<!-- Path Two publication gate: review the final post; confirm included local screenshots are accessible in the public repository; privately arrange restricted review access and finish credential handoff. Keep Path One as its own post. Do not publish provider keys, passwords or recovery links. -->
