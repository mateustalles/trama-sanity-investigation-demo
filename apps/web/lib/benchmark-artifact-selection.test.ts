import {describe, expect, it} from "vitest"
import {resultsForArtifact, retainArtifactResults} from "./benchmark-artifact-selection"

describe("benchmark artifact selection", () => {
  it("preserves duplicate case/arm/repetition keys in separate files", () => {
    const results = retainArtifactResults([
      {name: "older-5120.json", results: [{id: "R02", arm: "raw-full", run: 1, numCtx: 5120, strictPass: true}]},
      {name: "newer-4096.json", results: [{id: "R02", arm: "raw-full", run: 1, numCtx: 4096, strictPass: false}]}
    ])

    expect(results).toHaveLength(2)
    expect(resultsForArtifact(results, "older-5120.json")).toEqual([{
      id: "R02", arm: "raw-full", run: 1, numCtx: 5120, strictPass: true, artifact: "older-5120.json"
    }])
    expect(resultsForArtifact(results, "newer-4096.json")).toEqual([{
      id: "R02", arm: "raw-full", run: 1, numCtx: 4096, strictPass: false, artifact: "newer-4096.json"
    }])
    expect(resultsForArtifact(results, "missing.json")).toEqual([])
  })
})
