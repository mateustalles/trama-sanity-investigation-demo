import Link from "next/link";
import { adjacentMonthKey, buildMonthGrid, calendarActionStatus, deadlineDateKey, monthKey } from "./calendar-utils";

export interface CalendarAction {
  id: string;
  plotId: string;
  plotTitle: string;
  title: string;
  deadlineAt: string;
  resolution: string;
  priority: number;
}

const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export function ActionCalendar({ month, actions }: { month: Date; actions: CalendarAction[] }) {
  const days = buildMonthGrid(month);
  const grouped = new Map<string, CalendarAction[]>();
  for (const action of actions) {
    const key = deadlineDateKey(action.deadlineAt);
    grouped.set(key, [...(grouped.get(key) ?? []), action].sort((left, right) => right.priority - left.priority || left.deadlineAt.localeCompare(right.deadlineAt)));
  }
  const visibleMonth = monthKey(month);
  const monthActions = actions.filter((action) => deadlineDateKey(action.deadlineAt).startsWith(visibleMonth))
    .sort((left, right) => left.deadlineAt.localeCompare(right.deadlineAt));
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(month);

  return <section className="calendarPanel" aria-label={`Calendário de ações de ${label}`}>
    <header className="calendarHeader"><div><p className="kicker">Agenda das Tramas</p><h2>{label}</h2><p>Todos os prazos visíveis na Mesa, organizados pelo dia de cumprimento.</p></div><nav aria-label="Navegar entre meses"><Link href={`/?view=calendar&month=${adjacentMonthKey(month, -1)}`} aria-label="Mês anterior">←</Link><Link href={`/?view=calendar&month=${monthKey(new Date())}`}>Hoje</Link><Link href={`/?view=calendar&month=${adjacentMonthKey(month, 1)}`} aria-label="Próximo mês">→</Link></nav></header>
    <div className="calendarWeekdays" aria-hidden="true">{weekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
    <div className="calendarGrid">
      {days.map((day) => <article className={`calendarDay${day.inMonth ? "" : " outside"}${day.isToday ? " today" : ""}`} key={day.dateKey}>
        <time dateTime={day.dateKey}>{day.day}</time>
        <div>{(grouped.get(day.dateKey) ?? []).map((action) => {
          const status = calendarActionStatus(action.resolution);
          return <Link href={`/?plot=${action.plotId}`} className={`calendarAction status-${status.tone}${action.priority >= 75 ? " urgent" : ""}`} aria-label={`${action.title}. ${status.label}. ${action.plotTitle}.`} key={action.id}><i aria-hidden="true">{status.symbol}</i><small>{action.plotTitle}</small><strong>{action.title}</strong><span>{status.label} · {new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(action.deadlineAt))} · {action.priority}</span></Link>;
        })}</div>
      </article>)}
    </div>
    <div className="calendarAgenda"><h3>Prazos deste mês</h3>{monthActions.length === 0 && <p>Nenhuma ação com prazo neste mês.</p>}{monthActions.map((action) => { const status = calendarActionStatus(action.resolution); return <Link href={`/?plot=${action.plotId}`} className={`status-${status.tone}`} aria-label={`${action.title}. ${status.label}.`} key={action.id}><time>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(action.deadlineAt))}</time><i aria-hidden="true">{status.symbol}</i><span><small>{action.plotTitle}</small><strong>{action.title}</strong><em>{status.label}</em></span><b>{action.priority}</b></Link>; })}</div>
  </section>;
}
