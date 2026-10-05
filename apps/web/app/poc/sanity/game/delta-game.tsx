'use client';

import {useEffect, useRef, useState, type FormEvent, type ReactElement} from 'react';
import type {GameClueResult,GameReviewResult} from '../../../../../../scripts/sanity-delta-game.mjs';
import {gameQuestions,gameHypotheses,gameConclusions,gameQuestion} from '../../../../../../scripts/sanity-game-options.mjs';
import {demoLimits,describeDemoFailure,readDemoAccess,retrySeconds,waitLabel,type DemoAccess} from '../investigate/demo-feedback';
import {acceptDelta,activePath,mergeGameClues,canUseAnchor,contestDelta,createGame,draftIssues,isContested,resetLocalNotebook,restoreGame,revertTo,type Delta,type DeltaDraft,type GameState} from './game-model';
import {canReviewSelection,currentClues,exploredQuestionIds,freshDraft,toggleClue,type GamePanel} from './game-flow';
import {GuidedDeltaOrbit} from './guided-delta-orbit';
import styles from './delta-game.module.css';

const storageKey='trama-synthetic-delta-game-v1';
const verdictLabels={supported:'Supported by your selection',partial:'Partially supported',contradicted:'Contradicted by your selection',insufficient:'Insufficient selected context'};

function PastOrbit({delta,onInspect}:{delta:Delta;onInspect:()=>void}) {
  return <button type="button" className={styles.pastOrbit} onClick={onInspect} aria-label={`Inspect accepted Delta ${delta.id}`}>
    <svg viewBox="0 0 220 210" aria-hidden="true"><path d="M110 25 L25 170 L195 170 Z"/></svg>
    <i className={styles.pastCyan}/><i className={styles.pastGreen}/><i className={styles.pastPurple}/>
    <span>Δ</span><strong>{delta.id}</strong><small>{delta.closesCase?'Concluded by you':'Preserved step'}<br/>{delta.evidenceIds.length} clues · inspect</small>
  </button>;
}

