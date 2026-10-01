export type SupportedLocale = "pt-BR" | "en-US";

export interface TemporalLocale {
  numberWords: Record<string, number>;
  quantity: RegExp;
  time: RegExp;
  weekdays: Array<{ pattern: RegExp; day: number; label: string }>;
  phrases: Array<{ pattern: RegExp; unit: "day" | "week" | "month" | "year"; amount: number; label: string }>;
}

export const temporalLocales: Record<SupportedLocale, TemporalLocale> = {
  "pt-BR": {
    numberWords: { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12 },
    quantity: /\b(?:daqui\s+a|em)\s+(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s+(minutos?|horas?|dias?|semanas?|mes(?:es)?|anos?)\b/,
    time: /\bas\s*(\d{1,2})(?:[:h](\d{2}))?\s*(?:h|horas?)?\b/,
    weekdays: [
      { pattern: /\b(?:proxima\s+)?segunda(?:-feira)?\b/, day: 1, label: "próxima segunda-feira" },
      { pattern: /\b(?:proxima\s+)?terca(?:-feira)?\b/, day: 2, label: "próxima terça-feira" },
      { pattern: /\b(?:proxima\s+)?quarta(?:-feira)?\b/, day: 3, label: "próxima quarta-feira" },
      { pattern: /\b(?:proxima\s+)?quinta(?:-feira)?\b/, day: 4, label: "próxima quinta-feira" },
      { pattern: /\b(?:proxima\s+)?sexta(?:-feira)?\b/, day: 5, label: "próxima sexta-feira" },
      { pattern: /\b(?:proximo\s+)?sabado\b/, day: 6, label: "próximo sábado" },
      { pattern: /\b(?:proximo\s+)?domingo\b/, day: 0, label: "próximo domingo" }
    ],
    phrases: [
      { pattern: /\bdepois de amanha\b/, unit: "day", amount: 2, label: "depois de amanhã" },
      { pattern: /\bamanha\b/, unit: "day", amount: 1, label: "amanhã" },
      { pattern: /\bontem\b/, unit: "day", amount: -1, label: "ontem" },
      { pattern: /\bhoje\b/, unit: "day", amount: 0, label: "hoje" },
      { pattern: /\b(semana que vem|proxima semana|semana seguinte)\b/, unit: "week", amount: 1, label: "semana que vem" },
      { pattern: /\b(mes que vem|proximo mes|mes seguinte)\b/, unit: "month", amount: 1, label: "mês que vem" },
      { pattern: /\b(ano que vem|proximo ano|ano seguinte)\b/, unit: "year", amount: 1, label: "ano que vem" }
    ]
  },
  "en-US": {
    numberWords: { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 },
    quantity: /\bin\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(minutes?|hours?|days?|weeks?|months?|years?)\b/,
    time: /\bat\s*(\d{1,2})(?::(\d{2}))?\s*(?:(a\.?m\.?|p\.?m\.?))?\b/,
    weekdays: [
      { pattern: /\b(?:next\s+)?monday\b/, day: 1, label: "next Monday" },
      { pattern: /\b(?:next\s+)?tuesday\b/, day: 2, label: "next Tuesday" },
      { pattern: /\b(?:next\s+)?wednesday\b/, day: 3, label: "next Wednesday" },
      { pattern: /\b(?:next\s+)?thursday\b/, day: 4, label: "next Thursday" },
      { pattern: /\b(?:next\s+)?friday\b/, day: 5, label: "next Friday" },
      { pattern: /\b(?:next\s+)?saturday\b/, day: 6, label: "next Saturday" },
      { pattern: /\b(?:next\s+)?sunday\b/, day: 0, label: "next Sunday" }
    ],
    phrases: [
      { pattern: /\bday after tomorrow\b/, unit: "day", amount: 2, label: "day after tomorrow" },
      { pattern: /\btomorrow\b/, unit: "day", amount: 1, label: "tomorrow" },
      { pattern: /\byesterday\b/, unit: "day", amount: -1, label: "yesterday" },
      { pattern: /\btoday\b/, unit: "day", amount: 0, label: "today" },
      { pattern: /\bnext week\b/, unit: "week", amount: 1, label: "next week" },
      { pattern: /\bnext month\b/, unit: "month", amount: 1, label: "next month" },
      { pattern: /\bnext year\b/, unit: "year", amount: 1, label: "next year" }
    ]
  }
};

export function resolveSupportedLocale(value?: string): SupportedLocale {
  return value?.toLowerCase().startsWith("en") ? "en-US" : "pt-BR";
}
