import {
  calculatePriority, evaluateOperationalAttention,
  type ActorContext, type Clock, type IdGenerator, type TramaRepository
} from "@trama/core";
import {
  createActionInputSchema,
  closeOpenLoopInputSchema,
  createOpenLoopInputSchema,
  createPlotInputSchema,
  reparentPlotInputSchema,
  renamePlotInputSchema,
  setPlotStatusInputSchema,
  setPlotLifecycleTypeInputSchema,
  setPlotVisibilityInputSchema,
  answerRequiredInputSchema,
  recordActionUpdateInputSchema,
  recordActionStepInputSchema,
  renameActionInputSchema,
  rescheduleActionInputSchema,
  runOperationalReviewInputSchema,
  operationalPriorityReportSchema,
  createConversationInputSchema,
  appendConversationMessageInputSchema,
  setConversationMemoryScopeInputSchema,
  type Action,
  type ActionProgress,
  type AnswerRequiredInput,
  type AttentionItem,
  type AuditEvent,
  type CreateActionInput,
  type CloseOpenLoopInput,
  type CreateOpenLoopInput,
  type CreatePlotInput,
  type OpenLoop,
  type Notification,
  type OperationalPriorityReport,
  type PriorityReportEntry,
  type Plot,
  type ReparentPlotInput,
  type RenamePlotInput,
  type SetPlotStatusInput,
  type SetPlotLifecycleTypeInput,
  type SetPlotVisibilityInput,
  type RecordActionUpdateInput,
  type RecordActionStepInput,
  type RenameActionInput,
  type RescheduleActionInput,
  type RequiredInput,
  type ReviewRun,
  type RunOperationalReviewInput,
  type Conversation, type ConversationMessage, type ConversationContext,
  type ConversationOperation, type CreateConversationInput,
  type AppendConversationMessageInput, type SetConversationMemoryScopeInput,
  type ConversationEntityType
} from "@trama/schemas";

const TERMINAL_RESOLUTIONS = new Set<Action["resolution"]>([
  "completed", "failed", "cancelled", "noLongerNeeded"
]);

function deadlineSortValue(deadlineAt: string | null): number {
  return deadlineAt ? new Date(deadlineAt).getTime() : Number.MAX_SAFE_INTEGER;
}
const REVIEW_POLICY_VERSION = "operational-v1";

export class TramaService {
  constructor(
    private readonly repository: TramaRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly actor: ActorContext
  ) {}

  createPlot(rawInput: CreatePlotInput): Plot {
    const input = createPlotInputSchema.parse(rawInput);
    if (input.parentPlotId) {
      const parent = this.requirePlot(input.parentPlotId);
      if (parent.parentPlotId !== null) throw new Error("A Case can only belong to a root Trama.");
      if (input.lifecycleType !== "resolvable") throw new Error("A Case must be resolvable.");
    }
    const now = this.clock.now().toISOString();
    const plot: Plot = {
      id: this.ids.next(), parentPlotId: input.parentPlotId, title: input.title,
      goal: input.goal, centralQuestion: input.centralQuestion,
      status: "active", visibility: "public", lifecycleType: input.lifecycleType,
      createdAt: now, updatedAt: now
    };
    return this.repository.transaction(() => {
      this.repository.createPlot(plot);
      this.audit(plot.id, "plot", plot.id, "plot.created", null, plot, now);
      return plot;
    });
  }

  reparentPlot(rawInput: ReparentPlotInput): Plot {
    const input = reparentPlotInputSchema.parse(rawInput);
    const before = this.requirePlot(input.plotId);
    if (input.parentPlotId === before.id) throw new Error("A Plot cannot be its own parent.");
    if (input.parentPlotId) {
      let cursor: Plot | null = this.requirePlot(input.parentPlotId);
      const parent = cursor;
      while (cursor) {
        if (cursor.id === before.id) throw new Error("Reparenting would create a Plot cycle.");
        cursor = cursor.parentPlotId ? this.repository.getPlot(cursor.parentPlotId) : null;
      }
      if (parent.parentPlotId !== null) throw new Error("A Case can only belong to a root Trama.");
      if (before.lifecycleType !== "resolvable") throw new Error("A Case must be resolvable.");
      if (this.repository.listPlots().some((plot) => plot.parentPlotId === before.id)) {
        throw new Error("A Trama that contains Cases cannot become a Case.");
      }
    }
    const occurredAt = this.clock.now().toISOString();
    const after: Plot = { ...before, parentPlotId: input.parentPlotId, updatedAt: occurredAt };
    return this.repository.transaction(() => {
      this.repository.updatePlot(after);
      this.audit(after.id, "plot", after.id, "plot.reparented", before, after, occurredAt);
      return after;
    });
  }