export function DeltaGame() {
  const [state,setState]=useState<GameState>(()=>createGame([]));
  const [draft,setDraft]=useState<DeltaDraft>(()=>freshDraft());
  const [ready,setReady]=useState(false);
  const [saveAllowed,setSaveAllowed]=useState(true);
  const [panel,setPanel]=useState<GamePanel>('issue');
  const [reviewId,setReviewId]=useState<string|null>(null);
  const [reason,setReason]=useState('');
  const [notice,setNotice]=useState('');
  const [storageWarning,setStorageWarning]=useState('');
  const [questionId,setQuestionId]=useState('');
  const [hypothesisId,setHypothesisId]=useState('');
  const [conclusionId,setConclusionId]=useState('');
  const [pending,setPending]=useState<'search'|'review'|null>(null);
  const [result,setResult]=useState<GameClueResult|null>(null);
  const [review,setReview]=useState<GameReviewResult|null>(null);
  const [access,setAccess]=useState<DemoAccess>(demoLimits);
  const [retryAt,setRetryAt]=useState<number|null>(null);
  const [exhausted,setExhausted]=useState(false);
  const [now,setNow]=useState(0);
  const [searchError,setSearchError]=useState('');
  const [resetRequested,setResetRequested]=useState(false);
  const searchVersion=useRef(0);
  const searchController=useRef<AbortController|null>(null);
  const inFlight=useRef(false);
  const waiting=retrySeconds(retryAt,now);

  useEffect(()=>{
    try {
      const saved=window.localStorage.getItem(storageKey);
      const restored=saved?restoreGame(JSON.parse(saved)):null;
      if(restored)setState(restored);
      else if(saved){setSaveAllowed(false);setStorageWarning('The previous notebook could not be restored. Its stored copy will not be overwritten unless you explicitly reset.');}
    }catch{setSaveAllowed(false);setStorageWarning('Browser storage could not be read. You can still play and export this session; the stored copy will not be overwritten.');}
    setReady(true);
  },[]);
  useEffect(()=>{
    if(!ready||!saveAllowed)return;
    try{window.localStorage.setItem(storageKey,JSON.stringify(state));}
    catch{setStorageWarning('This notebook cannot be saved in browser storage. Export it before leaving.');}
  },[state,ready,saveAllowed]);
  useEffect(()=>()=>{searchController.current?.abort()},[]);
  useEffect(()=>{if(!waiting)return;const timer=window.setInterval(()=>setNow(Date.now()),1000);return()=>window.clearInterval(timer)},[waiting>0]);

  const head=state.deltas.find(delta=>delta.id===state.headId);
  const inspected=state.deltas.find(delta=>delta.id===reviewId);
  const question=gameQuestions.find(item=>item.id===questionId);
  const clues=currentClues(result);
  const explored=exploredQuestionIds(state);
  const remaining=gameQuestions.filter(item=>!explored.has(item.id));
  const orderedQuestions=[...remaining,...gameQuestions.filter(item=>explored.has(item.id))];
  const issues=draftIssues(state,draft);
  const disabled=Boolean(pending)||!ready;
  const liveDisabled=disabled||exhausted||waiting>0;
  const reviewable=canReviewSelection(questionId,hypothesisId,draft,clues);
  const pathIds=new Set(activePath(state).map(delta=>delta.id));
  const draftLabel=`D${String(state.deltas.length+1).padStart(2,'0')}`;

  function renderBranch(delta:Delta):ReactElement {
    const valid=canUseAnchor(state,delta.id);
    const contested=isContested(state,delta.id);
    const children=state.deltas.filter(node=>node.parentId===delta.id);
    return <li key={delta.id} className={styles.treeBranch}><button type="button" onClick={()=>setReviewId(delta.id)} aria-pressed={reviewId===delta.id} className={`${styles.mapNode} ${pathIds.has(delta.id)?styles.activeNode:''} ${!valid?styles.contestedNode:''}`}>
      <small>{delta.parentId?`${delta.parentId} →`:'Origin →'}</small><strong>△ {delta.id}</strong><span>{contested?'Contested':!valid?'Contested ancestor':delta.closesCase?'Player-concluded':'Investigation open'}</span><p>{delta.hypothesis}</p>{delta.id===state.headId&&<b>Current branch</b>}
    </button>{!!children.length&&<ol className={styles.treeChildren}>{children.map(renderBranch)}</ol>}</li>;
  }

  function chooseQuestion(id:string) {
    if(pending||!ready)return;
    setQuestionId(id);setDraft(freshDraft(id));setHypothesisId('');setConclusionId('');setResult(null);setReview(null);setSearchError('');setNotice('Choose Ask Sanity for Clues to retrieve context for this question.');setPanel('clues');
  }
  function toggleEvidence(id:string) {
    if(disabled)return;
    try{setDraft(toggleClue(draft,id,clues));setReview(null);setConclusionId('');setSearchError('');}
    catch(error){setNotice(error instanceof Error?error.message:'Could not select this clue.');}
  }
  function chooseHypothesis(id:string) {
    if(disabled||!clues.length)return;
    const option=gameHypotheses.find(item=>item.id===id);if(!option)return;
    if(id===hypothesisId)return;
    setHypothesisId(id);setReview(null);setConclusionId('');setDraft(previous=>({...previous,hypothesis:option.text,rationale:'',conclusion:'',closesCase:false}));
  }
  function commit(event:FormEvent) {
    event.preventDefault();if(disabled||!question||!reviewable)return;
    try{
      const next=acceptDelta(state,draft);setState(next);setReviewId(next.headId);
      setDraft(freshDraft());setQuestionId('');setHypothesisId('');setConclusionId('');setResult(null);setReview(null);setSearchError('');setPanel('issue');
      setNotice(`${next.headId} confirmed and preserved on the left. ${draft.closesCase?'This branch is concluded by you, not independently proven.':'The investigation remains open.'} Choose the next line of inquiry.`);
    }catch(error){setNotice(error instanceof Error?error.message:'Could not confirm this Delta.');}
  }
  function returnTo(delta:Delta) {
    if(pending)return;
    try{setState(revertTo(state,delta.id));setPanel(questionId?null:'issue');setNotice(`Returned to ${delta.id}. Your draft is kept; confirming it creates a new branch. No later Delta was deleted.`);}
    catch(error){setNotice(error instanceof Error?error.message:'Could not return.');}
  }
  function challenge(delta:Delta) {
    if(pending)return;
    try{setState(contestDelta(state,delta.id,reason));setReason('');setNotice(`${delta.id} contested. Affected descendants are preserved but cannot anchor a new branch.`);}
    catch(error){setNotice(error instanceof Error?error.message:'Could not contest this Delta.');}
  }
  async function requestGame(action:'search'|'review') {
    if(inFlight.current||exhausted||retrySeconds(retryAt,Date.now())>0||!ready)return;
    if(action==='search'&&!question||action==='review'&&!reviewable)return;
    inFlight.current=true;const version=++searchVersion.current;const controller=new AbortController();searchController.current=controller;
    setPending(action);setSearchError('');if(action==='review'){setReview(null);setPanel('rationale');}
    const timer=window.setTimeout(()=>controller.abort(),action==='search'?45000:105000);
    try{
      const body=action==='search'?{questionId}:{hypothesisId,evidence:clues.filter(item=>draft.evidenceIds.includes(item.id))};
      const response=await fetch(`/api/poc/sanity/game/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:controller.signal});
      const payload=await response.json().catch(()=>null);if(version!==searchVersion.current)return;
      if(!response.ok){const failure=describeDemoFailure(payload,response.status,response.headers.get('Retry-After'),Date.now());setSearchError(payload?.code==='model_timeout'||payload?.code==='search_timeout'?payload.error:failure.message);setRetryAt(failure.retryAt);setExhausted(failure.exhausted);setNow(Date.now());if(failure.access)setAccess(failure.access);return;}
      const allowance=readDemoAccess(payload?.access);if(allowance){setAccess(allowance);setExhausted(allowance.remainingTotal===0);setRetryAt(allowance.remainingInWindow===0&&allowance.retryAt?Date.parse(allowance.retryAt):null);setNow(Date.now());}
      if(action==='search'){
        if(!Array.isArray(payload?.clues)||!payload.clues.length||typeof payload?.search?.text!=='string')throw Error('Sanity returned no usable clue packet. No starting-record fallback was added.');
        const next=mergeGameClues(state,payload.clues);setState(next);setResult(payload);setReview(null);setConclusionId('');setDraft(previous=>({...previous,evidenceIds:[],rationale:'',conclusion:'',closesCase:false}));setPanel(null);
        setNotice(`Sanity returned ${payload.clues.length} context clues. Read → select → choose a hypothesis.`);
      }else{if(!payload?.review)throw Error('The server returned an invalid rationale proposal.');setReview(payload);setPanel('rationale');setNotice('A rationale proposal is ready. Read its limits before adopting it.');}
    }catch(error){if(version===searchVersion.current)setSearchError(controller.signal.aborted?'We stopped waiting. The accepted request may still count. Your selections are preserved; retry manually.':error instanceof Error?error.message:'The game request failed.');}
    finally{window.clearTimeout(timer);if(version===searchVersion.current){setPending(null);searchController.current=null;inFlight.current=false;}}
  }
  function finishSelection() {
    if(disabled||!draft.evidenceIds.length)return;
    if(!hypothesisId){setPanel('hypothesis');return;}
    setPanel('rationale');if(!review&&!draft.rationale)void requestGame('review');
  }
  function cautiousRationale() {
    const titles=clues.filter(item=>draft.evidenceIds.includes(item.id)).map(item=>item.title).join('; ');
    setDraft(previous=>({...previous,rationale:`I selected ${titles} to test the hypothesis: ${draft.hypothesis} These records need to be compared for timing, mechanism and counterevidence. Their selection alone does not establish causality.`}));setPanel('confirm');
  }
  function exportNotebook() {
    const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='trama-delta-notebook.json';link.click();URL.revokeObjectURL(url);
  }
  function reset() {
    if(!resetRequested)return;++searchVersion.current;searchController.current?.abort();searchController.current=null;
    setState(previous=>resetLocalNotebook(previous,[],true));setSaveAllowed(true);setDraft(freshDraft());setReviewId(null);setQuestionId('');setHypothesisId('');setConclusionId('');setResult(null);setReview(null);setReason('');setPending(null);inFlight.current=false;setSearchError('');setStorageWarning('');setResetRequested(false);setPanel('issue');setNotice('A fresh local investigation is ready. Live allowance has not been reset.');
  }

  return <main className={styles.page} lang="en"><div className={styles.shell}>
    <nav className={styles.nav} aria-label="Demo navigation"><a href="/poc/sanity/investigate">TRAMA <span>× Sanity</span></a><span className={styles.previewBadge}>Orbit UI · post-submission preview</span><button type="button" onClick={()=>setPanel('history')}>Delta map · {state.deltas.length}</button><button type="button" onClick={()=>setPanel('brief')}>Case brief</button></nav>
    <header className={styles.caseHeader}><div><p className={styles.eyebrow}>You are the investigator</p><h1>Fifteen minutes of failed checkouts</h1></div><span>{head?`Continuing from ${head.id}`:'No accepted Delta yet'} · {head?.closesCase?'concluded by you':'open'}</span></header>
    <nav className={styles.steps} aria-label="Investigation steps">
      <button type="button" onClick={()=>setPanel('issue')} disabled={disabled} aria-current={panel==='issue'?'step':undefined}>1 · Investigate</button>
      <button type="button" onClick={()=>setPanel('clues')} disabled={!question||disabled} aria-current={panel==='clues'?'step':undefined}>2 · Ask Sanity</button>
      <button type="button" onClick={()=>setPanel(null)} disabled={!clues.length} aria-current={panel===null?'step':undefined}>3 · Connect clues</button>
      <button type="button" onClick={finishSelection} disabled={!draft.evidenceIds.length||disabled} aria-current={panel==='rationale'||panel==='hypothesis'?'step':undefined}>4 · Rationale</button>
      <button type="button" onClick={()=>setPanel('confirm')} disabled={!draft.rationale||disabled} aria-current={panel==='confirm'?'step':undefined}>5 · Confirm Delta</button>
    </nav>
    <section className={styles.stage} aria-label="Delta progression">
      <aside className={styles.previous} key={state.headId}>{head?<><PastOrbit delta={head} onInspect={()=>{setReviewId(head.id);setPanel('history')}}/><p>{head.hypothesis}</p></>:<div className={styles.emptyPast}><span>∅</span><p>Your confirmed Delta will stay here.</p></div>}<span className={styles.stepArrow} aria-hidden="true">→</span></aside>
      <div className={styles.current} key={`${state.headId}-${state.deltas.length}`}>
        <GuidedDeltaOrbit label={draftLabel} questionLabel={question?.label??''} hypothesis={draft.hypothesis} evidence={clues} selectedIds={draft.evidenceIds} rationale={draft.rationale} disabled={disabled} onEvidence={toggleEvidence} onPanel={next=>{if(next==='rationale'&&!review&&!draft.rationale){finishSelection();return}setPanel(next)}} panel={panel}>
          {panel==='issue'&&<><p className={styles.eyebrow}>01 / Choose your line of inquiry</p><h2>What will you investigate?</h2><p>Payments failed between 10:00 and 10:15 UTC on September 18, 2026, near a release. Choose a question before looking for an explanation.</p><p className={styles.meta}>{remaining.length} questions not yet explored on this branch. Explored does not mean resolved; you can revisit any question.</p><div className={styles.questionGrid}>{orderedQuestions.map(item=><button type="button" key={item.id} disabled={disabled} onClick={()=>chooseQuestion(item.id)}><small>{explored.has(item.id)?'Revisit':'Explore'}</small><strong>{item.label}</strong><span>{item.description??item.question}</span></button>)}</div>{question&&<p className={styles.meta}>Changing the question clears only the current draft, not accepted Deltas.</p>}</>}
          {panel==='clues'&&<><p className={styles.eyebrow}>02 / Ask Sanity, then choose</p><h2>{question?.label??'Choose an investigation question first'}</h2><p>{question?.question}</p><div className={styles.sanityStep}><b>Sanity is your librarian.</b><p>We send this question's declared search terms to native Knowledge Base Search. It returns generated context with source references—not an OpenAI answer.</p><button className={styles.primary} type="button" disabled={liveDisabled||!question} onClick={()=>void requestGame('search')}>{pending==='search'?'Asking Sanity…':'Ask Sanity for Clues'}</button><small>One live action · nothing is selected automatically.</small></div>
            {result&&<><p className={styles.meta}>{clues.length} complete presentation sections returned. These are generated KB context, not verified original documents.</p><div className={styles.clueList}>{clues.map(item=><article key={item.id}><label><input type="checkbox" checked={draft.evidenceIds.includes(item.id)} disabled={disabled} onChange={()=>toggleEvidence(item.id)}/><strong>{item.title}</strong></label><details><summary>Read full clue</summary><p className={styles.sourceText}>{item.text}</p><small>{item.provenance}</small></details></article>)}</div><details><summary>Full, unmodified Sanity response & query</summary><p className={styles.sourceText}>{result.search.text}</p><small>Query: {result.search.arguments.query}</small></details><div className={styles.actions}><button type="button" onClick={()=>setPanel(null)}>Explore the orbit</button><button type="button" disabled={!draft.evidenceIds.length||disabled} onClick={finishSelection}>Done selecting →</button></div></>}
            {!question&&<button type="button" onClick={()=>setPanel('issue')}>Choose a question →</button>}
          </>}
          {panel==='hypothesis'&&<><p className={styles.eyebrow}>03 / Your explanation</p><h2>What might explain the failures?</h2><p>Your line of inquiry supplies material for testing a causal hypothesis. Choose an explanation to connect to your selected clues; you can revise it later.</p><div className={styles.hypothesisChoices}>{gameHypotheses.map(item=><button type="button" key={item.id} disabled={disabled||!clues.length} aria-pressed={hypothesisId===item.id} onClick={()=>chooseHypothesis(item.id)}><b>{item.code}</b><strong>{item.label}</strong><span>{item.text}</span></button>)}</div><p className={styles.meta}>{draft.evidenceIds.length} clues selected. The model reviews only this selection, not the entire archive.</p><button className={styles.primary} type="button" disabled={liveDisabled||!reviewable} onClick={finishSelection}>Done selecting · generate rationale →</button><button type="button" disabled={!clues.length} onClick={()=>setPanel(null)}>Back to clues</button></>}
          {panel==='rationale'&&<><p className={styles.eyebrow}>04 / Make the connection explicit</p><h2>Review your rationale</h2><p>{draft.hypothesis||'Choose a hypothesis first.'}</p><p className={styles.meta}>{draft.evidenceIds.length} selected clues · model feedback is not a truth score.</p>
            {pending==='review'?<div className={styles.sanityStep} role="status">Connecting your selected clues…<p>The model has a 90-second server deadline. Nothing is adopted or confirmed automatically.</p></div>:review?<div className={styles.reviewProposal}><h3>{verdictLabels[review.review.verdict]}</h3><p>{review.review.rationale}</p><p><strong>Limits: </strong>{review.review.limitations}</p><p><strong>Check next: </strong>{review.review.nextCheck}</p><small>{review.model} · {(review.latencyMs/1000).toFixed(1)} s · selected references: {review.review.evidenceIds.map(id=>state.evidence.find(item=>item.id===id)?.title??id).join(' · ')||'none'}</small><button className={styles.primary} type="button" disabled={disabled} onClick={()=>{setDraft(previous=>({...previous,rationale:review.review.rationale}));setPanel('confirm')}}>Use this rationale →</button><button type="button" onClick={()=>{setReview(null);setPanel(null)}}>Dismiss & revise selection</button></div>:draft.rationale?<><p className={styles.sourceText}>{draft.rationale}</p><button type="button" onClick={()=>setPanel('confirm')}>Review & confirm →</button></>:<p>No proposal yet. Finish selecting your clues and hypothesis to request one.</p>}
            {!pending&&<div className={styles.actions}><button type="button" disabled={liveDisabled||!reviewable} onClick={()=>void requestGame('review')}>{review?'Generate another proposal':'Generate rationale · one live action'}</button><button type="button" disabled={disabled||!reviewable} onClick={cautiousRationale}>Use cautious template · no model call</button></div>}
          </>}
          {panel==='confirm'&&<><p className={styles.eyebrow}>05 / You own the decision</p><h2>Confirm {draftLabel}</h2><form onSubmit={commit}><h3>Your hypothesis</h3><p>{draft.hypothesis}</p><p className={styles.meta}>{draft.evidenceIds.length} selected clues · {question?.label}</p><details open><summary>Rationale you will preserve</summary><p className={styles.sourceText}>{draft.rationale||'Adopt a rationale first.'}</p></details><label htmlFor="delta-conclusion">How strong is your conclusion?<select id="delta-conclusion" value={conclusionId} disabled={disabled} onChange={event=>{setConclusionId(event.target.value);setDraft(previous=>({...previous,conclusion:gameConclusions.find(item=>item.id===event.target.value)?.text??''}))}}><option value="">Choose a conclusion</option>{gameConclusions.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><p className={styles.meta}>{draft.conclusion}</p><label className={styles.closeCheck}><input type="checkbox" checked={draft.closesCase} disabled={disabled} onChange={event=>setDraft(previous=>({...previous,closesCase:event.target.checked}))}/><span>Mark this branch concluded<small>A player decision, not a verified root cause. New evidence can reopen it.</small></span></label><p className={styles.meta}>{issues.length?issues.join(' '):'All parts are present. Completeness is not proof of correctness.'}</p><button type="submit" className={styles.primary} disabled={disabled||!reviewable||issues.length>0}>Confirm Delta →</button></form></>}
          {panel==='history'&&<><p className={styles.eyebrow}>Preserved reasoning / not rewritten history</p><h2>Your Delta map</h2><div className={styles.actions}><button type="button" onClick={exportNotebook}>Export notebook</button><button type="button" onClick={()=>setResetRequested(true)}>Start fresh</button></div>
            {resetRequested&&<section className={styles.resetConfirmation}><h3>Reset this local notebook?</h3><p>Export first. This clears local history and the current draft, not server data or live quota.</p><button type="button" onClick={()=>setResetRequested(false)}>Keep notebook</button><button type="button" onClick={reset}>Reset local notebook</button></section>}
            {!state.deltas.length&&<p>Your first confirmed Delta will appear here.</p>}<div className={styles.branchMap}><ol className={styles.treeRoots} aria-label="Delta ancestry tree">{state.deltas.filter(delta=>delta.parentId===null).map(renderBranch)}</ol></div>
            {inspected&&<article className={styles.inspect}><h3>{inspected.id} · {inspected.question}</h3><dl><dt>Hypothesis</dt><dd>{inspected.hypothesis}</dd><dt>Evidence</dt><dd>{inspected.evidenceIds.map(id=>state.evidence.find(item=>item.id===id)?.title??id).join(' · ')}</dd><dt>Rationale</dt><dd>{inspected.rationale}</dd><dt>Conclusion</dt><dd>{inspected.conclusion}</dd></dl><details><summary>Read preserved evidence</summary>{inspected.evidenceIds.map(id=>{const item=state.evidence.find(clue=>clue.id===id);return item?<section key={id}><h4>{item.title}</h4><p className={styles.sourceText}>{item.text}</p><small>{item.provenance}</small></section>:null})}</details><button type="button" disabled={disabled||!canUseAnchor(state,inspected.id)} onClick={()=>returnTo(inspected)}>Return here & build a branch</button><label htmlFor="contest-reason">New evidence or reason to contest<textarea id="contest-reason" value={reason} rows={2} maxLength={4000} disabled={disabled} onChange={event=>setReason(event.target.value)}/></label><button type="button" disabled={disabled||!reason.trim()||isContested(state,inspected.id)} onClick={()=>challenge(inspected)}>Contest Delta · preserve history</button></article>}
            {!!state.events.length&&<details><summary>Decision history · {state.events.length} events</summary><ol>{state.events.map(event=><li key={event.id}><b>{event.deltaId} · {event.type}</b><p>{event.reason}</p></li>)}</ol></details>}
          </>}
          {panel==='brief'&&<><p className={styles.eyebrow}>Fictional incident / September 18, 2026</p><h2>What happened to checkout?</h2><p>Payments began failing between 10:00 and 10:15 UTC. A release had gone live nearby. Was it the change, a provider problem, or something else?</p><p>You can investigate chronology, release changes, overlapping measurements, competing explanations and misleading older reports.</p><h3>{gameQuestion}</h3><p>Ask Sanity for context, choose clues and an explanation, then let the model propose a rationale. You decide what to preserve as a Delta.</p><p>Sanity-generated entries are interpretations, not independently verified originals. This game never applies operational Trama changes or certifies a root cause.</p><button type="button" onClick={()=>setPanel(questionId?null:'issue')}>Continue investigating →</button></>}
          {panel==='usage'&&<><h2>Live actions & local progress</h2><p>Shared account: {access.requestsPerWindow} actions per minute · {access.totalRequests??600} accepted requests total{access.remainingTotal!==undefined?` · ${access.remainingTotal} remaining`:''}.</p><p>Ask Sanity and generate rationale each count once. Hover, reading, selecting, confirming and branching are local and free. There are no automatic paid retries.</p><p>Search has a 30-second server deadline; model review has a 90-second deadline. A timeout is not a quota cooldown. An accepted failed request may still count.</p>{waiting>0&&<p>Try again in {waitLabel(waiting)}, at {new Date(retryAt!).toLocaleTimeString()} (your local time).</p>}{exhausted&&<p>The total allowance is exhausted; waiting does not renew it.</p>}<p>Accepted Deltas and evidence are saved in this browser, not account-isolated or encrypted. Drafts are not saved. Export before leaving a shared device.</p>{storageWarning&&<p role="alert">{storageWarning}</p>}</>}
        </GuidedDeltaOrbit>
      </div>
    </section>
    <footer className={styles.statusBar}><div role="status" aria-live="polite">{searchError?<span className={styles.error}>{searchError}</span>:pending?<span>{pending==='search'?'Asking Sanity for clues…':'Generating rationale from your selection…'}</span>:notice||'Choose a question. Sanity will help you find context; you decide what to conclude.'}{waiting>0&&<span> · Live actions resume in {waitLabel(waiting)}.</span>}{exhausted&&<span> · Shared total allowance exhausted.</span>}{storageWarning&&<span> · Storage warning: see allowance & privacy.</span>}</div><button type="button" onClick={()=>setPanel('usage')}>{access.requestsPerWindow}/min · {access.remainingTotal!==undefined?`${access.remainingTotal} remaining`:'allowance & privacy'}</button></footer>
  </div></main>;
}
