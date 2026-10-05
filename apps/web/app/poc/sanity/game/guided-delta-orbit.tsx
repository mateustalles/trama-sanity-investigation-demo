'use client'
import {gameHypotheses} from '../../../../../../scripts/sanity-game-options.mjs'
import type {Evidence} from './game-model'
import styles from './delta-game.module.css'

export function GuidedDeltaOrbit({label,hypothesisId,evidence,selectedIds,rationale,disabled,onHypothesis,onEvidence,onReview,canReview,pending}:{
  label:string;hypothesisId:string;evidence:Evidence[];selectedIds:string[];rationale:string;disabled:boolean;
  onHypothesis:(id:string)=>void;onEvidence:(id:string)=>void;onReview:()=>void;canReview:boolean;
  pending?:'search'|'review'|null;
}) {
  const shown=evidence.slice(0,8)
  return <div className={styles.guidedOrbit} aria-label="Interactive Delta triangle">
    <svg className={styles.guidedTriangle} viewBox="0 0 800 620" preserveAspectRatio="none" aria-hidden="true"><path d="M400 170 L190 450 L615 450 Z"/><path d="M400 170 L405 350 L190 450 M405 350 L615 450"/></svg>
    <section className={styles.hypothesisStation} aria-labelledby="orbit-hypothesis">
      <h3 id="orbit-hypothesis">01 / Choose a hypothesis</h3>
      <div className={styles.hypothesisSatellites}>{gameHypotheses.map(option=><button type="button" key={option.id} aria-pressed={hypothesisId===option.id} disabled={disabled} onClick={()=>onHypothesis(option.id)} title={option.text}><b>{option.code}</b><span>{option.label}</span></button>)}</div>
      <span className={`${styles.stationSphere} ${styles.cyanSphere}`} aria-hidden="true"/><strong>Hypothesis</strong>
      <p>{gameHypotheses.find(item=>item.id===hypothesisId)?.text??'Select A, B or C. You can change your mind.'}</p>
    </section>
    <div className={styles.guidedCore}><span>Δ</span><strong>{label}</strong><small>Your choices build the Delta</small></div>
    <section className={styles.evidenceStation} aria-labelledby="orbit-evidence">
      <h3 id="orbit-evidence">02 / Connect the clues</h3>
      <div className={styles.satelliteRing}><span className={`${styles.stationSphere} ${styles.greenSphere}`} aria-hidden="true"/>{shown.map((item,index)=>{
        const angle=(index/Math.max(shown.length,1))*Math.PI*2-Math.PI/2
        return <button type="button" key={item.id} disabled={disabled} aria-pressed={selectedIds.includes(item.id)} aria-label={`${selectedIds.includes(item.id)?'Remove':'Select'} clue: ${item.title}`} title={item.title} onClick={()=>onEvidence(item.id)} style={{left:`${50+35*Math.cos(angle)}%`,top:`${50+36*Math.sin(angle)}%`}}><span>{selectedIds.includes(item.id)?'✓':'+'}</span>{item.title.length>23?`${item.title.slice(0,21)}…`:item.title}</button>
      })}</div>
      <strong>Evidence · {selectedIds.length} selected</strong><p>{shown.length} of {evidence.length} current clues orbit here. Open the full records below before drawing a conclusion.</p><a href="#evidence-heading">Read all clues ↓</a>
    </section>
    <section className={styles.rationaleStation} aria-labelledby="orbit-rationale">
      <h3 id="orbit-rationale">03 / Explain the connection</h3><button className={`${styles.stationSphere} ${styles.purpleSphere}`} type="button" onClick={onReview} disabled={!canReview} aria-label="Generate a rationale from my selected clues"/>
      <strong>Rationale</strong><p>{rationale?'A rationale is ready for your decision.':'Let the model assess this combination—not choose it for you.'}</p><button type="button" onClick={onReview} disabled={!canReview}>{pending==='review'?'Proposing a rationale…':'Explain this connection →'}</button>
    </section>
  </div>
}
