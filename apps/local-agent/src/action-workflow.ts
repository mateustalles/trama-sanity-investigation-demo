export type ActionWorkflowOperation =
  | "recordStep"
  | "wait"
  | "complete"
  | "reschedule"
  | "rename"
  | "reopen";

export interface ActionWorkflowSuggestion {
  operation: ActionWorkflowOperation;
  label: string;
  prompt: string;
  confirmation: string;
}

export interface ActionWorkflow {
  entityType: "action";
  entityId: string;
  entityTitle: string;
  currentResolution: string;
  allowedToolNames: string[];
  allowedResolutions: string[];
  suggestions: ActionWorkflowSuggestion[];
}

export interface GuidedActionInput {
  actionId: string;
  operation: ActionWorkflowOperation;
  detail?: string;
  deadlineAt?: string;
}

export interface GuidedActionProposal { toolName: string; arguments: Record<string, unknown> }

export type WorkflowDecision = "record_step" | "set_waiting" | "complete_action" | "reschedule" | "rename" | "reopen" | "clarify";
export interface WorkflowRoute { decision: WorkflowDecision; confidence: number }

const operationDecision: Record<ActionWorkflowOperation, WorkflowDecision> = {
  recordStep: "record_step", wait: "set_waiting", complete: "complete_action", reschedule: "reschedule", rename: "rename", reopen: "reopen"
};

export function workflowDecisionValues(workflow: ActionWorkflow): WorkflowDecision[] {
  const values: WorkflowDecision[] = ["clarify", ...workflow.suggestions.map((item) => operationDecision[item.operation])];
  return [...new Set(values)];
}

export function workflowDecisionSchema(workflow: ActionWorkflow): Record<string, unknown> {
  return {
    type: "object", additionalProperties: false, required: ["decision", "confidence"],
    properties: {
      decision: { type: "string", enum: workflowDecisionValues(workflow) },
      confidence: { type: "number", minimum: 0, maximum: 1 }
    }
  };
}

export function workflowRoutingExamples(workflow: ActionWorkflow): string {
  const available = new Set(workflowDecisionValues(workflow));
  const examples: Array<[WorkflowDecision, string, string]> = [
    ["record_step", "Liguei e ninguém atendeu.", "record_step"],
    ["set_waiting", "Eles disseram que retornam depois do almoço.", "set_waiting"],
    ["complete_action", "O resultado que eu precisava foi alcançado.", "complete_action"],
    ["reschedule", "Deixa para quinta às 14h.", "reschedule"],
    ["rename", "Troca o nome para Confirmar novo horário.", "rename"],
    ["reopen", "Preciso reabrir essa ação.", "reopen"],
    ["clarify", "Pode encerrar isso.", "clarify"]
  ];
  return examples.filter(([decision]) => available.has(decision)).map(([, message, decision]) => `User: ${message}\nDecision: ${decision}`).join("\n");
}

export function parseWorkflowRoute(value: string, workflow: ActionWorkflow): WorkflowRoute | null {
  try {
    const parsed = JSON.parse(value) as { decision?: unknown; confidence?: unknown };
    if (typeof parsed.decision !== "string" || !workflowDecisionValues(workflow).includes(parsed.decision as WorkflowDecision)) return null;
    if (typeof parsed.confidence !== "number" || !Number.isFinite(parsed.confidence) || parsed.confidence < 0 || parsed.confidence > 1) return null;
    return { decision: parsed.decision as WorkflowDecision, confidence: parsed.confidence };
  } catch { return null; }
}

export function toolsForWorkflowDecision(decision: WorkflowDecision): string[] {
  return decision === "record_step" ? ["record_action_step"]
    : decision === "set_waiting" || decision === "complete_action" || decision === "reopen" ? ["record_action_update"]
      : decision === "reschedule" ? ["reschedule_action"]
        : decision === "rename" ? ["rename_action"] : [];
}

