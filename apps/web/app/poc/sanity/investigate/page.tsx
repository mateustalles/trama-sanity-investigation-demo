import type {Metadata} from 'next'
import {notFound} from 'next/navigation'
import {requireHostedUser} from '../../../../lib/supabase/session'
import {demoAccountAllowed} from '../../../../lib/supabase/demo-judge'
import {InvestigationDemo} from './investigation-demo'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title:'The Checkout Investigation · Trama × Sanity Context',
  description:'Investigate a fictional checkout incident by asking questions and inspecting full Knowledge Base search responses.',
}

export default async function SanityInvestigationDemoPage() {
  const user = await requireHostedUser({allowDemoJudge:true})
  if (!demoAccountAllowed(user,{requireJudge:process.env.TRAMA_DEMO_REQUIRE_JUDGE === 'true',
    operatorId:process.env.TRAMA_DEMO_OPERATOR_ID})) notFound()
  return <InvestigationDemo signedIn={Boolean(user)} />
}
