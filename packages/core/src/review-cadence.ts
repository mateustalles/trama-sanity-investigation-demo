import { resolveSupportedLocale, temporalLocales, type SupportedLocale } from "./temporal-locales";
export { resolveSupportedLocale, type SupportedLocale } from "./temporal-locales";

export const DEFAULT_REVIEW_INTERVAL_HOURS = 24;

export function nextGlobalReviewAt(now: Date, intervalHours = DEFAULT_REVIEW_INTERVAL_HOURS): string {
  if (!Number.isFinite(intervalHours) || intervalHours <= 0) throw new Error("Global review interval must be a positive number of hours.");
  return new Date(now.getTime() + intervalHours * 60 * 60 * 1000).toISOString();
}

export interface RelativeDeadlineResolution { deadlineAt: string; expression: string; isPast: boolean }

function normalize(value: string, locale: SupportedLocale): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase(locale);
}

function addMonthsClamped(source: Date, amount: number): Date {
  const result = new Date(source); const originalDay = result.getDate();
  result.setDate(1); result.setMonth(result.getMonth() + amount);
  result.setDate(Math.min(originalDay, new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()));
  return result;
}

function applyTimeOrEndOfDay(target: Date, normalized: string, locale: SupportedLocale): void {
  const time = normalized.match(temporalLocales[locale].time);
  if (!time) { target.setHours(23, 59, 0, 0); return; }
  let hour = Number(time[1]); const meridiem = time[3]?.replaceAll(".", "");
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  target.setHours(hour, Number(time[2] ?? "0"), 0, 0);
}

export function resolveRelativeDeadline(input: string, now: Date, requestedLocale = "pt-BR"): RelativeDeadlineResolution | null {
  const locale = resolveSupportedLocale(requestedLocale); const lexicon = temporalLocales[locale];
  const normalized = normalize(input, locale); let target: Date | null = null; let expression = ""; let preserveExactTime = false;
  const quantity = normalized.match(lexicon.quantity);
  if (quantity) {
    const amount = /^\d+$/.test(quantity[1]!) ? Number(quantity[1]) : lexicon.numberWords[quantity[1]!] ?? Number.NaN;
    const unit = quantity[2]!; target = new Date(now); expression = quantity[0];
    if (unit.startsWith("minut")) { target.setMinutes(target.getMinutes() + amount); preserveExactTime = true; }
    else if (unit.startsWith("hora") || unit.startsWith("hour")) { target.setHours(target.getHours() + amount); preserveExactTime = true; }
    else if (unit.startsWith("dia") || unit.startsWith("day")) target.setDate(target.getDate() + amount);
    else if (unit.startsWith("semana") || unit.startsWith("week")) target.setDate(target.getDate() + amount * 7);
    else if (unit.startsWith("mes") || unit.startsWith("month")) target = addMonthsClamped(target, amount);
    else target.setFullYear(target.getFullYear() + amount);
  } else {
    const weekday = lexicon.weekdays.find(({ pattern }) => pattern.test(normalized));
    if (weekday) {
      target = new Date(now); expression = weekday.label;
      let daysAhead = (weekday.day - target.getDay() + 7) % 7;
      if (daysAhead === 0) daysAhead = 7;
      target.setDate(target.getDate() + daysAhead);
    }
    const phrase = lexicon.phrases.find(({ pattern }) => pattern.test(normalized));
    if (!target && phrase) {
      target = new Date(now); expression = phrase.label;
      if (phrase.unit === "day") target.setDate(target.getDate() + phrase.amount);
      else if (phrase.unit === "week") target.setDate(target.getDate() + phrase.amount * 7);
      else if (phrase.unit === "month") target = addMonthsClamped(target, phrase.amount);
      else target.setFullYear(target.getFullYear() + phrase.amount);
    }
  }
  if (!target) return null;
  if (!preserveExactTime || lexicon.time.test(normalized)) applyTimeOrEndOfDay(target, normalized, locale);
  return { deadlineAt: target.toISOString(), expression, isPast: target.getTime() < now.getTime() };
}
