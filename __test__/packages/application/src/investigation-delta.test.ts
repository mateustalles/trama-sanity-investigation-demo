import {describe, expect, it} from 'vitest'
import {planApprovedInvestigationDelta, type ApprovedInvestigationDelta, type InvestigationStateSnapshot} from '../../../../packages/application/src/investigation-delta'

const state: InvestigationStateSnapshot = {
  caseId: 'case-1',
  revision: 1,
  targets: [{id: 'condition-1', revision: 'rev-1', label: 'Provider concentration', status: 'open'}],
}

const approved: ApprovedInvestigationDelta = {
  id: 'delta-1', caseId: 'case-1', baseRevision: 1, status: 'approved',
  items: [
    {operation: 'CHANGED', targetId: 'condition-1', justification: 'Regional answer was received.', externalBasis: 'Human answer', proposedDetails: 'Concentrates in affected regions.'},
    {operation: 'RESOLVED', targetId: 'condition-1', justification: 'Necessary condition was confirmed.', externalBasis: 'Human answer', proposedStatus: 'resolved'},
    {operation: 'NEW', justification: 'Preserve a source-backed finding.', externalBasis: 'Incident report', proposedKind: 'finding', proposedLabel: 'Regional concentration confirmed', proposedStatus: 'resolved'},
  ],
}

describe('approved investigation Delta policy', () => {
  it('coalesces target changes and increments State revision', () => {
    expect(planApprovedInvestigationDelta(state, approved)).toEqual({
      nextStateRevision: 2,
      elementPatches: [{id: 'condition-1', revision: 'rev-1', details: 'Concentrates in affected regions.', status: 'resolved'}],
      newElements: [{kind: 'finding', label: 'Regional concentration confirmed', status: 'resolved', externalBasis: 'Incident report'}],
    })
  })

  it('rejects stale or non-approved Deltas before any adapter can write', () => {
    expect(() => planApprovedInvestigationDelta(state, {...approved, status: 'approved', baseRevision: 0})).toThrow('stale')
    expect(() => planApprovedInvestigationDelta(state, {...approved, status: 'proposed' as never})).toThrow('approved')
  })
})
