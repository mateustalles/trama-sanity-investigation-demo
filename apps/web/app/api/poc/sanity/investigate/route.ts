import {randomUUID} from 'node:crypto'
import {createNativeKnowledgeBaseDemoAdapters, investigateNativeKnowledgeBaseQuestion, validateNativeDemoQuestion} from '../../../../../../../scripts/sanity-kb-native-demo.mjs'
import {hostedAuthConfigured} from '../../../../../lib/supabase/config'
import {currentHostedUser} from '../../../../../lib/supabase/session'
import {isDemoJudge, demoJudgeExpired, demoAccountAllowed} from '../../../../../lib/supabase/demo-judge'
import {createSupabaseAdminClient} from '../../../../../lib/supabase/admin'
import {demoLimits,consumeLocalAttempt,judgeUsageInfo,rateLimitFailure,investigationFailure} from '../../../../../lib/demo-request-policy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const attempts = new Map<string, number[]>()
const privateHeaders={'Cache-Control':'no-store'}

export async function POST(request: Request) {
  const user = hostedAuthConfigured() ? await currentHostedUser() : null
  if (hostedAuthConfigured() && !user) return Response.json({error:'Sign in to use this demo.'},{status:401})
  if (!hostedAuthConfigured() &&
      (process.env.NODE_ENV !== 'development' || !['localhost','127.0.0.1'].includes(new URL(request.url).hostname))) {
    return Response.json({error:'The demo is available without sign-in only in local development.'},{status:403})
  }
  if (!demoAccountAllowed(user,{requireJudge:process.env.TRAMA_DEMO_REQUIRE_JUDGE === 'true',
    operatorId:process.env.TRAMA_DEMO_OPERATOR_ID})) {
    return Response.json({error:'This account is not authorized for the demo.'},{status:403})
  }
  const raw = await request.text()
  if (raw.length > 2_000) return Response.json({error:'Request body is too large.'},{status:413})
  let question: string
  try {
    const payload = JSON.parse(raw) as {question?: unknown}
    question = validateNativeDemoQuestion(payload.question)
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : 'Invalid request.'},{status:400})
  }
  const organizationToken = process.env.SANITY_ORGANIZATION_TOKEN
  const openAiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_API_KEY
  const mcpEndpoint = process.env.SANITY_CONTEXT_EVIDENCE_MCP_URL
  if (!organizationToken || !openAiKey || !mcpEndpoint) {
    return Response.json({error:'The demo is not configured on this server yet.'},{status:503})
  }
  const requestId = randomUUID()
  let access: Record<string,unknown> | undefined
  try {
    if (user && isDemoJudge(user)) {
      if (demoJudgeExpired(user)) return Response.json({error:'Judge access expired.'},{status:403})
      const admin=createSupabaseAdminClient()
      const {data,error} = await admin.rpc('consume_sanity_demo_judge_question',{candidate_user_id:user.id})
      if (error) return Response.json({error:'Judge quota is not configured.'},{status:503})
      if (!['allowed','rate_limited'].includes(data)) return Response.json({error:'Judge access is unavailable or expired.',code:'access_denied'},{status:403,headers:privateHeaders})
      const {data:usage,error:usageError}=await admin.from('sanity_demo_judge_usage')
        .select('total_requests,window_requests,window_started_at').eq('user_id',user.id).single()
      if (usageError || !usage) return Response.json({error:'Your allowance could not be checked. Please try again later.',code:'quota_unavailable'},{status:503,headers:privateHeaders})
      access=judgeUsageInfo(usage)
      if (data==='rate_limited') {
        if (access.remainingTotal===0) return Response.json({error:'This demo account has used its 600-question allowance. It does not reset each minute; contact the demo owner for renewed access.',code:'quota_exhausted',limits:demoLimits,access},{status:403,headers:privateHeaders})
        const failure=rateLimitFailure(access.retryAt as string)
        return Response.json({...failure,access},{status:429,headers:{...privateHeaders,'Retry-After':String(failure.retryAfterSeconds)}})
      }
    } else {
      const attempt=consumeLocalAttempt(attempts,user?.id ?? 'localhost')
      if (!attempt.allowed) {
        const failure=rateLimitFailure(attempt.retryAt)
        return Response.json(failure,{status:429,headers:{...privateHeaders,'Retry-After':String(failure.retryAfterSeconds)}})
      }
      access=attempt.access
    }
    const adapters = createNativeKnowledgeBaseDemoAdapters({mcpEndpoint,organizationToken,openAiKey})
    const result = await investigateNativeKnowledgeBaseQuestion(question,adapters)
    return Response.json({...result,requestId,access},{headers:privateHeaders})
  } catch (error) {
    const failure=investigationFailure(error)
    console.error(`Sanity pilot demo ${requestId}: ${failure.code}`)
    return Response.json({error:failure.error,code:failure.code,requestId,access},{status:failure.status,headers:privateHeaders})
  }
}
