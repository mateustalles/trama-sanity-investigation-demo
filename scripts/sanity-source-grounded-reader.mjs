import {
  originalEvidencePack,
  rankCandidateOriginals,
  sourceIdsFromKnowledgeBaseEntry,
  verifyExactEvidenceDocuments,
} from './sanity-content-lake-evidence.mjs'

/**
 * Experimental, subject-agnostic KB locator → exact original reader.
 * The caller owns authentication, KB-to-scope authorization, and the choice of
 * entry keys. Generated KB prose is never included in the returned evidence.
 */
export async function readSourceGroundedEvidence({
  workspaceId,
  scopeId,
  question,
  entries,
  selectedEntryKeys,
  registry,
  readKnowledgeBase,
  readOriginals,
  maxEntries = 5,
  maxCandidates = 40,
  maxSources = 10,
  maxChars = 12_000,
}) {
  if (!workspaceId || !scopeId || typeof question !== 'string' || !question.trim()) throw new TypeError('A scoped question is required.')
  if (!Array.isArray(entries) || !Array.isArray(selectedEntryKeys) || !(registry instanceof Map)) throw new TypeError('Entries, selected keys, and a scoped registry are required.')
  if (typeof readKnowledgeBase !== 'function' || typeof readOriginals !== 'function') throw new TypeError('Read-only KB and original adapters are required.')
  if (![maxEntries,maxCandidates,maxSources,maxChars].every(Number.isSafeInteger) || maxEntries < 1 || maxEntries > 20 || maxCandidates < 1 || maxSources < 1 || maxChars < 256) throw new RangeError('Invalid evidence limits.')

  const available = new Map()
  for (const entry of entries) {
    if (!entry || typeof entry.knowledgeBase !== 'string' || typeof entry.path !== 'string') throw new TypeError('Invalid KB entry.')
    const key = `${entry.knowledgeBase}:${entry.path}`
    if (available.has(key)) throw new Error(`Duplicate KB entry key: ${key}`)
    available.set(key, entry)
  }
  const keys = [...new Set(selectedEntryKeys)]
  if (keys.length > maxEntries || keys.some(key => typeof key !== 'string' || !available.has(key))) throw new Error('Selected KB entries are not in the authorized outline or exceed the read limit.')

  const groups = new Map()
  for (const key of keys) {
    const entry = available.get(key)
    groups.set(entry.knowledgeBase,[...(groups.get(entry.knowledgeBase) ?? []),entry.path])
  }
  const allowlistedIds = new Set(registry.keys())
  const candidateIds = [], unknownIds = new Set(), knowledgeBaseResponses = []
  for (const [knowledgeBase,paths] of groups) {
    const response = await readKnowledgeBase({knowledgeBase,paths})
    if (typeof response !== 'string') throw new TypeError('Knowledge Base read must return text.')
    knowledgeBaseResponses.push({knowledgeBase,paths,text:response})
    const references = sourceIdsFromKnowledgeBaseEntry(response,allowlistedIds)
    for (const id of references.ids) if (!candidateIds.includes(id)) candidateIds.push(id)
    for (const id of references.unknownIds) unknownIds.add(id)
  }

  const requestedIds = candidateIds.slice(0,maxCandidates)
  const overLimitIds = candidateIds.slice(maxCandidates)
  const verified = [], missingIds = []
  for (let index = 0; index < requestedIds.length; index += 10) {
    const batch = requestedIds.slice(index,index + 10)
    const documents = await readOriginals({workspaceId,scopeId,ids:batch})
    const result = verifyExactEvidenceDocuments({requestedIds:batch,documents,registry,workspaceId,scopeId})
    verified.push(...result.documents)
    missingIds.push(...result.missingIds)
  }
  const ranked = rankCandidateOriginals(verified,question)
  const pack = originalEvidencePack(ranked,{maxChars,maxSources})
  const gaps = [
    !keys.length ? 'No KB entry was selected.' : null,
    !candidateIds.length ? 'Selected KB entries exposed no allowlisted original IDs.' : null,
    unknownIds.size ? `${unknownIds.size} unregistered source ID(s) excluded.` : null,
    overLimitIds.length ? `${overLimitIds.length} source ID(s) exceeded the candidate limit.` : null,
    missingIds.length ? `${missingIds.length} original source(s) missing.` : null,
  ].filter(Boolean)
  return {
    content: `${pack.content}${gaps.length ? `\nEvidence gap: ${gaps.join(' ')}` : ''}`,
    knowledgeBaseResponses,
    selectedEntryKeys: keys,
    candidateIds,
    rankedIds: ranked.map(document => document._id),
    selectedIds: pack.selectedIds,
    omittedIds: pack.omittedIds,
    unknownIds: [...unknownIds],
    overLimitIds,
    missingIds,
    revisions: verified.map(document => ({_id:document._id,_rev:document._rev,contentHash:document.contentHash})),
  }
}
