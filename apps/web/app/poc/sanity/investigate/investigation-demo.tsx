'use client'

import {useEffect,useRef,useState,type FormEvent} from 'react'
import type {DemoResult} from '../../../../../../scripts/sanity-demo-agent.mjs'
import styles from './investigation-demo.module.css'
import {signOut} from '../../../login/actions'

const suggestedQuestions = [
  {id:'timeline',label:'Establish the timeline',description:'Start with the event itself, before looking for a cause.',question:'What happened to checkout payments between 10:00 and 10:15 UTC on September 18, 2026?'},
  {id:'change',label:'Look for a change',description:'Find records from just before the failures began.',question:'What changed in checkout shortly before the September 18 payment failures began?'},
  {id:'observations',label:'Check a measurement',description:'Inspect an observation that overlaps the failure window.',question:'What did the Provider A latency observation record during the 10:00–10:15 UTC checkout failure window?'},
  {id:'alternatives',label:'Test alternatives',description:'Compare two competing explanations with their original records.',question:'What do the original postal-code and fraud audit records say about alternative explanations for the September 18 payment failures?'},
] as const

const advancedQuestions = [
  {id:'synthesis',label:'Synthesize four evidence threads',question:'Compare the release timeout change, Provider A latency, and the postal/fraud counterevidence. What mechanism is best supported, what remains unproven, and which original records support each part?'},
  {id:'separation',label:'Spot a misleading look-alike',question:'A Provider A maintenance report from July uses the same vendor name. Should it influence this September incident?'},
] as const

function shortId(value: string) { return value.length > 28 ? `${value.slice(0,27)}…` : value }
function seconds(value: number) { return `${(value / 1000).toFixed(1)} s` }

