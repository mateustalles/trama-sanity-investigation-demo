import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { actionDecisionValues, actionEvalSystemPrompt, actionInterviewEvalSystemPrompt, validatesHumanReviewedInteraction, type ActionDecision, type ActionEvalDecision } from "./action-language-policy";
import { buildEvalContextMock, formatEvalContext, type ActionEvalContextMock } from "./eval-context";

interface ExportedSample {
  id: string; category: string; message: string; context: string; expected: string;
  family?: string; variant?: string; locale?: "pt-BR" | "en-US"; provenance?: string; pairId?: string;
  split?: "development" | "holdout"; expectedDecision?: ActionDecision;
  contextMock?: ActionEvalContextMock;
  evaluation?: { expected?: string; decision?: ActionDecision; notes?: string; rating?: number };
}

interface EvalResult {
  id: string; split: "development" | "holdout"; category: string; message: string;
  family: string; variant: string; locale: "pt-BR" | "en-US"; pairId: string | null;
  contextMock: ActionEvalContextMock; expected: ActionDecision; expectedBehavior: string;
  userNotes: string; decision: ActionEvalDecision | null; rawDecision: string | null;
  contractValid: boolean; passed: boolean;
  interactionValid: boolean;
  error: string | null; durationMs: number;
}

const expectedById: Record<string, ActionDecision> = {
  "action-001": "record_step", "action-002": "record_step", "action-003": "record_step",
  "action-004": "set_waiting", "action-005": "set_waiting", "action-006": "set_waiting",
  "action-007": "clarify", "action-008": "complete_action", "action-009": "complete_action",
  "action-010": "complete_action", "action-011": "clarify", "action-012": "clarify",
  "action-013": "complete_action", "action-014": "change_topic", "action-015": "change_topic",
  "action-016": "multiple_updates", "action-017": "record_step", "action-018": "reschedule",
  "action-019": "complete_action", "action-020": "clarify"
};