export function validateWorkflowDecisionProposal(route: WorkflowRoute, toolName: string, arguments_: Record<string, unknown>): string | null {
  const expectedTool = toolsForWorkflowDecision(route.decision)[0];
  if (!expectedTool || toolName !== expectedTool) return `Tool ${toolName} does not match the structured route ${route.decision}.`;
  const expectedResolution: Partial<Record<WorkflowDecision, string>> = { set_waiting: "waiting", complete_action: "completed", reopen: "pending" };
  const resolution = expectedResolution[route.decision];
  if (resolution && arguments_.resolution !== resolution) return `Resolution ${String(arguments_.resolution)} does not match the structured route ${route.decision}.`;
  return null;
}

export function buildGuidedActionProposal(input: GuidedActionInput): GuidedActionProposal {
  const detail = input.detail?.trim() ?? "";
  if (["recordStep", "wait", "complete", "rename"].includes(input.operation) && !detail) throw new Error("Descreva o que aconteceu antes de continuar.");
  if (["wait", "reschedule", "reopen"].includes(input.operation) && !input.deadlineAt) throw new Error("Informe o prazo de conclusão antes de continuar.");
  if (input.deadlineAt && !Number.isFinite(new Date(input.deadlineAt).getTime())) throw new Error("O prazo informado não é válido.");
  if (input.operation === "recordStep") return { toolName: "record_action_step", arguments: { actionId: input.actionId, progress: detail } };
  if (input.operation === "wait") return { toolName: "record_action_update", arguments: { actionId: input.actionId, resolution: "waiting", progress: detail, deadlineAt: input.deadlineAt } };
  if (input.operation === "complete") return { toolName: "record_action_update", arguments: { actionId: input.actionId, resolution: "completed", progress: detail } };
  if (input.operation === "reschedule") return { toolName: "reschedule_action", arguments: { actionId: input.actionId, deadlineAt: input.deadlineAt } };
  if (input.operation === "rename") return { toolName: "rename_action", arguments: { actionId: input.actionId, title: detail } };
  if (input.operation === "reopen") return { toolName: "record_action_update", arguments: { actionId: input.actionId, resolution: "pending", progress: "Ação reaberta conforme solicitação do usuário.", deadlineAt: input.deadlineAt } };
  throw new Error("A operação guiada não é suportada.");
}

const activeResolutions = new Set(["pending", "inProgress", "waiting", "blocked", "delegated"]);
const terminalResolutions = new Set(["completed", "failed", "cancelled", "noLongerNeeded"]);

type WorkflowLocale = "pt-BR" | "en-US";

const actionLocalization: Record<WorkflowLocale, Record<ActionWorkflowOperation, {
  label: string;
  prompt: (title: string) => string;
  confirmation: string;
}>> = {
  "pt-BR": {
    recordStep: { label: "Registrar passo", prompt: (title) => `Quero registrar um passo dado na ação “${title}”: `, confirmation: "Registrar este passo na ação?" },
    wait: { label: "Registrar e aguardar", prompt: (title) => `Quero registrar um passo na ação “${title}” e aguardar uma resposta: `, confirmation: "Registrar a atualização e o novo prazo?" },
    complete: { label: "Concluir ação", prompt: (title) => `Concluí a ação “${title}”. O resultado foi: `, confirmation: "Concluir esta ação com este resultado?" },
    reschedule: { label: "Mudar prazo", prompt: (title) => `Quero mudar o prazo da ação “${title}” para `, confirmation: "Mudar o prazo desta ação?" },
    rename: { label: "Renomear ação", prompt: (title) => `Quero renomear a ação “${title}” para `, confirmation: "Renomear esta ação?" },
    reopen: { label: "Reabrir ação", prompt: (title) => `Quero reabrir a ação “${title}”.`, confirmation: "Reabrir esta ação?" }
  },
  "en-US": {
    recordStep: { label: "Record step", prompt: (title) => `I want to record a step for “${title}”: `, confirmation: "Record this step in the Action?" },
    wait: { label: "Record and wait", prompt: (title) => `I want to record an update for “${title}” and wait for a response: `, confirmation: "Record this update and deadline?" },
    complete: { label: "Complete Action", prompt: (title) => `I completed “${title}”. The outcome was: `, confirmation: "Complete this Action with this outcome?" },
    reschedule: { label: "Change deadline", prompt: (title) => `I want to change the deadline for “${title}” to `, confirmation: "Change this Action deadline?" },
    rename: { label: "Rename Action", prompt: (title) => `I want to rename “${title}” to `, confirmation: "Rename this Action?" },
    reopen: { label: "Reopen Action", prompt: (title) => `I want to reopen “${title}”.`, confirmation: "Reopen this Action?" }
  }
};

