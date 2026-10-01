import type {Metadata} from 'next'
import {requireHostedUser} from '../../../../lib/supabase/session'
import {InvestigationDemo} from './investigation-demo'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title:'The Checkout Investigation · Trama × Sanity Context',
  description:'Investigate a fictional checkout incident by asking questions, inspecting original records, and testing what the evidence supports.',
}

export default async function SanityInvestigationDemoPage() {
  await requireHostedUser({allowDemoJudge:true})
  return <InvestigationDemo />
}
