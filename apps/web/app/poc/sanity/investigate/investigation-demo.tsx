'use client'

import {useEffect,useRef,useState,type FormEvent} from 'react'
import type {NativeDemoResult} from '../../../../../../scripts/sanity-kb-native-demo.mjs'
import {advancedQuestions,suggestedQuestions} from '../../../../../../scripts/sanity-demo-prompts.mjs'
import {clientRequestTimeoutMs,demoLimits,describeDemoFailure,readDemoAccess,retrySeconds,waitLabel,type DemoAccess} from './demo-feedback'
import styles from './investigation-demo.module.css'
import {signOut} from '../../../login/actions'

function seconds(value: number) { return `${(value / 1000).toFixed(1)} s` }

export function InvestigationDemo({signedIn=false}: {signedIn?: boolean}) {
  const [question,setQuestion] = useState('')
  const [result,setResult] = useState<NativeDemoResult | null>(null)
  const [pending,setPending] = useState(false)
  const [error,setError] = useState<string | null>(null)
  const [access,setAccess] = useState<DemoAccess>(demoLimits)
  const [retryAt,setRetryAt] = useState<number | null>(null)
  const [exhausted,setExhausted] = useState(false)
  const [startedAt,setStartedAt] = useState<number | null>(null)
  const [now,setNow] = useState(0)
  const resultRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const inFlightRef = useRef(false)
  const waiting = retrySeconds(retryAt,now)
  const cooldownActive = waiting > 0
  const windowMinutes = access.windowSeconds / 60

  useEffect(() => { if (result) resultRef.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}) },[result])
  useEffect(() => {
    if (!pending && !cooldownActive) return
    const timer = window.setInterval(() => setNow(Date.now()),1000)
    return () => window.clearInterval(timer)
  },[pending,cooldownActive])
  useEffect(() => () => {controllerRef.current?.abort()},[])

  function chooseQuestion(nextQuestion: string) {
    if (pending) return
    setQuestion(nextQuestion)
    setResult(null)
    if (!exhausted && retrySeconds(retryAt,Date.now()) === 0) setError(null)
    document.getElementById('investigation-question')?.focus()
  }

  async function investigate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlightRef.current || exhausted || retrySeconds(retryAt,Date.now()) > 0 || question.trim().length < 12) return
    inFlightRef.current = true
    const started = Date.now()
    setPending(true); setStartedAt(started); setNow(started); setError(null); setResult(null)
    const controller = new AbortController()
    controllerRef.current = controller
    const timer = window.setTimeout(() => controller.abort(),clientRequestTimeoutMs)
    try {
      const response = await fetch('/api/poc/sanity/investigate',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question}),cache:'no-store',signal:controller.signal,
      })
      const payload: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const failure = describeDemoFailure(payload,response.status,response.headers.get('Retry-After'),Date.now())
        setError(failure.message); setRetryAt(failure.retryAt); setExhausted(failure.exhausted); setNow(Date.now())
        if (failure.access) setAccess(failure.access)
        return
      }
      if (!payload || typeof payload !== 'object' || !('answer' in payload) || !('search' in payload)) throw new Error('The server returned an unexpected response. Your question has been kept.')
      const nextAccess = readDemoAccess('access' in payload ? payload.access : null)
      if (nextAccess) {
        setAccess(nextAccess)
        setExhausted(nextAccess.remainingTotal === 0)
        setRetryAt(nextAccess.remainingInWindow === 0 && nextAccess.retryAt ? Date.parse(nextAccess.retryAt) : null)
        setNow(Date.now())
      }
      setResult(payload as NativeDemoResult)
    } catch (cause) {
      setError(controller.signal.aborted ? 'The request did not finish within 125 seconds. We stopped waiting; the server may still finish processing it, and it may count toward your allowance. Your question has been kept. Check your connection and retry manually.' : cause instanceof Error ? cause.message : 'We could not reach the investigation service. Your question has been kept.')
    } finally {
      window.clearTimeout(timer)
      controllerRef.current = null
      inFlightRef.current = false
      setPending(false); setStartedAt(null)
    }
  }

  return <main className={styles.page} lang="en">
    <div className={styles.shell}>
      <nav className={styles.nav} aria-label="Demo navigation">
        <a href="/poc/sanity/investigate">Trama × Sanity</a>
        <span className={styles.navStatus}>Read-only investigation</span>
        <a href="/poc/sanity/game">Try the Delta game ↗</a>
        {signedIn && <form action={signOut}><button type="submit">Sign out</button></form>}
      </nav>

      <header className={styles.hero}>
        <div><p className={styles.eyebrow}>From scattered information to a clearer investigation</p>
          <h1>What caused the checkout failures?</h1>
          <p>Trama uses Sanity as an information index to help investigate complex, conflicting records. Ask about this fictional incident and see how the agent finds context, builds an explanation, and tells you what is still uncertain.</p>
        </div>
      </header>

      <section className={styles.brief} aria-labelledby="brief-heading">
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>Your starting point</p><h2 id="brief-heading">A fifteen-minute incident. Several possible explanations.</h2></div><span className={styles.badge}>Fictional case</span></div>
        <p className={styles.briefStory}>On September 18, 2026, checkout payments suddenly began failing between 10:00 and 10:15 UTC. A deployment, provider measurements, and competing explanations appear in the records. Some older incidents look similar. Your task: discover what changed, compare the explanations, and decide what the evidence really supports.</p>
        <p className={styles.scopeNote}>You can ask about the incident timeline, changes before it, provider observations, alternative causes, and gaps in the evidence. This demo cannot change the case or investigate your private data.</p>
      </section>

      <section className={styles.process} aria-labelledby="process-heading">
        <p className={styles.eyebrow}>What happens when you ask</p><h2 id="process-heading">Your question → Sanity context → a qualified answer</h2>
        <ol className={styles.processSteps}>
          <li><span>1</span><div><strong>You ask about the incident</strong><p>Choose a starting question or write your own.</p></div></li>
          <li><span>2</span><div><strong>Trama asks Sanity to find relevant context</strong><p>Sanity searches its built Knowledge Base, an index generated from 145 synthetic source documents.</p></div></li>
          <li><span>3</span><div><strong>The model reads Sanity’s complete response</strong><p>Trama passes all returned entry text to OpenAI without another filter or a keyword fallback.</p></div></li>
          <li><span>4</span><div><strong>You review an answer and its limits</strong><p>See the proposed explanation and uncertainty. Open the details if you want to inspect exactly what Sanity returned.</p></div></li>
        </ol>
      </section>

      <section className={styles.workspace} aria-labelledby="ask-heading">
        <div className={styles.sectionHead}><div><p className={styles.eyebrow}>Start here</p><h2 id="ask-heading">What would you ask first?</h2></div></div>
        <p className={styles.workspaceIntro}>Try a starting question, then follow your curiosity. Each question is an independent investigation—not a chat with memory of previous answers.</p>
        <div className={styles.examples} aria-label="Suggested investigation questions">
          {suggestedQuestions.map(suggestion => <button key={suggestion.id} type="button" className={question === suggestion.question ? styles.exampleActive : styles.example}
            onClick={() => chooseQuestion(suggestion.question)} aria-pressed={question === suggestion.question} disabled={pending}>
            <strong>{suggestion.label}</strong><span>{suggestion.description}</span><small>Use this question →</small>
          </button>)}
        </div>
        <details className={styles.advanced}><summary>Try a more challenging question</summary>
          <div>{advancedQuestions.map(item => <button key={item.id} type="button" onClick={() => chooseQuestion(item.question)} disabled={pending}>{item.label} →</button>)}</div>
        </details>
        <form onSubmit={investigate} className={styles.form}>
          <label htmlFor="investigation-question">Your investigation question</label>
          <textarea id="investigation-question" value={question} onChange={event => setQuestion(event.target.value)} placeholder="What changed shortly before the failures started?" minLength={12} maxLength={600} rows={3} required disabled={pending} aria-describedby="request-allowance question-privacy" />
          <div className={styles.allowance} id="request-allowance">
            <strong>{access.totalRequests !== undefined ? 'Judge account allowance' : 'Operator request limit'}: {access.requestsPerWindow} questions per {windowMinutes === 1 ? 'minute' : `${windowMinutes} minutes`}{access.totalRequests !== undefined ? ` · ${access.totalRequests} questions total per demo account` : ' · no total judge-account quota'}.</strong>
            {access.remainingTotal !== undefined && <span>{access.remainingTotal} total questions remaining{access.remainingInWindow !== undefined && waiting === 0 ? ` · ${access.remainingInWindow} available in the last reported window` : ''}.</span>}
            <span>Processing limits: up to 30 seconds for Sanity search, then up to 90 seconds for the answer. Requests are not retried automatically.</span>
          </div>
          <div className={styles.formFoot}><p id="question-privacy">Ask only about this fictional case. Your question is sent to Sanity and OpenAI; do not include personal or confidential information.</p>
            <button type="submit" disabled={pending || waiting > 0 || exhausted || question.trim().length < 12}>{pending ? 'Investigating…' : exhausted ? 'Account allowance used' : waiting > 0 ? `Try again in ${waitLabel(waiting)}` : 'Ask Trama →'}</button></div>
        </form>
        {pending && <div className={styles.pending} role="status"><strong>Investigating your question · {Math.floor(Math.max(0,now - (startedAt ?? now)) / 1000)} seconds elapsed</strong><p>Sanity search and answer preparation are in progress. This page receives the result at the end, so it cannot show which step has finished yet.</p></div>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {waiting > 0 && <p className={styles.retry} role="status">You can send another question in <strong>{waitLabel(waiting)}</strong>, at {new Date(retryAt!).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})} (your local time). Your question will not be sent automatically.</p>}
        {retryAt !== null && waiting === 0 && !exhausted && <p className={styles.retry} role="status">The waiting period has ended. You can send your question now; it has not been sent automatically.</p>}
        {exhausted && !error && <p className={styles.error} role="status">Your account’s total question allowance has been used. The answer below is still available; contact the demo owner for more access.</p>}
      </section>

      {result && <div className={styles.results} aria-live="polite" ref={resultRef}>
        <section className={styles.answerPanel} aria-labelledby="answer-heading">
          <div className={styles.sectionHead}><div><p className={styles.eyebrow}>Your investigation result</p><h2 id="answer-heading">What the records suggest</h2></div><span className={styles.badge}>{seconds(result.trace.totalLatencyMs)}</span></div>
          <p className={styles.answeredQuestion}><strong>Your question</strong><span>{result.question}</span></p>
          <p className={styles.conclusion}>{result.answer.conclusion}</p>
          <p className={styles.answer}>{result.answer.answer}</p>
          <div className={styles.limit}><strong>What remains uncertain</strong><p>{result.answer.limitations}</p></div>
          <p className={styles.disclaimer}>This answer uses Sanity-generated Knowledge Base entries. This path does not reread or verify original documents. Treat it as an investigation aid, not a proven verdict.</p>
        </section>

        <details className={styles.evidencePanel}>
          <summary>See what Sanity returned · Complete Knowledge Base response</summary>
          <p className={styles.contextNote}>This is the complete, unmodified text returned by Sanity’s native <code>knowledge_base_search</code> and read by the answer model. Generated entries can contain interpretation and source references—not verified original evidence.</p>
          <pre className={styles.kbResponse}>{result.search.text}</pre>
          {result.answer.entryRefs.length > 0 && <p className={styles.entryRefs}><strong>KB navigation references:</strong> {result.answer.entryRefs.join(' · ')}</p>}
        </details>

        <details className={styles.tracePanel}>
          <summary>How Trama used Sanity for this question · technical details</summary>
          <div className={styles.traceGrid}>
            <div><strong>1 / Query sent to Sanity</strong><p>{result.search.arguments.query}</p><p>{result.trace.queryMode === 'curated-keywords' ? 'This starting question uses prewritten, human-authored keywords.' : 'Your free-form question was sent unchanged.'}</p></div>
            <div><strong>2 / Native Knowledge Base search</strong><p>Sanity searches built entries using its keyword-based search. This route does not use vector embeddings, local keyword fallback, or a second source filter.</p><p><code>{JSON.stringify(result.search.arguments)}</code></p></div>
            <div><strong>3 / Answer preparation</strong><p>{result.model} received the full returned text and your question. It was asked to explain both findings and limitations.</p></div>
            <div><strong>4 / Time and model tokens</strong><p>Sanity search: {seconds(result.trace.searchLatencyMs)} · answer: {seconds(result.trace.modelLatencyMs)}. {result.trace.modelUsage ? `${result.trace.modelUsage.inputTokens} input / ${result.trace.modelUsage.outputTokens} output tokens.` : 'Token usage unavailable.'}</p></div>
          </div>
          <details className={styles.technical}><summary>Inspect the complete MCP response envelope</summary><pre className={styles.rawResponse}>{JSON.stringify(result.search.raw,null,2)}</pre></details>
        </details>
      </div>}
      <footer className={styles.footer}>An investigation aid—not an automatic verdict. Sanity indexes the information; Trama helps you reason about it. Nothing here changes the case or archive.</footer>
    </div>
  </main>
}