  renamePlot(rawInput: RenamePlotInput): Plot {
    const input = renamePlotInputSchema.parse(rawInput);
    const before = this.requirePlot(input.plotId);
    const occurredAt = this.clock.now().toISOString();
    const after: Plot = { ...before, title: input.title, updatedAt: occurredAt };
    return this.repository.transaction(() => {
      this.repository.updatePlot(after);
      this.audit(after.id, "plot", after.id, "plot.renamed", before, after, occurredAt);
      return after;
    });
  }

  setPlotVisibility(rawInput: SetPlotVisibilityInput): Plot {
    const input = setPlotVisibilityInputSchema.parse(rawInput);
    const before = this.requirePlot(input.plotId);
    const occurredAt = this.clock.now().toISOString();
    const after: Plot = { ...before, visibility: input.visibility, updatedAt: occurredAt };
    return this.repository.transaction(() => {
      this.repository.updatePlot(after);
      this.audit(after.id, "plot", after.id, "plot.visibilityChanged", before, after, occurredAt);
      return after;
    });
  }

  setPlotStatus(rawInput: SetPlotStatusInput): Plot {
    const input = setPlotStatusInputSchema.parse(rawInput);
    const before = this.requirePlot(input.plotId);
    if (before.lifecycleType === "ongoing" && input.status === "completed") {
      throw new Error("An ongoing Trama cannot be completed; archive it or change its lifecycle type.");
    }
    const occurredAt = this.clock.now().toISOString();
    const after: Plot = { ...before, status: input.status, updatedAt: occurredAt };
    return this.repository.transaction(() => {
      this.repository.updatePlot(after);
      this.audit(after.id, "plot", after.id, "plot.statusChanged", before, after, occurredAt);
      return after;
    });
  }

  setPlotLifecycleType(rawInput: SetPlotLifecycleTypeInput): Plot {
    const input = setPlotLifecycleTypeInputSchema.parse(rawInput);
    const before = this.requirePlot(input.plotId);
    if (before.parentPlotId !== null && input.lifecycleType !== "resolvable") {
      throw new Error("A Case must be resolvable.");
    }
    if (before.status === "completed" && input.lifecycleType === "ongoing") {
      throw new Error("Reopen the Trama before making it ongoing.");
    }
    const occurredAt = this.clock.now().toISOString();
    const after: Plot = { ...before, lifecycleType: input.lifecycleType, updatedAt: occurredAt };
    return this.repository.transaction(() => {
      this.repository.updatePlot(after);
      this.audit(after.id, "plot", after.id, "plot.lifecycleTypeChanged", before, after, occurredAt);
      return after;
    });
  }

  createOpenLoop(rawInput: CreateOpenLoopInput): OpenLoop {
    const input = createOpenLoopInputSchema.parse(rawInput);
    this.requirePlot(input.plotId);
    const now = this.clock.now().toISOString();
    const openLoop: OpenLoop = {
      id: this.ids.next(), plotId: input.plotId, title: input.title,
      description: input.description, requiresAction: input.requiresAction,
      status: "open", resolution: null, createdAt: now,
      updatedAt: now, resolvedAt: null
    };
    return this.repository.transaction(() => {
      this.repository.createOpenLoop(openLoop);
      this.audit(openLoop.plotId, "openLoop", openLoop.id, "openLoop.created", null, openLoop, now);
      return openLoop;
    });
  }

  closeOpenLoop(rawInput: CloseOpenLoopInput): OpenLoop {
    const input = closeOpenLoopInputSchema.parse(rawInput);
    const before = this.repository.getOpenLoop(input.openLoopId);
    if (!before) throw new Error(`OpenLoop not found: ${input.openLoopId}`);
    if (before.status !== "open") throw new Error("OpenLoop is already closed.");
    const occurredAt = this.clock.now().toISOString();
    const after: OpenLoop = {
      ...before,
      status: input.status,
      resolution: input.resolution,
      updatedAt: occurredAt,
      resolvedAt: occurredAt
    };
    return this.repository.transaction(() => {
      this.repository.updateOpenLoop(after);
      this.audit(after.plotId, "openLoop", after.id,
        input.status === "resolved" ? "openLoop.resolved" : "openLoop.dismissed",
        before, after, occurredAt);
      return after;
    });
  }