function suggestion(operation: ActionWorkflowOperation, title: string, locale: WorkflowLocale): ActionWorkflowSuggestion {
  const localization = actionLocalization[locale][operation];
  return { operation, label: localization.label, prompt: localization.prompt(title), confirmation: localization.confirmation };
}

export function buildActionWorkflow(action: {
  id: string;
  title: string;
  resolution: string;
}, locale: WorkflowLocale = "pt-BR"): ActionWorkflow {
  if (terminalResolutions.has(action.resolution)) {
    return {
      entityType: "action",
      entityId: action.id,
      entityTitle: action.title,
      currentResolution: action.resolution,
      allowedToolNames: ["record_action_update", "rename_action", "apply_action_batch"],
      allowedResolutions: ["pending"],
      suggestions: [suggestion("reopen", action.title, locale)]
    };
  }

  if (!activeResolutions.has(action.resolution)) {
    return {
      entityType: "action", entityId: action.id, entityTitle: action.title,
      currentResolution: action.resolution, allowedToolNames: [], allowedResolutions: [], suggestions: []
    };
  }

  return {
    entityType: "action",
    entityId: action.id,
    entityTitle: action.title,
    currentResolution: action.resolution,
    allowedToolNames: ["record_action_step", "record_action_update", "reschedule_action", "rename_action", "apply_action_batch"],
    allowedResolutions: ["pending", "inProgress", "waiting", "blocked", "delegated", "completed", "failed", "cancelled", "noLongerNeeded"],
    suggestions: ["recordStep", "wait", "complete", "reschedule", "rename"].map((item) => suggestion(item as ActionWorkflowOperation, action.title, locale))
  };
}

export function validateGuidedActionRequest(workflow: ActionWorkflow, input: GuidedActionInput): string | null {
  if (input.actionId !== workflow.entityId) return "The guided Action does not match the focused Action workflow.";
  if (!workflow.suggestions.some((suggestion) => suggestion.operation === input.operation)) {
    return `Operation ${input.operation} is not offered from ${workflow.currentResolution}.`;
  }
  return null;
}

export function actionWorkflowInstruction(workflow: ActionWorkflow): string {
  return [
    `Deterministic workflow for the focused Action “${workflow.entityTitle}” (${workflow.entityId}).`,
    `Current resolution: ${workflow.currentResolution}.`,
    `Allowed write tools: ${workflow.allowedToolNames.join(", ") || "none"}.`,
    `Allowed target resolutions for record_action_update: ${workflow.allowedResolutions.join(", ") || "none"}.`,
    "Choose only among these paths. A reported event normally records a step and keeps the Action open; complete it only when the user explicitly says its intended outcome was achieved. Ask one minimal clarification when none of the paths is supported."
  ].join(" ");
}

export function validateActionWorkflowProposal(
  workflow: ActionWorkflow,
  toolName: string,
  arguments_: Record<string, unknown>
): string | null {
  if (!workflow.allowedToolNames.includes(toolName)) {
    return `Tool ${toolName} is not allowed by the focused Action workflow.`;
  }
  if (toolName === "apply_action_batch") {
    return null;
  }
  if (arguments_.actionId !== workflow.entityId) {
    return "The proposed Action does not match the focused Action workflow.";
  }
  if (toolName === "record_action_update"
    && (typeof arguments_.resolution !== "string" || !workflow.allowedResolutions.includes(arguments_.resolution))) {
    return `Resolution ${String(arguments_.resolution)} is not allowed from ${workflow.currentResolution}.`;
  }
  return null;
}
