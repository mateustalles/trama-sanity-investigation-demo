/** Fixed projection used by the model-facing State snapshot tool. */
export const investigationStateSnapshotQuery = '{"case": *[_type == "investigationCase"][0]{_id,title,stateRevision,status}, "deltas": *[_type == "investigationDelta"] | order(_createdAt desc)[0...5]{_id,status,baseRevision,summary,approvedAt,appliedAt}}'

export const investigationEvidenceRequests = [
  "establish_scope", "reconstruct_sequence", "examine_explanations",
  "seek_counterevidence", "separate_related_matters",
  "check_evidence_boundaries", "prepare_decision_brief"
] as const

export type InvestigationEvidenceRequest = typeof investigationEvidenceRequests[number]

export interface KnowledgeBaseEntry {
  knowledgeBase: string
  path: string
  description: string
  centrality: "core" | "peripheral" | "standard"
}

/** Stable model-facing key; the host resolves it only against this session's outline. */
export function knowledgeBaseEntryKey(entry: KnowledgeBaseEntry): string {
  return `${entry.knowledgeBase}:${entry.path}`
}

export function resolveKnowledgeBaseEntryKeys(entries: KnowledgeBaseEntry[], value: unknown, limit = 5): KnowledgeBaseEntry[] {
  if (!Array.isArray(value)) return []
  const byKey = new Map(entries.map((entry) => [knowledgeBaseEntryKey(entry), entry]))
  return [...new Set(value.filter((key): key is string => typeof key === "string"))]
    .slice(0, Math.max(1, Math.min(20, limit)))
    .flatMap((key) => { const entry = byKey.get(key); return entry ? [entry] : [] })
}