  createAction(rawInput: CreateActionInput): Action {
    const input = createActionInputSchema.parse(rawInput);
    this.requirePlot(input.plotId);
    const now = this.clock.now();
    const existingOpenLoop = input.openLoopId ? this.repository.getOpenLoop(input.openLoopId) : null;
    if (input.openLoopId && (!existingOpenLoop || existingOpenLoop.plotId !== input.plotId)) throw new Error("OpenLoop does not belong to the Plot.");
    if (existingOpenLoop?.status !== undefined && existingOpenLoop.status !== "open") throw new Error("Cannot attach an Action to a closed OpenLoop.");
    if (existingOpenLoop && !existingOpenLoop.requiresAction) throw new Error("Cannot attach an Action to an OpenLoop that is waiting externally.");
    const implicitOpenLoop: OpenLoop | null = input.openLoopId ? null : {
      id: this.ids.next(), plotId: input.plotId, title: input.title,
      description: input.description, requiresAction: true, status: "open",
      resolution: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), resolvedAt: null
    };
    const openLoopId = input.openLoopId ?? implicitOpenLoop!.id;
    const action: Action = {
      id: this.ids.next(), plotId: input.plotId, openLoopId,
      title: input.title, description: input.description, resolution: "pending",
      owner: input.owner, deadlineAt: input.deadlineAt, nextReviewAt: input.nextReviewAt,
      risk: input.risk, manualPriorityAdjustment: input.manualPriorityAdjustment,
      priority: calculatePriority({ now, deadlineAt: input.deadlineAt, nextReviewAt: input.nextReviewAt,
        resolution: "pending", risk: input.risk, manualPriorityAdjustment: input.manualPriorityAdjustment }),
      outcome: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), resolvedAt: null
    };
    return this.repository.transaction(() => {
      if (implicitOpenLoop) {
        this.repository.createOpenLoop(implicitOpenLoop);
        this.audit(implicitOpenLoop.plotId, "openLoop", implicitOpenLoop.id,
          "openLoop.createdImplicitly", null, implicitOpenLoop, implicitOpenLoop.createdAt);
      }
      this.repository.createAction(action);
      this.audit(action.plotId, "action", action.id, "action.created", null, action, action.createdAt);
      return action;
    });
  }

  recordActionUpdate(rawInput: RecordActionUpdateInput): Action {
    const input = recordActionUpdateInputSchema.parse(rawInput);
    const before = this.repository.getAction(input.actionId);
    if (!before) throw new Error(`Action not found: ${input.actionId}`);
    const now = this.clock.now();
    const isTerminal = TERMINAL_RESOLUTIONS.has(input.resolution);
    const deadlineAt = input.deadlineAt === undefined ? before.deadlineAt : input.deadlineAt;
    const nextReviewAt = isTerminal ? before.nextReviewAt : input.nextReviewAt ?? before.nextReviewAt;
    const risk = input.risk ?? before.risk;
    const after: Action = {
      ...before,
      resolution: input.resolution,
      outcome: isTerminal ? input.progress : before.outcome,
      deadlineAt,
      nextReviewAt,
      risk,
      updatedAt: now.toISOString(),
      resolvedAt: isTerminal ? input.occurredAt : null,
      priority: isTerminal
        ? { calculatedPriority: 0, effectivePriority: 0, reasons: [], calculatedAt: now.toISOString() }
        : calculatePriority({ now, deadlineAt, nextReviewAt, resolution: input.resolution,
            risk, manualPriorityAdjustment: before.manualPriorityAdjustment })
    };
    const progress: ActionProgress = {
      id: this.ids.next(), plotId: before.plotId, actionId: before.id,
      description: input.progress, resolutionAfter: input.resolution,
      actorType: this.actor.type, actorId: this.actor.id, occurredAt: input.occurredAt
    };
    return this.repository.transaction(() => {
      this.repository.updateAction(after);
      this.repository.appendActionProgress(progress);
      this.audit(after.plotId, "action", after.id, "action.updated", before, after, input.occurredAt);
      this.audit(after.plotId, "actionProgress", progress.id, "action.progressRecorded", null, progress, input.occurredAt);
      if (isTerminal) {
        const relatedAttention = this.repository.listOpenAttentionItems()
          .filter((item) => item.entityType === "action" && item.entityId === after.id);
        const relatedAttentionIds = new Set(relatedAttention.map((item) => item.id));
        for (const item of relatedAttention) {
          const resolved: AttentionItem = {
            ...item, status: "resolved", resolvedAt: input.occurredAt,
            lastDetectedAt: input.occurredAt
          };
          this.repository.updateAttentionItem(resolved);
          this.audit(resolved.plotId, "attentionItem", resolved.id,
            "attentionItem.resolved", item, resolved, input.occurredAt);
        }
        for (const requiredInput of this.repository.listOpenRequiredInputs(after.plotId)) {
          if (!relatedAttentionIds.has(requiredInput.attentionItemId)) continue;
          const dismissed: RequiredInput = {
            ...requiredInput, status: "dismissed", dismissedAt: input.occurredAt
          };
          this.repository.updateRequiredInput(dismissed);
          this.audit(dismissed.plotId, "requiredInput", dismissed.id,
            "requiredInput.dismissed", requiredInput, dismissed, input.occurredAt);
        }
      }
      return after;
    });
  }

  renameAction(rawInput: RenameActionInput): Action {
    const input = renameActionInputSchema.parse(rawInput);
    const before = this.repository.getAction(input.actionId);
    if (!before) throw new Error(`Action not found: ${input.actionId}`);
    const after: Action = { ...before, title: input.title, updatedAt: input.occurredAt };
    return this.repository.transaction(() => {
      this.repository.updateAction(after);
      this.audit(after.plotId, "action", after.id, "action.renamed", before, after, input.occurredAt);
      return after;
    });
  }

  recordActionStep(rawInput: RecordActionStepInput): ActionProgress {
    const input = recordActionStepInputSchema.parse(rawInput);
    const action = this.repository.getAction(input.actionId);
    if (!action) throw new Error(`Action not found: ${input.actionId}`);
    const progress: ActionProgress = {
      id: this.ids.next(), plotId: action.plotId, actionId: action.id,
      description: input.progress, resolutionAfter: action.resolution,
      actorType: this.actor.type, actorId: this.actor.id, occurredAt: input.occurredAt
    };
    return this.repository.transaction(() => {
      this.repository.appendActionProgress(progress);
      this.audit(action.plotId, "actionProgress", progress.id, "action.progressRecorded", null, progress, input.occurredAt);
      return progress;
    });
  }

  rescheduleAction(rawInput: RescheduleActionInput): Action {
    const input = rescheduleActionInputSchema.parse(rawInput);
    const before = this.repository.getAction(input.actionId);
    if (!before) throw new Error(`Action not found: ${input.actionId}`);
    if (TERMINAL_RESOLUTIONS.has(before.resolution)) {
      throw new Error("A completed or closed Action must be reopened before it can be rescheduled.");
    }
    const now = this.clock.now();
    const after: Action = {
      ...before,
      deadlineAt: input.deadlineAt,
      updatedAt: now.toISOString(),
      priority: calculatePriority({
        now,
        deadlineAt: input.deadlineAt,
        nextReviewAt: before.nextReviewAt,
        resolution: before.resolution,
        risk: before.risk,
        manualPriorityAdjustment: before.manualPriorityAdjustment
      })
    };
    const progress: ActionProgress = {
      id: this.ids.next(), plotId: before.plotId, actionId: before.id,
      description: `Prazo de conclusão reagendado para ${input.deadlineAt}.`,
      resolutionAfter: before.resolution,
      actorType: this.actor.type, actorId: this.actor.id, occurredAt: input.occurredAt
    };
    return this.repository.transaction(() => {
      this.repository.updateAction(after);
      this.repository.appendActionProgress(progress);
      this.audit(after.plotId, "action", after.id, "action.rescheduled", before, after, input.occurredAt);
      this.audit(after.plotId, "actionProgress", progress.id, "action.progressRecorded", null, progress, input.occurredAt);
      return after;
    });
  }

  getPlotDashboard(plotId: string) {
    const plot = this.requirePlot(plotId);
    const actions = this.repository.listActions(plotId).sort(
      (a, b) => b.priority.effectivePriority - a.priority.effectivePriority
    );
    const terminalActionIds = new Set(actions
      .filter((action) => TERMINAL_RESOLUTIONS.has(action.resolution))
      .map((action) => action.id));
    const attentionItems = this.repository.listOpenAttentionItems().filter((item) =>
      item.plotId === plotId
      && !(item.entityType === "action" && terminalActionIds.has(item.entityId))
    );
    const visibleAttentionIds = new Set(attentionItems.map((item) => item.id));
    return {
      plot,
      openLoops: this.repository.listOpenLoops(plotId),
      actions,
      actionProgress: this.repository.listPlotActionProgress(plotId),
      attentionItems,
      requiredInputs: this.repository.listOpenRequiredInputs(plotId).filter((input) =>
        visibleAttentionIds.has(input.attentionItemId)
        && !(input.targetEntityType === "action" && terminalActionIds.has(input.targetEntityId))
      ),
      auditEvents: this.repository.listAuditEvents(plotId)
    };
  }

  listPlots(): Plot[] {
    return this.repository.listPlots();
  }

  createConversation(rawInput: CreateConversationInput): Conversation {
    const input = createConversationInputSchema.parse(rawInput);
    this.requireConversationEntity(input.primaryEntityType, input.primaryEntityId);
    const now = this.clock.now().toISOString();
    const conversation: Conversation = {
      ...input, id: this.ids.next(), status: "active", createdAt: now, updatedAt: now
    };
    const context: ConversationContext = {
      id: this.ids.next(), conversationId: conversation.id,
      entityType: conversation.primaryEntityType, entityId: conversation.primaryEntityId,
      relation: "primary", createdAt: now
    };
    return this.repository.transaction(() => {
      this.repository.createConversation(conversation);
      this.repository.createConversationContext(context);
      const plotId = this.conversationPlotId(conversation);
      this.audit(plotId, "conversation", conversation.id, "conversation.created", null, conversation, now);
      this.audit(plotId, "conversationContext", context.id, "conversationContext.created", null, context, now);
      return conversation;
    });
  }

  getConversation(id: string) {
    const conversation = this.repository.getConversation(id);
    if (!conversation) throw new Error(`Conversation not found: ${id}`);
    return {
      conversation,
      messages: this.repository.listConversationMessages(id),
      contexts: this.repository.listConversationContexts(id),
      operations: this.repository.listConversationOperations(id)
    };
  }

  listConversations(entityType: ConversationEntityType, entityId: string) {
    this.requireConversationEntity(entityType, entityId);
    return this.repository.listConversations(entityType, entityId);
  }

  appendConversationMessage(rawInput: AppendConversationMessageInput): ConversationMessage {
    const input = appendConversationMessageInputSchema.parse(rawInput);
    const conversation = this.repository.getConversation(input.conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${input.conversationId}`);
    const now = this.clock.now().toISOString();
    const message: ConversationMessage = { ...input, id: this.ids.next(), createdAt: now };
    return this.repository.transaction(() => {
      this.repository.appendConversationMessage(message);
      this.repository.updateConversation({ ...conversation, updatedAt: now });
      this.audit(this.conversationPlotId(conversation), "conversationMessage", message.id,
        "conversationMessage.appended", null, message, now);
      return message;
    });
  }

  setConversationMemoryScope(rawInput: SetConversationMemoryScopeInput): Conversation {
    const input = setConversationMemoryScopeInputSchema.parse(rawInput);
    const conversation = this.repository.getConversation(input.id);
    if (!conversation) throw new Error(`Conversation not found: ${input.id}`);
    const updated = { ...conversation, memoryScope: input.memoryScope, updatedAt: this.clock.now().toISOString() };
    return this.repository.transaction(() => {
      this.repository.updateConversation(updated);
      this.audit(this.conversationPlotId(conversation), "conversation", conversation.id,
        "conversation.memoryScopeChanged", conversation, updated, updated.updatedAt);
      return updated;
    });
  }

  recordConversationOperation(input: {
    conversationId: string; messageId?: string | null; toolName: string;
    arguments: Record<string, unknown>;
  }): ConversationOperation {
    const conversation = this.repository.getConversation(input.conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${input.conversationId}`);
    const operation: ConversationOperation = {
      id: this.ids.next(), conversationId: input.conversationId, messageId: input.messageId ?? null,
      toolName: input.toolName, arguments: input.arguments, status: "proposed",
      result: null, error: null, createdAt: this.clock.now().toISOString(), resolvedAt: null
    };
    return this.repository.transaction(() => {
      this.repository.createConversationOperation(operation);
      this.audit(this.conversationPlotId(conversation), "conversationOperation", operation.id,
        "conversationOperation.proposed", null, operation, operation.createdAt);
      return operation;
    });
  }

  resolveConversationOperation(id: string, status: "approved" | "declined" | "executed" | "failed", result: unknown = null, error: string | null = null): ConversationOperation {
    const operation = this.repository.getConversationOperation(id);
    if (!operation) throw new Error(`ConversationOperation not found: ${id}`);
    const updated: ConversationOperation = {
      ...operation, status, result, error,
      resolvedAt: ["declined", "executed", "failed"].includes(status) ? this.clock.now().toISOString() : null
    };
    const conversation = this.repository.getConversation(operation.conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${operation.conversationId}`);
    return this.repository.transaction(() => {
      this.repository.updateConversationOperation(updated);
      this.audit(this.conversationPlotId(conversation), "conversationOperation", operation.id,
        `conversationOperation.${status}`, operation, updated, this.clock.now().toISOString());
      return updated;
    });
  }

  getSameEntityConversationMemory(conversationId: string, limit = 40): ConversationMessage[] {
    const current = this.repository.getConversation(conversationId);
    if (!current || current.memoryScope === "currentConversation") return [];
    return this.repository.listConversations(current.primaryEntityType, current.primaryEntityId)
      .filter((conversation) => conversation.id !== current.id)
      .flatMap((conversation) => this.repository.listConversationMessages(conversation.id))
      .filter((message) => message.role === "user" || message.role === "assistant")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(-limit);
  }

  getOperationalPriorityReport(now = this.clock.now()): OperationalPriorityReport {
    const plots = this.repository.listPlots();
    const activePlots = plots.filter((plot) => plot.status === "active");
    const plotsById = new Map(plots.map((plot) => [plot.id, plot]));
    const entries: PriorityReportEntry[] = [];

    for (const plot of activePlots) {
      const trama = plot.parentPlotId ? plotsById.get(plot.parentPlotId) ?? plot : plot;
      const plotActions = this.repository.listActions(plot.id);
      const activeOpenLoopIds = new Set(plotActions
        .filter((action) => !TERMINAL_RESOLUTIONS.has(action.resolution) && action.openLoopId)
        .map((action) => action.openLoopId));
      for (const action of plotActions) {
        if (TERMINAL_RESOLUTIONS.has(action.resolution)) continue;
        const priority = calculatePriority({
          now,
          deadlineAt: action.deadlineAt,
          nextReviewAt: action.nextReviewAt,
          resolution: action.resolution,
          risk: action.risk,
          manualPriorityAdjustment: action.manualPriorityAdjustment
        });
        const score = priority.effectivePriority;
        const deadlineTime = action.deadlineAt ? new Date(action.deadlineAt).getTime() : null;
        const millisecondsUntilDeadline = deadlineTime === null ? null : deadlineTime - now.getTime();
        entries.push({
          kind: "action",
          entityId: action.id,
          plotId: plot.id,
          plotTitle: plot.title,
          tramaId: trama.id,
          tramaTitle: trama.title,
          title: action.title,
          band: score >= 75 ? "high" : score >= 45 ? "medium" : "low",
          score,
          deadlineAt: action.deadlineAt,
          deadlineStatus: millisecondsUntilDeadline === null
            ? "none"
            : millisecondsUntilDeadline < 0
              ? "overdue"
              : millisecondsUntilDeadline <= 86_400_000 ? "dueSoon" : "scheduled",
          reasons: priority.reasons.length > 0
            ? priority.reasons.map((reason: { label: string }) => reason.label)
            : ["Ação ativa sem alerta adicional neste momento."]
        });
      }
      for (const openLoop of this.repository.listOpenLoops(plot.id).filter((item) => item.status === "open")) {
        if (activeOpenLoopIds.has(openLoop.id)) continue;
        entries.push({
          kind: "openLoop",
          entityId: openLoop.id,
          plotId: plot.id,
          plotTitle: plot.title,
          tramaId: trama.id,
          tramaTitle: trama.title,
          title: openLoop.title,
          band: "context",
          score: null,
          deadlineAt: null,
          deadlineStatus: "none",
          reasons: [openLoop.requiresAction
            ? "Ponta Solta aberta: há uma frente que exige ação nossa."
            : "Ponta Solta aberta: o andamento depende de algo externo."]
        });
      }
    }

    const bandOrder = { high: 0, medium: 1, low: 2, context: 3 } as const;
    entries.sort((left, right) => bandOrder[left.band as keyof typeof bandOrder] - bandOrder[right.band as keyof typeof bandOrder]
      || (right.score ?? -1) - (left.score ?? -1)
      || deadlineSortValue(left.deadlineAt) - deadlineSortValue(right.deadlineAt)
      || left.title.localeCompare(right.title, "pt-BR"));

    return operationalPriorityReportSchema.parse({
      generatedAt: now.toISOString(),
      counts: {
        actions: entries.filter((entry) => entry.kind === "action").length,
        openLoops: entries.filter((entry) => entry.kind === "openLoop").length,
        high: entries.filter((entry) => entry.band === "high").length,
        medium: entries.filter((entry) => entry.band === "medium").length,
        low: entries.filter((entry) => entry.band === "low").length,
        context: entries.filter((entry) => entry.band === "context").length
      },
      entries
    });
  }

  runOperationalReview(rawInput: RunOperationalReviewInput = {}) {
    const input = runOperationalReviewInputSchema.parse(rawInput);
    const now = this.clock.now();
    const nowIso = now.toISOString();
    const idempotencyKey = input.idempotencyKey ?? `${input.trigger}:${REVIEW_POLICY_VERSION}:${nowIso}`;
    const existingRun = this.repository.getReviewRunByIdempotencyKey(idempotencyKey);
    if (existingRun) return this.reviewResult(existingRun);

    let run: ReviewRun = {
      id: this.ids.next(), idempotencyKey, trigger: input.trigger,
      policyVersion: REVIEW_POLICY_VERSION, status: "running", startedAt: nowIso,
      completedAt: null, reviewedCount: 0, changedCount: 0, attentionCount: 0,
      requiredInputCount: 0, notificationCount: 0, error: null
    };
    this.repository.transaction(() => {
      this.repository.createReviewRun(run);
      this.audit(null, "reviewRun", run.id, "reviewRun.started", null, run, nowIso);
    });

    let reviewed = 0;
    let changed = 0;
    const dueForAttention: Action[] = [];
    const attentionItems: AttentionItem[] = [];
    const requiredInputs: RequiredInput[] = [];
    const notifications: Notification[] = [];
    const seenFingerprints = new Set<string>();

    try {
      for (const plot of this.repository.listPlots().filter((item) => item.status === "active")) {
      for (const before of this.repository.listActions(plot.id)) {
        if (TERMINAL_RESOLUTIONS.has(before.resolution)) continue;
        reviewed += 1;
        const priority = calculatePriority({
          now,
          deadlineAt: before.deadlineAt,
          nextReviewAt: before.nextReviewAt,
          resolution: before.resolution,
          risk: before.risk,
          manualPriorityAdjustment: before.manualPriorityAdjustment
        });
        const reasonsChanged = JSON.stringify(priority.reasons) !== JSON.stringify(before.priority.reasons);
        const scoreChanged = priority.effectivePriority !== before.priority.effectivePriority;
        const after: Action = { ...before, priority, updatedAt: now.toISOString() };

        if (new Date(before.nextReviewAt).getTime() <= now.getTime()
          || (before.deadlineAt && new Date(before.deadlineAt).getTime() <= now.getTime())) {
          dueForAttention.push(after);
        }

        if (reasonsChanged || scoreChanged) {
          this.repository.transaction(() => {
            this.repository.updateAction(after);
            this.audit(after.plotId, "action", after.id, "action.priorityRecalculated", before, after, now.toISOString());
          });
          changed += 1;
        }

        for (const observation of evaluateOperationalAttention(after, now)) {
          const fingerprint = `action:${after.id}:${observation.kind}`;
          seenFingerprints.add(fingerprint);
          const existing = this.repository.getOpenAttentionItem(fingerprint);
          const item: AttentionItem = existing
            ? { ...existing, reviewRunId: run.id, severity: observation.severity,
                summary: observation.summary, reasons: observation.reasons, lastDetectedAt: nowIso }
            : { id: this.ids.next(), plotId: after.plotId, reviewRunId: run.id,
                entityType: "action", entityId: after.id, kind: observation.kind,
                severity: observation.severity, summary: observation.summary,
                reasons: observation.reasons, fingerprint, status: "open",
                firstDetectedAt: nowIso, lastDetectedAt: nowIso, resolvedAt: null };
          this.repository.transaction(() => {
            if (existing) this.repository.updateAttentionItem(item);
            else {
              this.repository.createAttentionItem(item);
              this.audit(item.plotId, "attentionItem", item.id, "attentionItem.opened", null, item, nowIso);
            }
          });
          attentionItems.push(item);

          if (["reviewDue", "waitingStale", "blocked"].includes(item.kind)) {
            const existingInput = this.repository.getOpenRequiredInput(item.id, "action.statusUpdate");
            if (existingInput) requiredInputs.push(existingInput);
            else {
              const requiredInput: RequiredInput = {
                id: this.ids.next(), plotId: item.plotId, attentionItemId: item.id,
                targetEntityType: "action", targetEntityId: after.id,
                key: "action.statusUpdate", question: `O que aconteceu com “${after.title}”?`,
                expectedType: "actionUpdate", blocking: item.kind === "blocked", status: "open",
                answer: null, createdAt: nowIso, answeredAt: null, dismissedAt: null
              };
              this.repository.transaction(() => {
                this.repository.createRequiredInput(requiredInput);
                this.audit(requiredInput.plotId, "requiredInput", requiredInput.id,
                  "requiredInput.opened", null, requiredInput, nowIso);
              });
              requiredInputs.push(requiredInput);
            }
          }

          const deliveryClass = item.severity === "critical" ? "immediate" : "briefing";
          const dedupeKey = `${fingerprint}:${deliveryClass}:${nowIso.slice(0, 10)}`;
          const existingNotification = this.repository.getNotificationByDedupeKey(dedupeKey);
          if (!existingNotification) {
            const notification: Notification = {
              id: this.ids.next(), plotId: item.plotId, attentionItemId: item.id,
              requiredInputId: requiredInputs.find((candidate) => candidate.attentionItemId === item.id)?.id ?? null,
              deliveryClass, dedupeKey, subject: item.summary,
              body: item.reasons.join(" "), data: { entityType: item.entityType, entityId: item.entityId },
              status: "pending", attempts: 0, nextAttemptAt: nowIso, createdAt: nowIso,
              deliveredAt: null, lastError: null
            };
            this.repository.transaction(() => {
              this.repository.createNotification(notification);
              this.audit(notification.plotId, "notification", notification.id,
                "notification.queued", null, notification, nowIso);
            });
            notifications.push(notification);
          }
        }
      }
      }

      for (const item of this.repository.listOpenAttentionItems()) {
        if (seenFingerprints.has(item.fingerprint)) continue;
        const resolved: AttentionItem = { ...item, status: "resolved", resolvedAt: nowIso, lastDetectedAt: nowIso };
        this.repository.transaction(() => {
          this.repository.updateAttentionItem(resolved);
          this.audit(resolved.plotId, "attentionItem", resolved.id,
            "attentionItem.resolved", item, resolved, nowIso);
        });
      }

      run = { ...run, status: "completed", completedAt: nowIso, reviewedCount: reviewed,
        changedCount: changed, attentionCount: attentionItems.length,
        requiredInputCount: requiredInputs.length, notificationCount: notifications.length };
      this.repository.transaction(() => {
        this.repository.updateReviewRun(run);
        this.audit(null, "reviewRun", run.id, "reviewRun.completed", null, run, nowIso);
      });
    } catch (error) {
      run = { ...run, status: "failed", completedAt: nowIso,
        error: error instanceof Error ? error.message : String(error) };
      this.repository.transaction(() => {
        this.repository.updateReviewRun(run);
        this.audit(null, "reviewRun", run.id, "reviewRun.failed", null, run, nowIso);
      });
      throw error;
    }

    return {
      run,
      reviewed, changed,
      attentionItems, requiredInputs, notifications,
      dueForAttention: dueForAttention.sort(
        (a, b) => b.priority.effectivePriority - a.priority.effectivePriority
      )
    };
  }

  answerRequiredInput(rawInput: AnswerRequiredInput): RequiredInput {
    const input = answerRequiredInputSchema.parse(rawInput);
    const before = this.repository.getRequiredInput(input.requiredInputId);
    if (!before) throw new Error(`RequiredInput not found: ${input.requiredInputId}`);
    if (before.status !== "open") throw new Error("RequiredInput is not open.");
    const after: RequiredInput = { ...before, status: "answered", answer: input.answer,
      answeredAt: input.occurredAt };
    return this.repository.transaction(() => {
      this.repository.updateRequiredInput(after);
      this.audit(after.plotId, "requiredInput", after.id, "requiredInput.answered",
        before, after, input.occurredAt);
      return after;
    });
  }

  private reviewResult(run: ReviewRun) {
    return { run, reviewed: run.reviewedCount, changed: run.changedCount,
      attentionItems: [] as AttentionItem[], requiredInputs: [] as RequiredInput[],
      notifications: [] as Notification[], dueForAttention: [] as Action[] };
  }

  private requirePlot(id: string): Plot {
    const plot = this.repository.getPlot(id);
    if (!plot) throw new Error(`Plot not found: ${id}`);
    return plot;
  }

  private requireConversationEntity(type: ConversationEntityType, id: string): void {
    if (type === "workspace") {
      if (id !== "trama") throw new Error(`Conversation target not found: ${type}:${id}`);
      return;
    }
    const exists = type === "plot" ? this.repository.getPlot(id)
      : type === "openLoop" ? this.repository.getOpenLoop(id)
        : this.repository.getAction(id);
    if (!exists) throw new Error(`Conversation target not found: ${type}:${id}`);
  }

  private conversationPlotId(conversation: Conversation): string | null {
    if (conversation.primaryEntityType === "workspace") return null;
    if (conversation.primaryEntityType === "plot") return conversation.primaryEntityId;
    if (conversation.primaryEntityType === "openLoop") {
      return this.repository.getOpenLoop(conversation.primaryEntityId)?.plotId ?? null;
    }
    return this.repository.getAction(conversation.primaryEntityId)?.plotId ?? null;
  }

  private audit(
    plotId: string | null,
    entityType: AuditEvent["entityType"],
    entityId: string,
    eventType: string,
    before: unknown,
    after: unknown,
    occurredAt: string
  ): void {
    this.repository.appendAuditEvent({
      id: this.ids.next(), plotId, entityType, entityId, eventType,
      actorType: this.actor.type, actorId: this.actor.id,
      before, after, occurredAt
    });
  }
}
