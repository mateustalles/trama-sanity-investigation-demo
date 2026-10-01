import {
  entityWorkflowSchema,
  type Action,
  type EntityWorkflow,
  type OpenLoop,
  type Plot,
  type WorkflowLocale,
  type WorkflowOperation
} from "@trama/schemas";

type Localization = Record<WorkflowLocale, Pick<WorkflowOperation, "label" | "prompt" | "confirmation">>;

interface WorkflowDefinition<T extends Plot | OpenLoop | Action> {
  id: string;
  command: string;
  requiredFields: string[];
  allowedWhen: (entity: T) => boolean;
  localization: Localization;
}

function operation<T extends Plot | OpenLoop | Action>(definition: WorkflowDefinition<T>, locale: WorkflowLocale): WorkflowOperation {
  return {
    id: definition.id,
    command: definition.command,
    requiredFields: definition.requiredFields,
    ...definition.localization[locale]
  };
}

const plotDefinitions: WorkflowDefinition<Plot>[] = [
  {
    id: "plot.createCase", command: "create_plot", requiredFields: ["title", "goal", "centralQuestion"],
    allowedWhen: (entity) => entity.parentPlotId === null && entity.status === "active",
    localization: {
      "pt-BR": { label: "Criar Caso", prompt: "Qual Caso você quer criar nesta Trama?", confirmation: "Criar este Caso nesta Trama?" },
      "en-US": { label: "Create case", prompt: "Which case do you want to create in this Plot?", confirmation: "Create this case in this Plot?" }
    }
  },
  {
    id: "plot.rename", command: "rename_plot", requiredFields: ["title"],
    allowedWhen: () => true,
    localization: {
      "pt-BR": { label: "Renomear", prompt: "Qual é o novo nome?", confirmation: "Renomear esta Trama ou Caso?" },
      "en-US": { label: "Rename", prompt: "What is the new name?", confirmation: "Rename this Plot?" }
    }
  },
  {
    id: "plot.setVisibility", command: "set_plot_visibility", requiredFields: ["visibility"],
    allowedWhen: () => true,
    localization: {
      "pt-BR": { label: "Mostrar ou ocultar na Mesa", prompt: "Você quer mostrar ou ocultar este item na Mesa do Investigador?", confirmation: "Alterar a visibilidade deste item?" },
      "en-US": { label: "Set desk visibility", prompt: "Do you want to show or hide this item on the Investigator Desk?", confirmation: "Change this item's visibility?" }
    }
  },
  {
    id: "plot.complete", command: "set_plot_status", requiredFields: [],
    allowedWhen: (entity) => entity.status === "active" && entity.lifecycleType === "resolvable",
    localization: {
      "pt-BR": { label: "Concluir", prompt: "Esta Trama ou Caso foi concluído?", confirmation: "Marcar como concluído?" },
      "en-US": { label: "Complete", prompt: "Has this resolvable Plot been completed?", confirmation: "Mark as completed?" }
    }
  },
  {
    id: "plot.archive", command: "set_plot_status", requiredFields: [],
    allowedWhen: (entity) => entity.status === "active",
    localization: {
      "pt-BR": { label: "Arquivar", prompt: "Você quer arquivar este item?", confirmation: "Arquivar esta Trama ou Caso?" },
      "en-US": { label: "Archive", prompt: "Do you want to archive this item?", confirmation: "Archive this Plot?" }
    }
  },
  {
    id: "plot.reopen", command: "set_plot_status", requiredFields: [],
    allowedWhen: (entity) => entity.status === "completed" || entity.status === "archived",
    localization: {
      "pt-BR": { label: "Reabrir", prompt: "Você quer reabrir este item?", confirmation: "Reabrir esta Trama ou Caso?" },
      "en-US": { label: "Reopen", prompt: "Do you want to reopen this item?", confirmation: "Reopen this Plot?" }
    }
  }
];

