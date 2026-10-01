import Link from "next/link";
import { closeOpenLoop, createOpenLoop, createPlot, renamePlot, setPlotLifecycleType, setPlotVisibility, updateAction } from "./actions";
import { getRequestTramaService, getTramaService } from "../lib/service";
import { requireHostedUser } from "../lib/supabase/session";
import { signOut } from "./login/actions";
import { ActionComposer } from "./action-composer";
import { InvestigatorBoard, type InvestigatorNode } from "./investigator-board";
import { ActionCalendar } from "./action-calendar";
import { parseMonthKey } from "./calendar-utils";

type PageProps = { searchParams: Promise<{ plot?: string; parent?: string; view?: string; mode?: string; month?: string }> };
type Dashboard = ReturnType<ReturnType<typeof getTramaService>["getPlotDashboard"]>;

const resolutionLabels: Record<string, string> = {
  pending: "Pendente", inProgress: "Em andamento", waiting: "Aguardando",
  blocked: "Bloqueada", completed: "Concluída", failed: "Falhou",
  cancelled: "Cancelada", delegated: "Delegada", noLongerNeeded: "Dispensada"
};

const activeResolutions = new Set(["pending", "inProgress", "waiting", "blocked", "delegated"]);

function formatDate(value: string | null): string {
  return value ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "Sem prazo";
}

