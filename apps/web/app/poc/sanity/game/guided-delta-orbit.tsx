'use client';
import {useState, type ReactNode} from 'react';
import type {Evidence} from './game-model';
import type {GamePanel} from './game-flow';
import styles from './delta-game.module.css';

export function GuidedDeltaOrbit({label,questionLabel,hypothesis,evidence,selectedIds,rationale,disabled,onEvidence,onPanel,panel,children}:{
  label:string;questionLabel:string;hypothesis:string;evidence:Evidence[];selectedIds:string[];rationale:string;disabled:boolean;
  onEvidence:(id:string)=>void;onPanel:(panel:GamePanel)=>void;panel:GamePanel;children:ReactNode;
}) {
  const [previewId,setPreviewId]=useState<string|null>(null);
  const preview=evidence.find(item=>item.id===previewId);
  function open(next:GamePanel){setPreviewId(null);onPanel(next)}
  return <div className={styles.cockpit} aria-label="Interactive Delta triangle" onKeyDown={event=>{if(event.key==='Escape'){setPreviewId(null);if(panel!=='issue')onPanel(null)}}}>
    <svg className={styles.cockpitTriangle} viewBox="0 0 800 600" preserveAspectRatio="none" aria-hidden="true"><path d="M400 95 L170 425 L630 425 Z"/><path d="M400 95 L400 305 L170 425 M400 305 L630 425"/></svg>
    <button type="button" className={`${styles.vertex} ${styles.topVertex}`} onClick={()=>open('hypothesis')} disabled={disabled||!evidence.length} aria-label="Choose or revise my hypothesis"><i className={styles.cyanSphere}/><b>Hypothesis</b><small>{hypothesis?'Chosen · click to revise':'Your explanation'}</small></button>
    <div className={styles.core}><span>Δ</span><strong>{label}</strong><small>{questionLabel||'Choose what to investigate'}</small><button type="button" onClick={()=>open(questionLabel?'clues':'issue')} disabled={disabled}>{questionLabel?'Ask Sanity / view clues':'Start investigating →'}</button></div>
    <section className={styles.clueOrbit} aria-label="Clues returned by Sanity">
      <button type="button" className={`${styles.vertex} ${styles.clueVertex}`} onClick={()=>open('clues')} disabled={disabled||!questionLabel} aria-label="Ask Sanity for clues or inspect the returned packet"><i className={styles.greenSphere}/><b>Evidence</b><small>{evidence.length?`${selectedIds.length} selected`:'Waiting for Sanity'}</small></button>
      {evidence.map((item,index)=>{
        const angle=index/Math.max(evidence.length,1)*Math.PI*2-Math.PI/2;
        return <button key={item.id} type="button" className={styles.clueChip} style={{left:`${50+39*Math.cos(angle)}%`,top:`${48+40*Math.sin(angle)}%`}} disabled={disabled} aria-pressed={selectedIds.includes(item.id)} aria-label={`${selectedIds.includes(item.id)?'Remove':'Select'} clue ${index+1}: ${item.title}`} onMouseEnter={()=>setPreviewId(item.id)} onFocus={()=>setPreviewId(item.id)} onClick={()=>{setPreviewId(item.id);onEvidence(item.id)}}><b>{selectedIds.includes(item.id)?'✓':index+1}</b><span>{item.title}</span></button>;
      })}
    </section>
    <button type="button" className={`${styles.vertex} ${styles.rightVertex}`} onClick={()=>open('rationale')} disabled={disabled||!selectedIds.length} aria-label="Finish selecting clues and review rationale"><i className={styles.purpleSphere}/><b>Rationale</b><small>{rationale?'Ready for your decision':'Connect your selected clues'}</small></button>
    {!!evidence.length&&!panel&&<div className={styles.orbitActions}><button type="button" onClick={()=>open(hypothesis?'rationale':'hypothesis')} disabled={disabled||!selectedIds.length}>{rationale?'Review & confirm Delta →':`Done selecting · ${selectedIds.length} clues →`}</button><button type="button" onClick={()=>open('clues')} disabled={disabled}>All clues & full response</button></div>}
    {panel&&<section className={styles.floatingPanel} aria-label="Delta builder"><div className={styles.panelToolbar}><span>Build {label}</span>{panel!=='issue'&&<button type="button" onClick={()=>open(null)} aria-label="Close builder and return to the triangle">×</button>}</div><div className={styles.panelContent}>{children}</div></section>}
    {preview&&!panel&&<aside className={styles.cluePreview} aria-label={`Full text: ${preview.title}`}><header><span>Sanity KB context · not original proof</span><button type="button" onClick={()=>setPreviewId(null)} aria-label="Close full clue text">×</button></header><h3>{preview.title}</h3><div className={styles.fullClueText} tabIndex={0}>{preview.text}</div><small>{preview.provenance}</small><button type="button" disabled={disabled} onClick={()=>onEvidence(preview.id)}>{selectedIds.includes(preview.id)?'Remove from Delta':'Add to Delta'}</button><small>Hover, focus or tap a clue to read. Escape closes this reader.</small></aside>}
  </div>;
}
