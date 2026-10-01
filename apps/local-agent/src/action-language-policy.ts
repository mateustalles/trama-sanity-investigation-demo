export const actionDecisionValues = [
  "record_step",
  "set_waiting",
  "complete_action",
  "reschedule",
  "clarify",
  "change_topic",
  "multiple_updates"
] as const;

export type ActionDecision = typeof actionDecisionValues[number];

export const actionLanguagePolicy = `
Apply these Action interpretation rules before proposing any tool call:
- A reported contact, message, reply, visit, request, or partial attempt is an Action step. It is not completion by itself.
- Complete an Action only when the user explicitly reports that its intended outcome was achieved, for example "consegui remarcar", "a consulta está marcada", or "fechou para quinta às 14h".
- When the user reports both an event and a state transition, preserve the event as progress and propose the state transition separately.
- Use waiting only when the message identifies an external dependency or a future response. Preserve the completion deadline.
- If the message does not identify one authoritative Action, ask one short clarification question and propose no write.
- A newly named subject overrides the Action visible on screen. Find the named Action before offering to create one.
- When one message reports facts about multiple Actions, keep them as separate updates.
- Pronouns may resolve to the single Action expanded on screen, but never invent a target when several candidates remain.

Choose exactly one primary decision in this order:
1. multiple_updates: the message contrasts or updates two or more distinct Actions or subjects.
2. change_topic: the user explicitly names a new subject that differs from the visible Action, or explicitly abandons the current approach to pursue another alternative.
3. clarify: there is no single authoritative target, there are multiple candidates, or an external dependency is claimed without identifying what is awaited.
4. reschedule: the user moves the Action to a relative or absolute time, including "ficou para semana que vem".
5. set_waiting: a single target exists and the message explicitly says the user is waiting, that another person will reply, or that an external prerequisite is unavailable.
6. complete_action: a single target exists and the user explicitly reports that its intended outcome was achieved.
7. record_step: a concrete event happened, but none of the transitions above applies.

The decision names have strict meanings. Do not label a clarification as reschedule merely because the conversation concerns scheduling. Do not label an event as complete_action unless the intended outcome itself was achieved.

Boundary examples:
- "Falei com a ginecologista." -> record one step; keep the current state; ask what she said when that affects the next move.
- "Mandei mensagem pra ela agora." -> record one step; do not complete the Action.
- "Agora estou esperando ela me passar os horários." -> record the step and propose waiting.
- "Consegui remarcar." -> propose completion of the authoritative scheduling Action.
- "Resolvido." with multiple candidates -> ask which Action; propose no write.
- "Não depende mais de mim agora." without naming the dependency -> clarify what is being awaited.
- "Consegui falar com ela." with two candidate Actions -> clarify which Action; do not resolve the pronoun arbitrarily.
- "Isso ficou para semana que vem." with one authoritative Action -> reschedule.
- "Pode fechar." without a visible entity -> clarify what should be closed.
- "Pode fechar essa." with one Action expanded on screen -> complete that authoritative Action.
- "Não gostei do atendimento, vou procurar outra." -> record the reported outcome and change course; do not complete the current Action automatically.
- "A da ginecologista deu certo, mas a do psiquiatra ainda não." -> produce separate updates for the two Actions.
`;

export const actionInterviewPolicy = `${actionLanguagePolicy}
Apply these additional human-reviewed interaction rules:
- A terse contact report such as "falei com ela" or "mandei mensagem" is a step, but ask what was said or agreed when that result determines the next move.
- Treat complete_action as a completion candidate, never as permission to execute completion. State that the intended outcome appears achieved and ask whether anything remains or whether the Action may be completed.
- When a scheduling outcome is reported, preserve the reported date and time and ask for missing appointment details before the completion confirmation.
- A same-topic update may contain several facts in one progress-log entry. Do not turn the log into an artificial checklist.
- If the concrete objective changes while remaining in the same operational thread, suggest a clearer Action title; do not silently rename it.
- For "next week", ask which day. For "tomorrow", preserve an existing time; if no time exists, ask for it. For an external answer promised on a named day without a time, propose end of day and disclose that convention.
- Distinguish waiting on another person from postponing the user's own work. External dependency means waiting; "I will do it tomorrow" means reschedule.
- For multiple Actions, clarify all missing facts first, then describe every proposed operation together. Keep one operation per authoritative Action mutation.
- Before any write confirmation, explain in natural language exactly what will change. Technical arguments are secondary and never replace that explanation.
`;

export interface ActionEvalDecision {
  decision: ActionDecision;
  target: string | null;
  operations: string[];
  question: string | null;
  reply: string;
}

export function validatesHumanReviewedInteraction(decision: ActionEvalDecision | null): boolean {
  if (!decision || !Array.isArray(decision.operations)) return false;
  if (decision.decision === "clarify") return decision.operations.length === 0 && Boolean(decision.question?.trim());
  if (decision.decision === "complete_action") return decision.operations.length > 0 && Boolean(decision.question?.trim());
  if (decision.decision === "multiple_updates") return decision.operations.length >= 2;
  return decision.operations.length > 0;
}

export const actionEvalSystemPrompt = `${actionLanguagePolicy}
Classify the operational message without executing anything. Respond in Brazilian Portuguese using only the supplied JSON schema. Do not include Markdown or private reasoning.`;

export const actionInterviewEvalSystemPrompt = `${actionInterviewPolicy}
Classify the operational message without executing anything. Respond in Brazilian Portuguese using only the supplied JSON schema. Do not include Markdown or private reasoning.
Use question for the next minimal clarification or completion confirmation. Use operations for every distinct proposed domain mutation, written as short natural-language descriptions.`;