const openLoopDefinitions: WorkflowDefinition<OpenLoop>[] = [
  {
    id: "openLoop.close", command: "close_open_loop", requiredFields: ["status", "resolution"],
    allowedWhen: (entity) => entity.status === "open",
    localization: {
      "pt-BR": { label: "Fechar Ponta Solta", prompt: "Como esta Ponta Solta foi encerrada?", confirmation: "Fechar esta Ponta Solta com este motivo?" },
      "en-US": { label: "Close open loop", prompt: "How was this OpenLoop settled?", confirmation: "Close this OpenLoop with this reason?" }
    }
  }
];

function resolve<T extends Plot | OpenLoop>(
  entity: T,
  entityType: "plot" | "openLoop",
  state: string,
  definitions: WorkflowDefinition<T>[],
  locale: WorkflowLocale
): EntityWorkflow {
  return entityWorkflowSchema.parse({
    entityType,
    entityId: entity.id,
    entityTitle: entity.title,
    state,
    operations: definitions.filter((definition) => definition.allowedWhen(entity)).map((definition) => operation(definition, locale))
  });
}

export function resolvePlotWorkflow(plot: Plot, locale: WorkflowLocale = "pt-BR"): EntityWorkflow {
  return resolve(plot, "plot", `${plot.status}:${plot.lifecycleType}`, plotDefinitions, locale);
}

export function resolveOpenLoopWorkflow(openLoop: OpenLoop, locale: WorkflowLocale = "pt-BR"): EntityWorkflow {
  return resolve(openLoop, "openLoop", openLoop.status, openLoopDefinitions, locale);
}

export interface GuidedEntityWorkflowInput {
  entityType: "plot" | "openLoop";
  entityId: string;
  operationId: string;
  fields?: Record<string, unknown>;
}

export interface GuidedEntityWorkflowProposal {
  toolName: string;
  arguments: Record<string, unknown>;
}

function text(fields: Record<string, unknown>, key: string): string {
  const value = fields[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Guided operation requires ${key}.`);
  return value.trim();
}

/** Converts a selected, server-resolved rail into the audited MCP command shape. */
export function buildGuidedEntityWorkflowProposal(
  workflow: EntityWorkflow,
  input: GuidedEntityWorkflowInput
): GuidedEntityWorkflowProposal {
  if (workflow.entityType !== input.entityType || workflow.entityId !== input.entityId) {
    throw new Error("The guided operation does not match the authoritative entity workflow.");
  }
  const operation = workflow.operations.find((candidate) => candidate.id === input.operationId);
  if (!operation) throw new Error(`Operation ${input.operationId} is not offered by the current entity workflow.`);
  const fields = input.fields ?? {};
  if (input.operationId === "plot.createCase") return { toolName: "create_plot", arguments: {
    title: text(fields, "title"), goal: text(fields, "goal"), centralQuestion: text(fields, "centralQuestion"),
    parentPlotId: workflow.entityId, lifecycleType: "resolvable"
  } };
  if (input.operationId === "plot.rename") return { toolName: "rename_plot", arguments: { plotId: workflow.entityId, title: text(fields, "title") } };
  if (input.operationId === "plot.setVisibility") {
    const visibility = fields.visibility;
    if (visibility !== "public" && visibility !== "private") throw new Error("Guided operation requires a valid visibility.");
    return { toolName: "set_plot_visibility", arguments: { plotId: workflow.entityId, visibility } };
  }
  if (input.operationId === "plot.complete") return { toolName: "set_plot_status", arguments: { plotId: workflow.entityId, status: "completed" } };
  if (input.operationId === "plot.archive") return { toolName: "set_plot_status", arguments: { plotId: workflow.entityId, status: "archived" } };
  if (input.operationId === "plot.reopen") return { toolName: "set_plot_status", arguments: { plotId: workflow.entityId, status: "active" } };
  if (input.operationId === "openLoop.close") {
    const status = fields.status;
    if (status !== "resolved" && status !== "dismissed") throw new Error("Guided operation requires a valid OpenLoop closure status.");
    return { toolName: "close_open_loop", arguments: { openLoopId: workflow.entityId, status, resolution: text(fields, "resolution") } };
  }
  throw new Error(`Guided operation ${input.operationId} is not implemented.`);
}
