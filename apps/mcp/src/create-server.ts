import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createOllamaProviderFromEnv } from "@trama/ai";
import type { TramaService, AsyncTramaService } from "@trama/application";
import { nextGlobalReviewAt } from "@trama/core";
import { operationalBriefingSchema, type OperationalPriorityReport, type PriorityReportEntry } from "@trama/schemas";
import { z } from "zod";

// Construction has no persistence side effects: the caller owns tenant and actor resolution.
export function createTramaMcpServer(service: TramaService | AsyncTramaService) {
const localAi = createOllamaProviderFromEnv();
const reviewIntervalHours = Number(process.env.TRAMA_REVIEW_INTERVAL_HOURS ?? "24");
const reportTimeZone = process.env.TRAMA_TIME_ZONE ?? "America/Sao_Paulo";
const automaticNextReviewAt = () => nextGlobalReviewAt(new Date(), reviewIntervalHours);

const server = new McpServer(
  { name: "trama", version: "0.1.0" },
  {
    instructions:
      "Trama is the source of truth. Internally use Plot, OpenLoop, and Action; speak about Tramas, Cases, Pontas Soltas, and Proximos Passos. A root Plot is a Trama and a direct child Plot is a Case; never nest Cases. A Trama may be ongoing or resolvable, but every Case is resolvable. An ongoing Trama is managed and prioritized, never completed. An OpenLoop is the unresolved thread that groups Actions or records a purely external wait; it is not an Action. Every new Action belongs to one, and Trama creates it implicitly when omitted. Read context before writing, ask for missing authoritative facts, never create an Action without a user-supplied deadline, never infer completion or future steps, and keep a next review date for active Actions."
  }
);

function result(data: Record<string, unknown>, message: string) {
  return {
    structuredContent: data,
    content: [{ type: "text" as const, text: message }]
  };
}

const bandPresentation: Record<PriorityReportEntry["band"], { icon: string; label: string }> = {
  high: { icon: "🔴", label: "Alta" },
  medium: { icon: "🟡", label: "Média" },
  low: { icon: "🔵", label: "Baixa" },
  context: { icon: "🟢", label: "Contexto" }
};

function markdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function formatDeadline(entry: PriorityReportEntry): string {
  if (!entry.deadlineAt) return "—";
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short", timeStyle: "short", timeZone: reportTimeZone
  }).format(new Date(entry.deadlineAt));
  return entry.deadlineStatus === "overdue" ? `⚠️ Vencido · ${formatted}`
    : entry.deadlineStatus === "dueSoon" ? `Hoje/24h · ${formatted}` : formatted;
}

function formatPriorityReport(report: OperationalPriorityReport): string {
  const heading = `## Relatório operacional\n\n${report.counts.actions} Ações ativas · ${report.counts.openLoops} Pontas Soltas abertas`;
  if (report.entries.length === 0) return `${heading}\n\nNenhum item operacional pendente.`;
  const rows = report.entries.map((entry) => {
    const band = bandPresentation[entry.band];
    const context = entry.plotTitle === entry.tramaTitle ? entry.tramaTitle : `${entry.tramaTitle} › ${entry.plotTitle}`;
    const score = entry.score === null ? "—" : String(entry.score);
    return `| ${band.icon} ${band.label} | ${score} | ${entry.kind === "action" ? "Ação" : "Ponta Solta"} | ${markdownCell(context)} | ${markdownCell(entry.title)} | ${formatDeadline(entry)} | ${markdownCell(entry.reasons[0] ?? "—")} |`;
  });
  return [heading, "", "| Prioridade | Score | Tipo | Trama / Caso | Item | Prazo | Por que está aqui |",
    "|---|---:|---|---|---|---|---|", ...rows].join("\n");
}

