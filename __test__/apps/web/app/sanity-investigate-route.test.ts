import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest'
const fixtures=vi.hoisted(()=>({
  user:{id:'judge-id',app_metadata:{trama_access:'sanity_demo_judge',sanity_demo_expires_at:'2027-01-01T00:00:00Z'}},
  rpc:vi.fn(),single:vi.fn(),investigate:vi.fn(),configured:vi.fn(()=>true),currentUser:vi.fn(),
}))
vi.mock('../../../../apps/web/lib/supabase/config',()=>({hostedAuthConfigured:fixtures.configured}))
vi.mock('../../../../apps/web/lib/supabase/session',()=>({currentHostedUser:fixtures.currentUser}))
vi.mock('../../../../apps/web/lib/supabase/admin',()=>({createSupabaseAdminClient:()=>({rpc:fixtures.rpc,
  from:()=>({select:()=>({eq:()=>({single:fixtures.single})})})})}))
vi.mock('../../../../scripts/sanity-kb-native-demo.mjs',()=>({
  validateNativeDemoQuestion:(value:unknown)=>{if(typeof value!=='string'||value.length<12)throw Error('Invalid question');return value},
  createNativeKnowledgeBaseDemoAdapters:()=>({}),investigateNativeKnowledgeBaseQuestion:fixtures.investigate,
}))
import {POST} from '../../../../apps/web/app/api/poc/sanity/investigate/route'

describe('native demo HTTP feedback and quota enforcement',()=>{
  const request=()=>new Request('https://demo.test/api/poc/sanity/investigate',{
    method:'POST',body:JSON.stringify({question:'What happened during the incident?'})})
  beforeEach(()=>{
    vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-04T20:00:00Z'))
    for(const key of ['SANITY_ORGANIZATION_TOKEN','OPENAI_API_KEY','SANITY_CONTEXT_EVIDENCE_MCP_URL'])vi.stubEnv(key,'offline-fixture')
    vi.stubEnv('TRAMA_DEMO_REQUIRE_JUDGE','true')
    fixtures.currentUser.mockResolvedValue(fixtures.user)
    fixtures.rpc.mockResolvedValue({data:'allowed',error:null})
    fixtures.single.mockResolvedValue({data:{total_requests:10,window_requests:1,window_started_at:'2026-10-04T20:00:00Z'},error:null})
    fixtures.investigate.mockResolvedValue({answer:{answer:'Fixture only'}})
  })
  afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.restoreAllMocks()})
  it('returns exact retry metadata and Retry-After without a paid call',async()=>{
    fixtures.rpc.mockResolvedValue({data:'rate_limited',error:null})
    fixtures.single.mockResolvedValue({data:{total_requests:20,window_requests:6,window_started_at:'2026-10-04T19:59:40Z'},error:null})
    const response=await POST(request()),body=await response.json()
    expect(response.status).toBe(429);expect(response.headers.get('Retry-After')).toBe('40')
    expect(body).toMatchObject({code:'rate_limited',retryAfterSeconds:40,retryAt:'2026-10-04T20:00:40.000Z',
      limits:{requestsPerWindow:6,windowSeconds:60,totalRequests:600},access:{remainingTotal:580}})
    expect(fixtures.investigate).not.toHaveBeenCalled()
  })
  it('does not claim that an exhausted total will reset',async()=>{
    fixtures.rpc.mockResolvedValue({data:'rate_limited',error:null})
    fixtures.single.mockResolvedValue({data:{total_requests:600,window_requests:0,window_started_at:'2026-10-04T19:00:00Z'},error:null})
    const response=await POST(request()),body=await response.json()
    expect(response.status).toBe(403);expect(body.code).toBe('quota_exhausted')
    expect(response.headers.get('Retry-After')).toBeNull();expect(fixtures.investigate).not.toHaveBeenCalled()
  })
  it('includes remaining allowance on success and uses only the database guard for judges',async()=>{
    const response=await POST(request()),body=await response.json()
    expect(response.status).toBe(200);expect(body.access).toMatchObject({remainingTotal:590,remainingInWindow:5})
    expect(fixtures.rpc).toHaveBeenCalledTimes(1);expect(fixtures.investigate).toHaveBeenCalledTimes(1)
  })
  it('fails closed if quota metadata is unavailable',async()=>{
    fixtures.single.mockResolvedValue({data:null,error:{message:'Do not disclose'}})
    const response=await POST(request())
    expect(response.status).toBe(503);expect((await response.json()).code).toBe('quota_unavailable')
    expect(fixtures.investigate).not.toHaveBeenCalled()
  })
  it('reports stage-specific processing timeouts without a misleading cooldown',async()=>{
    vi.spyOn(console,'error').mockImplementation(()=>{})
    fixtures.investigate.mockRejectedValue(Object.assign(new Error('secret',{cause:new DOMException('deadline','TimeoutError')}),{stage:'model'}))
    const response=await POST(request()),body=await response.json()
    expect(response.status).toBe(504);expect(body.code).toBe('model_timeout')
    expect(body.error).toContain('90-second');expect(body.error).not.toContain('secret')
    expect(response.headers.get('Retry-After')).toBeNull()
  })
  it('rejects unsigned users before checking quotas or calling providers',async()=>{
    fixtures.currentUser.mockResolvedValue(null)
    expect((await POST(request())).status).toBe(401)
    expect(fixtures.rpc).not.toHaveBeenCalled();expect(fixtures.investigate).not.toHaveBeenCalled()
  })
})
