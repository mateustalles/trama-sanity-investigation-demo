import {sanityClient} from '../../../lib/sanity/client'
import {requireHostedUser} from '../../../lib/supabase/session'
import {ApplyDeltaButton} from './apply-delta-button'
import styles from './page.module.css'

const proposedDeltasQuery = `
*[_type == "investigationDelta" && status == "proposed"] | order(_createdAt desc){
  _id, summary, baseRevision,
  "caseId": case._ref,
  "caseTitle": case->title,
  "itemCount": count(items)
}
`

const recentApplicationsQuery = `
*[_type == "investigationDelta" && status == "applied"] | order(appliedAt desc)[0...5]{
  _id, summary, appliedAt,
  "caseTitle": case->title
}
`

type ProposedDelta = {
  _id: string
  summary?: string
  baseRevision: number
  caseId: string
  caseTitle?: string
  itemCount: number
}

type AppliedDelta = {
  _id: string
  summary?: string
  appliedAt?: string
  caseTitle?: string
}

function formatAppliedAt(value?: string) {
  return value ? new Intl.DateTimeFormat('pt-BR', {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(value)) : 'Horário não registrado'
}

export default async function SanityPocPage() {
  await requireHostedUser()
  const client = sanityClient.withConfig({useCdn: false})
  const [deltas, recentApplications] = await Promise.all([
    client.fetch<ProposedDelta[]>(proposedDeltasQuery),
    client.fetch<AppliedDelta[]>(recentApplicationsQuery),
  ])

  return <main className={styles.page}>
    <section className={styles.surface}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>POC · Sanity + Trama</p>
        <h1>Aprovação de Deltas</h1>
        <p>Revise mudanças estruturadas antes de aplicá-las. A aprovação é auditada no Trama; o token de escrita nunca chega ao navegador.</p>
        <p><a href="/poc/sanity/investigate">Abrir a demo de investigação com Sanity Context →</a></p>
      </header>

      <section aria-labelledby="pending-deltas">
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>Aguardando decisão</p><h2 id="pending-deltas">Deltas propostas</h2></div>
          <span className={styles.count}>{deltas.length}</span>
        </div>
        {!deltas.length && <div className={styles.empty}><strong>Nada pendente agora.</strong><p>As próximas propostas aparecerão aqui antes de qualquer alteração no caso.</p></div>}
        {deltas.map((delta) => <article key={delta._id} className={styles.card}>
          <p className={styles.cardLabel}>Caso · {delta.caseTitle ?? delta.caseId}</p>
          <h3>{delta.summary ?? 'Delta sem resumo'}</h3>
          <p className={styles.meta}>Revisão-base {delta.baseRevision} <span>•</span> {delta.itemCount} alteração(ões) proposta(s)</p>
          <ApplyDeltaButton caseId={delta.caseId} deltaId={delta._id} />
        </article>)}
      </section>

      <section className={styles.history} aria-labelledby="applied-deltas">
        <div className={styles.sectionHeading}><div><p className={styles.eyebrow}>Evidência</p><h2 id="applied-deltas">Aplicações recentes</h2></div></div>
        {!recentApplications.length && <p className={styles.empty}>Ainda não há aplicações registradas.</p>}
        {recentApplications.map((delta) => <article key={delta._id} className={styles.historyItem}>
          <span aria-hidden="true">✓</span><div><strong>{delta.summary ?? 'Delta aplicada'}</strong><p>{delta.caseTitle ?? 'Caso'} · {formatAppliedAt(delta.appliedAt)}</p></div>
        </article>)}
      </section>
    </section>
  </main>
}
