/**
 * Treat a Knowledge Base entry's Sources list as untrusted locator hints.
 * Citation numbers and generated claims are deliberately ignored.
 */
export function parseKnowledgeBaseSourceReferences(text) {
  const fileNames = []
  const unsupportedReferences = []
  const seen = new Set()
  let inSources = false

  for (const line of String(text).split(/\r?\n/)) {
    if (/^## Sources\s*$/i.test(line)) {
      inSources = true
      continue
    }
    if (/^#{1,6}\s|^\s*---\s*$/.test(line)) {
      inSources = false
      continue
    }
    if (!inSources) continue

    const numbered = line.match(/^\s*\d+\.\s+(.+?)\s*$/)
    if (!numbered) continue
    const source = numbered[1].match(/^(.+?)\s+[—–-]\s+(.+)$/)
    if (!source) {
      unsupportedReferences.push({reference: numbered[1], type: "malformed"})
      continue
    }
    const reference = source[1].trim()
    const type = source[2].trim()
    if (type.toLocaleLowerCase("en-US") !== "file") {
      unsupportedReferences.push({reference, type})
    } else if (!seen.has(reference)) {
      seen.add(reference)
      fileNames.push(reference)
    }
  }

  return {fileNames, unsupportedReferences}
}

/** Return only file names; callers needing non-File diagnostics can use the fuller parser above. */
export function parseKnowledgeBaseSourceHints(text) {
  return parseKnowledgeBaseSourceReferences(text).fileNames
}

function isSafeName(name) {
  return typeof name === "string"
    && name.length > 0
    && name === name.trim()
    && name !== "."
    && name !== ".."
    && !name.includes("..")
    && !/[\\/:\x00-\x1f\x7f]/.test(name)
}

/**
 * Resolve only against originals already loaded for this benchmark scope.
 * This function never constructs a filesystem path and never treats a KB
 * citation number, source title, or generated statement as evidence.
 */
export function resolveOriginalSourcePack(hints, originalsByName, {maxChars = 4_000, maxSources = 5} = {}) {
  if (!Array.isArray(hints) || !(originalsByName instanceof Map)) {
    throw new TypeError("Source hints must be an array and originalsByName must be a scoped Map.")
  }
  if (!Number.isSafeInteger(maxChars) || maxChars < 256 || !Number.isSafeInteger(maxSources) || maxSources < 1) {
    throw new RangeError("maxChars must be at least 256 and maxSources must be positive integers.")
  }

  const selectedSources = []
  const missingSources = []
  const truncatedSources = []
  const unsupportedSources = []
  const originals = []
  const seen = new Set()
  // Keep space for an explicit gap summary even when a source nearly fills the budget.
  const sourceBudget = Math.max(0, maxChars - 128)
  let used = 0

  for (const hint of hints) {
    if (seen.has(hint)) continue
    seen.add(hint)
    if (!isSafeName(hint)) {
      unsupportedSources.push(typeof hint === "string" ? hint : "<non-string source hint>")
      continue
    }
    if (!originalsByName.has(hint)) {
      missingSources.push(hint)
      continue
    }
    const original = originalsByName.get(hint)
    if (!original || Array.isArray(original) || original.file !== hint || typeof original.text !== "string") {
      unsupportedSources.push(hint)
      continue
    }
    const separator = originals.length ? "\n\n" : ""
    if (selectedSources.length >= maxSources || used + separator.length + original.text.length > sourceBudget) {
      truncatedSources.push(hint)
      continue
    }
    originals.push(`${separator}${original.text}`)
    selectedSources.push(hint)
    used += separator.length + original.text.length
  }

  const gaps = [
    missingSources.length ? `${missingSources.length} missing` : null,
    unsupportedSources.length ? `${unsupportedSources.length} unsupported` : null,
    truncatedSources.length ? `${truncatedSources.length} omitted by budget` : null,
  ].filter(Boolean).join(", ")
  const summary = gaps
    ? `Evidence gap: ${gaps}. See structured source lists.`
    : hints.length ? "All listed original sources were resolved." : "Evidence gap: no original file was listed by the KB entry."
  const header = "ORIGINAL SOURCES (KB prose is not evidence):\n"
  const noSources = "No verified original source text is available.\n"
  const content = `${header}${originals.length ? originals.join("") : noSources}\n${summary}`
  // Source budget reserves more than the maximum header and summary length.
  if (content.length > maxChars) throw new Error("Original source pack exceeded its character budget.")
  return {content, selectedSources, missingSources, truncatedSources, unsupportedSources}
}
