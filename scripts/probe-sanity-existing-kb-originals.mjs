/** Read-only smoke of the existing pilot KB → exact GROQ originals. Prints metadata only. */
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {exactEvidenceQuery,makeEvidenceDocument} from './sanity-content-lake-evidence.mjs'
import {readSourceGroundedEvidence} from './sanity-source-grounded-reader.mjs'
import {knowledgeBaseEntryKey,parseKnowledgeBaseOutline,selectKnowledgeBaseEntries} from '../apps/web/lib/sanity/context-mcp-policy.ts'

const userProfile = process.env.USERPROFILE ?? ''
const envPath = process.env.TRAMA_BENCHMARK_ENV_FILE ?? resolve(userProfile,'Documents','trama','.env.local')
const localEnv = await readFile(envPath,'utf8')
const fileEnv = Object.fromEntries(localEnv.split(/\r?\n/).flatMap(line => {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  return match ? [[match[1],match[2].trim().replace(/^(['"])(.*)\1$/,'$2')]] : []
}))
const env = {...fileEnv,...process.env}
const token = env.SANITY_ORGANIZATION_TOKEN
const knowledgeBaseId = env.TRAMA_BENCHMARK_PILOT_KB_ID ?? 'kbhltiJDzx0j'
const kbBase = env.TRAMA_BENCHMARK_PILOT_KB_MCP_URL ?? env.SANITY_CONTEXT_EVIDENCE_MCP_URL
const groqUrl = env.TRAMA_BENCHMARK_PILOT_GROQ_MCP_URL ?? 'https://api.sanity.io/v1/context/organizations/o6xohyg5w/mcp/trama-evidence-pilot-groq'
if (!token || !kbBase) throw new Error('Existing pilot KB endpoint and organization token are required.')
const kbUrl = new URL(kbBase)
kbUrl.searchParams.set('mode','knowledge_base')
kbUrl.searchParams.set('knowledgeBases',knowledgeBaseId)
const scope = {workspaceId:'synthetic-benchmark',scopeId:'payment-incident-2026-09-18'}
const sourceDir = env.TRAMA_BENCHMARK_CORPUS_DIR ?? resolve(userProfile,'Documents','studio-trama','knowledge-base','payment-incident')
const files = (await readdir(sourceDir)).filter(file => file.endsWith('.md') && file !== 'README.md').sort()
if (files.length !== 24) throw new Error(`Expected the existing 24-file pilot registry; found ${files.length}.`)
const registry = new Map(await Promise.all(files.map(async sourceId => {
  const body = await readFile(resolve(sourceDir,sourceId),'utf8')
  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? sourceId
  const source = makeEvidenceDocument({...scope,sourceId,title,body,sourceLocator:`knowledge-base/payment-incident/${sourceId}`})
  return [source._id,source]
})))

async function mcp(url,method,params = {}) {
  const response = await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/json, text/event-stream','Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method,params}),signal:AbortSignal.timeout(30_000)})
  const payload = await response.json()
  if (!response.ok || payload.error) throw new Error(payload.error?.message ?? `Sanity Context HTTP ${response.status}`)
  return payload.result
}
async function tool(url,name,arguments_ = {}) {
  const result = await mcp(url,'tools/call',{name,arguments:arguments_})
  const content = result.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') ?? ''
  if (result.isError) throw new Error(`${name} returned an error: ${content.slice(0,200)}`)
  return content
}
const kbTools = (await mcp(kbUrl,'tools/list')).tools ?? []
const groqTools = (await mcp(groqUrl,'tools/list')).tools ?? []
if (!kbTools.some(item => item.name === 'knowledge_base_read') || !groqTools.some(item => item.name === 'groq_query')) throw new Error('Existing KB/GROQ endpoints do not expose the expected read-only tools.')
const outline = parseKnowledgeBaseOutline(await tool(kbUrl,'initial_context'))
if (!outline.length || outline.some(entry => entry.knowledgeBase !== knowledgeBaseId)) throw new Error('Existing KB outline did not match the selected pilot KB.')
const question = env.TRAMA_SOURCE_GROUNDED_QUESTION ?? 'What changed in the checkout payment-provider timeout?'
const selected = selectKnowledgeBaseEntries(outline,question,['examine_explanations'],new Set(),5)
if (!selected.length) throw new Error('No matching KB entries were selected; provide a more specific question.')
const read = await readSourceGroundedEvidence({
  ...scope,question,entries:outline,selectedEntryKeys:selected.map(knowledgeBaseEntryKey),registry,
  readKnowledgeBase:async ({knowledgeBase,paths}) => tool(kbUrl,'knowledge_base_read',{knowledgeBase,paths}),
  readOriginals:async ({ids}) => {
    const content = await tool(groqUrl,'groq_query',{query:exactEvidenceQuery({...scope,ids})})
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed.result)) throw new Error('Exact GROQ read did not return a result array.')
    return parsed.result
  },
})
const report = {knowledgeBaseId,scope,outlineEntries:outline.length,selectedEntryKeys:read.selectedEntryKeys,knowledgeBaseResponses:read.knowledgeBaseResponses,candidateCount:read.candidateIds.length,verifiedOriginals:read.selectedIds.map(id => ({id,sourceId:registry.get(id)?.sourceId,revision:read.revisions.find(item => item._id === id)?._rev})),omittedOriginals:read.omittedIds.map(id => ({id,sourceId:registry.get(id)?.sourceId})),unknownCount:read.unknownIds.length,missingCount:read.missingIds.length,overLimitCount:read.overLimitIds.length}
const outputDir = resolve(process.cwd(),'artifacts','sanity-context-benchmark')
await mkdir(outputDir,{recursive:true})
const outputPath = resolve(outputDir,`existing-kb-originals-probe-${new Date().toISOString().replace(/[:.]/g,'-')}.json`)
await writeFile(outputPath,JSON.stringify(report,null,2))
console.log(JSON.stringify({...report,reportPath:outputPath},null,2))
if (!read.selectedIds.length || read.unknownIds.length || read.missingIds.length) process.exitCode = 1
