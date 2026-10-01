"use client";

import { useEffect, useMemo, useState } from "react";
import { decisionLabels, expectedDecisionById, type ActionDecision, type ActionEvalSample } from "./samples";

type Rating = 0 | 1 | 2 | 3;
interface Evaluation { rating?: Rating; expected: string; decision?: ActionDecision; notes: string; updatedAt?: string }
type EvaluationMap = Record<string, Evaluation>;
const storageKey = "trama.action-evals.v1";

export function EvalWorkbench({ samples }: { samples: ActionEvalSample[] }) {
  const [evaluations, setEvaluations] = useState<EvaluationMap>({});
  const [filter, setFilter] = useState<"all" | "pending" | "rated">("all");
  const [category, setCategory] = useState("Todas");
  const [locale, setLocale] = useState<"all" | "pt-BR" | "en-US">("all");
  const [split, setSplit] = useState<"all" | "development" | "holdout">("all");
  const [ready, setReady] = useState(false);
  useEffect(() => { try { setEvaluations(JSON.parse(localStorage.getItem(storageKey) ?? "{}") as EvaluationMap); } catch { setEvaluations({}); } setReady(true); }, []);
  useEffect(() => { if (ready) localStorage.setItem(storageKey, JSON.stringify(evaluations)); }, [evaluations, ready]);

  const categories = useMemo(() => ["Todas", ...new Set(samples.map((sample) => sample.category))], [samples]);
  const rated = samples.filter((sample) => evaluations[sample.id]?.rating !== undefined).length;
  const visible = samples.filter((sample) => {
    const hasRating = evaluations[sample.id]?.rating !== undefined;
    const sampleSplit = sample.split ?? "development";
    return (split === "all" || sampleSplit === split) && (locale === "all" || (sample.locale ?? "pt-BR") === locale) && (category === "Todas" || sample.category === category) && (filter === "all" || (filter === "rated" ? hasRating : !hasRating));
  });

  function update(id: string, patch: Partial<Evaluation>) {
    const sample = samples.find((item) => item.id === id)!;
    setEvaluations((current) => ({ ...current, [id]: { expected: current[id]?.expected ?? sample.expected, notes: current[id]?.notes ?? "", ...current[id], ...patch, updatedAt: new Date().toISOString() } }));
  }

  function exportJson() {
    const payload = { schemaVersion: 2, exportedAt: new Date().toISOString(), samples: samples.map((sample) => ({ ...sample, split: sample.split ?? "development", expectedDecision: sample.expectedDecision ?? expectedDecisionById[sample.id], evaluation: evaluations[sample.id] ?? { expected: sample.expected, decision: sample.expectedDecision ?? expectedDecisionById[sample.id], notes: "" } })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `trama-action-evals-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  }

  return <main className="evalPage">
    <header className="evalHeader">
      <div><a href="/">← Mesa</a><span>LABORATÓRIO DO TRAMA</span><h1>Avaliação de linguagem</h1><p>Ensine ao agente quais frases representam seu uso real e qual comportamento você espera.</p></div>
      <div className="evalProgress"><strong>{rated}/{samples.length}</strong><span>avaliados</span><div><i style={{ width: `${rated / samples.length * 100}%` }} /></div></div>
    </header>
    <section className="evalToolbar" aria-label="Filtros e exportação">
      <label>Conjunto<select value={split} onChange={(event) => setSplit(event.target.value as typeof split)}><option value="all">Todos</option><option value="development">Desenvolvimento</option><option value="holdout">Teste cego</option></select></label>
      <label>Categoria<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Idioma<select value={locale} onChange={(event) => setLocale(event.target.value as typeof locale)}><option value="all">Todos</option><option value="pt-BR">Português</option><option value="en-US">English</option></select></label>
      <div className="evalFilters">{(["all", "pending", "rated"] as const).map((item) => <button type="button" className={filter === item ? "active" : ""} onClick={() => setFilter(item)} key={item}>{item === "all" ? "Todos" : item === "pending" ? "Pendentes" : "Avaliados"}</button>)}</div>
      <button type="button" className="evalExport" onClick={exportJson}>Exportar JSON</button>
    </section>
    <section className="evalList">
      {visible.map((sample) => {
        const evaluation = evaluations[sample.id]; const sampleNumber = Number(sample.id.split("-")[1]);
        return <article className={`evalCard ${evaluation?.rating !== undefined ? "rated" : ""}`} key={sample.id}>
          <div className="evalNumber"><span>{String(sampleNumber).padStart(2, "0")}</span><small>{sample.category}</small><small>{sample.locale ?? "pt-BR"} · {sample.variant ?? "canonical"}</small></div>
          <div className="evalContent">
            <blockquote>“{sample.message}”</blockquote>
            <p className="evalContext"><b>Contexto</b>{sample.context}</p>
            {sample.family && <p className="evalContext"><b>Família</b>{sample.family}{sample.pairId ? ` · par ${sample.pairId}` : ""}</p>}
            <label>Decisão esperada<select value={evaluation?.decision ?? sample.expectedDecision ?? expectedDecisionById[sample.id]} onChange={(event) => update(sample.id, { decision: event.target.value as ActionDecision })}>{Object.entries(decisionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label>Comportamento esperado<textarea value={evaluation?.expected ?? sample.expected} onChange={(event) => update(sample.id, { expected: event.target.value })} /></label>
            <label>Observações opcionais<textarea className="evalNotes" placeholder="Como você falaria? O que deveria acontecer diferente?" value={evaluation?.notes ?? ""} onChange={(event) => update(sample.id, { notes: event.target.value })} /></label>
          </div>
          <fieldset className="ratingScale"><legend>Você falaria assim?</legend>{([0, 1, 2, 3] as Rating[]).map((value) => <button type="button" aria-pressed={evaluation?.rating === value} className={evaluation?.rating === value ? "selected" : ""} onClick={() => update(sample.id, { rating: value })} key={value}><b>{value}</b><span>{["Não", "Pouco", "Talvez", "Sim"][value]}</span></button>)}</fieldset>
        </article>;
      })}
      {visible.length === 0 && <div className="evalEmpty">Nenhum sample neste filtro.</div>}
    </section>
    <footer className="evalFooter">As respostas ficam somente neste navegador até você exportar o arquivo.</footer>
  </main>;
}