export function InvestigationDemo({signedIn=false}: {signedIn?: boolean}) {
  const [question,setQuestion] = useState('')
  const [result,setResult] = useState<DemoResult | null>(null)
  const [pending,setPending] = useState(false)
  const [error,setError] = useState<string | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (result) resultRef.current?.scrollIntoView({behavior:'smooth',block:'start'}) },[result])

  function chooseQuestion(nextQuestion: string) {
    if (pending) return
    setQuestion(nextQuestion)
    setResult(null)
    setError(null)
    document.getElementById('investigation-question')?.focus()
  }

  async function investigate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true); setError(null); setResult(null)
    try {
      const response = await fetch('/api/poc/sanity/investigate',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question}),cache:'no-store',
      })
      const payload = await response.json() as DemoResult & {error?: string}
      if (!response.ok) throw new Error(payload.error ?? 'The investigation could not be completed.')
      setResult(payload)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The investigation failed.') }
    finally { setPending(false) }
  }

  return <main className={styles.page} lang="en">
    <div className={styles.shell}>
      <nav className={styles.nav} aria-label="Demo navigation">
        <a href="/poc/sanity/investigate">Trama × Sanity Context</a><span>·</span><span>Evidence investigation demo</span>
        <span className={styles.navStatus}>Experimental · read-only</span>
        {signedIn && <form action={signOut}><button type="submit">Sign out</button></form>}
      </nav>

      <header className={styles.hero}>
        <div><p className={styles.eyebrow}>An investigation, not a ready-made verdict</p>
          <h1>Find the evidence. Test the story.</h1>
          <p>Trama helps people reason through messy, evolving problems. Sanity Context acts as its evidence librarian: it finds potentially relevant records in a noisy archive. Trama reads the exact originals before explaining what is observed, what is inferred, and what is still unknown.</p>
        </div>
        <div className={styles.heroCard} aria-label="How this agent works">
          <span>01 <b>Search</b> with Context MCP</span>
          <span>02 <b>Verify</b> original records</span>
          <span>03 <b>Reason</b> without changing State</span>
        </div>
      </header>

      <section className={styles.brief} aria-labelledby="brief-heading">
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>The case brief / all you know at the start</p><h2 id="brief-heading">Fifteen minutes of failed checkouts</h2></div><span className={styles.badge}>Fictional incident</span></div>
        <p className={styles.briefStory}>On September 18, 2026, a merchant saw a sudden rise in failed checkout payments between 10:00 and 10:15 UTC. Several teams left records around that time. The archive also contains older incidents, later proposals, generic guidance, and other plausible-looking distractions. No cause is confirmed in this brief.</p>
        <div className={styles.briefGrid}>
          <div><span>YOUR TASK / 01</span><strong>Reconstruct the timeline</strong><p>Find out what happened and what changed nearby.</p></div>
          <div><span>YOUR TASK / 02</span><strong>Challenge explanations</strong><p>Compare direct observations with counterevidence and look-alike events.</p></div>
          <div><span>YOUR TASK / 03</span><strong>Qualify the conclusion</strong><p>Separate a plausible mechanism from a proven root cause.</p></div>
        </div>
        <p className={styles.scopeNote}><strong>In scope:</strong> this fictional September checkout incident and the records in its 145-document pilot archive. <strong>Out of scope:</strong> real customers, unrelated Tramas, and changing the current Case State. The assistant can investigate; it cannot apply a Delta here.</p>
      </section>

      <section className={styles.workspace} aria-labelledby="ask-heading">
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>01 / Begin investigating</p><h2 id="ask-heading">What would you ask first?</h2></div><span className={styles.badge}>145 synthetic records</span></div>
        <p className={styles.workspaceIntro}>Choose a starting question or write your own. These prompts point to lines of inquiry, not to the answer.</p>
        <div className={styles.examples} aria-label="Suggested investigation questions">
          {suggestedQuestions.map(suggestion => <button key={suggestion.id} type="button" className={question === suggestion.question ? styles.exampleActive : styles.example}
            onClick={() => chooseQuestion(suggestion.question)} aria-pressed={question === suggestion.question} disabled={pending}>
            <strong>{suggestion.label}</strong><span>{suggestion.description}</span><small>Use this question →</small>
          </button>)}
        </div>
        <details className={styles.advanced}><summary>Ready for a harder cross-source question?</summary>
          <p>These optional prompts test synthesis and whether the agent can keep similar-looking events separate.</p>
          <div>{advancedQuestions.map(item => <button key={item.id} type="button" onClick={() => chooseQuestion(item.question)} disabled={pending}>{item.label} →</button>)}</div>
        </details>
        <form onSubmit={investigate} className={styles.form}>
          <label htmlFor="investigation-question">Your question to the archive</label>
          <textarea id="investigation-question" value={question} onChange={event => setQuestion(event.target.value)} placeholder="What happened during the checkout incident?" minLength={12} maxLength={600} rows={4} required disabled={pending} />
          <div className={styles.formFoot}><p>Ask about the fictional pilot only. Do not include personal, customer, or confidential data: your question is sent to Sanity Context and OpenAI. Answers are experimental and never change the case.</p>
            <button type="submit" disabled={pending || question.trim().length < 12}>{pending ? 'Investigating…' : 'Investigate live →'}</button></div>
        </form>
        {pending && <p className={styles.pending} role="status">Searching with Context MCP, verifying original records, and preparing an answer. This may take a few seconds.</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </section>

      {result && <div className={styles.results} aria-live="polite" ref={resultRef}>
        <section className={styles.answerPanel} aria-labelledby="answer-heading">
          <div className={styles.sectionHead}><div><p className={styles.eyebrow}>02 / Evidence-based answer</p><h2 id="answer-heading">What the records support</h2></div><span className={styles.badge}>{seconds(result.trace.totalLatencyMs)}</span></div>
          <p className={styles.answeredQuestion}><strong>Question answered</strong><span>{result.question}</span></p>
          <p className={styles.conclusion}>{result.answer.conclusion}</p>
          <p className={styles.answer}>{result.answer.answer}</p>
          <div className={styles.limit}><strong>What remains uncertain</strong><p>{result.answer.limitations || 'No additional limitation was supplied by the model; inspect the original records before acting.'}</p></div>
          <p className={styles.disclaimer}>Experimental answer. Cited source names were checked against the originals delivered to the model; a person must still audit whether every claim is supported.</p>
        </section>

        <section className={styles.evidencePanel} aria-labelledby="evidence-heading">
          <div className={styles.sectionHead}><div><p className={styles.eyebrow}>03 / Provenance</p><h2 id="evidence-heading">Original records the agent read</h2></div><span className={styles.badge}>{result.sources.length} read</span></div>
          {result.sources.length === 0 && <p className={styles.empty}>No verified original entered the answer.</p>}
          <div className={styles.sources}>{result.sources.map(source => <article className={styles.source} key={source.id}>
            <div className={styles.sourceTop}><div><h3>{source.sourceId}</h3><p>{source.title}</p></div><span className={source.claimedByAnswer ? styles.cited : styles.unused}>{source.claimedByAnswer ? 'cited' : 'read'}</span></div>
            <div className={styles.meta}><span>rev. {shortId(source.revision)}</span><span>SHA-256 {shortId(source.contentHash)}</span>{source.sourceTimestamp && <span>{source.sourceTimestamp}</span>}</div>
            <details><summary>Read the original record</summary><pre>{source.body}</pre><small>ID: {source.id}</small></details>
          </article>)}</div>
        </section>

        <section className={styles.tracePanel} aria-labelledby="trace-heading">
          <div className={styles.sectionHead}><div><p className={styles.eyebrow}>04 / How it found them</p><h2 id="trace-heading">Retrieval trace</h2></div><span className={styles.badge}>{result.trace.calls.length} MCP reads</span></div>
          <div className={styles.traceGrid}>
            <div><strong>Search plan</strong><p>{result.trace.facets.length ? result.trace.facets.join(' · ') : 'Whole question — a valid facet plan was not needed or available.'}</p></div>
            <div><strong>Strategy</strong><p>{result.trace.strategy === 'whole-question' ? 'Whole-question search' : 'Independent facets + baseline candidates'}</p></div>
            <div><strong>Final packet</strong><p>{result.trace.selectedIds.length} originals within 12,000 characters; {result.trace.omittedIds.length} omitted by the budget.</p></div>
            <div><strong>Keyword comparison</strong><p>{result.trace.keywordCandidates.length} keyword candidates; no second answer was generated.</p></div>
          </div>
          {(result.trace.missingIds.length > 0 || result.trace.plannerWarning || result.trace.selectorWarning) && <p className={styles.warning}>Gaps: {result.trace.missingIds.length} originals missing. {result.trace.plannerWarning} {result.trace.selectorWarning}</p>}
          <details className={styles.technical}><summary>Inspect queries and candidates</summary>
            <div className={styles.techColumns}><div><h3>Sanity Context MCP</h3>{result.trace.calls.map((call,index) => <article key={`${call.kind}-${index}`}><strong>{call.kind}{call.facet ? ` · ${call.facet}` : ''}</strong><span>{call.returned} results · {seconds(call.latencyMs)}</span><code>{call.query}</code></article>)}</div>
              <div><h3>Keyword candidates</h3><ol>{result.trace.keywordCandidates.map(item => <li key={item.id}>{item.sourceId}</li>)}</ol><h3>Selected IDs</h3><ol>{result.trace.selectedIds.map(id => <li key={id}><code>{shortId(id)}</code></li>)}</ol></div></div>
          </details>
        </section>
      </div>}
      <footer className={styles.footer}>Sanity Context locates evidence; Trama checks original records and reasons about uncertainty. This demo does not modify the archive or the Case State.</footer>
    </div>
  </main>
}
