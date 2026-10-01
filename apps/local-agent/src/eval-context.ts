import { actionWorkflowInstruction, buildActionWorkflow, type ActionWorkflow } from "./action-workflow";

export interface ActionEvalContextMock {
  currentTime: string;
  locale: "pt-BR" | "en-US";
  timeZone: string;
  focusedActionId: string | null;
  screenContext: {
    view: "plot" | "desk";
    route: string;
    plotId: string | null;
    actionId: string | null;
    actionTitle: string | null;
  };
  visibleDom: {
    agentView: "plot" | "desk";
    agentPlotId: string | null;
    expandedAction: { agentActionId: string; agentActionTitle: string } | null;
    visibleActionIds: string[];
  };
  mcpDashboard: {
    plot: { id: string; title: string; status: "active" } | null;
    actions: ActionEvalContextMock["actions"];
    actionProgress: Array<{ actionId: string; progress: string }>;
    openLoops: unknown[];
    attentionItems: unknown[];
    requiredInputs: unknown[];
  };
  actions: Array<{
    id: string;
    title: string;
    resolution: "inProgress";
    deadlineAt: string;
  }>;
  conversationFacts: string[];
  workflow: ActionWorkflow | null;
  legacyDescription: string;
}

function cleanTitle(value: string): string {
  return value.trim().replace(/[.;]$/, "");
}

function extractTitles(context: string): string[] {
  const focusedEnglish = context.match(/Expanded Action:?\s*([^.]+)/i)?.[1];
  if (focusedEnglish) return [cleanTitle(focusedEnglish)];
  const candidates = context.match(/Candidatas?:\s*([^.]*)/i)?.[1]
    ?.split(/[;,]|\se\s(?=[A-ZÁÉÍÓÚ])/).map(cleanTitle).filter(Boolean);
  if (candidates?.length) return candidates;
  const distinct = context.match(/Ações distintas para ([^.]+)/i)?.[1]
    ?.split(/\se\s|,/).map((title) => cleanTitle(`Ação de ${title}`)).filter(Boolean);
  if (distinct?.length) return distinct;
  const focused = context.match(/(?:Ação (?:aberta|expandida)|Ação da [^ ]+ está aberta na tela):?\s*([^.]+)/i)?.[1];
  if (focused) return [cleanTitle(focused)];
  const named = context.match(/(?:chamada|relacionada à)\s+([^.]+)/i)?.[1];
  if (named) return [cleanTitle(named)];
  if (/uma única Ação|uma Ação está expandida|uma única Ação ativa|a conversa (?:já )?(?:estabeleceu|trata)|uma única Ação e/i.test(context)) return ["Ação em foco"];
  if (/várias Ações|duas Ações|Ações e Pontas Soltas/i.test(context)) return ["Ação candidata A", "Ação candidata B"];
  return [];
}

export function buildEvalContextMock(sample: {
  id: string;
  context: string;
  locale?: "pt-BR" | "en-US";
  contextMock?: ActionEvalContextMock;
}): ActionEvalContextMock {
  if (sample.contextMock) return sample.contextMock;
  const titles = extractTitles(sample.context);
  const explicitlyNoFocus = /nenhuma (?:Ação|entidade).*?(?:aberta|foco)|várias Ações ativas|duas Ações candidatas.*nenhuma está em foco|no Action is focused|multiple Actions/i.test(sample.context);
  const focused = !explicitlyNoFocus && titles.length === 1;
  const actions = titles.map((title, index) => ({
    id: `${sample.id}-action-${index + 1}`,
    title,
    resolution: "inProgress" as const,
    deadlineAt: "2026-08-20T18:00:00-03:00"
  }));
  const workflow = focused && actions[0] ? buildActionWorkflow(actions[0]) : null;
  const plotId = actions.length ? `${sample.id}-plot-1` : null;
  return {
    currentTime: "2026-08-13T12:00:00-03:00",
    locale: sample.locale ?? "pt-BR",
    timeZone: "America/Sao_Paulo",
    focusedActionId: workflow?.entityId ?? null,
    screenContext: {
      view: plotId ? "plot" : "desk",
      route: plotId ? `/?plot=${plotId}` : "/",
      plotId,
      actionId: workflow?.entityId ?? null,
      actionTitle: workflow?.entityTitle ?? null
    },
    visibleDom: {
      agentView: plotId ? "plot" : "desk",
      agentPlotId: plotId,
      expandedAction: workflow ? { agentActionId: workflow.entityId, agentActionTitle: workflow.entityTitle } : null,
      visibleActionIds: actions.map((action) => action.id)
    },
    mcpDashboard: {
      plot: plotId ? { id: plotId, title: "Trama de avaliação", status: "active" } : null,
      actions,
      actionProgress: [], openLoops: [], attentionItems: [], requiredInputs: []
    },
    actions,
    conversationFacts: [sample.context],
    workflow,
    legacyDescription: sample.context
  };
}

export function formatEvalContext(mock: ActionEvalContextMock): string {
  const workflow = mock.workflow ? actionWorkflowInstruction(mock.workflow) : "No focused Action workflow is active. Resolve an explicit unique target or clarify.";
  return [
    "Browser-derived screen hint (equivalent to the typed data-* projection; raw DOM is not authoritative):",
    JSON.stringify({ screenContext: mock.screenContext, visibleDom: mock.visibleDom }),
    "Authoritative get_plot_context MCP mock resolved by the host from that screen hint:",
    JSON.stringify({ dashboard: mock.mcpDashboard }),
    `Conversation facts: ${JSON.stringify(mock.conversationFacts)}`,
    `Host workflow: ${workflow}`
  ].join("\n");
}
