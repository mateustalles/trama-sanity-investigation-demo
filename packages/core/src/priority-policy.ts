import type {
  Action,
  PriorityAssessment,
  PriorityReason,
  RiskAssessment
} from "@trama/schemas";

const DAY_MS = 86_400_000;

export interface PriorityInput {
  now: Date;
  deadlineAt: string | null;
  nextReviewAt: string;
  resolution: Action["resolution"];
  risk: RiskAssessment;
  manualPriorityAdjustment: number;
}

export function calculatePriority(input: PriorityInput): PriorityAssessment {
  const reasons: PriorityReason[] = [];
  const deadline = input.deadlineAt ? new Date(input.deadlineAt) : null;
  const review = new Date(input.nextReviewAt);

  if (deadline) {
    const daysUntilDeadline = (deadline.getTime() - input.now.getTime()) / DAY_MS;
    const deadlineContribution = temporalPriority(daysUntilDeadline);
    if (daysUntilDeadline < 0) {
      reasons.push({ code: "deadlineOverdue", label: "O prazo está vencido.", contribution: deadlineContribution });
    } else if (daysUntilDeadline <= 1) {
      reasons.push({ code: "deadlineSoon", label: "O prazo vence em até 24 horas.", contribution: deadlineContribution });
    } else if (daysUntilDeadline <= 3) {
      reasons.push({ code: "deadlineSoon", label: "O prazo vence em até três dias.", contribution: deadlineContribution });
    } else if (daysUntilDeadline <= 7) {
      reasons.push({ code: "deadlineSoon", label: "O prazo vence nesta semana.", contribution: deadlineContribution });
    } else if (daysUntilDeadline <= 30) {
      reasons.push({ code: "deadlineSoon", label: "O prazo se aproxima neste mês.", contribution: deadlineContribution });
    }
  }

  if (input.risk.impact >= 4) {
    reasons.push({ code: "highImpact", label: "O impacto de não agir é alto.", contribution: input.risk.impact * 3 });
  }
  if (input.risk.likelihood >= 4) {
    reasons.push({ code: "highLikelihood", label: "A probabilidade do risco é alta.", contribution: input.risk.likelihood });
  }
  if (input.risk.urgency >= 4) {
    reasons.push({ code: "highUrgency", label: "O risco exige atenção urgente.", contribution: input.risk.urgency });
  }
  if (input.resolution === "blocked") {
    reasons.push({ code: "blocked", label: "A ação está bloqueada.", contribution: 5 });
  }
  if (review.getTime() <= input.now.getTime()) {
    reasons.push({ code: "stale", label: "A próxima revisão já está devida.", contribution: 5 });
  }
  if (input.manualPriorityAdjustment !== 0) {
    reasons.push({
      code: "manualAdjustment",
      label: "Existe um ajuste manual de prioridade.",
      contribution: input.manualPriorityAdjustment
    });
  }

  const riskBaseline = input.risk.impact * 3 + input.risk.likelihood + input.risk.urgency;
  const deadlinePriority = reasons.find((reason) => reason.code === "deadlineOverdue" || reason.code === "deadlineSoon")?.contribution ?? 0;
  const operationalPriority = reasons
    .filter((reason) => reason.code === "blocked" || reason.code === "stale")
    .reduce((sum, reason) => sum + reason.contribution, 0);
  const calculatedPriority = clamp(
    riskBaseline + deadlinePriority + operationalPriority
  );
  const effectivePriority = clamp(calculatedPriority + input.manualPriorityAdjustment);

  return {
    calculatedPriority,
    effectivePriority,
    reasons,
    calculatedAt: input.now.toISOString()
  };
}

function temporalPriority(daysUntilDeadline: number): number {
  if (daysUntilDeadline < 0) return Math.min(90, 75 + Math.abs(daysUntilDeadline) * 2);
  if (daysUntilDeadline <= 1) return 70 - daysUntilDeadline * 10;
  if (daysUntilDeadline <= 3) return 60 - (daysUntilDeadline - 1) * 10;
  if (daysUntilDeadline <= 7) return 40 - (daysUntilDeadline - 3) * 5;
  if (daysUntilDeadline <= 30) return 20 * (1 - (daysUntilDeadline - 7) / 23);
  return 0;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
