export interface CalendarDay {
  dateKey: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function parseMonthKey(value: string | undefined, fallback = new Date()): Date {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return new Date(fallback.getFullYear(), fallback.getMonth(), 1, 12);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 2000 || year > 2200 || month < 1 || month > 12) return new Date(fallback.getFullYear(), fallback.getMonth(), 1, 12);
  return new Date(year, month - 1, 1, 12);
}

export function adjacentMonthKey(month: Date, offset: number): string {
  return monthKey(new Date(month.getFullYear(), month.getMonth() + offset, 1, 12));
}

export function buildMonthGrid(month: Date, today = new Date()): CalendarDay[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - mondayOffset, 12);
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index, 12);
    const dateKey = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return { dateKey, day: date.getDate(), inMonth: date.getMonth() === month.getMonth(), isToday: dateKey === todayKey };
  });
}

export function deadlineDateKey(value: string, timeZone = "America/Sao_Paulo"): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export const calendarActionStatuses = {
  pending: { symbol: "○", label: "Pendente", tone: "pending" },
  inProgress: { symbol: "↗", label: "Em andamento", tone: "progress" },
  waiting: { symbol: "●", label: "Aguardando", tone: "waiting" },
  blocked: { symbol: "!", label: "Bloqueada", tone: "blocked" },
  delegated: { symbol: "→", label: "Delegada", tone: "delegated" },
  completed: { symbol: "✓", label: "Concluída", tone: "completed" },
  failed: { symbol: "×", label: "Falhou", tone: "cancelled" },
  cancelled: { symbol: "×", label: "Cancelada", tone: "cancelled" },
  noLongerNeeded: { symbol: "×", label: "Dispensada", tone: "cancelled" }
} as const;

export function calendarActionStatus(resolution: string) {
  return calendarActionStatuses[resolution as keyof typeof calendarActionStatuses]
    ?? calendarActionStatuses.pending;
}
