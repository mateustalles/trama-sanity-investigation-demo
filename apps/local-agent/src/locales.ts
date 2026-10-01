import { resolveSupportedLocale, type SupportedLocale } from "@trama/core";

const copy = {
  "pt-BR": {
    writeDisabled: "Essa solicitação altera o Trama. Ative “Permitir alterações” e envie novamente para eu preparar a confirmação.",
    askAction: "Qual ação você quer reagendar? Abra a ação ou diga o nome dela.",
    failed: "Não consegui preparar o reagendamento. Nada foi alterado.",
    unknownAction: "ação não identificada",
    description: (title: string) => `Passar a ação “${title}” para o novo prazo`,
    summary: (title: string, date: string, past: boolean) => `Você está falando da ação “${title}”. O prazo de conclusão será alterado para ${date}.${past ? " Atenção: essa data já passou." : ""} A revisão periódica continuará sendo administrada automaticamente pelo Trama e o estado da ação não será alterado.`
  },
  "en-US": {
    writeDisabled: "This request changes Trama. Enable “Allow changes” and send it again so I can prepare the confirmation.",
    askAction: "Which action should I reschedule? Open the action or tell me its name.",
    failed: "I could not prepare the reschedule. Nothing was changed.",
    unknownAction: "unidentified action",
    description: (title: string) => `Move “${title}” to the new deadline`,
    summary: (title: string, date: string, past: boolean) => `You are referring to “${title}”. Its completion deadline will change to ${date}.${past ? " Warning: this date is in the past." : ""} Trama will continue to manage periodic review automatically, and the action state will not change.`
  }
};

export function agentCopy(locale?: string) { return copy[resolveSupportedLocale(locale)]; }
export function formatAgentDate(value: unknown, locale: SupportedLocale, timeZone: string): string {
  if (typeof value !== "string") return locale === "pt-BR" ? "não informado" : "not provided";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone }).format(date);
}
