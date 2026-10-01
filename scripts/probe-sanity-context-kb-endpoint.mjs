/** Read-only check that an MCP endpoint serves exactly the intended KB. */
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'

const expectedId=process.argv[2]
if(!/^kb[A-Za-z0-9]+$/.test(expectedId??''))throw Error('Pass one expected Knowledge Base ID.')
const envPath=process.env.TRAMA_BENCHMARK_ENV_FILE??resolve(process.env.USERPROFILE??'','Documents','trama','.env.local')
const fileEnv=Object.fromEntries((await readFile(envPath,'utf8')).split(/\r?\n/).flatMap(line=>{
 const match=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
 return match?[[match[1],match[2].trim().replace(/^(['"])(.*)\1$/,'$2')]]:[]
}))
const env={...fileEnv,...process.env}
if(!env.SANITY_ORGANIZATION_TOKEN||!env.SANITY_CONTEXT_EVIDENCE_MCP_URL)throw Error('Missing Sanity endpoint credentials in the benchmark environment.')
const url=new URL(env.SANITY_CONTEXT_EVIDENCE_MCP_URL)
async function request(method,params){
 const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${env.SANITY_ORGANIZATION_TOKEN}`,Accept:'application/json, text/event-stream','Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:crypto.randomUUID(),method,params}),signal:AbortSignal.timeout(30_000)})
 const body=await response.json()
 if(!response.ok||body.error)throw Error(body.error?.message??`Context HTTP ${response.status}`)
 return body.result
}
const tools=(await request('tools/list',{})).tools??[]
if(!tools.some(tool=>tool.name==='knowledge_base_read'))throw Error('Endpoint does not advertise knowledge_base_read.')
const initial=(await request('tools/call',{name:'initial_context',arguments:{}})).content?.map(item=>item.text??'').join('\n')??''
const ids=[...initial.matchAll(/Knowledge base id: `([^`]+)`/g)].map(match=>match[1])
if(ids.length!==1||ids[0]!==expectedId)throw Error(`Endpoint served ${ids.length} KB IDs, not only the requested ${expectedId}.`)
console.log(JSON.stringify({endpoint:`${url.origin}${url.pathname}`,knowledgeBaseId:expectedId,knowledgeBaseReadAvailable:true},null,2))
