import {readFile, readdir} from 'node:fs/promises'
import {resolve, basename} from 'node:path'
import {benchmarkCases, benchmarkEvaluationNotes} from './sanity-context-benchmark-cases.mjs'
import {structuredAdditionalCases} from './sanity-context-benchmark-structured.mjs'

const directory=resolve(process.cwd(),'artifacts','sanity-context-benchmark')
const caseById=new Map([...benchmarkCases,...structuredAdditionalCases].map(testCase=>[testCase.id,testCase]))
const explicitPath=process.argv[2]?resolve(process.argv[2]):null
let currentPath='',printed=0,busy=false,lastStatus='',announcedArtifact=false

async function latestCheckpoint(){
  if(explicitPath)return explicitPath
  const names=(await readdir(directory)).filter(name=>/^v[34]-checkpoint-.*\.json$/.test(name)).sort()
  return names.length?resolve(directory,names.at(-1)):null
}

async function tick(){
  if(busy)return
  busy=true
  try{
    const path=await latestCheckpoint()
    if(!path)return
    if(path!==currentPath){currentPath=path;printed=0;lastStatus='';announcedArtifact=false;process.stdout.write(`\nWatching ${basename(path)}\n`)}
    const checkpoint=JSON.parse(await readFile(path,'utf8'))
    let results=checkpoint.results??[]
    if(checkpoint.status==='complete'&&checkpoint.output){
      const output=resolve(directory,basename(checkpoint.output))
      results=JSON.parse(await readFile(output,'utf8')).results??[]
    }
    for(const result of results.slice(printed)){
      const paths=result.toolCalls?.flatMap(call=>call.resolvedPaths??call.arguments?.paths??[])??[]
      process.stdout.write(`\n[${printed+1}/${checkpoint.total??'?'}] ${result.arm} ${result.id} · ${result.score?.strictPass?'PASS':'FAIL'} · ${result.latencyMs} ms · ${result.promptTokens} prompt tokens\n`)
      process.stdout.write(`QUESTION: ${result.prompt}\n`)
      process.stdout.write(`READ: ${paths.length?paths.join(', '):result.selectedSources?.join(', ')||'(none)'}\n`)
      process.stdout.write(`ANSWER:\n${result.answer}\n`)
      const testCase=caseById.get(result.id)
      if(result.score?.kind==='structured-v4'){
        const score=result.score
        process.stdout.write(`RATIONALE: decision ${score.decisionPass?'PASS':'FAIL'} (${score.decision??'missing'} vs ${score.correctDecision??'unknown'}); facts ${score.factsPass?'PASS':'FAIL'}; evidence ${score.evidencePass?'PASS':'FAIL'}; JSON ${score.formatPass?'PASS':'FAIL'}; explanation present ${score.explanationPass?'yes':'no'}.\n`)
        for(const [name,fact] of Object.entries(score.factResults??{}))if(!fact.pass)process.stdout.write(`WRONG FACT: ${name} = ${JSON.stringify(fact.actual)}; expected ${JSON.stringify(fact.expected)}\n`)
        process.stdout.write('CAUTION: structured score does not verify that prose and citations support each other.\n')
      }else if(testCase&&result.score){
        const hits=result.score.conceptHits?.filter(Boolean).length??0
        const minimum=Math.ceil(testCase.concepts.length*0.8)
        const missing=testCase.concepts.flatMap((alternatives,index)=>result.score.conceptHits?.[index]?[]:[`#${index+1}: ${alternatives.join(' / ')}`])
        process.stdout.write(`RATIONALE: ${result.score.strictPass?'PASS':'FAIL'} lexical; ${hits}/${testCase.concepts.length} groups found (minimum ${minimum})${result.score.unsafe?'; Delta safety pattern triggered':''}.\n`)
        if(missing.length)process.stdout.write(`MISSING: ${missing.join('; ')}\n`)
        const notes=benchmarkEvaluationNotes[result.id]
        if(notes)process.stdout.write(`REFERENCE: ${notes.expected}\nCHECK SOURCES: ${notes.sources.join(', ')}\n`)
        process.stdout.write('CAUTION: lexical score does not verify factual truth or citation support.\n')
      }
      if(result.error)process.stdout.write(`ERROR: ${result.error}\n`)
      printed++
    }
    if(checkpoint.status!==lastStatus){lastStatus=checkpoint.status;process.stdout.write(`\nStatus: ${checkpoint.status}; ${checkpoint.completed??results.length}/${checkpoint.total??'?'} completed\n`)}
    if(checkpoint.status==='complete'&&!announcedArtifact){
      process.stdout.write(`Artifact: ${checkpoint.output}\nWatching for the next run...\n`)
      announcedArtifact=true
    }
  }catch(error){
    // The runner writes checkpoints in place; a concurrent read may see a partial JSON file.
    if(!(error instanceof SyntaxError))process.stderr.write(`Watcher: ${error instanceof Error?error.message:String(error)}\n`)
  }finally{busy=false}
}

await tick()
setInterval(tick,1000)
