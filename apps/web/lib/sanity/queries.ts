import {defineQuery} from 'next-sanity'

/**
 * Authoritative structured read for one investigation turn. The returned `_rev`
 * is carried into Trama's reviewed Delta so a future write adapter can use
 * Sanity optimistic locking instead of overwriting newer state.
 */
export const INVESTIGATION_CASE_QUERY = defineQuery(`
  *[_type == "investigationCase" && _id == $caseId][0]{
    _id,
    _rev,
    title,
    problem,
    centralQuestion,
    status,
    "elements": *[_type == "investigationElement" && case._ref == ^._id] | order(_createdAt asc){
      _id,
      _type,
      kind,
      label,
      details,
      status,
      externalBasis
    },
    "relations": *[_type == "investigationRelation" && case._ref == ^._id] | order(_createdAt asc){
      _id,
      role,
      "from": from->_id,
      "to": to->_id,
      externalBasis
    },
    "latestSession": *[_type == "investigationSession" && case._ref == ^._id] | order(startedAt desc)[0]{
      _id,
      stateRevision,
      startedAt,
      endedAt
    }
  }
`)
