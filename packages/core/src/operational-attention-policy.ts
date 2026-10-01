import type { Action, AttentionItem } from "@trama/schemas";

export interface AttentionObservation {
  kind: AttentionItem["kind"];
  severity: AttentionItem["severity"];
  summary: string;
  reasons: string[];
}

export function evaluateOperationalAttention(action: Action, now: Date): AttentionObservation[] {
  const observations: AttentionObservation[] = [];
  const reviewDue = new Date(action.nextReviewAt).getTime() <= now.getTime();
  const deadlineOverdue = action.deadlineAt !== null
    && new Date(action.deadlineAt).getTime() <= now.getTime();

  if (deadlineOverdue) observations.push({
    kind: "deadlineOverdue", severity: "critical", summary: `Prazo vencido: ${action.title}`,
    reasons: ["A ação permanece ativa após o prazo."]
  });
  if (reviewDue) observations.push({
    kind: "reviewDue", severity: "warning", summary: `Revisão devida: ${action.title}`,
    reasons: ["A data de próxima revisão foi alcançada."]
  });
  if (action.resolution === "blocked") observations.push({
    kind: "blocked", severity: "warning", summary: `Ação bloqueada: ${action.title}`,
    reasons: ["O bloqueio precisa de acompanhamento explícito."]
  });
  if (action.risk.impact >= 4 && action.risk.likelihood >= 4) observations.push({
    kind: "highRisk", severity: action.risk.urgency >= 4 ? "critical" : "warning",
    summary: `Risco alto: ${action.title}`,
    reasons: ["Impacto e probabilidade estão classificados como altos."]
  });
  if (action.resolution === "waiting" && reviewDue) observations.push({
    kind: "waitingStale", severity: "warning", summary: `Espera sem atualização: ${action.title}`,
    reasons: ["A ação aguarda terceiro e sua revisão está devida."]
  });

  return observations;
}
