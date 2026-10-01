import {createHash} from 'node:crypto'

const EVIDENCE_ID = /^evidenceSource\.[a-f0-9]{64}$/
const SHA256 = /^[a-f0-9]{64}$/

function requiredText(value, name, maxLength = 2_000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new TypeError(`${name} must be a non-empty string of at most ${maxLength} characters.`)
  }
  return value
}

function groqLiteral(value) {
  // JSON strings and arrays are also GROQ literals. Never interpolate raw user text.
  return JSON.stringify(value)
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function evidenceDocumentId({workspaceId, scopeId, sourceId}) {
  for (const [name, value] of Object.entries({workspaceId, scopeId, sourceId})) requiredText(value, name)
  return `evidenceSource.${sha256(JSON.stringify([workspaceId, scopeId, sourceId]))}`
}

/** Preserve the source text; metadata is not mixed into body or its hash. */
export function makeEvidenceDocument(input, ingestedAt = new Date().toISOString()) {
  const workspaceId = requiredText(input.workspaceId, 'workspaceId')
  const scopeId = requiredText(input.scopeId, 'scopeId')
  const sourceId = requiredText(input.sourceId, 'sourceId')
  const title = requiredText(input.title, 'title')
  const body = requiredText(input.body, 'body', 1_000_000)
  const contentHash = sha256(Buffer.from(body, 'utf8'))
  if (input.contentHash && input.contentHash !== contentHash) throw new Error(`Source ${sourceId} does not match its declared SHA-256.`)
  if (!Number.isFinite(Date.parse(ingestedAt))) throw new TypeError('ingestedAt must be an ISO timestamp.')
  const document = {
    _id: evidenceDocumentId({workspaceId, scopeId, sourceId}),
    _type: 'evidenceSource',
    workspaceId,
    scopeId,
    sourceId,
    title,
    body,
    mimeType: input.mimeType ?? 'text/markdown',
    contentHash,
    ingestedAt,
  }
  for (const field of ['sourceRevision', 'sourceLocator', 'sourceTimestamp']) {
    if (input[field] !== undefined) document[field] = requiredText(input[field], field)
  }
  return document
}

/** The projected title carries an exact document ID for the KB source-fidelity probe. */
export function knowledgeBaseDatasetQuery({workspaceId, scopeId}) {
  requiredText(workspaceId, 'workspaceId')
  requiredText(scopeId, 'scopeId')
  return `*[_type == "evidenceSource" && workspaceId == ${groqLiteral(workspaceId)} && scopeId == ${groqLiteral(scopeId)}]{_id,sourceId,"title":_id + " | " + title,body,contentHash,sourceRevision}`
}

export function exactEvidenceQuery({workspaceId, scopeId, ids}) {
  requiredText(workspaceId, 'workspaceId')
  requiredText(scopeId, 'scopeId')
  if (!Array.isArray(ids) || !ids.length || ids.length > 10 || ids.some(id => !EVIDENCE_ID.test(id))) {
    throw new TypeError('ids must contain one to ten stable evidence document IDs.')
  }
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate evidence IDs are not allowed.')
  return `*[_type == "evidenceSource" && workspaceId == ${groqLiteral(workspaceId)} && scopeId == ${groqLiteral(scopeId)} && _id in ${groqLiteral(ids)}]{_id,_rev,_updatedAt,workspaceId,scopeId,sourceId,title,body,mimeType,contentHash,sourceRevision,sourceLocator,sourceTimestamp}`
}

/** Candidate ranking is scoped first. A second exact query must fetch the originals. */
export function semanticCandidatesQuery({workspaceId, scopeId, question, limit = 5}) {
  requiredText(workspaceId, 'workspaceId')
  requiredText(scopeId, 'scopeId')
  requiredText(question, 'question', 8_000)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw new RangeError('limit must be between 1 and 10.')
  return `*[_type == "evidenceSource" && workspaceId == ${groqLiteral(workspaceId)} && scopeId == ${groqLiteral(scopeId)}] | score(text::semanticSimilarity(${groqLiteral(question)}))[0...${limit}]{_id,_score,_embeddings,sourceId,title,contentHash}`
}

/** Same scope and source fields as semantic search, but BM25 keyword ranking. */
export function keywordCandidatesQuery({workspaceId, scopeId, question, limit = 5}) {
  requiredText(workspaceId, 'workspaceId')
  requiredText(scopeId, 'scopeId')
  requiredText(question, 'question', 8_000)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10) throw new RangeError('limit must be between 1 and 10.')
  return `*[_type == "evidenceSource" && workspaceId == ${groqLiteral(workspaceId)} && scopeId == ${groqLiteral(scopeId)}] | score([title,body] match text::query(${groqLiteral(question)}))[_score > 0] | order(_score desc)[0...${limit}]{_id,_score,sourceId,title,contentHash}`
}