function localDateInput(daysFromNow: number): string {
  const date = new Date(Date.now() + daysFromNow * 86_400_000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function attentionState(dashboard: Dashboard): { rank: number; label: string } {
  if (dashboard.plot.status === "completed") return { rank: 0, label: "Concluída" };
  if (dashboard.attentionItems.some((item) => item.severity === "critical")) return { rank: 5, label: "Precisa de você agora" };
  if (dashboard.requiredInputs.length) return { rank: 4, label: "Esperando uma resposta sua" };
  if (dashboard.attentionItems.length || topPriority(dashboard) >= 75) return { rank: 3, label: "Merece atenção hoje" };
  if (dashboard.actions.some((action) => action.resolution === "waiting")) return { rank: 2, label: "Aguardando acontecimentos" };
  if (dashboard.actions.some((action) => activeResolutions.has(action.resolution))) return { rank: 1, label: "Em progresso" };
  return { rank: 1, label: "Sob controle" };
}

function attentionLabel(dashboard: Dashboard): string {
  return attentionState(dashboard).label;
}

function statusTone(dashboard: Dashboard): "danger" | "success" | "warning" | "progress" | "neutral" {
  if (dashboard.plot.status === "completed") return "success";
  if (dashboard.attentionItems.some((item) => item.severity === "critical") || dashboard.requiredInputs.length) return "danger";
  if (dashboard.attentionItems.length || topPriority(dashboard) >= 75) return "danger";
  if (dashboard.actions.some((action) => action.resolution === "waiting")) return "warning";
  if (dashboard.actions.some((action) => activeResolutions.has(action.resolution))) return "progress";
  return "neutral";
}

function topPriority(dashboard: Dashboard): number {
  return Math.max(0, ...dashboard.actions.filter((action) => activeResolutions.has(action.resolution)).map((action) => action.priority.effectivePriority));
}

function plotFamily(dashboard: Dashboard, dashboards: Dashboard[]): Dashboard[] {
  const family = [dashboard];
  const visited = new Set([dashboard.plot.id]);
  for (let index = 0; index < family.length; index += 1) {
    const current = family[index];
    if (!current) continue;
    for (const candidate of dashboards) {
      if (candidate.plot.parentPlotId === current.plot.id && !visited.has(candidate.plot.id)) {
        visited.add(candidate.plot.id);
        family.push(candidate);
      }
    }
  }
  return family;
}

function rolledUpAttention(dashboard: Dashboard, dashboards: Dashboard[]) {
  return plotFamily(dashboard, dashboards)
    .map((source) => ({ ...attentionState(source), source }))
    .reduce((best, candidate) => candidate.rank > best.rank || (candidate.rank === best.rank && topPriority(candidate.source) > topPriority(best.source)) ? candidate : best);
}

function rolledUpPriority(dashboard: Dashboard, dashboards: Dashboard[]): number {
  return Math.max(...plotFamily(dashboard, dashboards).map(topPriority));
}

function PriorityPanel({ dashboards, variant = "detail" }: { dashboards: Dashboard[]; variant?: "desk" | "detail" }) {
  const items = dashboards.flatMap((item) => item.actions
    .filter((action) => activeResolutions.has(action.resolution))
    .map((action) => ({ action, plot: item.plot, attention: item.attentionItems.some((entry) => entry.entityId === action.id) })))
    .sort((left, right) => Number(right.attention) - Number(left.attention)
      || right.action.priority.effectivePriority - left.action.priority.effectivePriority
      || String(left.action.deadlineAt ?? "9999").localeCompare(String(right.action.deadlineAt ?? "9999")))
    .slice(0, 5);
  return <section className={`priorityPanel priorityPanel-${variant}`} aria-label="Painel de prioridades">
    <div className="sheetHeading"><div><p className="kicker">Prioridades agora</p><h2>O que fazer primeiro</h2></div><span className="countSeal">{items.length}</span></div>
    <div className="priorityPanelList">
      {items.length === 0 && <div className="quietState"><span>✓</span><div><strong>Nenhuma ação ativa exige atenção agora.</strong><p>As novas prioridades aparecerão aqui com o próximo passo concreto.</p></div></div>}
      {items.map(({ action, plot, attention }, index) => {
        const band = action.priority.effectivePriority >= 75 ? "high" : action.priority.effectivePriority >= 45 ? "medium" : "low";
        return <Link href={`/?plot=${plot.id}`} className={`priorityPanelRow priorityBand-${band}`} key={action.id}>
          <span className="priorityIndex">{String(index + 1).padStart(2, "0")}</span>
          <div className="priorityPanelMain"><small>{plot.title}</small><strong>{action.title}</strong><p>{attention ? "Existe um alerta operacional ligado a esta ação." : action.priority.reasons[0]?.label ?? "Ação ativa em acompanhamento."}</p></div>
          <div className="priorityPanelDeadline"><small>Prazo</small><strong>{formatDate(action.deadlineAt)}</strong><span>{action.priority.effectivePriority}</span></div>
        </Link>;
      })}
    </div>
  </section>;
}

export default async function Home({ searchParams }: PageProps) {
  await requireHostedUser();
  const service = await getRequestTramaService();
  const plots = await service.listPlots();
  const dashboards = await Promise.all(plots.map((plot) => service.getPlotDashboard(plot.id)));
  const params = await searchParams;
  const publicDashboards = dashboards.filter((item) => item.plot.visibility !== "private");
  const hiddenDashboards = dashboards.filter((item) => item.plot.visibility === "private");
  const requested = params.plot;
  const dashboard = requested ? dashboards.find((item) => item.plot.id === requested) ?? null : null;
  const parentDashboard = params.parent ? dashboards.find((item) => item.plot.id === params.parent) ?? null : null;
  const showingHidden = params.view === "hidden";
  const showingCalendar = params.view === "calendar" && !parentDashboard;
  const showingRootMap = !showingHidden && !parentDashboard && params.mode === "map";
  const displayedDashboards = showingHidden
    ? hiddenDashboards
    : publicDashboards.filter((item) =>
      item.plot.parentPlotId === (parentDashboard?.plot.id ?? null)
      && (!parentDashboard || item.plot.status !== "completed")
    );

  if (dashboard) {
    const childDashboards = dashboards.filter((item) => item.plot.parentPlotId === dashboard.plot.id && item.plot.status !== "completed");
    return <PlotDetail dashboard={dashboard} childDashboards={childDashboards} allDashboards={dashboards} mapMode={params.mode === "map"} />;
  }

  return (
    <main className="deskPage" data-agent-view={showingHidden ? "hidden" : showingCalendar ? "calendar" : parentDashboard ? "cases" : showingRootMap ? "root-map" : "desk"} data-agent-plot-id={parentDashboard?.plot.id} data-agent-plot-title={parentDashboard?.plot.title} data-agent-plot-kind={parentDashboard ? "plot" : undefined}>
      <DeskNav active={showingHidden ? "hidden" : showingCalendar ? "calendar" : "desk"} />
      <header className="deskHeader">
        <Link href="/" className="brand"><span className="brandMark">T</span><span><b>TRAMA</b><small>contexto vivo</small></span></Link>
        <div className="dateStamp"><span>{new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(new Date())}</span><b>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long" }).format(new Date())}</b></div>
        <details className="newPlotMenu">
          <summary>+ Nova trama</summary>
          <form action={createPlot} className="paperForm">
            <label>Título<input name="title" placeholder="Ex.: Mudança de apartamento" required /></label>
            <label>O que queremos alcançar?<textarea name="goal" required /></label>
            <label>O que precisamos descobrir ou decidir?<textarea name="centralQuestion" required /></label>
            <label>Que tipo de Trama é esta?<select name="lifecycleType" defaultValue="resolvable"><option value="resolvable">Tem uma resolução</option><option value="ongoing">É permanente</option></select></label>
            <button type="submit">Colocar sobre a mesa</button>
          </form>
        </details>
      </header>

      <div className="deskSurface">
        <section className="deskIntro">
          <p className="kicker">{showingHidden ? "Fora da vista" : showingCalendar ? "Tudo no tempo" : parentDashboard ? "Um contexto dentro de outro" : "Seu centro de investigação"}</p>
          <h1>{showingHidden ? "Tramas ocultas" : showingCalendar ? "Calendário" : parentDashboard ? `Casos de ${parentDashboard.plot.title}` : "Mesa do Investigador"}</h1>
          <p>{showingHidden ? "Estas Tramas continuam ativas, mas não aparecem sobre a Mesa." : showingCalendar ? "Veja em que dia cada ação precisa acontecer e antecipe os próximos prazos." : parentDashboard ? "Os contextos que fazem parte desta Trama." : "Veja o que está em movimento, o que precisa de você e o que não pode cair no esquecimento."}</p>
          {parentDashboard && <div className="subdeskActions"><Link href="/" className="deskTextLink">← Voltar à Mesa principal</Link><Link href={`/?plot=${parentDashboard.plot.id}`} className="deskTextLink">Abrir Trama-mãe →</Link></div>}
          {!showingHidden && !showingCalendar && !parentDashboard && <Link className="rootMapToggle" href={showingRootMap ? "/" : "/?mode=map"}>{showingRootMap ? "Ver cartões da Mesa" : "Ver mapa geral"}</Link>}
        </section>

        {!showingHidden && !showingCalendar && !showingRootMap && <PriorityPanel dashboards={parentDashboard ? plotFamily(parentDashboard, dashboards) : publicDashboards} variant="desk" />}

        {showingCalendar && <ActionCalendar month={parseMonthKey(params.month)} actions={publicDashboards.flatMap((item) => item.actions.filter((action) => action.deadlineAt).map((action) => ({ id: action.id, plotId: item.plot.id, plotTitle: item.plot.title, title: action.title, deadlineAt: action.deadlineAt!, resolution: action.resolution, priority: action.priority.effectivePriority })))} />}

        {showingRootMap && <RootEntityMap dashboards={publicDashboards} />}

        {!showingCalendar && !showingRootMap && <section className="plotsSection">
          <div className="plotsHeading"><div><p className="kicker light">{showingHidden ? "Arquivo reservado" : parentDashboard ? "Dentro desta Trama" : "Tramas em acompanhamento"}</p><h2>{showingHidden ? "Fora da Mesa" : parentDashboard ? "Casos" : "Tramas na raiz"}</h2></div><span>{displayedDashboards.length} {displayedDashboards.length === 1 ? "item" : "itens"}</span></div>
          <div className="plotCards">
            {displayedDashboards.map((item, index) => {
              const family = plotFamily(item, dashboards);
              const familyActions = family.flatMap((member) => member.actions);
              const active = familyActions.filter((action) => activeResolutions.has(action.resolution));
              const completed = familyActions.filter((action) => !activeResolutions.has(action.resolution));
              const openLoops = family.flatMap((member) => member.openLoops).filter((item) => item.status === "open");
              const childCount = publicDashboards.filter((candidate) => candidate.plot.parentPlotId === item.plot.id).length;
              const rolledUp = rolledUpAttention(item, dashboards);
              const inherited = rolledUp.source.plot.id !== item.plot.id;
              return (
                <article className={`plotCard tilt-${index % 4}`} key={item.plot.id}>
                  <span className="paperClip" />
                  <Link href={`/?plot=${item.plot.id}`} className="cardPrimary"><div className="cardTop"><span className="caseNumber">TRAMA {String(index + 1).padStart(2, "0")}</span><span className={`signal ${item.attentionItems.length ? "hot" : ""}`} /></div>
                    <h3>{item.plot.title}</h3><p className="cardGoal">{item.plot.goal}</p><div className={`cardStatus status-${statusTone(rolledUp.source)}`}>{item.plot.visibility === "private" ? "Oculta da Mesa" : `${parentDashboard && item.plot.status === "completed" ? "Caso concluído" : `${!parentDashboard && item.plot.lifecycleType === "ongoing" ? "Permanente · " : ""}${rolledUp.label}`}${inherited ? ` · ${rolledUp.source.plot.title}` : ""}`}</div>
                    <dl><div><dt>Próximos passos{family.length > 1 ? " · total" : ""}</dt><dd>{active.length}</dd></div><div><dt>Pontas soltas{family.length > 1 ? " · total" : ""}</dt><dd>{openLoops.length}</dd></div><div><dt>Concluídas{family.length > 1 ? " · total" : ""}</dt><dd>{completed.length}</dd></div></dl>
                    <div className="cardFooter"><span>{childCount ? "Maior prioridade" : "Prioridade atual"}</span><b>{rolledUpPriority(item, dashboards) || "—"}</b></div></Link>
                  {childCount > 0 && <Link className="subdeskLink" href={`/?parent=${item.plot.id}`}><span>▦</span>Casos <b>{childCount}</b></Link>}
                </article>
              );
            })}
            {!displayedDashboards.length && <article className="emptyCard"><span>+</span><h3>{showingHidden ? "Nenhuma Trama oculta." : parentDashboard ? "Esta Trama ainda não tem Casos ativos." : "A mesa está livre."}</h3><p>{showingHidden ? "Use “Ocultar da Mesa” para guardar uma Trama aqui." : "Crie uma nova Trama para colocar um assunto sobre a mesa."}</p></article>}
          </div>
        </section>}
      </div>
    </main>
  );
}

function DeskNav({ active }: { active: "desk" | "hidden" | "calendar" }) {
  return <aside className="deskSidebar" aria-label="Navegação principal">
    <Link href="/" className="navMonogram" aria-label="Trama">T</Link>
    <nav>
      <Link href="/" className={active === "desk" ? "sideNavItem active" : "sideNavItem"}><span>▦</span><small>Mesa</small></Link>
      <Link href="/?view=calendar" className={active === "calendar" ? "sideNavItem active" : "sideNavItem"}><span>□</span><small>Agenda</small></Link>
      <Link href="/?view=hidden" className={active === "hidden" ? "sideNavItem active" : "sideNavItem"}><span>◉</span><small>Ocultas</small></Link>
      <Link href="/evals" className="sideNavItem"><span>✎</span><small>Avaliar</small></Link>
      <Link href="/settings" className="sideNavItem"><span>⚙</span><small>Ajustes</small></Link>
      <form action={signOut}><button type="submit" className="sideNavItem"><span>↪</span><small>Sair</small></button></form>
    </nav>
  </aside>;
}

function RootEntityMap({ dashboards }: { dashboards: Dashboard[] }) {
  const roots = dashboards.filter((item) => item.plot.parentPlotId === null);
  const nodes: InvestigatorNode[] = [];
  for (const root of roots) {
    const rolledUp = rolledUpAttention(root, dashboards);
    nodes.push({
      id: root.plot.id, parentId: null, kind: "trama", title: root.plot.title,
      status: root.plot.status === "completed" ? "Concluída" : rolledUp.label,
      tone: statusTone(rolledUp.source), href: `/?plot=${root.plot.id}`, contextPlotId: root.plot.id
    });
    for (const child of dashboards.filter((item) => item.plot.parentPlotId === root.plot.id && item.plot.status !== "completed")) {
      nodes.push({
        id: child.plot.id, parentId: root.plot.id, kind: "case", title: child.plot.title,
        status: attentionLabel(child), tone: statusTone(child), href: `/?plot=${child.plot.id}`, contextPlotId: child.plot.id
      });
    }
  }
  for (const dashboard of dashboards) {
    for (const action of dashboard.actions) {
      const tone = !activeResolutions.has(action.resolution) ? "success" : action.priority.effectivePriority >= 75 ? "danger" : action.resolution === "waiting" ? "warning" : "progress";
      nodes.push({ id: action.id, parentId: action.openLoopId ?? dashboard.plot.id, kind: "action", title: action.title, status: resolutionLabels[action.resolution] ?? action.resolution, tone, contextPlotId: dashboard.plot.id, contextActionId: action.id });
      for (const step of dashboard.actionProgress.filter((item) => item.actionId === action.id)) nodes.push({
        id: step.id, parentId: action.id, kind: "step", title: step.description,
        status: formatDate(step.occurredAt), tone: "success", contextPlotId: dashboard.plot.id, contextActionId: action.id
      });
    }
    for (const loop of dashboard.openLoops.filter((item) => item.status === "open")) nodes.push({
      id: loop.id, parentId: dashboard.plot.id, kind: "openLoop", title: loop.title,
      status: loop.requiresAction ? "Exige ação nossa" : "Aguardando algo externo", tone: "warning", contextPlotId: dashboard.plot.id
    });
  }
  return <section className="entityMapPanel rootEntityMap" aria-label="Mapa geral das Tramas">
    <div className="mapHeading"><div><p className="kicker">Quadro geral de evidências</p><h2>Mapa da Mesa</h2><p>Veja várias Tramas ao mesmo tempo. Arraste as notas e clique para destacar os Casos ligados a cada uma.</p></div><div className="statusLegend" aria-label="Legenda de estados"><span className="status-success">Concluído</span><span className="status-danger">Precisa de atenção</span><span className="status-warning">Aguardando</span><span className="status-progress">Em progresso</span></div></div>
    <InvestigatorBoard plotId="root-desk" nodes={nodes} />
  </section>;
}

function CloseOpenLoopForm({ plotId, openLoopId }: { plotId: string; openLoopId: string }) {
  return <details className="closeOpenLoop"><summary>Fechar ponta solta</summary><form action={closeOpenLoop}><input type="hidden" name="plotId" value={plotId} /><input type="hidden" name="openLoopId" value={openLoopId} /><label>Como esta ponta foi encerrada?<textarea name="resolution" required /></label><label>Resultado<select name="status" defaultValue="resolved"><option value="resolved">Resolvida</option><option value="dismissed">Não é mais relevante</option></select></label><button type="submit">Registrar fechamento</button></form></details>;
}

function PlotDetail({ dashboard, childDashboards, allDashboards, mapMode }: { dashboard: Dashboard; childDashboards: Dashboard[]; allDashboards: Dashboard[]; mapMode: boolean }) {
  const pending = dashboard.actions.filter((action) => activeResolutions.has(action.resolution));
  const openLoops = dashboard.openLoops.filter((item) => item.status === "open");
  const operationalLoops = openLoops.filter((item) => item.requiresAction);
  const externalLoops = openLoops.filter((item) => !item.requiresAction);
  const legacyActions = pending.filter((action) => !action.openLoopId);
  const closedOpenLoops = dashboard.openLoops.filter((item) => item.status !== "open")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const terminalActionIds = new Set(dashboard.actions
    .filter((action) => !activeResolutions.has(action.resolution))
    .map((action) => action.id));
  const visibleAttentionItems = dashboard.attentionItems.filter((item) =>
    !(item.entityType === "action" && terminalActionIds.has(item.entityId))
  );
  const visibleAttentionIds = new Set(visibleAttentionItems.map((item) => item.id));
  const visibleRequiredInputs = dashboard.requiredInputs.filter((item) =>
    visibleAttentionIds.has(item.attentionItemId)
    && !(item.targetEntityType === "action" && terminalActionIds.has(item.targetEntityId))
  );
  const family = plotFamily(dashboard, allDashboards);
  const descendants = family.slice(1);
  const history = family.flatMap((member) => member.actions
    .filter((action) => !activeResolutions.has(action.resolution))
    .map((action) => ({ action, source: member.plot })))
    .sort((a, b) => b.action.updatedAt.localeCompare(a.action.updatedAt));
  const completedSubplots = descendants
    .filter((member) => member.plot.status === "completed")
    .sort((a, b) => b.plot.updatedAt.localeCompare(a.plot.updatedAt));
  const rolledUp = rolledUpAttention(dashboard, allDashboards);
  const inheritedFrom = rolledUp.source.plot.id !== dashboard.plot.id ? rolledUp.source.plot.title : null;
  const parent = dashboard.plot.parentPlotId ? allDashboards.find((item) => item.plot.id === dashboard.plot.parentPlotId) ?? null : null;
  return (
    <main className="detailPage" data-agent-view="plot" data-agent-plot-id={dashboard.plot.id} data-agent-plot-title={dashboard.plot.title} data-agent-plot-kind={dashboard.plot.parentPlotId ? "case" : "plot"}>
      <DeskNav active="desk" />
      <header className="detailNav"><div className="detailBackLinks">{parent && <Link href={`/?plot=${parent.plot.id}`} className="backLink">← Voltar à Trama: {parent.plot.title}</Link>}<Link href="/" className="backLink secondary">Mesa do Investigador</Link></div><span className="brandMini">TRAMA</span></header>
      <div className="caseFile">
        <section className="caseHero">
          <div><p className="kicker">{parent ? `Caso de ${parent.plot.title}` : dashboard.plot.lifecycleType === "ongoing" ? "Trama permanente" : "Trama resolvível"}</p><div className="editableTitle"><h1>{dashboard.plot.title}</h1><details><summary aria-label={`Renomear ${parent ? "Caso" : "Trama"}`}>✎</summary><form action={renamePlot}><input type="hidden" name="plotId" value={dashboard.plot.id} /><label>Novo nome<input name="title" defaultValue={dashboard.plot.title} maxLength={160} required /></label><button type="submit">Salvar nome</button></form></details></div><p>{dashboard.plot.goal}</p></div>
          <div className="caseControls"><div className={`caseState status-${statusTone(rolledUp.source)}`}><span />{dashboard.plot.visibility === "private" ? "Privada · fora da mesa" : `${parent && dashboard.plot.status === "completed" ? "Caso concluído" : `${!parent && dashboard.plot.lifecycleType === "ongoing" ? "Permanente · " : ""}${rolledUp.label}`}${inheritedFrom ? ` · ${inheritedFrom}` : ""}`}</div><div className="caseControlButtons"><Link className="mapViewButton" href={`/?plot=${dashboard.plot.id}${mapMode ? "" : "&mode=map"}`}>{mapMode ? "Visão normal" : "Ver mapa"}</Link>{!parent && <form action={setPlotLifecycleType}><input type="hidden" name="plotId" value={dashboard.plot.id} /><input type="hidden" name="lifecycleType" value={dashboard.plot.lifecycleType === "ongoing" ? "resolvable" : "ongoing"} /><button className="lifecycleButton" type="submit">{dashboard.plot.lifecycleType === "ongoing" ? "Tornar resolvível" : "Tornar permanente"}</button></form>}<form action={setPlotVisibility}><input type="hidden" name="plotId" value={dashboard.plot.id} /><input type="hidden" name="visibility" value={dashboard.plot.visibility === "private" ? "public" : "private"} /><button className="visibilityButton" type="submit">{dashboard.plot.visibility === "private" ? "Mostrar na Mesa" : "Ocultar da Mesa"}</button></form></div></div>
        </section>

        <div className="questionBanner"><small>Pergunta central</small><strong>{dashboard.plot.centralQuestion}</strong></div>

        <PriorityPanel dashboards={family} />

        {mapMode && <EntityMap dashboard={dashboard} allDashboards={allDashboards} />}

        {dashboard.plot.status === "completed" && <section className="completionBanner">
          <span>✓</span><div><small>{parent ? "Caso concluído" : "Trama concluída"}</small><strong>Parabéns! Este contexto chegou a uma conclusão.</strong><p>O histórico continua disponível como registro do que foi realizado.</p></div>
        </section>}

        {childDashboards.length > 0 && <section className="fileSection childPlotsSection">
          <div className="sectionHeading"><div><p className="kicker">Contextos relacionados</p><h2>Casos ativos</h2></div><span>{childDashboards.length}</span></div>
          <div className="childPlotGrid">
            {childDashboards.map((child) => <Link href={`/?plot=${child.plot.id}`} className={`childPlotCard status-border-${statusTone(child)}`} key={child.plot.id}>
              <div><small className={`status-text-${statusTone(child)}`}>{child.plot.status === "completed" ? "Caso concluído" : attentionLabel(child)}</small><strong>{child.plot.title}</strong><p>{child.plot.goal}</p></div>
              <span>→</span>
            </Link>)}
          </div>
          <Link href={`/?parent=${dashboard.plot.id}`} className="allChildrenLink">Ver todos os Casos →</Link>
        </section>}

        {(visibleAttentionItems.length > 0 || visibleRequiredInputs.length > 0) && <section className="attentionBoard">
          <div className="sectionHeading"><div><p className="kicker">Precisamos olhar</p><h2>Pontos de atenção</h2></div><span>{visibleAttentionItems.length + visibleRequiredInputs.length}</span></div>
          <div className="attentionGrid">
            {visibleAttentionItems.map((item) => <article className={`attentionNote ${item.severity}`} key={item.id}><small>{item.severity === "critical" ? "Importante" : "Acompanhar"}</small><strong>{item.summary}</strong><p>{item.reasons[0]}</p></article>)}
            {visibleRequiredInputs.map((item) => <article className="attentionNote question" key={item.id}><small>Precisamos descobrir</small><strong>{item.question}</strong><p>Esta resposta depende de você.</p></article>)}
          </div>
        </section>}

        <section className="fileSection openLoopWorkspace">
          <div className="sectionHeading"><div><p className="kicker">Frentes em aberto</p><h2>Pontas soltas e próximas ações</h2></div><span>{openLoops.length}</span></div>
          <div className="openLoopGroups">
            {openLoops.length === 0 && legacyActions.length === 0 && <p className="emptyText">Nenhuma ponta solta registrada.</p>}
            {operationalLoops.map((item) => {
              const actions = pending.filter((action) => action.openLoopId === item.id);
              return <article className="openLoopGroup" key={item.id}><header><span>?</span><div><small>Depende de ação nossa</small><strong>{item.title}</strong><p>{item.description}</p></div></header><div className="actionList nestedActions">{actions.length === 0 ? <p className="emptyText">Ainda não há uma ação para movimentar esta ponta.</p> : actions.map((action) => <ActionRow action={action} progress={dashboard.actionProgress.filter((entry) => entry.actionId === action.id)} plotId={dashboard.plot.id} key={action.id} />)}</div><CloseOpenLoopForm plotId={dashboard.plot.id} openLoopId={item.id} /></article>;
            })}
            {externalLoops.map((item) => <article className="openLoopGroup external" key={item.id}><header><span>…</span><div><small>Aguardando algo externo</small><strong>{item.title}</strong><p>{item.description}</p></div></header><CloseOpenLoopForm plotId={dashboard.plot.id} openLoopId={item.id} /></article>)}
            {legacyActions.length > 0 && <article className="openLoopGroup legacy"><header><span>↺</span><div><small>Compatibilidade</small><strong>Ações anteriores sem Ponta Solta</strong><p>Registros preservados de versões anteriores do Trama.</p></div></header><div className="actionList nestedActions">{legacyActions.map((action) => <ActionRow action={action} progress={dashboard.actionProgress.filter((entry) => entry.actionId === action.id)} plotId={dashboard.plot.id} key={action.id} />)}</div></article>}
          </div>
          <details className="addPanel"><summary>+ Registrar uma ponta solta</summary><form action={createOpenLoop} className="paperForm"><input type="hidden" name="plotId" value={dashboard.plot.id} /><label>Título<input name="title" required /></label><label>Contexto<textarea name="description" /></label><fieldset><legend>Isso depende de uma ação nossa?</legend><label><input type="radio" name="requiresAction" value="true" defaultChecked /> Sim, precisamos agir</label><label><input type="radio" name="requiresAction" value="false" /> Não, estamos aguardando</label></fieldset><button>Registrar</button></form></details>
        </section>
        <div className="actionComposerBar"><ActionComposer plotId={dashboard.plot.id} openLoops={operationalLoops} /></div>

        <section className="fileSection historySection"><div className="sectionHeading"><div><p className="kicker">O que já aconteceu</p><h2>Histórico</h2></div><span>{history.length}</span></div>
          {history.length === 0 ? <p className="emptyText">As ações concluídas aparecerão aqui.</p> : history.map(({ action, source }) => <div className="historyRow" key={action.id}><span>✓</span><div>{source.id !== dashboard.plot.id && <small className="historySource">Caso · {source.title}</small>}<strong>{action.title}</strong><p>{action.outcome || resolutionLabels[action.resolution]}</p></div><time>{formatDate(action.updatedAt)}</time></div>)}
        </section>

        {closedOpenLoops.length > 0 && <section className="fileSection historySection"><div className="sectionHeading"><div><p className="kicker">Contexto esclarecido</p><h2>Pontas fechadas</h2></div><span>{closedOpenLoops.length}</span></div>
          {closedOpenLoops.map((item) => <div className="historyRow" key={item.id}><span>✓</span><div><strong>{item.title}</strong><p>{item.resolution}</p></div><time>{formatDate(item.resolvedAt)}</time></div>)}
        </section>}

        {completedSubplots.length > 0 && <section className="fileSection completedSubplotsSection"><div className="sectionHeading"><div><p className="kicker">Contextos encerrados</p><h2>Casos concluídos</h2></div><span>{completedSubplots.length}</span></div>
          <div className="completedSubplotList">{completedSubplots.map((child) => <Link href={`/?plot=${child.plot.id}`} className="completedSubplotRow" key={child.plot.id}><span>✓</span><div><strong>{child.plot.title}</strong><p>{child.plot.goal}</p></div><time>{formatDate(child.plot.updatedAt)}</time></Link>)}</div>
        </section>}
      </div>
    </main>
  );
}

function EntityMap({ dashboard, allDashboards }: { dashboard: Dashboard; allDashboards: Dashboard[] }) {
  const cases = allDashboards.filter((item) => item.plot.parentPlotId === dashboard.plot.id);
  const branches = [dashboard, ...cases];
  const nodes: InvestigatorNode[] = [{
    id: dashboard.plot.id, parentId: null, kind: dashboard.plot.parentPlotId ? "case" : "trama",
    title: dashboard.plot.title, status: dashboard.plot.status === "completed" ? "Concluído" : attentionLabel(dashboard),
    tone: statusTone(dashboard), href: `/?plot=${dashboard.plot.id}&mode=map`, contextPlotId: dashboard.plot.id
  }];
  if (cases.length > 0) for (const branch of cases) nodes.push({
    id: branch.plot.id, parentId: dashboard.plot.id, kind: "case", title: branch.plot.title,
    status: branch.plot.status === "completed" ? "Caso concluído" : attentionLabel(branch), tone: statusTone(branch), href: `/?plot=${branch.plot.id}&mode=map`, contextPlotId: branch.plot.id
  });
  for (const branch of branches) {
    const parentId = branch.plot.id;
    for (const action of branch.actions) {
      const tone = !activeResolutions.has(action.resolution) ? "success" : action.priority.effectivePriority >= 75 ? "danger" : action.resolution === "waiting" ? "warning" : "progress";
      nodes.push({ id: action.id, parentId: action.openLoopId ?? parentId, kind: "action", title: action.title, status: resolutionLabels[action.resolution] ?? action.resolution, tone, contextPlotId: branch.plot.id, contextActionId: action.id });
      for (const step of branch.actionProgress.filter((item) => item.actionId === action.id)) nodes.push({ id: step.id, parentId: action.id, kind: "step", title: step.description, status: formatDate(step.occurredAt), tone: "success", contextPlotId: branch.plot.id, contextActionId: action.id });
    }
    for (const loop of branch.openLoops.filter((item) => item.status === "open")) nodes.push({ id: loop.id, parentId, kind: "openLoop", title: loop.title, status: loop.requiresAction ? "Exige ação nossa" : "Aguardando algo externo", tone: "warning", contextPlotId: branch.plot.id });
  }
  return <section className="entityMapPanel" aria-label="Mapa de entidades">
    <div className="mapHeading"><div><p className="kicker">Quadro de evidências</p><h2>Mapa da Trama</h2><p>Arraste as notas para organizar a leitura. Clique em uma delas para destacar suas relações.</p></div><div className="statusLegend" aria-label="Legenda de estados"><span className="status-success">Concluído</span><span className="status-danger">Precisa de atenção</span><span className="status-warning">Aguardando</span><span className="status-progress">Em progresso</span></div></div>
    <InvestigatorBoard plotId={dashboard.plot.id} nodes={nodes} />
  </section>;
}

function ActionRow({ action, progress, plotId }: { action: Dashboard["actions"][number]; progress: Dashboard["actionProgress"]; plotId: string }) {
  return <details className="actionRow" data-agent-action-id={action.id} data-agent-action-title={action.title}><summary><span className={`priorityDot priority-${Math.floor(action.priority.effectivePriority / 25)}`} /><div><small>{resolutionLabels[action.resolution]}</small><strong>{action.title}</strong><p>{action.description}</p></div><span className="actionScore">{action.priority.effectivePriority}</span></summary>
    <div className="actionUpdate">
      <div className="progressLog"><div className="progressHeading"><strong>Passos dados</strong><span>{progress.length}</span></div>
        {progress.length === 0 && <p className="emptyProgress">Nenhum passo registrado ainda.</p>}
        {progress.map((entry, index) => <div className="progressEntry" key={entry.id}><span>{String(index + 1).padStart(2, "0")}</span><div><p>{entry.description}</p><small>{formatDate(entry.occurredAt)} · {resolutionLabels[entry.resolutionAfter]}</small></div></div>)}
      </div>
      <form action={updateAction} className="updateForm"><input type="hidden" name="plotId" value={plotId} /><input type="hidden" name="actionId" value={action.id} /><label className="wide">Qual passo você deu?<textarea name="progress" placeholder="Ex.: Liguei para a clínica e pedi os horários disponíveis." required /></label><label>Como fica a ação agora?<select name="resolution" defaultValue={action.resolution}>{Object.entries(resolutionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><button>Registrar passo</button></form>
    </div>
  </details>;
}
