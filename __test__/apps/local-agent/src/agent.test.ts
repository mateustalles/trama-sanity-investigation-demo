import { describe, expect, it } from "vitest";
import { boundedPromptMessages, claimsPersistedMutation, compactPlotContext, compactToolResult, embeddedToolCalls, findExplicitPlotReference, isReopenActionRequest, isRescheduleRequest, keepsCurrentDeadline, likelyWriteRequest, needsStepDeadlineDecision, screenContextInstruction, validateWriteProposal, visibleAnswer, writeResolutionMessage, type OllamaMessage } from "../../../../apps/local-agent/src/agent";
import { actionDecisionValues, actionInterviewPolicy, actionLanguagePolicy } from "../../../../apps/local-agent/src/action-language-policy";

describe("local agent model output compatibility", () => {
  it("keeps Action step, waiting, completion, and ambiguity boundaries explicit", () => {
    expect(actionDecisionValues).toContain("record_step");
    expect(actionDecisionValues).toContain("set_waiting");
    expect(actionDecisionValues).toContain("complete_action");
    expect(actionLanguagePolicy).toContain("It is not completion by itself");
    expect(actionLanguagePolicy).toContain("multiple candidates");
    expect(actionLanguagePolicy).toContain("separate updates");
    expect(actionInterviewPolicy).toContain("completion candidate");
    expect(actionInterviewPolicy).toContain("explain in natural language exactly what will change");
  });

  it("recognizes textual Qwen function calls", () => {
    expect(embeddedToolCalls('<function_call>{"name":"list_plots","arguments":{}}</function_call>')).toEqual([
      { function: { name: "list_plots", arguments: {} } }
    ]);
  });

  it("does not expose reasoning or embedded calls", () => {
    expect(visibleAnswer('<think>private reasoning</think>Resposta curta.')).toBe("Resposta curta.");
    expect(visibleAnswer('private reasoning</think><function_call>{"name":"list_plots","arguments":{}}</function_call>')).toBe("");
    expect(visibleAnswer("O prazo foi **atualizado**.")).toBe("O prazo foi atualizado.");
  });

  it("recognizes a requested write and blocks an unverified success claim", () => {
    expect(likelyWriteRequest('"Remarcar consulta de retorno" -> favor mude o prazo para semana que vem')).toBe(true);
    expect(likelyWriteRequest('Renomeie esta ação para "Confirmar consulta"')).toBe(true);
    expect(claimsPersistedMutation("O prazo da ação foi atualizado e a alteração foi aplicada.")).toBe(true);
    expect(claimsPersistedMutation("Qual dia da semana que vem você prefere?")).toBe(false);
  });

  it("routes natural deadline changes separately", () => {
    expect(isRescheduleRequest("Mude o prazo desta ação para 18/08 às 18h")).toBe(true);
    expect(isRescheduleRequest("Passa esse compromisso pra semana que vem")).toBe(true);
    expect(isRescheduleRequest("Empurra a data para o mês que vem")).toBe(true);
    expect(isRescheduleRequest("Muda para amanhã")).toBe(true);
    expect(isRescheduleRequest("Adia por um ano")).toBe(true);
    expect(isRescheduleRequest("Concluí esta ação hoje")).toBe(false);
  });

  it("requires a completion-deadline decision when active progress is recorded", () => {
    expect(needsStepDeadlineDecision("record_action_step", { actionId: "action-1", progress: "Ligou." })).toBe(true);
    expect(needsStepDeadlineDecision("record_action_update", { actionId: "action-1", resolution: "waiting", progress: "Aguardando resposta." })).toBe(true);
    expect(needsStepDeadlineDecision("record_action_update", { actionId: "action-1", resolution: "completed", progress: "Concluiu." })).toBe(false);
    expect(needsStepDeadlineDecision("record_action_update", { actionId: "action-1", resolution: "waiting", progress: "Aguardando.", deadlineAt: "2026-08-20T18:00:00-03:00" })).toBe(false);
    expect(keepsCurrentDeadline("MantÃ©m o mesmo prazo.", "pt-BR")).toBe(true);
    expect(keepsCurrentDeadline("Muda para semana que vem.", "pt-BR")).toBe(false);
  });

  it("grounds ambiguous conversation in the visible Plot", () => {
    expect(isRescheduleRequest("Move this deadline to next week", "en-US")).toBe(true);
    const instruction = screenContextInstruction({ view: "plot", plotId: "plot-123" });
    expect(instruction).toContain("Plot plot-123");
    expect(instruction).toContain("host resolves");
    expect(instruction).toContain("explicit reference");
  });

  it("describes the root map as a multi-Trama context", () => {
    expect(screenContextInstruction({ view: "root-map" })).toContain("multiple Tramas and their Cases");
  });

  it("validates entity existence, type, hierarchy, and relationships", () => {
    const index = {
      plots: new Map([["plot-1", { parentPlotId: null }], ["case-1", { parentPlotId: "plot-1" }]]),
      actions: new Map([["action-1", { plotId: "plot-1" }]]),
      openLoops: new Map([["loop-1", { plotId: "plot-1" }]]),
      requiredInputs: new Map([["input-1", { plotId: "plot-1" }]])
    };
    expect(isReopenActionRequest("Vamos reabrir essa ação Remarcar consulta", "pt-BR")).toBe(true);
    expect(validateWriteProposal("set_plot_status", { plotId: "plot-1", status: "active" }, "Vamos reabrir essa ação", index, "pt-BR")).toContain("another entity");
    expect(validateWriteProposal("record_action_update", { actionId: "wrong" }, "Vamos reabrir essa ação", index, "pt-BR")).toContain("does not exist");
    expect(validateWriteProposal("record_action_update", { actionId: "action-1" }, "Vamos reabrir essa ação", index, "pt-BR")).toBeNull();
    expect(validateWriteProposal("record_action_step", { actionId: "action-1", progress: "Ligou para a clínica." }, "Adicionar passo nesta ação", index, "pt-BR")).toBeNull();
    expect(validateWriteProposal("set_plot_status", { plotId: "missing", status: "completed" }, "Concluir a trama", index, "pt-BR")).toContain("does not exist");
    expect(validateWriteProposal("rename_plot", { plotId: "plot-1", title: "Casa e mudança" }, "Renomear a trama", index, "pt-BR")).toBeNull();
    expect(validateWriteProposal("rename_action", { actionId: "action-1", title: "Confirmar consulta" }, "Renomear a ação", index, "pt-BR")).toBeNull();
    expect(validateWriteProposal("apply_action_batch", { operations: [
      { operation: "rename", actionId: "action-1", title: "Confirmar consulta" },
      { operation: "recordStep", actionId: "action-1", progress: "Clínica respondeu." }
    ] }, "Atualize estas ações", index, "pt-BR")).toBeNull();
    expect(validateWriteProposal("apply_action_batch", { operations: [
      { operation: "rename", actionId: "action-1", title: "Confirmar consulta" },
      { operation: "recordStep", actionId: "missing", progress: "Clínica respondeu." }
    ] }, "Atualize estas ações", index, "pt-BR")).toContain("exists");
    expect(validateWriteProposal("move_plot", { plotId: "plot-1", parentPlotId: "case-1" }, "Mover a trama", index, "pt-BR")).toContain("cannot be used as a parent");
    expect(validateWriteProposal("create_action", { plotId: "case-1", openLoopId: "loop-1" }, "Criar uma ação", index, "pt-BR")).toContain("different Plot");
    expect(validateWriteProposal("answer_required_input", { requiredInputId: "missing" }, "Responder a informação", index, "pt-BR")).toContain("does not exist");
  });

  it("finishes an approved or declined write without asking the model again", () => {
    expect(writeResolutionMessage("Reabrir a ação “Consulta”", true, "pt-BR")).toBe("Concluído: Reabrir a ação “Consulta”.");
    expect(writeResolutionMessage("", false, "pt-BR")).toBe("Alteração não executada.");
    expect(writeResolutionMessage("Reopen action", true, "en-US")).toBe("Completed: Reopen action.");
  });

  it("keeps operational context while excluding raw audit history", () => {
    const compact = compactPlotContext({ dashboard: {
      plot: { id: "plot-123" }, actions: [{ id: "action-1" }], openLoops: [],
      actionProgress: Array.from({ length: 25 }, (_, index) => ({ index })),
      attentionItems: [], requiredInputs: [], auditEvents: [{ payload: "large" }]
    } }) as { dashboard: { plot: { id: string }; actions: Array<{ id: string }>; actionProgress: Array<{ index: number }> } };
    expect(compact.dashboard.plot.id).toBe("plot-123");
    expect(compact.dashboard.actions).toEqual([{ id: "action-1" }]);
    expect(compact.dashboard.actionProgress).toHaveLength(20);
    expect(compact.dashboard.actionProgress[0]).toEqual({ index: 5 });
    expect(JSON.stringify(compactPlotContext({ dashboard: { plot: {}, auditEvents: [{ payload: "large" }] } }))).not.toContain("auditEvents");
  });

  it("resolves an explicitly named Plot before model inference", () => {
    const plots = [{ id: "health", title: "Saúde da Júlia" }, { id: "rent", title: "Aluguel" }];
    expect(findExplicitPlotReference("E qual é o próximo passo na trama aluguel?", plots)).toEqual(plots[1]);
    expect(findExplicitPlotReference("O que acontece aqui?", plots)).toBeNull();
  });

  it("compacts get_plot_context tool results before adding them to model memory", () => {
    const result = compactToolResult("get_plot_context", { dashboard: {
      plot: { id: "plot-1" }, openLoops: [], actions: [], actionProgress: [],
      attentionItems: [], requiredInputs: [], auditEvents: Array.from({ length: 100 }, () => ({ payload: "x".repeat(1_000) }))
    } });
    expect(result).toContain("plot-1");
    expect(result).not.toContain("auditEvents");
    expect(result.length).toBeLessThanOrEqual(5_000);
  });

  it("keeps the latest conversation turn inside a bounded prompt", () => {
    const messages: OllamaMessage[] = [
      { role: "system", content: "base" },
      { role: "system", content: `Authoritative visible Plot context returned by Trama MCP:\n${"v".repeat(10_000)}` },
      ...Array.from({ length: 10 }, (_, index) => [
        { role: "user" as const, content: `old-${index}-${"u".repeat(2_000)}` },
        { role: "assistant" as const, content: `answer-${index}-${"a".repeat(2_000)}` }
      ]).flat(),
      { role: "system", content: "Current operational time: 2026-08-11T12:00:00.000Z." },
      { role: "user", content: "latest request" }
    ];
    const bounded = boundedPromptMessages(messages, 8_000);
    expect(bounded.reduce((sum, message) => sum + message.content.length, 0)).toBeLessThanOrEqual(8_000);
    expect(bounded.some((message) => message.content === "latest request")).toBe(true);
    expect(bounded.some((message) => message.content.includes("old-0-"))).toBe(false);
  });
});
