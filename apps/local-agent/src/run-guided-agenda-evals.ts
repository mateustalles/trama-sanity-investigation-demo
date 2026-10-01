import { evaluateGuidedAgendaCase, guidedAgendaEvalCases } from "./guided-agenda-evals";

const results = guidedAgendaEvalCases.map((testCase) => ({ id: testCase.id, ...evaluateGuidedAgendaCase(testCase) }));
for (const result of results) process.stdout.write(`${result.passed ? "PASS" : "FAIL"} ${result.id}${result.error && !result.passed ? ` — ${result.error}` : ""}\n`);
const passed = results.filter((result) => result.passed).length;
process.stdout.write(`\n${passed}/${results.length} (${Math.round(passed / results.length * 100)}%) guided Agenda contracts passed.\n`);
if (passed !== results.length) process.exitCode = 1;