server.registerTool("list_plots", {
  title: "List Tramas and Cases",
  description: "List root Tramas and their direct Cases before deciding where new information belongs.",
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async () => {
  const plots = await service.listPlots();
  return result({ plots }, `Found ${plots.length} Trama plots.`);
});

server.registerTool("get_plot_context", {
  title: "Get Trama or Case context",
  description: "Read a Trama or Case with its Actions, Pontas Soltas, attention items, required inputs, and recent audit history before proposing a change.",
  inputSchema: { plotId: z.string().min(1) },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async ({ plotId }) => {
  const dashboard = await service.getPlotDashboard(plotId);
  return result({ dashboard }, `Loaded context for ${dashboard.plot.title}.`);
});

server.registerTool("list_conversations", {
  title: "List conversations for an entity",
  description: "List persistent conversations attached to the workspace, a Trama/Case, Ponta Solta, or Action.",
  inputSchema: {
    entityType: z.enum(["workspace", "plot", "openLoop", "action"]),
    entityId: z.string().min(1)
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async ({ entityType, entityId }) => {
  const conversations = await service.listConversations(entityType, entityId);
  return result({ conversations }, `Found ${conversations.length} persistent conversations.`);
});

server.registerTool("get_conversation", {
  title: "Get a persistent conversation",
  description: "Read a conversation with its messages, linked contexts, and model-decided operation history.",
  inputSchema: { conversationId: z.string().min(1) },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async ({ conversationId }) => {
  const conversation = await service.getConversation(conversationId);
  return result({ conversation }, `Loaded conversation ${conversationId}.`);
});

server.registerTool("create_conversation", {
  title: "Create a persistent conversation",
  description: "Create a conversation attached to one entity. Default to sameEntity memory; related or global context requires explicit user authorization.",
  inputSchema: {
    title: z.string().min(1),
    primaryEntityType: z.enum(["workspace", "plot", "openLoop", "action"]),
    primaryEntityId: z.string().min(1),
    memoryScope: z.enum(["currentConversation", "sameEntity", "relatedContext", "global"]).optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (input) => {
  const conversation = await service.createConversation({ ...input, memoryScope: input.memoryScope ?? "sameEntity", sourceClient: "mcp" });
  return result({ conversation }, `Created persistent conversation “${conversation.title}”.`);
});

server.registerTool("append_conversation_message", {
  title: "Append a conversation message",
  description: "Persist a user, assistant, system, or tool message in an existing conversation without changing operational entities.",
  inputSchema: {
    conversationId: z.string().min(1),
    role: z.enum(["user", "assistant", "system", "tool"]),
    content: z.string().min(1),
    provider: z.string().min(1).nullable().optional(),
    model: z.string().min(1).nullable().optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (input) => {
  const message = await service.appendConversationMessage({ ...input, provider: input.provider ?? null, model: input.model ?? null });
  return result({ message }, "Appended the message to the persistent conversation.");
});

server.registerTool("set_conversation_memory_scope", {
  title: "Set conversation memory scope",
  description: "Choose whether a conversation uses only itself, other conversations on the same entity, related context, or global context. Never select related or global without explicit user authorization.",
  inputSchema: {
    conversationId: z.string().min(1),
    memoryScope: z.enum(["currentConversation", "sameEntity", "relatedContext", "global"])
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async ({ conversationId, memoryScope }) => {
  const conversation = await service.setConversationMemoryScope({ id: conversationId, memoryScope });
  return result({ conversation }, `Conversation memory scope is now ${memoryScope}.`);
});

server.registerTool("get_operational_priority_report", {
  title: "Get the structured operational priority report",
  description: "Return every active Action and every open Ponta Solta across active Tramas and Cases in one deterministic, priority-sorted report. Use this for daily summaries and status reports instead of inventing a free-form layout.",
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async () => {
  const report = await service.getOperationalPriorityReport();
  return result({ report }, formatPriorityReport(report));
});

server.registerTool("get_local_ai_status", {
  title: "Get local AI status",
  description: "Check whether the local Ollama server and configured model are available. This never sends Trama data to a remote await service.",
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async () => {
  const status = await localAi.status();
  return result({ status }, status.available
    ? status.modelInstalled
      ? `Local AI is ready with ${status.model}.`
      : `Ollama is running, but ${status.model} is not installed.`
    : "Local AI is unavailable.");
});

server.registerTool("draft_local_operational_briefing", {
  title: "Draft operational briefing with local AI",
  description: "Ask the configured local Ollama model to draft a read-only operational briefing from active Trama records. The output is schema-validated and never mutates Trama.",
  inputSchema: {
    plotIds: z.array(z.string().min(1)).max(20).optional(),
    now: z.string().datetime({ offset: true }).optional()
  },
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
}, async ({ plotIds, now }) => {
  const selected = (await service.listPlots()).filter((plot) =>
    plot.status === "active" && (!plotIds || plotIds.includes(plot.id))
  );
  const context = await Promise.all(selected.map(async (plot) => {
    const dashboard = await service.getPlotDashboard(plot.id);
    return {
      plot: dashboard.plot,
      openLoops: dashboard.openLoops.filter((item) => item.status === "open"),
      actions: dashboard.actions.filter((item) =>
        !["completed", "failed", "cancelled", "noLongerNeeded"].includes(item.resolution)
      ),
      attentionItems: dashboard.attentionItems,
      requiredInputs: dashboard.requiredInputs
    };
  }));
  const briefing = await localAi.generateStructured({
    system: [
      "Você é o analista operacional local do Trama.",
      "Use somente os registros fornecidos; não invente progresso, conclusão, prazo ou fato.",
      "Priorize compromissos concretos, riscos, prazos e perguntas dependentes do usuário.",
      "Escreva em português claro. Retorne apenas o JSON solicitado."
    ].join(" "),
    prompt: `Momento da revisão: ${now ?? new Date().toISOString()}\nContexto operacional:\n${JSON.stringify(context)}`,
    schema: operationalBriefingSchema,
    temperature: 0.1
  });
  return result({ briefing, provider: "ollama", model: localAi.model },
    `Local AI drafted ${briefing.priorities.length} priorities.`);
});

server.registerTool("create_plot", {
  title: "Create a Trama or Case",
  description: "Create a root Trama with parentPlotId null or a resolvable Case directly under a root Trama. Never create a Case under another Case.",
  inputSchema: {
    title: z.string().min(1), goal: z.string().min(1), centralQuestion: z.string().min(1),
    parentPlotId: z.string().min(1).nullable().optional(),
    lifecycleType: z.enum(["resolvable", "ongoing"]).optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (input) => {
  const plot = await service.createPlot({ ...input, parentPlotId: input.parentPlotId ?? null,
    lifecycleType: input.parentPlotId ? "resolvable" : input.lifecycleType ?? "resolvable" });
  return result({ plot }, `Created Plot “${plot.title}”.`);
});

server.registerTool("move_plot", {
  title: "Move a Trama or Case",
  description: "Move a resolvable context to the root or directly under a root Trama. Preserve Actions, Pontas Soltas and history; never create recursive Cases.",
  inputSchema: {
    plotId: z.string().min(1),
    parentPlotId: z.string().min(1).nullable()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (input) => {
  const plot = await service.reparentPlot(input);
  return result({ plot }, `Moved Plot “${plot.title}”.`);
});

server.registerTool("rename_plot", {
  title: "Rename a Trama or Case",
  description: "Change only the display title of an existing Trama or Case. Preserve its stable ID, relationships, Actions, Pontas Soltas, status, and history.",
  inputSchema: {
    plotId: z.string().min(1),
    title: z.string().min(1).max(160)
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (input) => {
  const plot = await service.renamePlot(input);
  return result({ plot }, `Renamed Plot to “${plot.title}”.`);
});

server.registerTool("set_plot_visibility", {
  title: "Set Plot visibility",
  description: "Show a Plot on the Investigator's Desk or hide it from that presentation surface. Private visibility is not authentication and does not block MCP or direct-link access.",
  inputSchema: {
    plotId: z.string().min(1),
    visibility: z.enum(["public", "private"])
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (input) => {
  const plot = await service.setPlotVisibility(input);
  return result({ plot }, plot.visibility === "private" ? `Hid Plot “${plot.title}” from the Desk.` : `Showed Plot “${plot.title}” on the Desk.`);
});

server.registerTool("set_plot_status", {
  title: "Set Plot status",
  description: "Mark a resolvable Trama or Case as active, completed, or archived after explicit confirmation. Ongoing Tramas cannot be completed. This preserves Actions, Pontas Soltas, progress, and history.",
  inputSchema: {
    plotId: z.string().min(1),
    status: z.enum(["active", "completed", "archived"])
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (input) => {
  const plot = await service.setPlotStatus(input);
  const message = plot.status === "active"
    ? `Reopened Plot “${plot.title}”.`
    : plot.status === "completed"
      ? `Completed Plot “${plot.title}”.`
      : `Archived Plot “${plot.title}”.`;
  return result({ plot }, message);
});

server.registerTool("set_plot_lifecycle_type", {
  title: "Set Trama lifecycle type",
  description: "Classify a root Trama as ongoing or resolvable. Cases are always resolvable. Do not infer this distinction when the user's intent is unclear.",
  inputSchema: {
    plotId: z.string().min(1),
    lifecycleType: z.enum(["resolvable", "ongoing"])
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (input) => {
  const plot = await service.setPlotLifecycleType(input);
  return result({ plot }, plot.lifecycleType === "ongoing"
    ? `Marked Trama “${plot.title}” as ongoing.`
    : `Marked “${plot.title}” as resolvable.`);
});

server.registerTool("create_open_loop", {
  title: "Create a Ponta Solta",
  description: "Create the operational thread that groups related Actions, or record a thread that only waits for an external event. Default requiresAction to true unless the user explicitly says there is nothing for them to do.",
  inputSchema: { plotId: z.string().min(1), title: z.string().min(1), description: z.string().optional(), requiresAction: z.boolean().default(true) },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (input) => {
  const openLoop = await service.createOpenLoop({ ...input, description: input.description ?? "" });
  return result({ openLoop }, `Created open loop “${openLoop.title}”.`);
});

server.registerTool("close_open_loop", {
  title: "Close a Ponta Solta",
  description: "Resolve a Ponta Solta after the user confirms what settled it, or dismiss it after the user confirms it is no longer relevant. Preserve the original context and record the closure reason in the audit history.",
  inputSchema: {
    openLoopId: z.string().min(1),
    status: z.enum(["resolved", "dismissed"]),
    resolution: z.string().min(1)
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (input) => {
  const openLoop = await service.closeOpenLoop(input);
  return result({ openLoop }, input.status === "resolved"
    ? `Resolved open loop “${openLoop.title}”.`
    : `Dismissed open loop “${openLoop.title}”.`);
});

server.registerTool("create_action", {
  title: "Create and prioritize an Action",
  description: "Create an executable commitment inside an open Ponta Solta after the user confirms what should be done and its completion deadline. Reuse a matching openLoopId when one exists; otherwise omit it and Trama creates the operational Ponta Solta automatically. Do not ask for numeric risk scores or a review date.",
  inputSchema: {
    plotId: z.string().min(1), openLoopId: z.string().min(1).nullable().optional(),
    title: z.string().min(1), description: z.string().optional(), owner: z.string().min(1),
    deadlineAt: z.string().datetime({ offset: true }),
    importance: z.enum(["low", "medium", "high", "critical"]),
    timing: z.enum(["flexible", "soon", "urgent"]),
    likelihood: z.number().int().min(0).max(5).optional(),
    riskDescription: z.string().optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (input) => {
  const impact = { low: 1, medium: 3, high: 4, critical: 5 }[input.importance];
  const urgency = { flexible: 1, soon: 3, urgent: 5 }[input.timing];
  const action = await service.createAction({
    plotId: input.plotId, openLoopId: input.openLoopId ?? null,
    title: input.title, description: input.description ?? "", owner: input.owner,
    deadlineAt: input.deadlineAt, nextReviewAt: automaticNextReviewAt(),
    risk: { likelihood: input.likelihood ?? 3, impact, urgency,
      description: input.riskDescription ?? "" },
    manualPriorityAdjustment: 0
  });
  return result({ action }, `Created and prioritized “${action.title}”.`);
});

server.registerTool("record_action_update", {
  title: "Record an Action update",
  description: "Append a reported step to the Action's progress log and optionally change its state. Record only what the user says happened; never predict future steps or mark completion without confirmation. The host schedules active Actions through the global review cadence; never ask the user for a review date.",
  inputSchema: {
    actionId: z.string().min(1),
    resolution: z.enum(["pending", "inProgress", "waiting", "blocked", "completed", "failed", "cancelled", "delegated", "noLongerNeeded"]),
    progress: z.string().min(1), occurredAt: z.string().datetime({ offset: true }).optional(),
    deadlineAt: z.string().datetime({ offset: true }).nullable().optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (input) => {
  const action = await service.recordActionUpdate({
    ...input,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    ...(["pending", "inProgress", "waiting", "blocked", "delegated"].includes(input.resolution)
      ? { nextReviewAt: automaticNextReviewAt() }
      : {})
  });
  return result({ action }, `Recorded a progress step for “${action.title}”.`);
});

server.registerTool("rename_action", {
  title: "Rename an Action",
  description: "Change only an Action title while preserving its stable ID, Plot, OpenLoop relationship, progress history, state, deadline, outcome, priority, and conversations. Use the authoritative Action ID and never create a replacement Action just to change its name.",
  inputSchema: {
    actionId: z.string().min(1),
    title: z.string().trim().min(1).max(200)
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (input) => {
  const action = await service.renameAction({ ...input, occurredAt: new Date().toISOString() });
  return result({ action }, `Renamed the Action to "${action.title}" while preserving its history.`);
});

const actionBatchOperationSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("rename"), actionId: z.string().min(1), title: z.string().trim().min(1).max(200) }),
  z.object({ operation: z.literal("recordStep"), actionId: z.string().min(1), progress: z.string().trim().min(1) }),
  z.object({ operation: z.literal("update"), actionId: z.string().min(1), resolution: z.enum(["pending", "inProgress", "waiting", "blocked", "completed", "failed", "cancelled", "delegated", "noLongerNeeded"]), progress: z.string().trim().min(1), deadlineAt: z.string().datetime({ offset: true }).nullable().optional() }),
  z.object({ operation: z.literal("reschedule"), actionId: z.string().min(1), deadlineAt: z.string().datetime({ offset: true }) })
]);

server.registerTool("apply_action_batch", {
  title: "Apply a batch of Action changes",
  description: "Apply 2 to 20 explicit Action operations from one user request. Each item must target an authoritative Action ID and is executed through the same audited domain command as the corresponding single operation. Present the complete batch for one human confirmation. Results are returned per item; earlier successful items remain committed if a later item fails. Never infer missing events, completion, deadlines, or titles.",
  inputSchema: { operations: z.array(actionBatchOperationSchema).min(2).max(20) },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async ({ operations }) => {
  const items = [];
  for (const [index, operation] of operations.entries()) {
    try {
      const occurredAt = new Date().toISOString();
      const value = operation.operation === "rename"
        ? await service.renameAction({ actionId: operation.actionId, title: operation.title, occurredAt })
        : operation.operation === "recordStep"
          ? await service.recordActionStep({ actionId: operation.actionId, progress: operation.progress, occurredAt })
          : operation.operation === "reschedule"
            ? await service.rescheduleAction({ actionId: operation.actionId, deadlineAt: operation.deadlineAt, occurredAt })
            : await service.recordActionUpdate({
                actionId: operation.actionId, resolution: operation.resolution, progress: operation.progress,
                occurredAt, ...(operation.deadlineAt !== undefined ? { deadlineAt: operation.deadlineAt } : {}),
                ...(["pending", "inProgress", "waiting", "blocked", "delegated"].includes(operation.resolution) ? { nextReviewAt: automaticNextReviewAt() } : {})
              });
      items.push({ index, operation: operation.operation, actionId: operation.actionId, status: "executed", value });
    } catch (error) {
      items.push({ index, operation: operation.operation, actionId: operation.actionId, status: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  }
  const executed = items.filter((item) => item.status === "executed").length;
  return result({ items, executed, failed: items.length - executed }, `Applied ${executed} of ${items.length} Action operations.`);
});

server.registerTool("record_action_step", {
  title: "Record an Action step",
  description: "Append one user-reported event to an Action's immutable progress log without changing its state, deadline, outcome, priority, or review cadence. Use this whenever the user reports something they did or something that happened within an Action. Do not merge separate reported events into one step. Before calling it for an active Action, establish whether the completion deadline stays the same or changes; use record_action_update with deadlineAt when the reported step also changes the deadline.",
  inputSchema: {
    actionId: z.string().min(1),
    progress: z.string().min(1),
    occurredAt: z.string().datetime({ offset: true }).optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (input) => {
  const progress = await service.recordActionStep({ ...input, occurredAt: input.occurredAt ?? new Date().toISOString() });
  return result({ progress }, "Recorded one Action progress step without changing the Action state.");
});

server.registerTool("reschedule_action", {
  title: "Reschedule an Action",
  description: "Change only an active Action's completion deadline. Preserve its current state and global review schedule; never use this tool to complete, cancel, dismiss, or otherwise close the Action. In Trama, 'prazo' always means the completion deadline. The host resolves supported relative expressions before calling this tool.",
  inputSchema: {
    actionId: z.string().min(1),
    deadlineAt: z.string().datetime({ offset: true })
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (input) => {
  const action = await service.rescheduleAction({ ...input, occurredAt: new Date().toISOString() });
  return result({ action }, `Rescheduled "${action.title}" without changing its state.`);
});

server.registerTool("run_operational_review", {
  title: "Run operational review",
  description: "Reevaluate active Plots and persist priority changes, attention items, required inputs, and notification intents.",
  inputSchema: {
    trigger: z.enum(["scheduled", "change", "manual"]).optional(),
    idempotencyKey: z.string().min(1).optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (input) => {
  const review = await service.runOperationalReview(input);
  const report = await service.getOperationalPriorityReport();
  return result({ review, report }, formatPriorityReport(report));
});

server.registerTool("answer_required_input", {
  title: "Answer a required input",
  description: "Record an authoritative answer supplied by the user for information Trama could not safely infer.",
  inputSchema: {
    requiredInputId: z.string().min(1), answer: z.unknown(),
    occurredAt: z.string().datetime({ offset: true }).optional()
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
}, async (input) => {
  const requiredInput = await service.answerRequiredInput({ ...input,
    occurredAt: input.occurredAt ?? new Date().toISOString() });
  return result({ requiredInput }, "Recorded the user's answer.");
});


return server;
}

export async function createServiceMcpTransport(service: TramaService | AsyncTramaService) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createTramaMcpServer(service).connect(serverTransport);
  return clientTransport;
}