function argument(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const model = argument("model", "deepseek-r1:8b")!;
const input = argument("input");
const baseUrl = argument("base-url", "http://127.0.0.1:11434")!.replace(/\/$/, "");
const useThinking = process.argv.includes("--think");
const limit = Number(argument("limit", "0"));
const timeoutMs = Number(argument("timeout-ms", "180000"));
const useJsonMode = process.argv.includes("--json-mode");
const useRails = process.argv.includes("--rails");
const requestedSplit = argument("split");
const policy = argument("policy", "baseline");
if (!['baseline', 'interview'].includes(policy!)) throw new Error("Use --policy baseline or --policy interview.");
if (!input) throw new Error("Use --input <path-to-exported-evals.json>.");

const source = JSON.parse(await readFile(path.resolve(input), "utf8")) as { samples?: ExportedSample[] };
const eligibleSamples = (source.samples ?? []).filter((sample) => {
  const split = sample.split ?? "development";
  const hasLabel = Boolean(sample.evaluation?.decision ?? sample.expectedDecision ?? expectedById[sample.id]);
  return sample.evaluation?.rating !== 0 && hasLabel && (!requestedSplit || requestedSplit === split);
});
const samples = limit > 0 ? eligibleSamples.slice(0, limit) : eligibleSamples;
const decisionSchema = {
  type: "object", additionalProperties: false,
  required: ["decision", "target", "operations", "question", "reply"],
  properties: {
    decision: { type: "string", enum: actionDecisionValues },
    target: { type: ["string", "null"] },
    operations: { type: "array", items: { type: "string" } },
    question: { type: ["string", "null"] },
    reply: { type: "string" }
  }
};

const results: EvalResult[] = [];
const outputDirectory = path.resolve("artifacts/evals");
await mkdir(outputDirectory, { recursive: true });
const safeModel = model.replace(/[^a-z0-9.-]+/gi, "-");
const runStartedAt = Date.now();
const output = path.join(outputDirectory, `${safeModel}-${useRails ? "rails" : policy}-${useThinking ? "thinking" : "direct"}-${runStartedAt}.json`);

function summarize(items: typeof results) {
  const passed = items.filter((item) => item.passed).length;
  const contractValid = items.filter((item) => item.contractValid).length;
  const interactionValid = items.filter((item) => item.interactionValid).length;
  return { passed, contractValid, interactionValid, total: items.length, percentage: items.length ? Math.round(passed / items.length * 100) : 0, interactionPercentage: items.length ? Math.round(interactionValid / items.length * 100) : 0 };
}

async function checkpoint() {
  const bySplit = {
    development: summarize(results.filter((item) => item.split === "development")),
    holdout: summarize(results.filter((item) => item.split === "holdout"))
  };
  const report = {
    schemaVersion: 3, evaluationContract: "screen-projection+mcp-context+focus-workflow-v3",
    model, policy: useRails ? `${policy}-rails` : policy, thinking: useThinking, outputMode: useJsonMode ? "json" : "json-schema",
    generatedAt: new Date().toISOString(), complete: results.length === samples.length,
    score: summarize(results), bySplit, results
  };
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

for (const [index, sample] of samples.entries()) {
  const startedAt = Date.now();
  let payload: { message?: { content?: string }; error?: string } = {};
  let decision: ActionEvalDecision | null = null;
  let rawDecision: string | null = null;
  let error: string | null = null;
  const contextMock = buildEvalContextMock(sample);
  const railDecisions = contextMock.workflow
    ? [...new Set(["clarify", ...contextMock.workflow.suggestions.map((suggestion) => ({ recordStep: "record_step", wait: "set_waiting", complete: "complete_action", reschedule: "reschedule", rename: "record_step", reopen: "record_step" }[suggestion.operation] ?? "clarify"))])]
    : ["clarify", "change_topic", "multiple_updates"];
  const format = useJsonMode ? "json" : useRails
    ? {
        type: "object", additionalProperties: false, required: ["decision", "confidence"],
        properties: { decision: { type: "string", enum: railDecisions }, confidence: { type: "number", minimum: 0, maximum: 1 } }
      }
    : decisionSchema;
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model, stream: false, think: useThinking, format,
        options: { temperature: 0.1, num_ctx: 4096, num_predict: useThinking ? 1024 : 320 },
        messages: [
          { role: "system", content: useRails
            ? "Classify the operational message using only the supplied JSON schema. Do not execute anything, do not add fields, and do not explain your reasoning."
            : policy === "interview" ? actionInterviewEvalSystemPrompt : actionEvalSystemPrompt },
          { role: "user", content: `${formatEvalContext(contextMock)}${useRails ? `\n\nAllowed primary decisions for this server-resolved workflow: ${railDecisions.join(", ")}. Choose only one of them; use clarify if the message does not support an offered rail.` : ""}\n\nMensagem do usuário:\n${sample.message}` }
        ]
      }), signal: AbortSignal.timeout(timeoutMs)
    });
    payload = await response.json() as typeof payload;
    error = response.ok ? null : payload.error ?? `HTTP ${response.status}`;
    if (payload.message?.content) {
      decision = JSON.parse(payload.message.content) as ActionEvalDecision;
      rawDecision = typeof decision?.decision === "string" ? decision.decision : null;
    }
  } catch (cause) {
    error = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
  }
  const expected = sample.evaluation?.decision ?? sample.expectedDecision ?? expectedById[sample.id]!;
  const contractValid = rawDecision !== null && actionDecisionValues.includes(rawDecision as ActionDecision);
  const passed = contractValid && rawDecision === expected;
  const interactionValid = validatesHumanReviewedInteraction(decision);
  results.push({ id: sample.id, split: sample.split ?? "development", category: sample.category, family: sample.family ?? sample.category, variant: sample.variant ?? "canonical", locale: sample.locale ?? "pt-BR", pairId: sample.pairId ?? null, message: sample.message, contextMock, expected, expectedBehavior: sample.evaluation?.expected ?? sample.expected, userNotes: sample.evaluation?.notes ?? "", decision, rawDecision, contractValid, interactionValid, passed, error, durationMs: Date.now() - startedAt });
  await checkpoint();
  process.stdout.write(`[${index + 1}/${samples.length}] ${sample.id}: ${passed ? "PASS" : "FAIL"} (${decision?.decision ?? error ?? "empty"})\n`);
}

const report = await checkpoint();
process.stdout.write(`\n${report.score.passed}/${results.length} (${report.score.percentage}%)\nDevelopment: ${report.bySplit.development.passed}/${report.bySplit.development.total}\nHoldout: ${report.bySplit.holdout.passed}/${report.bySplit.holdout.total}\n${output}\n`);
