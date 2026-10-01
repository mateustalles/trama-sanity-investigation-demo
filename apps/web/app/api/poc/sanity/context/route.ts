import {callSanityContext} from '../../../../../lib/sanity/context-mcp'
import {requireHostedUser} from '../../../../../lib/supabase/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** A read-only health and orientation check used by the Sanity POC. */
export async function GET() {
  await requireHostedUser()
  const [evidence, state] = await Promise.all([
    callSanityContext('evidence', 'initial_context'),
    callSanityContext('state', 'initial_context'),
  ])
  return Response.json({
    evidence: {connected: true, hasKnowledgeBase: /Knowledge base id:\s*`[^`]+`/i.test(evidence)},
    state: {connected: true, hasInvestigationSchema: state.includes('investigationCase')},
  })
}
