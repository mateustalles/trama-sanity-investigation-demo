# Subject-agnostic Sanity evidence flow — first slice

Status: experimental and read-only against the **existing** 24-source pilot. It does not change the active Trama chat, MCP endpoint, persistence, or authoritative State. No new dataset, Knowledge Base, ingestion, or build is needed for this slice.

## The concept

Trama owns investigation State, uncertainty, Delta proposals, approval, and audit. Sanity Context helps locate evidence in an authorized scope. A generated Knowledge Base entry is a map, not proof. The host accepts only explicit, allowlisted original document IDs from its `Sources` section, reads those originals by scoped exact GROQ, verifies their revision and SHA-256 against an ingestion registry, and gives the model only the original text plus provenance and explicit gaps.

The experimental reader in `scripts/sanity-source-grounded-reader.mjs` has no payment, vehicle, or legal vocabulary. It receives the authorized outline, selected entry keys, a scope-specific source registry, and read-only KB/GROQ adapters. Tests exercise the same flow for fictional car repair, legal filing, and payment records. They also reject invented IDs, out-of-outline paths, cross-scope results, and tampered bodies.

This slice proves that the **retrieval contract** is reusable; it does not prove that the model chooses the right KB entries, that a real multi-domain KB is well built, or that answer quality improves. `scripts/probe-sanity-existing-kb-originals.mjs` connects the reader to the already built pilot KB (`kbhltiJDzx0j`) and its existing GROQ-mode Content Lake endpoint, without writing or printing source bodies. It uses the existing 24-file registry only to verify those originals. The two MCP endpoints expose different modes over the same pilot evidence; the KB endpoint supplies locator IDs, and GROQ reads the exact originals. No user evidence is ingested or exposed.

The first live read-only probe selected five of ten KB index entries for a timeout question. Those entries exposed 12 allowlisted original IDs. Exact GROQ reads verified all 12; the 10-source prompt budget included ten and reported two whole-source omissions. No IDs were unknown, missing, or outside scope. The first probe exposed an ordering problem: the KB source order left `00-scenario.md` and `17-payment-decline-baseline.md` out of the packet. The reader now reuses the pilot's subject-agnostic original ranking *after* exact verification and before packing; the cap and omission report remain. This validates the existing KB-to-original identity route, not the quality of the model answer or source selection under a large corpus.

For auditability, the reader also returns each full Knowledge Base response in a separate `knowledgeBaseResponses` field. The probe prints those full responses for inspection. They are not merged into the `content` packet sent as verified original evidence; generated KB claims remain locator hints rather than primary proof.

## Next integration gates

1. Authorize the workspace, Case, KB endpoint, and original-source registry server-side before showing an outline or executing a read. A shared organization token is not a user authorization boundary.
2. Use the model-facing KB entry-key tool to choose entries, then invoke this reader behind the tool. Record selected keys, IDs, revisions, omissions, and gaps. Never pass generated KB claims as original evidence.
3. Demonstrate the existing KB → GROQ → originals flow end to end with questions and distractors already present in this acervo. Keep raw-full only as an upper bound, not as a viable production architecture. Broader domain coverage can be tested later without replacing this pilot.
4. Keep current Trama State reads and Delta writes on their audited paths. Retrieval alone must never mutate State.
