'use client';

import {useEffect, useRef, useState, type FormEvent, type ReactElement} from 'react';
import type {NativeDemoResult} from '../../../../../../scripts/sanity-kb-native-demo.mjs';
import {acceptDelta, activePath, addGeneratedEvidence, canUseAnchor, contestDelta, createGame, draftIssues, isContested, resetLocalNotebook, restoreGame, revertTo, type Delta, type DeltaDraft, type GameState} from './game-model';
import {initialEvidence} from './game-evidence';
import styles from './delta-game.module.css';

const storageKey = 'trama-synthetic-delta-game-v1';
const emptyDraft: DeltaDraft = {question: 'What explains the September checkout failures?', hypothesis: '', evidenceIds: [], rationale: '', conclusion: '', closesCase: false};

function Orbit({label, hypothesis, evidenceCount, rationale, small = false}: {label: string; hypothesis: string; evidenceCount: number; rationale: string; small?: boolean}) {
  return <div className={`${styles.orbit} ${small ? styles.smallOrbit : ''}`} aria-label={`${label}: hypothesis, ${evidenceCount} evidence items, rationale`}>
    <svg className={styles.triangle} viewBox="0 0 360 300" aria-hidden="true"><path d="M180 42 L55 246 L305 246 Z"/><path d="M180 42 L180 174 L55 246 M180 174 L305 246"/></svg>
    <span className={`${styles.orb} ${styles.hypothesisOrb}`}><i/><b>Hypothesis</b><small>{hypothesis.trim() ? 'Articulated' : 'Your explanation'}</small></span>
    <span className={`${styles.orb} ${styles.evidenceOrb}`}><i/><b>Evidence</b><small>{evidenceCount} selected</small></span>
    <span className={`${styles.orb} ${styles.rationaleOrb}`}><i/><b>Rationale</b><small>{rationale.trim() ? 'Connected' : 'Explain the link'}</small></span>
    <div className={styles.orbitCore}><span>Δ</span><strong>{label}</strong><small>{small ? 'Preserved step' : 'You build the decision'}</small></div>
  </div>;
}

