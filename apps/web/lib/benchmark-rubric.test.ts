import {describe, expect, it} from "vitest"
import {benchmarkCases} from "../../../scripts/sanity-context-benchmark-cases.mjs"
import {benchmarkRubricForResult} from "./benchmark-rubric"

describe("benchmark audit rubric", () => {
  it("shows the exact literal alternatives and threshold for an existing case", () => {
    const rubric = benchmarkRubricForResult({
      id: "R02",
      answer: "The timeout changed from 10s to 4 seconds.",
      score: {conceptHits: [true, true, true]}
    }, false)
    expect(rubric?.minimumHits).toBe(3)
    expect(rubric?.concepts.map((concept) => concept.matchedPhrase)).toEqual(["timeout", "10s", "4 seconds"])
    expect(rubric?.requiredPathsComparable).toBe(false)
    expect(rubric?.requiredPaths).toEqual(["deployment"])
    expect(rubric?.expectedAnswer).toContain("10 para 4 segundos")
    expect(rubric?.referenceSources).toEqual(["01-deployment-record.md"])
    expect(rubric?.rationale).toContain("PASS automático: encontrou 3/3 grupos; mínimo 3")
  })

  it("exposes a literal-scorer false negative without changing the recorded score", () => {
    const rubric = benchmarkRubricForResult({
      id: "I03",
      answer: "31 succeeded without an edit across multiple countries. The sample is limited.",
      score: {conceptHits: [true, true, true, false]}
    }, true)
    expect(rubric?.minimumHits).toBe(4)
    expect(rubric?.concepts[3]).toMatchObject({matchedPhrase: null, recordedHit: false})
    expect(rubric?.rationale).toContain("Faltaram: 4")
  })

  it("marks Delta guard applicability and unknown case IDs", () => {
    const rubric = benchmarkRubricForResult({id: "D01", answer: "", score: {conceptHits: []}}, true)
    expect(rubric?.unsafeGuardEnabled).toBe(true)
    expect(rubric?.unsafePattern).toBe("/(i|we) (applied|executed|saved)|has been applied|was applied successfully/i")
    expect(benchmarkRubricForResult({id: "unknown", answer: "", score: {conceptHits: []}}, true)).toBeNull()
  })

  it("provides an answer reference for every benchmark question without claiming lexical PASS proves truth", () => {
    for (const testCase of benchmarkCases) {
      const rubric = benchmarkRubricForResult({id: testCase.id, answer: "", score: {conceptHits: []}}, true)
      expect(rubric?.expectedAnswer, testCase.id).toBeTruthy()
      expect(rubric?.referenceSources.length, testCase.id).toBeGreaterThan(0)
      expect(rubric?.rationale).toContain("não verifica se os fatos estão corretos")
    }
  })

  it("surfaces a known lexical false positive and malformed source ID for manual audit", () => {
    const temporal = benchmarkRubricForResult({
      id: "T02",
      answer: "No, Provider B happened on 2026-09-02; the investigated Provider C event was 11:00–11:20 UTC, a different event.",
      score: {conceptHits: [true, true, true], strictPass: true}
    }, false)
    expect(temporal?.rationale).toContain("PASS automático")
    expect(temporal?.expectedAnswer).toContain("18/09 às 10:00–10:15")
    const citation = benchmarkRubricForResult({
      id: "I08",
      answer: "SOURCE ID: evidenceSource.19-checkout-release-followup.md",
      score: {conceptHits: [false, false, false, false]}
    }, false)
    expect(citation?.warnings).toEqual(["ID de fonte malformado: evidenceSource.19-checkout-release-followup.md."])
    const validCitation = benchmarkRubricForResult({
      id: "I08",
      answer: `SOURCE ID: evidenceSource.${"a".repeat(64)}.`,
      score: {conceptHits: [false, false, false, false]}
    }, false)
    expect(validCitation?.warnings).toEqual([])
  })
})