/** A generated citation is only a candidate; never resolve filenames or citation numbers. */
export function sourceIdsFromKnowledgeBaseEntry(entryText, allowedIds) {
  if (!(allowedIds instanceof Set) || [...allowedIds].some(id => !EVIDENCE_ID.test(id))) {
    throw new TypeError('allowedIds must be a Set of stable evidence document IDs.')
  }
  const lines = String(entryText).split(/\r?\n/)
  let inSources = false
  const ids = new Set()
  const unknownIds = new Set()
  for (const line of lines) {
    if (/^#{1,6}\s+Sources\s*$/i.test(line)) { inSources = true; continue }
    if (inSources && /^#{1,6}\s+/.test(line)) { inSources = false; continue }
    if (!inSources) continue
    for (const match of line.matchAll(/\bevidenceSource\.[a-f0-9]{64}\b/g)) {
      if (allowedIds.has(match[0])) ids.add(match[0])
      else unknownIds.add(match[0])
    }
  }
  return {ids: [...ids], unknownIds: [...unknownIds], identityAvailable: ids.size > 0}
}

/** Fail closed if a remote document differs from the scoped import registry. */
export function verifyExactEvidenceDocuments({requestedIds, documents, registry, workspaceId, scopeId}) {
  if (!Array.isArray(requestedIds) || !(registry instanceof Map) || !Array.isArray(documents)) {
    throw new TypeError('Expected requestedIds, a registry Map, and remote documents.')
  }
  const requested = new Set(requestedIds)
  if (requested.size !== requestedIds.length || requestedIds.some(id => !EVIDENCE_ID.test(id))) throw new Error('Invalid or duplicate requested IDs.')
  const found = new Map()
  for (const document of documents) {
    if (!document || !requested.has(document._id) || found.has(document._id)) throw new Error('GROQ returned an unexpected or duplicate document.')
    const original = registry.get(document._id)
    if (!original || document.workspaceId !== workspaceId || document.scopeId !== scopeId || document.sourceId !== original.sourceId) {
      throw new Error(`Scope or registry mismatch for ${document._id}.`)
    }
    if (typeof document.body !== 'string' || !SHA256.test(document.contentHash) || sha256(Buffer.from(document.body, 'utf8')) !== document.contentHash || original.contentHash !== document.contentHash) {
      throw new Error(`Content hash mismatch for ${document._id}.`)
    }
    if (typeof document._rev !== 'string' || !document._rev) throw new Error(`Missing source revision for ${document._id}.`)
    found.set(document._id, document)
  }
  return {documents: requestedIds.flatMap(id => found.has(id) ? [found.get(id)] : []), missingIds: requestedIds.filter(id => !found.has(id))}
}

export function originalEvidencePack(documents, {maxChars = 12_000, maxSources = 5} = {}) {
  if (!Number.isSafeInteger(maxChars) || maxChars < 256 || !Number.isSafeInteger(maxSources) || maxSources < 1) throw new RangeError('Invalid original evidence budget.')
  const selected = []
  const omittedIds = []
  let content = 'ORIGINAL CONTENT LAKE EVIDENCE (KB prose is only a locator):\n'
  for (const document of documents) {
    const part = `\nSOURCE ID: ${document._id}\nSOURCE NAME: ${document.sourceId}\nSOURCE REVISION: ${document._rev}\nSHA-256: ${document.contentHash}\n${document.body}\n`
    if (selected.length >= maxSources || content.length + part.length + 120 > maxChars) { omittedIds.push(document._id); continue }
    content += part
    selected.push(document._id)
  }
  if (!selected.length) content += 'No verified original source text is available.\n'
  if (omittedIds.length) content += `Evidence gap: ${omittedIds.length} original sources omitted by budget.\n`
  return {content, selectedIds: selected, omittedIds}
}

/** Rank only the originals named by selected KB entries; never search outside that set. */
export function rankCandidateOriginals(documents, question) {
  requiredText(question, 'question', 8_000)
  if (!Array.isArray(documents)) throw new TypeError('documents must be an array.')
  const normalize = value => String(value).normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-US')
  const words = value => new Set(normalize(value).match(/[\p{L}\p{N}]+/gu) ?? [])
  const stop = new Set('a an and are as at be by can did do does for from how in is it of on or should the this to was were what when where which who why with would you your de da das do dos e em na nas no nos o os um uma para por que qual quais como quando onde porque isso esta este esse essa ser foi pode deve sobre entre com sem'.split(' '))
  const query = [...words(question)].filter(word => (word.length > 1 || /[bcdefghijklmnopqrstuvwxyz]/.test(word)) && !stop.has(word))
  const prepared = documents.map((document, index) => ({
    document, index,
    title: normalize(`${document.title ?? ''} ${document.sourceId ?? ''}`),
    body: normalize(document.body ?? ''),
    titleWords: words(`${document.title ?? ''} ${document.sourceId ?? ''}`),
    bodyWords: words(document.body ?? ''),
  }))
  const frequency = new Map(query.map(word => [word, prepared.filter(item => item.titleWords.has(word) || item.bodyWords.has(word)).length]))
  const dateTokens = [...new Set(question.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [])]
  const queryPairs = query.slice(0, -1).map((word, index) => `${word} ${query[index + 1]}`)
  const scored = prepared.map(item => {
    let score = 0
    for (const word of query) {
      const idf = Math.log(1 + (prepared.length + 1) / (1 + (frequency.get(word) ?? 0)))
      if (item.titleWords.has(word)) score += 4 * idf
      else if (item.bodyWords.has(word)) score += idf
    }
    for (const pair of queryPairs) if (item.title.includes(pair)) score += 2
    for (const date of dateTokens) if (item.title.includes(date)) score += 6; else if (item.body.includes(date)) score += 3
    return {...item, score}
  })
  return scored.sort((left, right) => right.score - left.score || left.index - right.index).map(item => item.document)
}
