import {randomUUID} from 'node:crypto'
import {createKnowledgeBaseReader} from '../../../scripts/sanity-kb-demo-agent.mjs'
import {createNativeKnowledgeBaseDemoAdapters,demoKnowledgeBaseId} from '../../../scripts/sanity-kb-native-demo.mjs'
import {retrieveGameClues,reviewGameSelection,validateGameSelection} from '../../../scripts/sanity-delta-game.mjs'
import {gameQuestions} from '../../../scripts/sanity-game-options.mjs'
import {initialEvidence} from '../app/poc/sanity/game/game-evidence'
import {hostedAuthConfigured} from './supabase/config'
import {currentHostedUser} from './supabase/session'
import {demoAccountAllowed,isDemoJudge,demoJudgeExpired} from './supabase/demo-judge'
import {createSupabaseAdminClient} from './supabase/admin'
import {consumeLocalAttempt,demoLimits,judgeUsageInfo,rateLimitFailure} from './demo-request-policy'

const attempts=new Map<string,number[]>()
const headers={'Cache-Control':'no-store'}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers})

/** Both game actions share atomic judge quota; neither mutates a Case or Delta. */
export async function handleSanityGameAction(request:Request,action:'search'|'review') {
  const configured=hostedAuthConfigured()
  const user=configured?await currentHostedUser():null
  if(configured&&!user)return json({error:'Sign in to use this demo.'},401)
  if(!configured&&(process.env.NODE_ENV!=='development'||!['localhost','127.0.0.1'].includes(new URL(request.url).hostname)))return json({error:'Unauthenticated access is local-development only.'},403)
  if(!demoAccountAllowed(user,{requireJudge:process.env.TRAMA_DEMO_REQUIRE_JUDGE==='true',operatorId:process.env.TRAMA_DEMO_OPERATOR_ID}))return json({error:'This account is not authorized for the demo.'},403)
  const origin=request.headers.get('origin')
  // The reverse proxy forwards the public Host while Next may construct a
  // loopback request URL. Never use the client's arbitrary Origin as authority.
  if(origin){try{if(new URL(origin).host!==(request.headers.get('host')??new URL(request.url).host))return json({error:'Cross-origin game requests are not allowed.'},403)}catch{return json({error:'Invalid request origin.'},403)}}
  const raw=await request.text()
  if(raw.length>(action==='search'?2000:240000))return json({error:'Request body is too large; select fewer complete clues.'},413)
  const token=process.env.SANITY_ORGANIZATION_TOKEN
  const endpoint=process.env.SANITY_CONTEXT_EVIDENCE_MCP_URL
  const key=process.env.OPENAI_API_KEY??process.env.OPEN_API_KEY
  if(!token||!endpoint||(action==='review'&&!key))return json({error:'The game service is not configured on this server.'},503)
  let questionId='',selection:ReturnType<typeof validateGameSelection>|undefined
  try{
    const input=JSON.parse(raw)
    if(action==='search'){
      if(!gameQuestions.some(item=>item.id===input?.questionId))throw TypeError('Choose a predefined question.')
      questionId=input.questionId
    }else selection=validateGameSelection(input,initialEvidence,token)
  }catch(error){return json({error:error instanceof Error?error.message:'Invalid game selection.'},400)}
  const requestId=randomUUID()
  let access:Record<string,unknown>|undefined
  try{
    if(user&&isDemoJudge(user)){
      if(demoJudgeExpired(user))return json({error:'Judge access expired.'},403)
      const admin=createSupabaseAdminClient()
      const {data,error}=await admin.rpc('consume_sanity_demo_judge_question',{candidate_user_id:user.id})
      if(error)return json({error:'Judge quota is not configured.'},503)
      if(!['allowed','rate_limited'].includes(data))return json({error:'Judge access is unavailable or expired.',code:'access_denied'},403)
      const {data:usage,error:usageError}=await admin.from('sanity_demo_judge_usage').select('total_requests,window_requests,window_started_at').eq('user_id',user.id).single()
      if(usageError||!usage)return json({error:'Your allowance could not be checked.',code:'quota_unavailable'},503)
      access=judgeUsageInfo(usage)
      if(data==='rate_limited'){
        if(access.remainingTotal===0)return json({error:'The shared 600-request allowance has been used. It does not renew each minute.',code:'quota_exhausted',access,limits:demoLimits},403)
        const failure=rateLimitFailure(access.retryAt as string)
        return Response.json({...failure,access},{status:429,headers:{...headers,'Retry-After':String(failure.retryAfterSeconds)}})
      }
    }else{
      const attempt=consumeLocalAttempt(attempts,user?.id??'localhost')
      if(!attempt.allowed){const failure=rateLimitFailure(attempt.retryAt);return Response.json(failure,{status:429,headers:{...headers,'Retry-After':String(failure.retryAfterSeconds)}})}
      access=attempt.access
    }
    const result=action==='search'
      ?await retrieveGameClues(questionId,createKnowledgeBaseReader({mcpEndpoint:endpoint,knowledgeBaseId:demoKnowledgeBaseId,organizationToken:token}),{receiptKey:token})
      :await reviewGameSelection(selection!,createNativeKnowledgeBaseDemoAdapters({mcpEndpoint:endpoint,organizationToken:token,openAiKey:key!}))
    return json({...result,requestId,access})
  }catch(error){
    const stage=error&&typeof error==='object'&&'stage'in error?error.stage:undefined
    const cause=error instanceof Error?error.cause:undefined
    const timeout=cause instanceof Error&&['TimeoutError','AbortError'].includes(cause.name)
    const code=timeout?(stage==='search'?'search_timeout':'model_timeout'):'game_request_failed'
    console.error(`Sanity game ${requestId}: ${code}`)
    return json({code,requestId,access,error:timeout
      ?stage==='search'?'Sanity clue search exceeded 30 seconds. No rationale was generated. This accepted attempt counts toward your allowance.'
        :'Rationale generation exceeded 90 seconds. Your selections were not changed. This accepted attempt counts toward your allowance.'
      :'The game request could not be completed. No Delta was changed. This accepted attempt counts toward your allowance.'},timeout?504:502)
  }
}
