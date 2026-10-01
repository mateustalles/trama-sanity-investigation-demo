import {loadBenchmarkAuditData} from '../../../../lib/benchmark-artifacts'
import {requireHostedUser} from '../../../../lib/supabase/session'
import {BenchmarkAuditWorkbench} from './workbench'

export const dynamic = 'force-dynamic'

export default async function BenchmarkAuditPage() {
  await requireHostedUser()
  return <BenchmarkAuditWorkbench data={await loadBenchmarkAuditData()} />
}
