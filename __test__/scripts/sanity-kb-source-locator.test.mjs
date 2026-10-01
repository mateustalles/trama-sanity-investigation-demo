import {strict as assert} from "node:assert"
import {test} from "node:test"
import {parseKnowledgeBaseSourceHints, parseKnowledgeBaseSourceReferences, resolveOriginalSourcePack} from "../../scripts/sanity-kb-source-locator.mjs"

const original = (file, body) => ({file, text: `SOURCE: ${file}\n${body}`})

test("parses file names from Sources sections, not generated claims or citation numbers", () => {
  const entry = `A generated claim cites [4] and mentions invented.md.
## Sources
1. 09-fraud-tuning-proposal.md — File
4. 13-fraud-quarterly-report.md — File

---
## Another entry
It cites [1] without providing a source.
## Sources
1. 09-fraud-tuning-proposal.md — File`
  assert.deepEqual(parseKnowledgeBaseSourceHints(entry), ["09-fraud-tuning-proposal.md", "13-fraud-quarterly-report.md"])
})

test("reports unsupported source types and malformed Sources rows separately", () => {
  const entry = `## Sources
1. car-repair.pdf — File
2. https://example.test/article — Website
3. bad-format-record
4. legal memo.txt — File`
  assert.deepEqual(parseKnowledgeBaseSourceReferences(entry), {
    fileNames: ["car-repair.pdf", "legal memo.txt"],
    unsupportedReferences: [
      {reference: "https://example.test/article", type: "Website"},
      {reference: "bad-format-record", type: "malformed"},
    ],
  })
})

test("returns only exact allowlisted originals, never the KB-generated interpretation", () => {
  const originals = new Map([
    ["battery.txt", original("battery.txt", "Battery test showed 12.4 V.")],
    ["starter.txt", original("starter.txt", "Starter current remained high.")],
  ])
  const pack = resolveOriginalSourcePack(["battery.txt", "starter.txt"], originals, {maxChars: 1_000, maxSources: 2})
  assert.deepEqual(pack.selectedSources, ["battery.txt", "starter.txt"])
  assert.deepEqual(pack.missingSources, [])
  assert.match(pack.content, /Battery test showed 12\.4 V/)
  assert.match(pack.content, /Starter current remained high/)
  assert.doesNotMatch(pack.content, /generated claim/i)
  assert.ok(pack.content.length <= 1_000)
})

test("rejects path-like hints and records unknown names as missing without reading them", () => {
  const originals = new Map([["known.md", original("known.md", "Verified record.")]])
  const pack = resolveOriginalSourcePack([
    "../secret.md", "subdir/known.md", "C:\\secret.md", "known.md", "README.md", "known.md"
  ], originals, {maxChars: 1_000, maxSources: 5})
  assert.deepEqual(pack.selectedSources, ["known.md"])
  assert.deepEqual(pack.missingSources, ["README.md"])
  assert.deepEqual(pack.unsupportedSources, ["../secret.md", "subdir/known.md", "C:\\secret.md"])
  assert.match(pack.content, /Evidence gap: 1 missing, 3 unsupported/)
})

test("fails closed on ambiguous or mismatched source records", () => {
  const originals = new Map([
    ["duplicate.md", [original("duplicate.md", "Case A"), original("duplicate.md", "Case B")]],
    ["wrong.md", original("other.md", "Wrong record")],
  ])
  const pack = resolveOriginalSourcePack(["duplicate.md", "wrong.md"], originals)
  assert.deepEqual(pack.selectedSources, [])
  assert.deepEqual(pack.unsupportedSources, ["duplicate.md", "wrong.md"])
  assert.match(pack.content, /No verified original source text is available/)
})

test("omits whole originals when the source-count or character budget is exhausted", () => {
  const originals = new Map([
    ["large.md", original("large.md", "x".repeat(500))],
    ["short.md", original("short.md", "Concise verified fact.")],
    ["extra.md", original("extra.md", "Another verified fact.")],
  ])
  const pack = resolveOriginalSourcePack(["large.md", "short.md", "extra.md"], originals, {maxChars: 300, maxSources: 1})
  assert.deepEqual(pack.selectedSources, ["short.md"])
  assert.deepEqual(pack.truncatedSources, ["large.md", "extra.md"])
  assert.match(pack.content, /Concise verified fact/)
  assert.doesNotMatch(pack.content, /Another verified fact/)
  assert.match(pack.content, /Evidence gap: 2 omitted by budget/)
  assert.ok(pack.content.length <= 300)
})

test("an entry with no file sources produces an explicit evidence gap", () => {
  const pack = resolveOriginalSourcePack(parseKnowledgeBaseSourceHints("## Sources\n1. https://example.test — Website"), new Map())
  assert.deepEqual(pack.selectedSources, [])
  assert.match(pack.content, /Evidence gap: no original file was listed/)
  assert.throws(() => resolveOriginalSourcePack([], new Map(), {maxChars: 80}), RangeError)
})
