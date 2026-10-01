import {describe, expect, it} from "vitest"
import {asksForAuthoritativeState, guidedRequests, investigationStateSnapshotQuery, parseKnowledgeBaseOutline, selectKnowledgeBaseEntries} from "./context-mcp-policy"

const outline = `# Knowledge bases
Knowledge base id: \`kb-payments\`

## Payments evidence — Investigation records
3 entries.

incident_overview [core]
  Checkout payment failure event and investigation timeline

hypotheses/fraud_rules [core]
  Fraud configuration audit and rule publication evidence

related_incidents
  Other payment events outside the investigated window

Knowledge base id: \`kb-car\`

## Vehicle records — Repairs and observations
2 entries.

vehicle/electrical [core]
  Car battery replacement, starter symptoms, and electrical diagnosis

vehicle/maintenance
  Garage inspection and maintenance history

Knowledge base id: \`kb-legal\`

## Legal matter — Filings and deadlines
2 entries.

legal/contestacao [core]
  Prazo para contestação, intimação e documentos do processo

legal/evidence
  Provas anexadas e depoimentos`

describe("Sanity Context MCP policy", () => {
  it("uses a fixed bounded State projection", () => {
    expect(investigationStateSnapshotQuery).toContain('stateRevision,status')
    expect(investigationStateSnapshotQuery).toContain('[0...5]')
    expect(investigationStateSnapshotQuery).not.toContain("$params")
  })

  it("parses the live outline, including multiple unrelated Knowledge Bases", () => {
    const entries = parseKnowledgeBaseOutline(outline)
    expect(entries).toHaveLength(7)
    expect(entries[0]).toMatchObject({knowledgeBase: "kb-payments", path: "incident_overview", centrality: "core"})
    expect(entries[3]).toMatchObject({knowledgeBase: "kb-car", path: "vehicle/electrical"})
    expect(entries[5]).toMatchObject({knowledgeBase: "kb-legal", path: "legal/contestacao"})
  })

  it("routes State and related-matter questions without subject names", () => {
    expect(asksForAuthoritativeState("What is the current revision and status?")).toBe(true)
    expect(asksForAuthoritativeState("Compare the evidence from different meetings")).toBe(false)
    expect(asksForAuthoritativeState("Separate a vendor status notice from evidence")).toBe(false)
    expect(guidedRequests(["reconstruct_sequence"], "Does an earlier event belong here?")).toEqual(["separate_related_matters", "reconstruct_sequence"])
    expect(guidedRequests(["reconstruct_sequence"], "What changed immediately before the event?")).toEqual(["reconstruct_sequence"])
  })

  it("selects sources for payments, car repair, and law without configured subject paths", () => {
    const entries = parseKnowledgeBaseOutline(outline)
    expect(selectKnowledgeBaseEntries(entries, "What did the fraud audit find?", ["examine_explanations"], new Set(), 1)[0]).toMatchObject({knowledgeBase: "kb-payments", path: "hypotheses/fraud_rules"})
    expect(selectKnowledgeBaseEntries(entries, "Why does my car have starter symptoms after battery replacement?", ["examine_explanations"], new Set(), 1)[0]).toMatchObject({knowledgeBase: "kb-car", path: "vehicle/electrical"})
    expect(selectKnowledgeBaseEntries(entries, "Qual é o prazo da contestação após a intimação?", ["reconstruct_sequence"], new Set(), 1)[0]).toMatchObject({knowledgeBase: "kb-legal", path: "legal/contestacao"})
    expect(selectKnowledgeBaseEntries(entries, "How should I water tomato seedlings?", ["establish_scope"])).toEqual([])
  })

  it("honors an experimental exclusion list without embedding it in production retrieval", () => {
    const entries = parseKnowledgeBaseOutline(outline)
    expect(selectKnowledgeBaseEntries(entries, "fraud audit", ["check_evidence_boundaries"], new Set(["hypotheses/fraud_rules"]))).toEqual([])
  })

  it("uses analytical roles for a subject-free question and normalizes ordinary plurals", () => {
    const entries = parseKnowledgeBaseOutline(outline)
    expect(selectKnowledgeBaseEntries(entries, "Rank the three candidate explanations from strongest to weakest and justify the ordering.", ["examine_explanations"]).map((entry) => entry.path)).toContain("hypotheses/fraud_rules")
    expect(selectKnowledgeBaseEntries([{knowledgeBase: "kb-retries", path: "observations/retry", description: "Successful retry behavior after an initial failure", centrality: "core"}], "What can successful retries establish?", ["examine_explanations"])).toHaveLength(1)
    expect(selectKnowledgeBaseEntries(entries, "Why is my bicycle chain skipping?", ["examine_explanations"])).toEqual([])
  })
})
