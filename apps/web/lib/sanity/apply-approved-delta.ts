import {
  planApprovedInvestigationDelta,
  type ApprovedInvestigationDelta,
  type InvestigationElementKind,
  type InvestigationStateSnapshot,
} from '@trama/application'
import {createClient} from 'next-sanity'

const apiVersion = '2026-09-21'

function required(name: 'NEXT_PUBLIC_SANITY_PROJECT_ID' | 'NEXT_PUBLIC_SANITY_DATASET' | 'SANITY_API_WRITE_TOKEN') {
  const value = process.env[name]
  if (!value) throw new Error(`${name} must be configured to apply an approved Delta.`)
  return value
}

const approvedDeltaQuery = `
{
  "case": *[_id == $caseId][0]{_id,_rev,stateRevision},
  "targets": *[_type == "investigationElement" && case._ref == $caseId]{_id,_rev,label,status,details},
  "delta": *[_id == $deltaId && _type == "investigationDelta"][0]{
    _id,_rev,case,baseRevision,status,
    items[]{operation,"targetId":target._ref,justification,externalBasis,proposedKind,proposedLabel,proposedStatus,proposedDetails}
  }
}
`

const proposedDeltaQuery = `
*[_id == $deltaId && _type == "investigationDelta"][0]{_id,_rev,case,status}
`

/**
 * Records the explicit human approval in Sanity before any state mutation.
 * The revision guard prevents approving an edited or already-resolved Delta.
 */
export async function approveSanityDelta(caseId: string, deltaId: string) {
  const client = createClient({
    projectId: required('NEXT_PUBLIC_SANITY_PROJECT_ID'),
    dataset: required('NEXT_PUBLIC_SANITY_DATASET'),
    apiVersion,
    token: required('SANITY_API_WRITE_TOKEN'),
    useCdn: false,
  })
  const delta = await client.fetch<{
    _id: string
    _rev: string
    case?: {_ref?: string}
    status: string
  } | null>(proposedDeltaQuery, {deltaId})

  if (!delta) throw new Error('Delta was not found.')
  if (delta.case?._ref !== caseId) throw new Error('Delta does not belong to this Case.')
  // An application can fail after the approval was durably recorded. In that
  // case the same explicit approval may safely retry the guarded application.
  if (delta.status === 'approved') return
  if (delta.status !== 'proposed') throw new Error('Only a proposed Delta may be approved.')

  const approvedAt = new Date().toISOString()
  await client.patch(deltaId, {
    ifRevisionID: delta._rev,
    set: {status: 'approved', approvedAt},
  }).commit({tag: 'trama.approve-investigation-delta'})
}

/** Server-only Sanity adapter. Call only after Trama has recorded human approval. */
export async function applyApprovedSanityDelta(caseId: string, deltaId: string) {
  const client = createClient({
    projectId: required('NEXT_PUBLIC_SANITY_PROJECT_ID'),
    dataset: required('NEXT_PUBLIC_SANITY_DATASET'),
    apiVersion,
    token: required('SANITY_API_WRITE_TOKEN'),
    useCdn: false,
  })
  const source = await client.fetch<{
    case: { _id: string; _rev: string; stateRevision: number | null } | null
    targets: Array<{_id: string; _rev: string; label: string; status: InvestigationStateSnapshot['targets'][number]['status']; details?: string}>
    delta: (Omit<ApprovedInvestigationDelta, 'id' | 'caseId' | 'status'> & { _id: string; _rev: string; case?: {_ref?: string}; status: string }) | null
  }>(approvedDeltaQuery, {caseId, deltaId})

  if (!source.case || !source.delta) throw new Error('Case or Delta was not found.')
  if (source.delta.case?._ref !== caseId) throw new Error('Delta does not belong to this Case.')
  const state: InvestigationStateSnapshot = {
    caseId,
    revision: source.case.stateRevision ?? 0,
    targets: source.targets.map(({_id, _rev, ...target}) => ({id: _id, revision: _rev, ...target})),
  }
  const delta: ApprovedInvestigationDelta = {
    id: source.delta._id,
    caseId,
    baseRevision: source.delta.baseRevision,
    status: source.delta.status as 'approved',
    items: source.delta.items,
  }
  const plan = planApprovedInvestigationDelta(state, delta)
  const appliedAt = new Date().toISOString()
  let transaction = client.transaction().patch(caseId, {
    ifRevisionID: source.case._rev,
    set: {stateRevision: plan.nextStateRevision},
  })
  for (const patch of plan.elementPatches) {
    const set = Object.fromEntries(Object.entries({label: patch.label, status: patch.status, details: patch.details}).filter(([, value]) => value !== undefined))
    transaction = transaction.patch(patch.id, {ifRevisionID: patch.revision, set})
  }
  for (const element of plan.newElements) {
    transaction = transaction.create({
      _type: 'investigationElement',
      case: {_type: 'reference', _ref: caseId},
      kind: element.kind as InvestigationElementKind,
      label: element.label,
      status: element.status,
      externalBasis: element.externalBasis,
      ...(element.details === undefined ? {} : {details: element.details}),
    })
  }
  transaction = transaction.patch(deltaId, {
    ifRevisionID: source.delta._rev,
    set: {status: 'applied', appliedAt},
  })
  return transaction.commit({tag: 'trama.apply-approved-investigation-delta'})
}
