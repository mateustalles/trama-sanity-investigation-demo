import {
  buildActionWorkflow,
  buildGuidedActionProposal,
  validateActionWorkflowProposal,
  validateGuidedActionRequest,
  type GuidedActionInput
} from "./action-workflow";

export interface GuidedAgendaEvalCase {
  id: string;
  agendaAction: { id: string; title: string; resolution: string; deadlineAt: string | null };
  request: GuidedActionInput;
  expected?: { toolName: string; arguments: Record<string, unknown> };
  expectedError?: string;
}

export const guidedAgendaEvalCases: GuidedAgendaEvalCase[] = [
  {
    id: "agenda-record-progress",
    agendaAction: { id: "travel", title: "Comprar passagem para o offsite", resolution: "inProgress", deadlineAt: "2026-08-20T20:00:00-03:00" },
    request: { actionId: "travel", operation: "recordStep", detail: "Comparei os voos disponíveis e separei duas opções." },
    expected: { toolName: "record_action_step", arguments: { actionId: "travel", progress: "Comparei os voos disponíveis e separei duas opções." } }
  },
  {
    id: "agenda-wait-for-school",
    agendaAction: { id: "school", title: "Confirmar data inicial da Júlia no PROMHS", resolution: "inProgress", deadlineAt: "2026-08-21T18:00:00-03:00" },
    request: { actionId: "school", operation: "wait", detail: "Recebi o e-mail, identifiquei conflito com o teatro e pedi um horário alternativo.", deadlineAt: "2026-08-24T23:59:00-03:00" },
    expected: { toolName: "record_action_update", arguments: { actionId: "school", resolution: "waiting", progress: "Recebi o e-mail, identifiquei conflito com o teatro e pedi um horário alternativo.", deadlineAt: "2026-08-24T23:59:00-03:00" } }
  },
  {
    id: "agenda-complete-enrollment",
    agendaAction: { id: "enrollment", title: "Concluir matrícula da Júlia", resolution: "inProgress", deadlineAt: "2026-08-20T11:15:00-03:00" },
    request: { actionId: "enrollment", operation: "complete", detail: "A matrícula foi concluída e a Júlia começou as aulas." },
    expected: { toolName: "record_action_update", arguments: { actionId: "enrollment", resolution: "completed", progress: "A matrícula foi concluída e a Júlia começou as aulas." } }
  },
  {
    id: "agenda-reschedule-dentist",
    agendaAction: { id: "dentist", title: "Levar Júlia ao retorno com o dentista", resolution: "pending", deadlineAt: "2026-08-24T13:30:00-03:00" },
    request: { actionId: "dentist", operation: "reschedule", deadlineAt: "2026-08-31T13:30:00-03:00" },
    expected: { toolName: "reschedule_action", arguments: { actionId: "dentist", deadlineAt: "2026-08-31T13:30:00-03:00" } }
  },
  {
    id: "agenda-rename-rental-form",
    agendaAction: { id: "rental", title: "Preencher ficha do imóvel", resolution: "inProgress", deadlineAt: "2026-08-20T18:00:00-03:00" },
    request: { actionId: "rental", operation: "rename", detail: "Corrigir renda e reenviar ficha do imóvel" },
    expected: { toolName: "rename_action", arguments: { actionId: "rental", title: "Corrigir renda e reenviar ficha do imóvel" } }
  },
  {
    id: "agenda-reopen-insurance",
    agendaAction: { id: "insurance", title: "Enviar documentos do seguro-fiança", resolution: "completed", deadlineAt: "2026-08-18T18:00:00-03:00" },
    request: { actionId: "insurance", operation: "reopen", deadlineAt: "2026-08-21T18:00:00-03:00" },
    expected: { toolName: "record_action_update", arguments: { actionId: "insurance", resolution: "pending", progress: "Ação reaberta conforme solicitação do usuário.", deadlineAt: "2026-08-21T18:00:00-03:00" } }
  },
  {
    id: "agenda-reject-wait-without-deadline",
    agendaAction: { id: "lawyer", title: "Aguardar retorno do advogado", resolution: "inProgress", deadlineAt: "2026-08-20T17:00:00-03:00" },
    request: { actionId: "lawyer", operation: "wait", detail: "Enviei os documentos solicitados." },
    expectedError: "Informe o prazo de conclusão"
  },
  {
    id: "agenda-reject-empty-result",
    agendaAction: { id: "visit", title: "Visitar o imóvel", resolution: "inProgress", deadlineAt: "2026-08-20T15:00:00-03:00" },
    request: { actionId: "visit", operation: "complete", detail: " " },
    expectedError: "Descreva o que aconteceu"
  },
  {
    id: "agenda-reject-invalid-date",
    agendaAction: { id: "doctor", title: "Marcar retorno médico", resolution: "pending", deadlineAt: "2026-08-22T12:00:00-03:00" },
    request: { actionId: "doctor", operation: "reschedule", deadlineAt: "semana que vem" },
    expectedError: "O prazo informado não é válido"
  },
  {
    id: "agenda-reject-terminal-progress",
    agendaAction: { id: "agreement", title: "Formalizar acordo judicial", resolution: "completed", deadlineAt: "2026-08-10T14:00:00-03:00" },
    request: { actionId: "agreement", operation: "recordStep", detail: "Acrescentei uma observação." },
    expectedError: "not offered"
  },
  {
    id: "agenda-reject-wrong-action",
    agendaAction: { id: "focused", title: "Responder à escola", resolution: "pending", deadlineAt: "2026-08-21T12:00:00-03:00" },
    request: { actionId: "another", operation: "recordStep", detail: "Respondi ao e-mail." },
    expectedError: "does not match"
  },
  ...([
    ["pending", "Enviar confirmação do offsite"],
    ["inProgress", "Separar documentos do seguro-fiança"],
    ["waiting", "Aguardar resposta da escola"],
    ["blocked", "Resolver pendência cadastral do imóvel"],
    ["delegated", "Acompanhar documento solicitado à contadora"]
  ] as const).flatMap(([resolution, title], index): GuidedAgendaEvalCase[] => {
    const actionId = `active-${resolution}`;
    const day = 22 + index;
    return [
      {
        id: `agenda-${resolution}-record-step`,
        agendaAction: { id: actionId, title, resolution, deadlineAt: `2026-08-${day}T18:00:00-03:00` },
        request: { actionId, operation: "recordStep", detail: `Registrei um avanço na ação ${title}.` },
        expected: { toolName: "record_action_step", arguments: { actionId, progress: `Registrei um avanço na ação ${title}.` } }
      },
      {
        id: `agenda-${resolution}-reschedule`,
        agendaAction: { id: actionId, title, resolution, deadlineAt: `2026-08-${day}T18:00:00-03:00` },
        request: { actionId, operation: "reschedule", deadlineAt: `2026-09-0${index + 1}T18:00:00-03:00` },
        expected: { toolName: "reschedule_action", arguments: { actionId, deadlineAt: `2026-09-0${index + 1}T18:00:00-03:00` } }
      },
      {
        id: `agenda-${resolution}-complete`,
        agendaAction: { id: actionId, title, resolution, deadlineAt: `2026-08-${day}T18:00:00-03:00` },
        request: { actionId, operation: "complete", detail: `O resultado esperado de ${title} foi alcançado.` },
        expected: { toolName: "record_action_update", arguments: { actionId, resolution: "completed", progress: `O resultado esperado de ${title} foi alcançado.` } }
      }
    ];
  }),
  ...([
    ["completed", "Matrícula da Júlia concluída"],
    ["failed", "Proposta de aluguel recusada"],
    ["cancelled", "Consulta que foi cancelada"],
    ["noLongerNeeded", "Documento que deixou de ser necessário"]
  ] as const).map(([resolution, title], index): GuidedAgendaEvalCase => ({
    id: `agenda-${resolution}-reopen`,
    agendaAction: { id: `terminal-${resolution}`, title, resolution, deadlineAt: "2026-08-18T18:00:00-03:00" },
    request: { actionId: `terminal-${resolution}`, operation: "reopen", deadlineAt: `2026-08-${25 + index}T18:00:00-03:00` },
    expected: { toolName: "record_action_update", arguments: { actionId: `terminal-${resolution}`, resolution: "pending", progress: "Ação reaberta conforme solicitação do usuário.", deadlineAt: `2026-08-${25 + index}T18:00:00-03:00` } }
  })),
  {
    id: "agenda-reject-reopen-active-action",
    agendaAction: { id: "already-active", title: "Enviar ficha do imóvel", resolution: "inProgress", deadlineAt: "2026-08-22T18:00:00-03:00" },
    request: { actionId: "already-active", operation: "reopen", deadlineAt: "2026-08-25T18:00:00-03:00" },
    expectedError: "not offered"
  },
  {
    id: "agenda-reject-progress-on-cancelled-action",
    agendaAction: { id: "cancelled-appointment", title: "Comparecer à consulta cancelada", resolution: "cancelled", deadlineAt: "2026-08-19T14:00:00-03:00" },
    request: { actionId: "cancelled-appointment", operation: "recordStep", detail: "Liguei para a clínica." },
    expectedError: "not offered"
  },
  {
    id: "agenda-reject-complete-already-completed-action",
    agendaAction: { id: "done-school", title: "Concluir matrícula escolar", resolution: "completed", deadlineAt: "2026-08-10T18:00:00-03:00" },
    request: { actionId: "done-school", operation: "complete", detail: "Foi concluída novamente." },
    expectedError: "not offered"
  },
  {
    id: "agenda-reject-rename-from-terminal-guided-menu",
    agendaAction: { id: "done-rental", title: "Visitar primeiro imóvel", resolution: "completed", deadlineAt: "2026-08-12T18:00:00-03:00" },
    request: { actionId: "done-rental", operation: "rename", detail: "Visitar imóvel escolhido" },
    expectedError: "not offered"
  }
];

export function evaluateGuidedAgendaCase(testCase: GuidedAgendaEvalCase): { passed: boolean; error: string | null } {
  try {
    const workflow = buildActionWorkflow(testCase.agendaAction);
    const requestError = validateGuidedActionRequest(workflow, testCase.request);
    if (requestError) throw new Error(requestError);
    const proposal = buildGuidedActionProposal(testCase.request);
    const validationError = validateActionWorkflowProposal(workflow, proposal.toolName, proposal.arguments);
    if (validationError) throw new Error(validationError);
    if (testCase.expectedError) return { passed: false, error: "Expected the request to be rejected." };
    const passed = JSON.stringify(proposal) === JSON.stringify(testCase.expected);
    return { passed, error: passed ? null : `Expected ${JSON.stringify(testCase.expected)}, received ${JSON.stringify(proposal)}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { passed: Boolean(testCase.expectedError && message.includes(testCase.expectedError)), error: message };
  }
}
