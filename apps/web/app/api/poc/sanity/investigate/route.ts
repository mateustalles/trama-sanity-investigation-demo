import {randomUUID} from 'node:crypto'
import {createNativeKnowledgeBaseDemoAdapters, investigateNativeKnowledgeBaseQuestion, validateNativeDemoQuestion} from '../../../../../../../scripts/sanity-kb-native-demo.mjs'
import {hostedAuthConfigured} from '../../../../../lib/supabase/config'
import {currentHostedUser} from '../../../../../lib/supabase/session'
import {isDemoJudge, demoJudgeExpired, demoAccountAllowed} from '../../../../../lib/supabase/demo-judge'
import {createSupabaseAdminClient} from '../../../../../lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const windowMs = 10 * 60 * 1000
const maxRequests = 6
const attempts = new Map<string, number[]>()

function limited(identity: string) {
  const now = Date.now()
  const recent = (attempts.get(identity) ?? []).filter(time => now - time < windowMs)
  if (recent.length >= maxRequests) return true
  attempts.set(identity, [...recent, now])
  return false
}

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
  if (limited(user?.id ?? 'localhost')) return Response.json({error:'Demo rate limit reached. Please try again in a few minutes.'},{status:429})

  const organizationToken = process.env.SANITY_ORGANIZATION_TOKEN
  const openAiKey = process.env.OPENAI_API_KEY ?? process.env.OPEN_API_KEY
  const mcpEndpoint = process.env.SANITY_CONTEXT_EVIDENCE_MCP_URL
  if (!organizationToken || !openAiKey || !mcpEndpoint) {
    return Response.json({error:'The demo is not configured on this server yet.'},{status:503})
  }
  const requestId = randomUUID()
  try {
    if (user && isDemoJudge(user)) {
      if (demoJudgeExpired(user)) return Response.json({error:'Judge access expired.'},{status:403})
      const {data,error} = await createSupabaseAdminClient().rpc('consume_sanity_demo_judge_question',{candidate_user_id:user.id})
      if (error) return Response.json({error:'Judge quota is not configured.'},{status:503})
      if (data !== 'allowed') return Response.json({error:'Judge access or quota limit reached.'},{status:data === 'rate_limited' ? 429 : 403})
    }
    const adapters = createNativeKnowledgeBaseDemoAdapters({mcpEndpoint,organizationToken,openAiKey})
    const result = await investigateNativeKnowledgeBaseQuestion(question,adapters)
    return Response.json({...result,requestId},{headers:{'Cache-Control':'no-store'}})
  } catch (error) {
    console.error(`Sanity pilot demo ${requestId}:`,error instanceof Error ? error.message : String(error))
    return Response.json({error:'The investigation could not be completed. No unsupported answer was shown.',requestId},{status:502,headers:{'Cache-Control':'no-store'}})
  }
}
