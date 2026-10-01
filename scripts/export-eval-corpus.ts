import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { actionEvalSamples, expectedDecisionById } from "../apps/web/app/evals/samples";
import { expandedActionEvalSamples } from "../apps/web/app/evals/expanded-samples";

const samples = [...actionEvalSamples, ...expandedActionEvalSamples].map((sample) => ({
  ...sample,
  split: sample.split ?? "development",
  locale: sample.locale ?? "pt-BR",
  family: sample.family ?? sample.category,
  variant: sample.variant ?? "canonical",
  provenance: sample.provenance ?? "hand-authored",
  expectedDecision: sample.expectedDecision ?? expectedDecisionById[sample.id],
  evaluation: {
    expected: sample.expected,
    decision: sample.expectedDecision ?? expectedDecisionById[sample.id],
    notes: ""
  }
}));

const output = path.resolve(process.argv[2] ?? "artifacts/evals/trama-action-evals-built-in.json");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ schemaVersion: 3, exportedAt: new Date().toISOString(), source: "built-in-provisional-labels", samples }, null, 2)}\n`, "utf8");
process.stdout.write(`${samples.length} samples exported to ${output}\n`);
