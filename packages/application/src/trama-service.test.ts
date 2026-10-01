import { describe, expect, it } from "vitest";
import { SqliteTramaRepository } from "@trama/database";
import type { Clock, IdGenerator } from "@trama/core";
import { TramaService } from "./trama-service";

class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date { return this.current; }
  set(value: string): void { this.current = new Date(value); }
}

class SequenceIds implements IdGenerator {
  private value = 0;
  next(): string { this.value += 1; return `id-${this.value}`; }
}

describe("TramaService vertical slice", () => {
  it("persists multiple conversations, same-entity memory, messages, and agent operations", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const clock = new FixedClock(new Date("2026-08-13T12:00:00.000Z"));
    const service = new TramaService(repository, clock, new SequenceIds(), { type: "agent", id: "local-chat" });
    const plot = service.createPlot({ title: "Saúde", goal: "Acompanhar.", centralQuestion: "O que importa?", parentPlotId: null });
    const first = service.createConversation({ title: "Consulta", primaryEntityType: "plot", primaryEntityId: plot.id, memoryScope: "sameEntity", sourceClient: "web" });
    service.appendConversationMessage({ conversationId: first.id, role: "user", content: "Precisamos marcar a consulta.", provider: null, model: null });
    service.appendConversationMessage({ conversationId: first.id, role: "assistant", content: "Qual é o prazo?", provider: "ollama", model: "trama-agent" });
    const second = service.createConversation({ title: "Novo acompanhamento", primaryEntityType: "plot", primaryEntityId: plot.id, memoryScope: "sameEntity", sourceClient: "web" });
    const operation = service.recordConversationOperation({ conversationId: second.id, toolName: "create_action", arguments: { plotId: plot.id } });
    service.resolveConversationOperation(operation.id, "executed", { actionId: "action-1" });

    expect(service.listConversations("plot", plot.id)).toHaveLength(2);
    expect(service.getSameEntityConversationMemory(second.id).map((message) => message.content)).toEqual([
      "Precisamos marcar a consulta.", "Qual é o prazo?"
    ]);
    expect(service.getConversation(second.id).operations[0]).toMatchObject({ toolName: "create_action", status: "executed" });
    repository.close();
  });

  it("renames a Trama without changing its stable identity or context", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const clock = new FixedClock(new Date("2026-08-05T12:00:00.000Z"));
    const service = new TramaService(repository, clock, new SequenceIds(), { type: "user", id: "mateus" });
    const plot = service.createPlot({ title: "Nome provisório", goal: "Organizar.", centralQuestion: "O que fazer?", parentPlotId: null });
    clock.set("2026-08-05T13:00:00.000Z");

    const renamed = service.renamePlot({ plotId: plot.id, title: "Nome definitivo" });

    expect(renamed.id).toBe(plot.id);
    expect(renamed.title).toBe("Nome definitivo");
    expect(renamed.goal).toBe(plot.goal);
    expect(service.getPlotDashboard(plot.id).auditEvents.map((event) => event.eventType)).toContain("plot.renamed");
    repository.close();
  });

  it("rejects creating an Action without a deadline", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const service = new TramaService(repository, new FixedClock(new Date("2026-08-05T12:00:00.000Z")), new SequenceIds(), { type: "user", id: "mateus" });
    const plot = service.createPlot({ title: "Casa", goal: "Organizar.", centralQuestion: "O que fazer?", parentPlotId: null });

    expect(() => service.createAction({
      plotId: plot.id, openLoopId: null, title: "Resolver pendência", description: "",
      owner: "Mateus", deadlineAt: null, nextReviewAt: "2026-08-06T12:00:00.000Z",
      risk: { likelihood: 2, impact: 3, urgency: 2, description: "" }, manualPriorityAdjustment: 0
    } as never)).toThrow();
    repository.close();
  });

  it("places every new Action inside an operational Ponta Solta without extra input", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const service = new TramaService(repository, new FixedClock(new Date("2026-08-20T12:00:00.000Z")), new SequenceIds(), { type: "user", id: "mateus" });
    const plot = service.createPlot({ title: "Casa", goal: "Organizar.", centralQuestion: "O que fazer?", parentPlotId: null });

    const action = service.createAction({
      plotId: plot.id, openLoopId: null, title: "Pagar a conta de luz", description: "Conta de agosto.",
      owner: "Mateus", deadlineAt: "2026-08-21T21:00:00.000Z", nextReviewAt: "2026-08-21T12:00:00.000Z",
      risk: { likelihood: 2, impact: 3, urgency: 3, description: "" }, manualPriorityAdjustment: 0
    });
    const dashboard = service.getPlotDashboard(plot.id);

    expect(action.openLoopId).toBeTruthy();
    expect(dashboard.openLoops[0]).toMatchObject({ id: action.openLoopId, title: action.title, requiresAction: true });
    expect(dashboard.auditEvents.map((event) => event.eventType)).toContain("openLoop.createdImplicitly");
    repository.close();
  });

  it("does not attach an Action to a Ponta Solta that only waits externally", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const service = new TramaService(repository, new FixedClock(new Date("2026-08-20T12:00:00.000Z")), new SequenceIds(), { type: "user", id: "mateus" });
    const plot = service.createPlot({ title: "Imóvel", goal: "Acompanhar.", centralQuestion: "O que falta?", parentPlotId: null });
    const waiting = service.createOpenLoop({ plotId: plot.id, title: "Aguardar aprovação da imobiliária", description: "", requiresAction: false });

    expect(() => service.createAction({
      plotId: plot.id, openLoopId: waiting.id, title: "Esperar", description: "", owner: "Mateus",
      deadlineAt: "2026-08-22T21:00:00.000Z", nextReviewAt: "2026-08-21T12:00:00.000Z",
      risk: { likelihood: 2, impact: 3, urgency: 2, description: "" }, manualPriorityAdjustment: 0
    })).toThrow(/waiting externally/i);
    repository.close();
  });

  it("hides a Plot from presentation surfaces without deleting its context", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const clock = new FixedClock(new Date("2026-08-05T12:00:00.000Z"));
    const service = new TramaService(repository, clock, new SequenceIds(), { type: "user", id: "mateus" });
    const plot = service.createPlot({ title: "Privada", goal: "Preservar contexto.", centralQuestion: "Como acompanhar?", parentPlotId: null });

    clock.set("2026-08-05T13:00:00.000Z");
    const hidden = service.setPlotVisibility({ plotId: plot.id, visibility: "private" });

    expect(hidden.visibility).toBe("private");
    expect(service.getPlotDashboard(plot.id).plot.visibility).toBe("private");
    expect(service.getPlotDashboard(plot.id).auditEvents.map((event) => event.eventType))
      .toContain("plot.visibilityChanged");
    repository.close();
  });

  it("changes a Plot lifecycle status without deleting its context", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const clock = new FixedClock(new Date("2026-08-05T12:00:00.000Z"));
    const service = new TramaService(repository, clock, new SequenceIds(), { type: "user", id: "mateus" });
    const plot = service.createPlot({ title: "Matrícula", goal: "Concluir a matrícula.", centralQuestion: "A matrícula foi concluída?", parentPlotId: null });
    service.createOpenLoop({ plotId: plot.id, title: "Guardar comprovante", description: "Preservar o registro." });

    clock.set("2026-08-10T12:00:00.000Z");
    const completed = service.setPlotStatus({ plotId: plot.id, status: "completed" });

    expect(completed.status).toBe("completed");
    expect(service.getPlotDashboard(plot.id).openLoops).toHaveLength(1);
    expect(service.getPlotDashboard(plot.id).auditEvents.map((event) => event.eventType))
      .toContain("plot.statusChanged");

    clock.set("2026-08-11T12:00:00.000Z");
    expect(service.setPlotStatus({ plotId: plot.id, status: "active" }).status).toBe("active");
    repository.close();
  });

  it("closes a Ponta Solta with a resolution and immutable audit history", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const clock = new FixedClock(new Date("2026-08-05T12:00:00.000Z"));
    const service = new TramaService(repository, clock, new SequenceIds(), { type: "user", id: "mateus" });
    const plot = service.createPlot({ title: "Casa", goal: "Escolher um imóvel.", centralQuestion: "Qual imóvel escolher?", parentPlotId: null });
    const openLoop = service.createOpenLoop({ plotId: plot.id, title: "Confirmar imóvel", description: "A escolha ainda está aberta." });

    clock.set("2026-08-06T13:00:00.000Z");
    const closed = service.closeOpenLoop({
      openLoopId: openLoop.id,
      status: "resolved",
      resolution: "O imóvel mais barato foi escolhido."
    });

    expect(closed).toMatchObject({
      status: "resolved",
      resolution: "O imóvel mais barato foi escolhido.",
      resolvedAt: "2026-08-06T13:00:00.000Z"
    });
    expect(service.getPlotDashboard(plot.id).auditEvents.map((event) => event.eventType))
      .toContain("openLoop.resolved");
    expect(() => service.closeOpenLoop({ openLoopId: openLoop.id, status: "dismissed", resolution: "Duplicada." }))
      .toThrow("already closed");
    expect(() => service.createAction({
      plotId: plot.id, openLoopId: openLoop.id, title: "Ação tardia", description: "",
      owner: "Mateus", deadlineAt: "2026-08-07T12:00:00.000Z", nextReviewAt: "2026-08-07T10:00:00.000Z",
      risk: { likelihood: 1, impact: 1, urgency: 1, description: "" }, manualPriorityAdjustment: 0
    })).toThrow("closed OpenLoop");
    repository.close();
  });

  it("moves a Plot under another Plot and audits the hierarchy change", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const clock = new FixedClock(new Date("2026-08-05T12:00:00.000Z"));
    const service = new TramaService(repository, clock, new SequenceIds(), { type: "user", id: "mateus" });
    const parent = service.createPlot({ title: "Crianças", goal: "Cuidar das crianças.", centralQuestion: "O que precisa de cuidado?", parentPlotId: null });
    const child = service.createPlot({ title: "Saúde", goal: "Acompanhar a saúde.", centralQuestion: "O que precisa de acompanhamento?", parentPlotId: null });

    clock.set("2026-08-05T13:00:00.000Z");
    const moved = service.reparentPlot({ plotId: child.id, parentPlotId: parent.id });

    expect(moved.parentPlotId).toBe(parent.id);
    expect(service.listPlots().find((plot) => plot.id === child.id)?.parentPlotId).toBe(parent.id);
    expect(service.getPlotDashboard(child.id).auditEvents.map((event) => event.eventType))
      .toContain("plot.reparented");
    repository.close();
  });

  it("rejects hierarchy cycles when moving Plots", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const service = new TramaService(repository, new FixedClock(new Date("2026-08-05T12:00:00.000Z")), new SequenceIds(), { type: "user", id: "mateus" });
    const root = service.createPlot({ title: "Raiz", goal: "Organizar.", centralQuestion: "Como organizar?", parentPlotId: null });
    const child = service.createPlot({ title: "Filha", goal: "Detalhar.", centralQuestion: "O que detalhar?", parentPlotId: root.id });

    expect(() => service.reparentPlot({ plotId: root.id, parentPlotId: child.id })).toThrow("cycle");
    repository.close();
  });

  it("keeps the product hierarchy to one Trama and one Case level", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const service = new TramaService(repository, new FixedClock(new Date("2026-08-05T12:00:00.000Z")), new SequenceIds(),
      { type: "user", id: "mateus" });
    const root = service.createPlot({ title: "Crianças", goal: "Cuidar.", centralQuestion: "O que acompanhar?", parentPlotId: null });
    const aCase = service.createPlot({ title: "Escola", goal: "Acompanhar.", centralQuestion: "O que falta?", parentPlotId: root.id });

    expect(() => service.createPlot({ title: "Matrícula", goal: "Concluir.", centralQuestion: "Foi feita?", parentPlotId: aCase.id }))
      .toThrow("root Trama");
    expect(() => service.reparentPlot({ plotId: root.id, parentPlotId: aCase.id }))
      .toThrow("cycle");
    const anotherRoot = service.createPlot({ title: "Casa", goal: "Organizar.", centralQuestion: "O que falta?", parentPlotId: null });
    expect(() => service.reparentPlot({ plotId: root.id, parentPlotId: anotherRoot.id }))
      .toThrow("contains Cases");
    repository.close();
  });

  it("supports ongoing Tramas but keeps every Case resolvable", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const clock = new FixedClock(new Date("2026-08-05T12:00:00.000Z"));
    const service = new TramaService(repository, clock, new SequenceIds(), { type: "user", id: "mateus" });
    const ongoing = service.createPlot({ title: "Saúde das crianças", goal: "Manter cuidados em dia.",
      centralQuestion: "O que precisa de atenção?", parentPlotId: null, lifecycleType: "ongoing" });

    expect(ongoing.lifecycleType).toBe("ongoing");
    expect(() => service.setPlotStatus({ plotId: ongoing.id, status: "completed" })).toThrow("cannot be completed");
    const aCase = service.createPlot({ title: "Nova ginecologista", goal: "Encontrar profissional.",
      centralQuestion: "Quem atende pela Amil?", parentPlotId: ongoing.id });
    expect(aCase.lifecycleType).toBe("resolvable");
    expect(() => service.setPlotLifecycleType({ plotId: aCase.id, lifecycleType: "ongoing" })).toThrow("Case must be resolvable");
    expect(service.setPlotLifecycleType({ plotId: ongoing.id, lifecycleType: "resolvable" }).lifecycleType).toBe("resolvable");
    repository.close();
  });

  it("records a structured action update, recalculates priority, and audits every mutation", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const clock = new FixedClock(new Date("2026-08-05T12:00:00.000Z"));
    const service = new TramaService(repository, clock, new SequenceIds(), { type: "user", id: "mateus" });

    const plot = service.createPlot({
      title: "Saúde da Júlia",
      goal: "Manter continuidade dos cuidados de saúde.",
      centralQuestion: "Quais acompanhamentos precisam de ação agora?",
      parentPlotId: null
    });
    const openLoop = service.createOpenLoop({
      plotId: plot.id,
      title: "Acompanhamento ginecológico",
      description: "A consulta ainda precisa ser organizada."
    });
    const action = service.createAction({
      plotId: plot.id,
      openLoopId: openLoop.id,
      title: "Marcar ginecologista",
      description: "Encontrar uma profissional e marcar a consulta.",
      owner: "Mateus",
      deadlineAt: "2026-08-08T12:00:00.000Z",
      nextReviewAt: "2026-08-06T12:00:00.000Z",
      risk: { likelihood: 3, impact: 4, urgency: 3, description: "Acompanhamento pode atrasar." },
      manualPriorityAdjustment: 0
    });

    clock.set("2026-08-06T13:00:00.000Z");
    const updated = service.recordActionUpdate({
      actionId: action.id,
      resolution: "waiting",
      occurredAt: "2026-08-06T13:00:00.000Z",
      progress: "A clínica informou que abrirá a agenda na segunda-feira.",
      nextReviewAt: "2026-08-10T12:00:00.000Z"
    });

    expect(updated.resolution).toBe("waiting");
    expect(updated.outcome).toBeNull();
    expect(repository.listActionProgress(action.id).map((entry) => entry.description))
      .toEqual(["A clínica informou que abrirá a agenda na segunda-feira."]);
    expect(updated.priority.reasons.length).toBeGreaterThan(0);

    service.recordActionUpdate({
      actionId: action.id,
      resolution: "inProgress",
      occurredAt: "2026-08-10T13:00:00.000Z",
      progress: "Liguei novamente e pedi os horários disponíveis.",
      nextReviewAt: "2026-08-11T12:00:00.000Z"
    });

    expect(repository.listActionProgress(action.id).map((entry) => entry.description))
      .toEqual([
        "A clínica informou que abrirá a agenda na segunda-feira.",
        "Liguei novamente e pedi os horários disponíveis."
      ]);
    expect(service.getPlotDashboard(plot.id).auditEvents).toHaveLength(7);
    repository.close();
  });

  it("reschedules an active Action without changing or completing its state", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const clock = new FixedClock(new Date("2026-08-11T12:00:00.000Z"));
    const service = new TramaService(repository, clock, new SequenceIds(), { type: "user", id: "mateus" });
    const plot = service.createPlot({ title: "Saúde", goal: "Acompanhar.", centralQuestion: "O que fazer?", parentPlotId: null });
    const action = service.createAction({
      plotId: plot.id, openLoopId: null, title: "Remarcar retorno", description: "",
      owner: "Mateus", deadlineAt: "2026-08-12T18:00:00.000Z", nextReviewAt: "2026-08-12T12:00:00.000Z",
      risk: { likelihood: 2, impact: 3, urgency: 3, description: "" }, manualPriorityAdjustment: 0
    });

    const rescheduled = service.rescheduleAction({
      actionId: action.id,
      deadlineAt: "2026-08-18T21:00:00.000Z",
      occurredAt: "2026-08-11T12:00:00.000Z"
    });

    expect(rescheduled.resolution).toBe("pending");
    expect(rescheduled.resolvedAt).toBeNull();
    expect(rescheduled.outcome).toBeNull();
    expect(rescheduled.deadlineAt).toBe("2026-08-18T21:00:00.000Z");
    expect(rescheduled.nextReviewAt).toBe(action.nextReviewAt);
    expect(repository.listActionProgress(action.id)[0]).toMatchObject({ resolutionAfter: "pending" });
    expect(service.getPlotDashboard(plot.id).auditEvents.map((event) => event.eventType)).toContain("action.rescheduled");
    repository.close();
  });

  it("appends a reported step without changing a completed Action", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const clock = new FixedClock(new Date("2026-08-11T12:00:00.000Z"));
    const service = new TramaService(repository, clock, new SequenceIds(), { type: "user", id: "mateus" });
    const plot = service.createPlot({ title: "Saúde", goal: "Acompanhar.", centralQuestion: "O que fazer?", parentPlotId: null });
    const action = service.createAction({
      plotId: plot.id, openLoopId: null, title: "Remarcar consulta", description: "", owner: "Mateus",
      deadlineAt: "2026-08-12T18:00:00.000Z", nextReviewAt: "2026-08-12T12:00:00.000Z",
      risk: { likelihood: 2, impact: 3, urgency: 3, description: "" }, manualPriorityAdjustment: 0
    });
    const completed = service.recordActionUpdate({ actionId: action.id, resolution: "completed", occurredAt: "2026-08-11T13:00:00.000Z", progress: "Consulta remarcada." });

    const step = service.recordActionStep({ actionId: action.id, occurredAt: "2026-08-11T12:30:00.000Z", progress: "Falou com a ginecologista." });
    const unchanged = repository.getAction(action.id)!;

    expect(step).toMatchObject({ description: "Falou com a ginecologista.", resolutionAfter: "completed" });
    expect(repository.listActionProgress(action.id).map((item) => item.description)).toEqual(["Falou com a ginecologista.", "Consulta remarcada."]);
    expect(unchanged.resolution).toBe("completed");
    expect(unchanged.outcome).toBe(completed.outcome);
    expect(unchanged.deadlineAt).toBe(completed.deadlineAt);
    repository.close();
  });

  it("rejects an active update without a next review date", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const service = new TramaService(
      repository,
      new FixedClock(new Date("2026-08-05T12:00:00.000Z")),
      new SequenceIds(),
      { type: "user", id: "mateus" }
    );
    const plot = service.createPlot({ title: "Casa", goal: "Organizar a casa.", centralQuestion: "O que exige ação?", parentPlotId: null });
    const action = service.createAction({
      plotId: plot.id, openLoopId: null, title: "Ligar para eletricista", description: "",
      owner: "Mateus", deadlineAt: "2026-08-08T12:00:00.000Z", nextReviewAt: "2026-08-06T12:00:00.000Z",
      risk: { likelihood: 2, impact: 3, urgency: 2, description: "" }, manualPriorityAdjustment: 0
    });

    expect(() => service.recordActionUpdate({
      actionId: action.id,
      resolution: "waiting",
      occurredAt: "2026-08-05T13:00:00.000Z",
      progress: "Mensagem enviada."
    })).toThrow(/next review date/i);
    repository.close();
  });

  it("proactively reevaluates active actions when time changes their priority", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const clock = new FixedClock(new Date("2026-08-05T12:00:00.000Z"));
    const service = new TramaService(repository, clock, new SequenceIds(), { type: "system", id: "operational-review" });
    const plot = service.createPlot({ title: "Saúde", goal: "Manter cuidados em dia.", centralQuestion: "O que precisa de atenção?", parentPlotId: null });
    service.createAction({
      plotId: plot.id, openLoopId: null, title: "Confirmar consulta", description: "",
      owner: "Mateus", deadlineAt: "2026-08-07T12:00:00.000Z", nextReviewAt: "2026-08-06T12:00:00.000Z",
      risk: { likelihood: 3, impact: 4, urgency: 3, description: "" }, manualPriorityAdjustment: 0
    });

    clock.set("2026-08-08T12:00:00.000Z");
    const review = service.runOperationalReview();

    expect(review.reviewed).toBe(1);
    expect(review.changed).toBe(1);
    expect(review.dueForAttention).toHaveLength(1);
    expect(review.dueForAttention[0]?.priority.reasons.map((reason) => reason.code)).toContain("deadlineOverdue");
    expect(service.getPlotDashboard(plot.id).auditEvents.map((event) => event.eventType))
      .toContain("action.priorityRecalculated");
    repository.close();
  });

  it("builds a complete deterministic priority report for active Actions and open loops", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const clock = new FixedClock(new Date("2026-08-13T12:00:00.000Z"));
    const service = new TramaService(repository, clock, new SequenceIds(),
      { type: "system", id: "priority-report" });
    const trama = service.createPlot({ title: "Crianças", goal: "Cuidar.", centralQuestion: "O que importa?", parentPlotId: null });
    const caso = service.createPlot({ title: "Escola", goal: "Acompanhar.", centralQuestion: "O que falta?", parentPlotId: trama.id });
    service.createAction({
      plotId: caso.id, openLoopId: null, title: "Entregar documento", description: "",
      owner: "Mateus", deadlineAt: "2026-08-12T12:00:00.000Z", nextReviewAt: "2026-08-13T11:00:00.000Z",
      risk: { likelihood: 5, impact: 5, urgency: 5, description: "" }, manualPriorityAdjustment: 0
    });
    service.createAction({
      plotId: trama.id, openLoopId: null, title: "Planejar passeio", description: "",
      owner: "Mateus", deadlineAt: "2026-09-13T12:00:00.000Z", nextReviewAt: "2026-08-20T12:00:00.000Z",
      risk: { likelihood: 1, impact: 1, urgency: 1, description: "" }, manualPriorityAdjustment: 0
    });
    service.createOpenLoop({ plotId: caso.id, title: "Confirmar regra da escola", description: "" });

    const report = service.getOperationalPriorityReport();

    expect(report.counts).toMatchObject({ actions: 2, openLoops: 1, high: 1, low: 1, context: 1 });
    expect(report.entries.map((entry) => [entry.title, entry.band])).toEqual([
      ["Entregar documento", "high"],
      ["Planejar passeio", "low"],
      ["Confirmar regra da escola", "context"]
    ]);
    expect(report.entries[0]).toMatchObject({ tramaTitle: "Crianças", plotTitle: "Escola", deadlineStatus: "overdue" });
    repository.close();
  });

  it("persists an idempotent review with attention, required input, and notification outbox", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const clock = new FixedClock(new Date("2026-08-05T12:00:00.000Z"));
    const service = new TramaService(repository, clock, new SequenceIds(),
      { type: "system", id: "operational-review" });
    const plot = service.createPlot({ title: "Viagem", goal: "Preparar a viagem.",
      centralQuestion: "O que falta resolver?", parentPlotId: null });
    const action = service.createAction({
      plotId: plot.id, openLoopId: null, title: "Confirmar hospedagem", description: "",
      owner: "Mateus", deadlineAt: "2026-08-06T12:00:00.000Z",
      nextReviewAt: "2026-08-06T12:00:00.000Z",
      risk: { likelihood: 4, impact: 5, urgency: 4, description: "Perder a reserva." },
      manualPriorityAdjustment: 0
    });

    clock.set("2026-08-07T12:00:00.000Z");
    const first = service.runOperationalReview({ trigger: "scheduled", idempotencyKey: "daily:2026-08-07" });
    const repeated = service.runOperationalReview({ trigger: "scheduled", idempotencyKey: "daily:2026-08-07" });

    expect(first.run.status).toBe("completed");
    expect(first.attentionItems.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["deadlineOverdue", "reviewDue", "highRisk"])
    );
    expect(first.requiredInputs).toHaveLength(1);
    expect(first.notifications.length).toBeGreaterThan(0);
    expect(repeated.run.id).toBe(first.run.id);
    expect(repeated.attentionItems).toHaveLength(0);

    const answered = service.answerRequiredInput({
      requiredInputId: first.requiredInputs[0]!.id,
      answer: { outcome: "Hospedagem confirmada." },
      occurredAt: "2026-08-07T13:00:00.000Z"
    });
    expect(answered.status).toBe("answered");
    expect(repository.getRequiredInput(answered.id)?.answer).toEqual({ outcome: "Hospedagem confirmada." });

    service.recordActionUpdate({ actionId: action.id, resolution: "completed",
      occurredAt: "2026-08-07T13:00:00.000Z", progress: "Reserva confirmada." });
    expect(service.getPlotDashboard(plot.id).attentionItems).toHaveLength(0);
    expect(service.getPlotDashboard(plot.id).requiredInputs).toHaveLength(0);
    clock.set("2026-08-08T12:00:00.000Z");
    service.runOperationalReview({ trigger: "change", idempotencyKey: "action-completed" });
    expect(repository.getOpenAttentionItem(`action:${action.id}:deadlineOverdue`)).toBeNull();
    repository.close();
  });

  it("renames an Action without changing its identity or history", () => {
    const repository = new SqliteTramaRepository(":memory:");
    const clock = new FixedClock(new Date("2026-08-13T12:00:00.000Z"));
    const service = new TramaService(repository, clock, new SequenceIds(), { type: "agent", id: "test" });
    const plot = service.createPlot({ title: "Saúde", goal: "Acompanhar.", centralQuestion: "O que falta?", parentPlotId: null });
    const action = service.createAction({ plotId: plot.id, openLoopId: null, title: "Marcar consulta", description: "", owner: "Mateus", deadlineAt: "2026-08-20T18:00:00.000Z", nextReviewAt: "2026-08-14T12:00:00.000Z", risk: { likelihood: 2, impact: 3, urgency: 2, description: "" }, manualPriorityAdjustment: 0 });
    service.recordActionStep({ actionId: action.id, progress: "Clínica localizada.", occurredAt: "2026-08-13T12:10:00.000Z" });

    const renamed = service.renameAction({ actionId: action.id, title: "Marcar retorno com a ginecologista", occurredAt: "2026-08-13T12:20:00.000Z" });

    expect(renamed.id).toBe(action.id);
    expect(renamed.title).toBe("Marcar retorno com a ginecologista");
    expect(repository.listActionProgress(action.id)).toHaveLength(1);
    expect(repository.listAuditEvents(plot.id).some((event) => event.eventType === "action.renamed")).toBe(true);
    repository.close();
  });
});
