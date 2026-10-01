import { describe, expect, it } from "vitest";
import { actionEvalSamples, expectedDecisionById } from "./samples";
import { expandedActionEvalSamples } from "./expanded-samples";

const samples = [...actionEvalSamples, ...expandedActionEvalSamples];

describe("Action evaluation corpus", () => {
  it("keeps IDs unique and every sample labeled", () => {
    expect(new Set(samples.map((sample) => sample.id)).size).toBe(samples.length);
    for (const sample of samples) expect(sample.expectedDecision ?? expectedDecisionById[sample.id]).toBeTruthy();
  });

  it("requires structured metadata on the expanded corpus", () => {
    for (const sample of expandedActionEvalSamples) {
      expect(sample.family).toBeTruthy();
      expect(sample.variant).toBeTruthy();
      expect(sample.locale).toMatch(/^(pt-BR|en-US)$/);
      expect(sample.provenance).toBeTruthy();
    }
  });

  it("does not leak contrastive pairs across development and holdout", () => {
    const splitsByPair = new Map<string, Set<string>>();
    for (const sample of expandedActionEvalSamples.filter((item) => item.pairId)) {
      const splits = splitsByPair.get(sample.pairId!) ?? new Set<string>();
      splits.add(sample.split ?? "development");
      splitsByPair.set(sample.pairId!, splits);
    }
    for (const splits of splitsByPair.values()) expect(splits.size).toBe(1);
  });
});