export function DeltaGame() {
  const [state, setState] = useState<GameState>(() => createGame(initialEvidence));
  const [draft, setDraft] = useState<DeltaDraft>({...emptyDraft});
  const [ready, setReady] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<NativeDemoResult | null>(null);
  const [resultAdded, setResultAdded] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [resetRequested, setResetRequested] = useState(false);
  const searchVersion = useRef(0);
  const searchController = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      const restored = saved ? restoreGame(JSON.parse(saved)) : null;
      if (restored) setState(restored);
      else if (saved) setStorageWarning('The previous notebook could not be restored. A fresh case is open.');
    } catch { setStorageWarning('Browser storage is unavailable. You can still play and export this session.'); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(state)); }
    catch { setStorageWarning('This notebook cannot be saved in browser storage. Export it before leaving.'); }
  }, [state, ready]);
  useEffect(() => () => { searchController.current?.abort(); }, []);

  const head = state.deltas.find(delta => delta.id === state.headId);
  const reviewed = state.deltas.find(delta => delta.id === reviewId);
  const issues = draftIssues(state, draft);
  const pathIds = new Set(activePath(state).map(delta => delta.id));

  function renderBranch(delta: Delta): ReactElement {
    const valid = canUseAnchor(state, delta.id);
    const contested = isContested(state, delta.id);
    const children = state.deltas.filter(node => node.parentId === delta.id);
    return <li key={delta.id} className={styles.treeBranch}>
      <button type="button" onClick={() => setReviewId(delta.id)} aria-pressed={reviewId === delta.id} className={`${styles.mapNode} ${pathIds.has(delta.id) ? styles.activeNode : ''} ${!valid ? styles.contestedNode : ''}`}>
        <small>{delta.parentId ? `${delta.parentId} →` : 'Origin →'}</small><strong>△ {delta.id}</strong>
        <span>{contested ? 'Contested' : !valid ? 'Affected by contested ancestor' : delta.closesCase ? 'Player-concluded' : 'Open investigation'}</span>
        <p>{delta.hypothesis}</p>{delta.id === state.headId && <b>Current branch</b>}
      </button>
      {!!children.length && <ol className={styles.treeChildren}>{children.map(renderBranch)}</ol>}
    </li>;
  }

  function updateDraft<K extends keyof DeltaDraft>(key: K, value: DeltaDraft[K]) {
    setDraft(previous => ({...previous, [key]: value}));
  }
  function toggleEvidence(id: string) {
    setDraft(previous => ({...previous, evidenceIds: previous.evidenceIds.includes(id)
      ? previous.evidenceIds.filter(value => value !== id) : [...previous.evidenceIds, id]}));
  }
  function commit(event: FormEvent) {
    event.preventDefault();
    try {
      const next = acceptDelta(state, draft);
      setState(next); setReviewId(next.headId);
      setDraft({...emptyDraft, question: draft.question});
      setNotice(`${next.headId} accepted by you. ${draft.closesCase ? 'This branch is marked concluded, not independently proven. New evidence can reopen it.' : 'The investigation remains open.'} A new Delta is ready.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not accept this Delta.'); }
  }
  function returnTo(delta: Delta) {
    try { setState(revertTo(state, delta.id)); setNotice(`Returned to ${delta.id}. Your current draft is kept; accepting it now creates a branch here. No later Delta was deleted.`); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not return.'); }
  }
  function challenge(delta: Delta) {
    try {
      setState(contestDelta(state, delta.id, reason)); setReason('');
      setNotice(`${delta.id} contested. Affected descendants remain in history but cannot be used as branch points. If the active path was affected, it returns to an uncontested ancestor.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not contest this Delta.'); }
  }
  async function search(event: FormEvent) {
    event.preventDefault(); if (pending) return;
    const version = ++searchVersion.current;
    const controller = new AbortController();
    searchController.current = controller;
    setPending(true); setSearchError(''); setResult(null); setResultAdded(false);
    try {
      const response = await fetch('/api/poc/sanity/investigate', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({question}), cache: 'no-store', signal: controller.signal});
      const payload = await response.json() as NativeDemoResult & {error?: string};
      if (version !== searchVersion.current) return;
      if (!response.ok) throw new Error(payload.error ?? 'The Knowledge Base search could not be completed.');
      setResult(payload);
    } catch (error) { if (version === searchVersion.current) setSearchError(error instanceof Error ? error.message : 'Search failed.'); }
    finally {
      if (version === searchVersion.current) { setPending(false); searchController.current = null; }
    }
  }
  function keepContext() {
    if (!result || resultAdded) return;
    try {
      setState(addGeneratedEvidence(state, `KB context: ${result.question}`, result.search.text, result.question));
      setResultAdded(true); setNotice('The complete generated KB context was added to your notebook. Select it yourself if you want to use it in a Delta.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not keep context.'); }
  }
  function exportNotebook() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'trama-delta-notebook.json'; link.click(); URL.revokeObjectURL(url);
  }
  function reset() {
    if (!resetRequested) return;
    ++searchVersion.current;
    searchController.current?.abort(); searchController.current = null;
    setState(previous => resetLocalNotebook(previous, initialEvidence, true)); setDraft({...emptyDraft}); setReviewId(null);
    setQuestion(''); setResult(null); setResultAdded(false); setReason('');
    setPending(false); setSearchError(''); setStorageWarning('');
    setResetRequested(false);
    setNotice('A fresh local investigation is ready.');
  }

  return <main className={styles.page} lang="en"><div className={styles.shell}>
    <nav className={styles.nav} aria-label="Demo navigation"><a href="/poc/sanity/investigate">Trama × Sanity</a><span>Delta / Investigation game</span><a href="/poc/sanity/investigate">Read-only agent ↗</a></nav>
    <header className={styles.hero}><p className={styles.eyebrow}>You are the investigator</p><h1>A conclusion is a step.<br/><em>Not the end of the story.</em></h1>
      <p>Build an explanation from evidence. Show your reasoning. Accept a Delta, challenge it when new information arrives, and branch without erasing what you once believed.</p>
      <div className={styles.badges}><span>Fictional case</span><span>Browser-local simulation</span><span>No operational writes</span></div>
    </header>
    <section className={styles.brief} aria-labelledby="case-title"><div><p className={styles.eyebrow}>Your open question</p><h2 id="case-title">Fifteen minutes of failed checkouts</h2><p>On September 18, 2026, payments began failing between 10:00 and 10:15 UTC. A release had gone live nearby. Was it the change, a provider problem, or something else?</p><p>The six starting records are curated excerpts from our frozen synthetic benchmark corpus. Ask the live Sanity agent for more context, but remember: its generated interpretation is not original proof.</p></div><div className={styles.caseStatus}><span>Active branch</span><strong>{head?.closesCase ? 'Concluded by you' : 'Investigation open'}</strong><small>{head ? `Based on ${head.id}` : 'No Delta accepted yet'} · no correctness score</small></div></section>

    <section className={styles.stage} aria-label="Delta progression">
      <div className={styles.previous}>{head ? <><Orbit small label={head.id} hypothesis={head.hypothesis} evidenceCount={head.evidenceIds.length} rationale={head.rationale}/><p>{head.conclusion}</p><button type="button" onClick={() => setReviewId(head.id)}>Inspect this step</button></> : <div className={styles.emptyPast}><span>∅</span><h3>Start with uncertainty.</h3><p>Your first accepted Delta will stay here. Nothing is decided for you.</p></div>}</div>
      <span className={styles.stepArrow} aria-hidden="true">→</span>
      <div key={`${state.headId}-${state.deltas.length}`} className={styles.current}><p className={styles.eyebrow}>{head ? `Continuing from ${head.id}` : 'A new line of inquiry'}</p><Orbit label={`D${String(state.deltas.length + 1).padStart(2, '0')} / draft`} hypothesis={draft.hypothesis} evidenceCount={draft.evidenceIds.length} rationale={draft.rationale}/></div>
    </section>

    <div className={styles.workspace}>
      <section className={styles.notebook} aria-labelledby="evidence-heading"><p className={styles.eyebrow}>01 / Follow the clues</p><h2 id="evidence-heading">Evidence notebook</h2><p>Select supporting and challenging material. A reference alone does not prove a conclusion.</p>
        <div className={styles.evidenceList}>{state.evidence.map(item => <article key={item.id} className={draft.evidenceIds.includes(item.id) ? styles.selectedEvidence : styles.evidence}>
          <label><input type="checkbox" checked={draft.evidenceIds.includes(item.id)} onChange={() => toggleEvidence(item.id)}/><strong>{item.title}</strong></label><span className={styles.provenanceKind}>{item.kind === 'generated-context' ? 'Generated KB context / not original proof' : 'Frozen synthetic source excerpt'}</span><details><summary>Read the record</summary><p className={styles.sourceText}>{item.text}</p><small>{item.provenance}</small></details>
        </article>)}</div>
        <details className={styles.liveSearch}><summary>Ask Sanity for another clue</summary><p>The same read-only agent searches native Knowledge Base entries, then reasons with OpenAI. Your question goes to both providers and consumes the demo quota. Never include personal data.</p>
          <form onSubmit={search}><label htmlFor="game-search">Your investigation question</label><textarea id="game-search" rows={3} minLength={12} maxLength={600} required value={question} onChange={event => setQuestion(event.target.value)} disabled={pending}/><button type="submit" disabled={pending || question.trim().length < 12}>{pending ? 'Searching the KB…' : 'Ask the live agent →'}</button></form>
          {pending && <p role="status">Retrieving generated context; no Delta will be created automatically.</p>}{searchError && <p role="alert" className={styles.error}>{searchError}</p>}
          {result && <div className={styles.searchResult}><h3>What the agent suggests</h3><p>{result.answer.answer}</p><p><strong>Conclusion: </strong>{result.answer.conclusion}</p><p><strong>Limitations: </strong>{result.answer.limitations}</p><details><summary>Complete returned KB context</summary><p className={styles.sourceText}>{result.search.text}</p><small>Query: {result.search.arguments.query}</small></details><button type="button" onClick={keepContext} disabled={resultAdded}>{resultAdded ? 'Added to your notebook' : 'Keep generated context in notebook'}</button></div>}
        </details>
      </section>
      <section className={styles.builder} aria-labelledby="builder-heading"><p className={styles.eyebrow}>02 / Make your thinking explicit</p><h2 id="builder-heading">Build your next Delta</h2><p>The model helps investigate. You choose the hypothesis, evidence, rationale, and conclusion.</p>
        <form onSubmit={commit}><label htmlFor="delta-question">Open question<textarea id="delta-question" value={draft.question} maxLength={4000} required rows={2} onChange={event => updateDraft('question', event.target.value)}/></label><label htmlFor="delta-hypothesis">Your hypothesis<textarea id="delta-hypothesis" placeholder="What explanation are you testing?" value={draft.hypothesis} maxLength={4000} required rows={3} onChange={event => updateDraft('hypothesis', event.target.value)}/></label>
          <div className={styles.selectionSummary}>{draft.evidenceIds.length} evidence items selected in the notebook</div><label htmlFor="delta-rationale">Your rationale<textarea id="delta-rationale" placeholder="How do the records support or challenge your hypothesis? What is missing?" value={draft.rationale} maxLength={4000} required rows={4} onChange={event => updateDraft('rationale', event.target.value)}/></label><label htmlFor="delta-conclusion">Your conclusion<textarea id="delta-conclusion" placeholder="What can you conclude now, and with what uncertainty?" value={draft.conclusion} maxLength={4000} required rows={3} onChange={event => updateDraft('conclusion', event.target.value)}/></label>
          <label className={styles.closeCheck}><input type="checkbox" checked={draft.closesCase} onChange={event => updateDraft('closesCase', event.target.checked)}/><span>Mark this branch concluded<br/><small>A player decision, not a verified root cause. New evidence can reopen it.</small></span></label>
          <p className={styles.validation}>{issues.length ? issues.join(' ') : 'The Delta has all required parts. This is a completeness check, not a truth judgement.'}</p><button type="submit" className={styles.accept} disabled={issues.length > 0}>Accept my Delta →</button>
        </form>
      </section>
    </div>
    <p className={styles.notice} role="status" aria-live="polite">{notice}</p>{storageWarning && <p className={styles.error} role="alert">{storageWarning}</p>}

    <section className={styles.map} aria-labelledby="map-heading"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>03 / An evolving map, not a rewritten history</p><h2 id="map-heading">Your Delta branches</h2></div><div className={styles.tools}><button onClick={exportNotebook} type="button">Export notebook</button><button onClick={() => setResetRequested(true)} type="button" aria-expanded={resetRequested} aria-controls="reset-confirmation">Start fresh</button></div></div>
      {resetRequested && <div id="reset-confirmation" className={styles.resetConfirmation} role="group" aria-labelledby="reset-confirmation-heading"><h3 id="reset-confirmation-heading">Reset this local notebook?</h3><p>Export first if you want to keep your evidence and Delta history. Resetting clears this browser notebook and the current draft, but does not change any Trama or server data.</p><div className={styles.tools}><button type="button" onClick={() => setResetRequested(false)}>Keep notebook</button><button type="button" onClick={reset}>Reset local notebook</button></div></div>}
      {!state.deltas.length && <p>Your first accepted Delta will appear here. Then you can return, challenge it, or create another branch.</p>}
      <div className={styles.branchMap}><ol className={styles.treeRoots} aria-label="Delta ancestry tree">{state.deltas.filter(delta => delta.parentId === null).map(renderBranch)}</ol></div>
      {reviewed && <article className={styles.review}><p className={styles.eyebrow}>Inspect / {reviewed.id}</p><h3>{reviewed.question}</h3><dl><dt>Hypothesis</dt><dd>{reviewed.hypothesis}</dd><dt>Evidence</dt><dd>{reviewed.evidenceIds.map(id => state.evidence.find(item => item.id === id)?.title ?? id).join(' · ')}</dd><dt>Rationale</dt><dd>{reviewed.rationale}</dd><dt>Conclusion</dt><dd>{reviewed.conclusion}</dd></dl><button type="button" onClick={() => returnTo(reviewed)} disabled={!canUseAnchor(state, reviewed.id)}>Return here & build a branch</button><label htmlFor="contest-reason">New evidence or reason to contest<textarea id="contest-reason" value={reason} rows={2} maxLength={4000} onChange={event => setReason(event.target.value)}/></label><button type="button" onClick={() => challenge(reviewed)} disabled={!reason.trim() || isContested(state, reviewed.id)}>Contest this Delta / preserve history</button></article>}
      {!!state.events.length && <details className={styles.eventLog}><summary>Decision history / {state.events.length} events</summary><ol>{state.events.map(event => <li key={event.id}><strong>{event.deltaId} · {event.type}</strong><span>{event.reason}</span></li>)}</ol></details>}
    </section>
    <footer className={styles.footer}>This game is a local simulation of evolving decisions. It never applies, cancels, or closes a real Trama Case. Accepted Deltas and notes are stored in this browser; drafts are not. Shared devices share this notebook. <a href="/poc/sanity/investigate">Explore the read-only investigation agent ↗</a></footer>
  </div></main>;
}
