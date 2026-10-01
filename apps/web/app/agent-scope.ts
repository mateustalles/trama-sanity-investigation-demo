export type AgentScopeKind = "workspace" | "calendar" | "plot" | "case" | "openLoop" | "action";

export interface AgentScope {
  kind: AgentScopeKind;
  entityId: string;
  title: string;
  plotId?: string;
  actionId?: string;
}

export interface AgentScopeProjection {
  view?: string | undefined;
  plotId?: string | undefined;
  plotTitle?: string | undefined;
  plotKind?: "plot" | "case" | undefined;
  actionId?: string | undefined;
  actionTitle?: string | undefined;
}

export interface ScopeSuggestion { id: string; label: string; prompt: string }

export function resolveAgentScope(projection: AgentScopeProjection): AgentScope {
  if (projection.actionId && projection.actionTitle) return {
    kind: "action", entityId: projection.actionId, actionId: projection.actionId,
    ...(projection.plotId ? { plotId: projection.plotId } : {}), title: projection.actionTitle
  };
  if (projection.plotId) return {
    kind: projection.plotKind === "case" ? "case" : "plot",
    entityId: projection.plotId, plotId: projection.plotId,
    title: projection.plotTitle ?? (projection.plotKind === "case" ? "Caso atual" : "Trama atual")
  };
  if (projection.view === "calendar") return { kind: "calendar", entityId: "calendar", title: "Agenda" };
  return { kind: "workspace", entityId: "trama", title: projection.view === "hidden" ? "Tramas ocultas" : "Mesa do Investigador" };
}

export function suggestionsForScope(scope: AgentScope): ScopeSuggestion[] {
  if (scope.kind === "calendar") return [
    { id: "today", label: "Prioridades de hoje", prompt: "Mostre as ações mais prioritárias de hoje, com prazo e motivo da prioridade." },
    { id: "overdue", label: "Ver atrasadas", prompt: "Mostre todas as ações com prazo vencido e o próximo passo concreto de cada uma." },
    { id: "week", label: "Planejar 7 dias", prompt: "Organize as ações dos próximos sete dias em ordem de prioridade." }
  ];
  if (scope.kind === "workspace") return [
    { id: "priorities", label: "Revisar prioridades", prompt: "Faça uma revisão das prioridades de todas as Tramas ativas." },
    { id: "attention", label: "O que precisa de mim", prompt: "Mostre o que depende de uma resposta ou decisão minha agora." },
    { id: "waiting", label: "O que estou aguardando", prompt: "Mostre as ações e Pontas Soltas que estão aguardando outras pessoas ou acontecimentos." }
  ];
  if (scope.kind === "plot" || scope.kind === "case") return [
    { id: "summary", label: "Resumir contexto", prompt: `Resuma o estado atual de “${scope.title}”, sem inventar progresso.` },
    { id: "priorities", label: "Ver prioridades", prompt: `Mostre as ações prioritárias de “${scope.title}” e seus prazos.` },
    { id: "loose-ends", label: "Examinar pontas soltas", prompt: `Mostre as Pontas Soltas de “${scope.title}” e o que falta esclarecer em cada uma.` },
    { id: "next", label: "Definir próximo movimento", prompt: `Ajude a identificar o próximo movimento concreto em “${scope.title}”.` }
  ];
  if (scope.kind === "openLoop") return [
    { id: "investigate", label: "Investigar", prompt: `Ajude a investigar a Ponta Solta “${scope.title}” usando apenas o contexto registrado.` },
    { id: "action", label: "Ver ação necessária", prompt: `Verifique se a Ponta Solta “${scope.title}” exige uma ação nossa e qual informação ainda falta.` },
    { id: "close", label: "Avaliar fechamento", prompt: `Avalie se a Ponta Solta “${scope.title}” já pode ser fechada; não a feche sem confirmação.` }
  ];
  return [];
}
