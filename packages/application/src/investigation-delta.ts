export type InvestigationDeltaOperation = 'NEW' | 'CHANGED' | 'RESOLVED'
export type InvestigationElementKind =
  | 'problem'
  | 'hypothesis'
  | 'condition'
  | 'evidence'
  | 'artifact'
  | 'question'
  | 'finding'

export interface InvestigationTarget {
  id: string
  revision: string
  label: string
  status: 'open' | 'resolved' | 'contradicted' | 'missing'
  details?: string
}

export interface InvestigationStateSnapshot {
  caseId: string
  revision: number
  targets: InvestigationTarget[]
}

export interface ApprovedInvestigationDeltaItem {
  operation: InvestigationDeltaOperation
  targetId?: string
  justification: string
  externalBasis: string
  proposedKind?: InvestigationElementKind
  proposedLabel?: string
  proposedStatus?: InvestigationTarget['status']
  proposedDetails?: string
}

export interface ApprovedInvestigationDelta {
  id: string
  caseId: string
  baseRevision: number
  status: 'approved'
  items: ApprovedInvestigationDeltaItem[]
}

export interface InvestigationElementPatch {
  id: string
  revision: string
  label?: string
  status?: InvestigationTarget['status']
  details?: string
}

export interface NewInvestigationElement {
  kind: InvestigationElementKind
  label: string
  status: InvestigationTarget['status']
  details?: string
  externalBasis: string
}

export interface ApprovedDeltaMutationPlan {
  nextStateRevision: number
  elementPatches: InvestigationElementPatch[]
  newElements: NewInvestigationElement[]
}

/**
 * Provider-neutral policy. It contains no model reasoning and does not write.
 * An adapter is responsible for translating the returned plan into one
 * transaction on the selected persistence system.
 */
export function planApprovedInvestigationDelta(
  state: InvestigationStateSnapshot,
  delta: ApprovedInvestigationDelta,
): ApprovedDeltaMutationPlan {
  if (delta.status !== 'approved') throw new Error('Only an approved Delta may be applied.')
  if (delta.caseId !== state.caseId) throw new Error('Delta does not belong to the supplied Case.')
  if (delta.baseRevision !== state.revision) throw new Error('Delta was proposed from a stale State revision.')
  if (!delta.items.length) throw new Error('An approved Delta needs at least one item.')

  const targets = new Map(state.targets.map((target) => [target.id, target]))
  const patches = new Map<string, InvestigationElementPatch>()
  const newElements: NewInvestigationElement[] = []

  for (const item of delta.items) {
    if (!item.justification.trim() || !item.externalBasis.trim()) {
      throw new Error('Every Delta item needs a justification and external basis.')
    }

    if (item.operation === 'NEW') {
      if (!item.proposedKind || !item.proposedLabel?.trim()) {
        throw new Error('A NEW item needs a proposed kind and label.')
      }
      newElements.push({
        kind: item.proposedKind,
        label: item.proposedLabel,
        status: item.proposedStatus ?? 'open',
        ...(item.proposedDetails === undefined ? {} : {details: item.proposedDetails}),
        externalBasis: item.externalBasis,
      })
      continue
    }

    if (!item.targetId) throw new Error(`${item.operation} needs an existing target.`)
    const target = targets.get(item.targetId)
    if (!target) throw new Error(`Delta target is not in the authoritative State: ${item.targetId}`)
    const current = patches.get(target.id) ?? {id: target.id, revision: target.revision}

    if (item.operation === 'RESOLVED' && item.proposedStatus && item.proposedStatus !== 'resolved') {
      throw new Error('A RESOLVED item may only set status to resolved.')
    }
    patches.set(target.id, {
      ...current,
      ...(item.proposedLabel === undefined ? {} : {label: item.proposedLabel}),
      ...(item.proposedDetails === undefined ? {} : {details: item.proposedDetails}),
      ...(item.operation === 'RESOLVED' ? {status: 'resolved' as const} : item.proposedStatus === undefined ? {} : {status: item.proposedStatus}),
    })
  }

  return {nextStateRevision: state.revision + 1, elementPatches: [...patches.values()], newElements}
}