/** Context's initial_context is the source of truth for available entries. */
export function parseKnowledgeBaseOutline(text: string): KnowledgeBaseEntry[] {
  const entries: KnowledgeBaseEntry[] = []
  let knowledgeBase: string | null = null
  for (const line of text.split(/\r?\n/)) {
    const base = line.match(/^Knowledge base id: `([^`]+)`\s*$/)
    if (base) { knowledgeBase = base[1]!; continue }
    if (!knowledgeBase) continue
    const entry = line.match(/^([a-zA-Z0-9][a-zA-Z0-9_./-]*)(?: \[(core|peripheral)\])?\s*$/)
    if (entry) {
      entries.push({knowledgeBase, path: entry[1]!, description: "", centrality: (entry[2] as "core" | "peripheral" | undefined) ?? "standard"})
    } else if (/^\s{2,}\S/.test(line) && entries.at(-1)?.knowledgeBase === knowledgeBase) {
      entries[entries.length - 1]!.description += `${entries.at(-1)!.description ? " " : ""}${line.trim()}`
    }
  }
  return entries
}

const stopWords = new Set("a an and are as at be by can did do does for from how in is it of on or should the this to was were what when where which who why with would you your de da das do dos e em na nas no nos o os a as um uma para por que qual quais como quando onde porque isso esta este esse essa ser foi pode deve sobre entre com sem".split(" "))
const genericTaskWords = new Set("rank three candidate candidates explanation explanations strongest weakest justify ordering compare comparison evidence observations assess evaluate summarize summary explain question questions conclusion conclusions uncertainty source sources infer inference reason reasoning classify classification classifique explicacoes hipoteses forte fraca justificar ordem comparar evidencias avaliar resumir conclusao duvida".split(" "))
const roleTerms: Record<InvestigationEvidenceRequest, string[]> = {
  establish_scope: ["overview", "scope", "framing", "summary", "context", "escopo", "resumo"],
  reconstruct_sequence: ["timeline", "time", "date", "change", "history", "sequence", "cronologia", "mudanca"],
  examine_explanations: ["hypothesis", "explanation", "cause", "mechanism", "hipotese", "causa"],
  seek_counterevidence: ["against", "contradict", "weaken", "limit", "uncertainty", "contradiz", "enfraquece"],
  separate_related_matters: ["related", "other", "outside", "different", "unrelated", "separate", "outro", "fora"],
  check_evidence_boundaries: ["audit", "scope", "limit", "source", "uncertainty", "auditoria", "limite"],
  prepare_decision_brief: ["summary", "decision", "followup", "uncertainty", "resumo", "decisao"],
}

function terms(text: string): string[] {
  return (text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((term) => term.length > 2 && !stopWords.has(term))
    .map((term) => term.length > 5 && term.endsWith("ies") ? `${term.slice(0, -3)}y` : term.length > 4 && term.endsWith("s") && !term.endsWith("ss") ? term.slice(0, -1) : term)
}

/** Rank Context's actual outline; no subject names or paths live in Trama code. */
export function selectKnowledgeBaseEntries(entries: KnowledgeBaseEntry[], question: string, requests: InvestigationEvidenceRequest[], excludedPaths: ReadonlySet<string> = new Set(), limit = 5): KnowledgeBaseEntry[] {
  const query = [...new Set(terms(question))]
  if (!query.length) return []
  const documents = entries.filter((entry) => !excludedPaths.has(entry.path))
  const tokenSets = documents.map((entry) => new Set(terms(`${entry.path.replaceAll("/", " ")} ${entry.description}`)))
  const genericOnly = query.every((term) => genericTaskWords.has(term))
  const frequency = new Map<string, number>()
  for (const tokens of tokenSets) for (const token of tokens) frequency.set(token, (frequency.get(token) ?? 0) + 1)
  const ranked = documents.flatMap((entry, index) => {
    const tokens = tokenSets[index]!
    const pathTokens = new Set(terms(entry.path.replaceAll("/", " ")))
    let direct = 0
    for (const queryTerm of query) {
      const matched = tokens.has(queryTerm) ? queryTerm : [...tokens].find((token) => queryTerm.length >= 5 && token.length >= 5 && token.slice(0, 5) === queryTerm.slice(0, 5))
      if (!matched) continue
      const rarity = Math.log(1 + documents.length / (1 + (frequency.get(matched) ?? 0)))
      direct += rarity * (pathTokens.has(matched) ? 2.5 : 1)
    }
    const role = requests.flatMap((request) => roleTerms[request]).reduce((score, term) => score + ([...tokens].some((token) => token === term || token.length >= 5 && term.length >= 5 && token.slice(0, 5) === term.slice(0, 5)) ? 0.25 : 0), 0)
    if (direct === 0 && !(genericOnly && role > 0)) return []
    return [{entry, score: direct + role + (entry.centrality === "core" ? 0.1 : 0)}]
  })
  ranked.sort((left, right) => right.score - left.score || left.entry.knowledgeBase.localeCompare(right.entry.knowledgeBase) || left.entry.path.localeCompare(right.entry.path))
  return ranked.slice(0, Math.max(1, Math.min(20, limit))).map((item) => item.entry)
}

export function asksForAuthoritativeState(message: string): boolean {
  return /\b(state|revision|revis[aã]o|applied|aplicad[oa]|approved|aprovad[oa]|delta|snapshot|estado atual|situa[cç][aã]o atual)\b/i.test(message)
    || /\b(current|present|atual|case|caso|investigation|investiga[cç][aã]o)\b.{0,60}\bstatus\b|\bstatus\b.{0,60}\b(current|present|atual|case|caso|investigation|investiga[cç][aã]o)\b/i.test(message)
}

export function asksToSeparateRelatedMatters(message: string): boolean {
  return /\b(other|another|different|unrelated|outside|previous|old|similar|same|separate|exclude|overlap|belong|out.of.scope|out.of.window|outr[oa]|diferente|anterior|fora|semelhante|mesm[oa]|separar|excluir|relacionad[oa]|pertence|sobreposi[cç][aã]o)\b/i.test(message)
    || /\b(earlier|later|before|after|posterior|antes|depois)\b.{0,100}\b(explain|influence|account|cause|belong|explicar|influenciar|causar|pertencer)\b|\b(explain|influence|account|cause|belong|explicar|influenciar|causar|pertencer)\b.{0,100}\b(earlier|later|before|after|posterior|antes|depois)\b/i.test(message)
}

export function guidedRequests(value: unknown, question: string): InvestigationEvidenceRequest[] {
  const allowed = new Set<string>(investigationEvidenceRequests)
  const requests = Array.isArray(value) ? [...new Set(value.filter((request): request is InvestigationEvidenceRequest => typeof request === "string" && allowed.has(request)))].slice(0, 2) : []
  if (!asksToSeparateRelatedMatters(question)) return requests
  return [...new Set(["separate_related_matters" as const, ...requests])].slice(0, 2)
}

export function knowledgeBaseIdFromInitialContext(value: string): string | null {
  return value.match(/Knowledge base id: `([^`]+)`/)?.[1] ?? null
}

/** Context outlines decorate core paths for humans; the MCP expects bare paths. */
export function normalizeEvidencePaths(value: unknown): unknown {
  return Array.isArray(value)
    ? value.flatMap((path) => typeof path === "string" ? [path.replace(/\s+\[core\]$/i, "")] : [])
    : value
}
