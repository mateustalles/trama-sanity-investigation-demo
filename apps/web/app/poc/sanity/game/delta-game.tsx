'use client';

import {useEffect, useRef, useState, type FormEvent, type ReactElement} from 'react';
import type {GameClueResult,GameReviewResult} from '../../../../../../scripts/sanity-delta-game.mjs';
import {gameQuestions,gameHypotheses,gameConclusions,gameQuestion} from '../../../../../../scripts/sanity-game-options.mjs';
import {demoLimits,describeDemoFailure,readDemoAccess,retrySeconds,waitLabel,type DemoAccess} from '../investigate/demo-feedback';
import {acceptDelta, activePath, mergeGameClues, canUseAnchor, contestDelta, createGame, draftIssues, isContested, resetLocalNotebook, restoreGame, revertTo, type Delta, type DeltaDraft, type GameState} from './game-model';
import {initialEvidence} from './game-evidence';
import {GuidedDeltaOrbit} from './guided-delta-orbit';
import styles from './delta-game.module.css';

const storageKey = 'trama-synthetic-delta-game-v1';
const emptyDraft: DeltaDraft = {question: gameQuestion, hypothesis: '', evidenceIds: [], rationale: '', conclusion: '', closesCase: false};

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
  const [questionId, setQuestionId] = useState('timeline');
  const [hypothesisId,setHypothesisId] = useState('');
  const [conclusionId,setConclusionId] = useState('');
  const [pending, setPending] = useState<'search'|'review'|null>(null);
  const [result, setResult] = useState<GameClueResult | null>(null);
  const [review,setReview] = useState<GameReviewResult|null>(null);
  const [access,setAccess] = useState<DemoAccess>(demoLimits);
  const [retryAt,setRetryAt] = useState<number|null>(null);
  const [exhausted,setExhausted] = useState(false);
  const [now,setNow] = useState(0);
  const [searchError, setSearchError] = useState('');
  const [resetRequested, setResetRequested] = useState(false);
  const searchVersion = useRef(0);
  const searchController = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const waiting=retrySeconds(retryAt,now);

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
  useEffect(()=>{if(!waiting)return;const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer)},[waiting>0]);

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
    if(pending)return;
    setReview(null);
    setDraft(previous => ({...previous, evidenceIds: previous.evidenceIds.includes(id)
      ? previous.evidenceIds.filter(value => value !== id) : [...previous.evidenceIds, id],rationale:''}));
  }
  function chooseHypothesis(id:string) {
    if(pending)return;
    const option=gameHypotheses.find(item=>item.id===id);if(!option)return;
    setHypothesisId(id);setReview(null);setDraft(previous=>({...previous,hypothesis:option.text,rationale:''}));
  }
  function commit(event: FormEvent) {
    event.preventDefault();
    if(pending)return;
    try {
      const next = acceptDelta(state, draft);
      setState(next); setReviewId(next.headId);
      setDraft({...emptyDraft, question: draft.question});
      setHypothesisId('');setConclusionId('');setReview(null);
      setNotice(`${next.headId} accepted by you. ${draft.closesCase ? 'This branch is marked concluded, not independently proven. New evidence can reopen it.' : 'The investigation remains open.'} A new Delta is ready.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not accept this Delta.'); }
  }
  function returnTo(delta: Delta) {
    if(pending)return;
    try { setState(revertTo(state, delta.id)); setNotice(`Returned to ${delta.id}. Your current draft is kept; accepting it now creates a branch here. No later Delta was deleted.`); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not return.'); }
  }
  function challenge(delta: Delta) {
    if(pending)return;
    try {
      setState(contestDelta(state, delta.id, reason)); setReason('');
      setNotice(`${delta.id} contested. Affected descendants remain in history but cannot be used as branch points. If the active path was affected, it returns to an uncontested ancestor.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not contest this Delta.'); }
  }
  async function requestGame(action:'search'|'review') {
    if(inFlight.current||exhausted||retrySeconds(retryAt,Date.now())>0||!ready)return;
    if(action==='review'&&(!hypothesisId||!draft.evidenceIds.length||draft.evidenceIds.length>10))return;
    inFlight.current=true;
    const version = ++searchVersion.current;
    const controller = new AbortController();
    searchController.current = controller;
    setPending(action);setSearchError('');if(action==='review')setReview(null);
    const timer=window.setTimeout(()=>controller.abort(),action==='search'?45000:105000);
    try {
      const body=action==='search'?{questionId}:{hypothesisId,evidence:state.evidence.filter(item=>draft.evidenceIds.includes(item.id))};
      const response = await fetch(`/api/poc/sanity/game/${action}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:controller.signal});
      const payload=await response.json().catch(()=>null);
      if (version !== searchVersion.current) return;
      if(!response.ok){const failure=describeDemoFailure(payload,response.status,response.headers.get('Retry-After'),Date.now());setSearchError(payload?.code==='model_timeout'||payload?.code==='search_timeout'?payload.error:failure.message);setRetryAt(failure.retryAt);setExhausted(failure.exhausted);setNow(Date.now());if(failure.access)setAccess(failure.access);return;}
      const allowance=readDemoAccess(payload?.access);if(allowance){setAccess(allowance);setExhausted(allowance.remainingTotal===0);setRetryAt(allowance.remainingInWindow===0&&allowance.retryAt?Date.parse(allowance.retryAt):null);setNow(Date.now());}
      if(action==='search'){
        if(!Array.isArray(payload?.clues)||typeof payload?.search?.text!=='string')throw Error('The server returned an invalid clue packet.');
        const next=mergeGameClues(state,payload.clues);setState(next);setResult(payload);
        setNotice('Sanity returned clues, not an answer-model conclusion. Read and choose which ones enter your Delta.');
      }else{if(!payload?.review)throw Error('The server returned an invalid rationale proposal.');setReview(payload);}
    } catch (error) { if(version===searchVersion.current)setSearchError(controller.signal.aborted?'We stopped waiting. The accepted request may still count toward your allowance. Your selections are preserved; retry manually.':error instanceof Error?error.message:'The game request failed.'); }
    finally {
      window.clearTimeout(timer);
      if (version === searchVersion.current) { setPending(null); searchController.current = null; inFlight.current=false; }
    }
  }
  function cautiousRationale() {
    const titles=state.evidence.filter(item=>draft.evidenceIds.includes(item.id)).map(item=>item.title).join('; ');
    updateDraft('rationale',`I selected ${titles} to test the hypothesis: ${draft.hypothesis} These records need to be compared for timing, mechanism and counterevidence. Their selection alone does not establish causality.`);
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
    setQuestionId('timeline');setHypothesisId('');setConclusionId('');setResult(null);setReview(null);setReason('');
    setPending(null);inFlight.current=false;setSearchError('');setStorageWarning('');
    setResetRequested(false);
    setNotice('A fresh local investigation is ready.');
  }

  return <main className={styles.page} lang="en"><div className={styles.shell}>
    <nav className={styles.nav} aria-label="Demo navigation"><a href="/poc/sanity/investigate">Trama × Sanity</a><span>Delta / Investigation game</span><a href="/poc/sanity/investigate">Read-only agent ↗</a></nav>
    <header className={styles.hero}><p className={styles.eyebrow}>You are the investigator</p><h1>A conclusion is a step.<br/><em>Not the end of the story.</em></h1>
      <p>Choose a hypothesis. Connect clues around the triangle. Let the model propose a rationale—then decide whether to accept, revise or branch.</p>
      <div className={styles.badges}><span>Fictional case</span><span>Browser-local simulation</span><span>No operational writes</span></div>
    </header>
    <section className={styles.brief} aria-labelledby="case-title"><div><p className={styles.eyebrow}>Your open question</p><h2 id="case-title">Fifteen minutes of failed checkouts</h2><p>On September 18, 2026, payments began failing between 10:00 and 10:15 UTC. A release had gone live nearby. Was it the change, a provider problem, or something else?</p><p>The six starting records are curated excerpts from our frozen synthetic benchmark corpus. Ask the live Sanity agent for more context, but remember: its generated interpretation is not original proof.</p></div><div className={styles.caseStatus}><span>Active branch</span><strong>{head?.closesCase ? 'Concluded by you' : 'Investigation open'}</strong><small>{head ? `Based on ${head.id}` : 'No Delta accepted yet'} · no correctness score</small></div></section>

    <section className={`${styles.stage} ${styles.guidedStage}`} aria-label="Delta progression">
      <div className={styles.previous}>{head ? <><Orbit small label={head.id} hypothesis={head.hypothesis} evidenceCount={head.evidenceIds.length} rationale={head.rationale}/><p>{head.conclusion}</p><button type="button" onClick={() => setReviewId(head.id)}>Inspect this step</button></> : <div className={styles.emptyPast}><span>∅</span><h3>Start with uncertainty.</h3><p>Your first accepted Delta will stay here. Nothing is decided for you.</p></div>}</div>
      <span className={styles.stepArrow} aria-hidden="true">→</span>
      <div key={`${state.headId}-${state.deltas.length}`} className={styles.current}>
        <p className={styles.eyebrow}>{head ? `Continuing from ${head.id}` : 'A new line of inquiry'}</p>
        <GuidedDeltaOrbit label={`D${String(state.deltas.length+1).padStart(2,'0')} / draft`} hypothesisId={hypothesisId} evidence={result?.clues??initialEvidence} selectedIds={draft.evidenceIds} rationale={draft.rationale} disabled={Boolean(pending)||!ready} onHypothesis={chooseHypothesis} onEvidence={toggleEvidence} onReview={()=>void requestGame('review')} pending={pending} canReview={ready&&!pending&&!exhausted&&!waiting&&Boolean(hypothesisId)&&draft.evidenceIds.length>0&&draft.evidenceIds.length<=10}/>
        <div className={styles.orbitStatus} aria-live="polite">
          {pending==='review'&&<p>Assessing your selection. The model has a 90-second deadline; nothing is accepted automatically.</p>}
          {review&&<a href="#rationale-proposal">Your rationale proposal is ready. Read it and decide ↓</a>}
          {searchError&&<p role="alert">{searchError}</p>}
          {waiting>0&&<p>Live actions resume in {waitLabel(waiting)}.</p>}
        </div>
      </div>
    </section>

    <div className={styles.workspace}>
      <section className={styles.notebook} aria-labelledby="evidence-heading"><p className={styles.eyebrow}>01 / Follow the clues</p><h2 id="evidence-heading">Evidence notebook</h2><p>Select supporting and challenging material. A reference alone does not prove a conclusion.</p>
        <div className={styles.evidenceList}>{state.evidence.map(item => <article key={item.id} className={draft.evidenceIds.includes(item.id) ? styles.selectedEvidence : styles.evidence}>
          <label><input type="checkbox" checked={draft.evidenceIds.includes(item.id)} disabled={Boolean(pending)||!ready} onChange={() => toggleEvidence(item.id)}/><strong>{item.title}</strong></label><span className={styles.provenanceKind}>{item.kind === 'generated-context' ? 'Generated KB context / not original proof' : 'Frozen synthetic source excerpt'}</span><details><summary>Read the record</summary><p className={styles.sourceText}>{item.text}</p><small>{item.provenance}</small></details>
        </article>)}</div>
        <section className={styles.liveSearch} aria-labelledby="clue-search-title"><h3 id="clue-search-title">Ask a question. Find clues.</h3><p>Choose a question to send its declared search terms to Sanity. Retrieval adds generated response sections to the notebook; it makes no OpenAI answer call and selects nothing for your Delta.</p>
          <label htmlFor="game-search">Investigation question<select id="game-search" value={questionId} onChange={event=>setQuestionId(event.target.value)} disabled={Boolean(pending)}>{gameQuestions.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><p>{gameQuestions.find(item=>item.id===questionId)?.question}</p><button type="button" onClick={()=>void requestGame('search')} disabled={!ready||Boolean(pending)||exhausted||waiting>0||state.evidence.length>55}>{pending==='search'?'Searching Sanity…':'Retrieve clues from Sanity →'}</button>
          {result&&<details className={styles.searchResult}><summary>Full, unmodified Sanity response</summary><p className={styles.sourceText}>{result.search.text}</p><small>Query: {result.search.arguments.query}. Cards are deterministic Markdown presentation sections, not independently verified original documents.</small></details>}
        </section>
      </section>
      <section className={styles.builder} aria-labelledby="builder-heading"><p className={styles.eyebrow}>02 / Make your thinking explicit</p><h2 id="builder-heading">Build your next Delta</h2><p>The model helps investigate. You choose the hypothesis, evidence, rationale, and conclusion.</p>
        <form onSubmit={commit}><p className={styles.chosenHypothesis}><strong>Your hypothesis</strong><br/>{draft.hypothesis||'Choose A, B or C around the top sphere.'}</p><p className={styles.provenanceKind}>{draft.question}</p>
          <div className={styles.selectionSummary}>{draft.evidenceIds.length} evidence items selected · at most 10 per AI review</div>
          <label htmlFor="delta-rationale">Rationale you will accept<textarea id="delta-rationale" value={draft.rationale} readOnly rows={4} placeholder="Generate a proposal using the purple sphere, or choose the cautious template below."/></label><button type="button" disabled={Boolean(pending)||!draft.hypothesis||!draft.evidenceIds.length} onClick={cautiousRationale}>Use a cautious rationale · no model call</button>
          <label htmlFor="delta-conclusion">Your conclusion<select id="delta-conclusion" value={conclusionId} disabled={Boolean(pending)} onChange={event=>{setConclusionId(event.target.value);updateDraft('conclusion',gameConclusions.find(item=>item.id===event.target.value)?.text??'')}}><option value="">Choose the strength of your conclusion</option>{gameConclusions.map(item=><option value={item.id} key={item.id}>{item.label}</option>)}</select></label><p className={styles.provenanceKind}>{draft.conclusion}</p>
          <label className={styles.closeCheck}><input type="checkbox" checked={draft.closesCase} onChange={event => updateDraft('closesCase', event.target.checked)}/><span>Mark this branch concluded<br/><small>A player decision, not a verified root cause. New evidence can reopen it.</small></span></label>
          <p className={styles.validation}>{issues.length ? issues.join(' ') : 'The Delta has all required parts. This is a completeness check, not a truth judgement.'}</p><button type="submit" className={styles.accept} disabled={!ready||Boolean(pending)||issues.length>0}>Accept my Delta →</button>
        </form>
        {review&&<section className={styles.reviewProposal} aria-labelledby="rationale-proposal"><p className={styles.eyebrow}>Model proposal / not a verdict</p><h3 id="rationale-proposal">{{supported:'Supported by your selection',partial:'Partially supported',contradicted:'Contradicted by your selection',insufficient:'Insufficient selected context'}[review.review.verdict]}</h3><p>{review.review.rationale}</p><p><strong>Limits: </strong>{review.review.limitations}</p><p><strong>Check next: </strong>{review.review.nextCheck}</p><small>{review.model} · {(review.latencyMs/1000).toFixed(1)} s · references: {review.review.evidenceIds.map(id=>state.evidence.find(item=>item.id===id)?.title??id).join(' · ')||'none'}</small><button type="button" disabled={Boolean(pending)} onClick={()=>updateDraft('rationale',review.review.rationale)}>Use this rationale in my Delta</button><button type="button" onClick={()=>setReview(null)}>Dismiss proposal</button></section>}
      </section>
    </div>
    <div className={styles.requestStatus} aria-live="polite"><p>Shared account: {access.requestsPerWindow} live actions per minute{access.totalRequests!==undefined?` · ${access.totalRequests} accepted requests total`:''}{access.remainingTotal!==undefined?` · ${access.remainingTotal} remaining`:''}. Retrieval and AI review each count as one action. Local choices are free.</p>{pending&&<p role="status">{pending==='search'?'Retrieving clues from Sanity (30-second server deadline).':'Generating a rationale from your selected clues (90-second server deadline).'} No Delta will be accepted automatically.</p>}{waiting>0&&<p>Try again in <strong>{waitLabel(waiting)}</strong>, at {new Date(retryAt!).toLocaleTimeString()} (your local time). Nothing will retry automatically.</p>}{exhausted&&<p>The shared total allowance has been used. Waiting does not renew it.</p>}{searchError&&<p role="alert" className={styles.error}>{searchError}</p>}</div>
    <p className={styles.notice} role="status" aria-live="polite">{notice}</p>{storageWarning && <p className={styles.error} role="alert">{storageWarning}</p>}

    <section className={styles.map} aria-labelledby="map-heading"><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>03 / An evolving map, not a rewritten history</p><h2 id="map-heading">Your Delta branches</h2></div><div className={styles.tools}><button onClick={exportNotebook} type="button">Export notebook</button><button onClick={() => setResetRequested(true)} type="button" aria-expanded={resetRequested} aria-controls="reset-confirmation">Start fresh</button></div></div>
      {resetRequested && <div id="reset-confirmation" className={styles.resetConfirmation} role="group" aria-labelledby="reset-confirmation-heading"><h3 id="reset-confirmation-heading">Reset this local notebook?</h3><p>Export first if you want to keep your evidence and Delta history. Resetting clears this browser notebook and the current draft, but does not change any Trama or server data.</p><div className={styles.tools}><button type="button" onClick={() => setResetRequested(false)}>Keep notebook</button><button type="button" onClick={reset}>Reset local notebook</button></div></div>}
      {!state.deltas.length && <p>Your first accepted Delta will appear here. Then you can return, challenge it, or create another branch.</p>}
      <div className={styles.branchMap}><ol className={styles.treeRoots} aria-label="Delta ancestry tree">{state.deltas.filter(delta => delta.parentId === null).map(renderBranch)}</ol></div>
      {reviewed && <article className={styles.review}><p className={styles.eyebrow}>Inspect / {reviewed.id}</p><h3>{reviewed.question}</h3><dl><dt>Hypothesis</dt><dd>{reviewed.hypothesis}</dd><dt>Evidence</dt><dd>{reviewed.evidenceIds.map(id => state.evidence.find(item => item.id === id)?.title ?? id).join(' · ')}</dd><dt>Rationale</dt><dd>{reviewed.rationale}</dd><dt>Conclusion</dt><dd>{reviewed.conclusion}</dd></dl><button type="button" onClick={() => returnTo(reviewed)} disabled={Boolean(pending)||!canUseAnchor(state, reviewed.id)}>Return here & build a branch</button><label htmlFor="contest-reason">New evidence or reason to contest<textarea id="contest-reason" value={reason} rows={2} maxLength={4000} onChange={event => setReason(event.target.value)}/></label><button type="button" onClick={() => challenge(reviewed)} disabled={Boolean(pending)||!reason.trim() || isContested(state, reviewed.id)}>Contest this Delta / preserve history</button></article>}
      {!!state.events.length && <details className={styles.eventLog}><summary>Decision history / {state.events.length} events</summary><ol>{state.events.map(event => <li key={event.id}><strong>{event.deltaId} · {event.type}</strong><span>{event.reason}</span></li>)}</ol></details>}
    </section>
    <footer className={styles.footer}>This game is a local simulation of evolving decisions. It never applies, cancels, or closes a real Trama Case. Accepted Deltas and notes are stored in this browser; drafts are not. Shared devices share this notebook. <a href="/poc/sanity/investigate">Explore the read-only investigation agent ↗</a></footer>
  </div></main>;
}
