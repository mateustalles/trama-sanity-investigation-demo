'use client'

import {useEffect,useRef,useState,type FormEvent} from 'react'
import type {NativeDemoResult} from '../../../../../../scripts/sanity-kb-native-demo.mjs'
import {advancedQuestions,suggestedQuestions} from '../../../../../../scripts/sanity-demo-prompts.mjs'
import styles from './investigation-demo.module.css'
import {signOut} from '../../../login/actions'

function seconds(value: number) { return `${(value / 1000).toFixed(1)} s` }

export function InvestigationDemo({signedIn=false}: {signedIn?: boolean}) {
  const [question,setQuestion] = useState('')
  const [result,setResult] = useState<NativeDemoResult | null>(null)
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
      const payload = await response.json() as NativeDemoResult & {error?: string}
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
          <p>Trama helps people reason through messy, evolving problems. Sanity Context searches a Knowledge Base built from a noisy archive. The agent reads the returned entries in full, then explains what they suggest and what remains uncertain. Generated entries are a guide, not verified original evidence.</p>
        </div>
        <div className={styles.heroCard} aria-label="How this agent works">
          <span>01 <b>Search</b> the Knowledge Base</span>
          <span>02 <b>Read</b> its full response</span>
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
        <p className={styles.scopeNote}><strong>In scope:</strong> this fictional September checkout incident and its Knowledge Base, built from 145 synthetic source documents. Not every source was retained in generated entries. <strong>Out of scope:</strong> real customers, unrelated Tramas, and changing the current Case State. The assistant cannot apply a Delta here.</p>
      </section>

      <section className={styles.workspace} aria-labelledby="ask-heading">
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>01 / Begin investigating</p><h2 id="ask-heading">What would you ask first?</h2></div><span className={styles.badge}>Native KB search</span></div>
        <p className={styles.workspaceIntro}>Choose a starting question or write your own. Starting questions use prewritten keyword queries; free-form questions are sent verbatim to the Knowledge Base keyword search. The exact query is shown with the result.</p>
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
          <label htmlFor="investigation-question">Your question to the Knowledge Base</label>
          <textarea id="investigation-question" value={question} onChange={event => setQuestion(event.target.value)} placeholder="What happened during the checkout incident?" minLength={12} maxLength={600} rows={4} required disabled={pending} />
          <div className={styles.formFoot}><p>Ask about the fictional pilot only. Do not include personal, customer, or confidential data: your question is sent to Sanity Context and OpenAI. Answers are experimental and never change the case.</p>
            <button type="submit" disabled={pending || question.trim().length < 12}>{pending ? 'Investigating…' : 'Investigate live →'}</button></div>
        </form>
        {pending && <p className={styles.pending} role="status">Searching Knowledge Base entries and preparing an answer from the full response. This may take a few seconds.</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </section>

      {result && <div className={styles.results} aria-live="polite" ref={resultRef}>
        <section className={styles.answerPanel} aria-labelledby="answer-heading">
          <div className={styles.sectionHead}><div><p className={styles.eyebrow}>02 / Qualified answer</p><h2 id="answer-heading">What the Knowledge Base suggests</h2></div><span className={styles.badge}>{seconds(result.trace.totalLatencyMs)}</span></div>
          <p className={styles.answeredQuestion}><strong>Question answered</strong><span>{result.question}</span></p>
          <p className={styles.conclusion}>{result.answer.conclusion}</p>
          <p className={styles.answer}>{result.answer.answer}</p>
          <div className={styles.limit}><strong>What remains uncertain</strong><p>{result.answer.limitations}</p></div>
          {result.answer.entryRefs.length > 0 && <p className={styles.entryRefs}><strong>KB navigation references:</strong> {result.answer.entryRefs.join(' · ')}</p>}
          <p className={styles.disclaimer}>Experimental answer from generated KB entries. This path does not reread or verify original documents. Entry references are navigation hints, not original-source citations; check source support before acting.</p>
        </section>

        <section className={styles.evidencePanel} aria-labelledby="evidence-heading">
          <div className={styles.sectionHead}><div><p className={styles.eyebrow}>03 / Returned context</p><h2 id="evidence-heading">Complete Knowledge Base response</h2></div><span className={styles.badge}>Unmodified text</span></div>
          <p className={styles.contextNote}>This is the entire text returned by <code>knowledge_base_search</code> and passed to the answer model. It may contain Sanity-generated interpretation and source references; neither is an independently verified original in this demo.</p>
          <pre className={styles.kbResponse}>{result.search.text}</pre>
        </section>

        <section className={styles.tracePanel} aria-labelledby="trace-heading">
          <div className={styles.sectionHead}><div><p className={styles.eyebrow}>04 / How it found them</p><h2 id="trace-heading">One native MCP search</h2></div><span className={styles.badge}>{result.model}</span></div>
          <div className={styles.traceGrid}>
            <div><strong>Query mode</strong><p>{result.trace.queryMode === 'curated-keywords' ? 'Prewritten keywords for this starting question' : 'Your question, unchanged'}</p></div>
            <div><strong>KB search query</strong><p>{result.search.arguments.query}</p></div>
            <div><strong>Tool arguments</strong><p><code>{JSON.stringify(result.search.arguments)}</code></p></div>
            <div><strong>Time and tokens</strong><p>KB search {seconds(result.trace.searchLatencyMs)} · answer model {seconds(result.trace.modelLatencyMs)}. {result.trace.modelUsage ? `${result.trace.modelUsage.inputTokens} input / ${result.trace.modelUsage.outputTokens} output tokens.` : 'Token usage unavailable.'}</p></div>
          </div>
          <details className={styles.technical}><summary>Inspect the complete MCP response envelope</summary><pre className={styles.rawResponse}>{JSON.stringify(result.search.raw,null,2)}</pre></details>
        </section>
      </div>}
      <footer className={styles.footer}>Sanity Context searches generated Knowledge Base entries; Trama reasons about their limits. This demo does not verify originals or modify the archive or Case State.</footer>
    </div>
  </main>
}
