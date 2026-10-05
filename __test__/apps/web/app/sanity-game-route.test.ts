import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest'
const fixtures=vi.hoisted(()=>({
 user:{id:'judge-id',app_metadata:{trama_access:'sanity_demo_judge',sanity_demo_expires_at:'2027-01-01T00:00:00Z'}},
 rpc:vi.fn(),single:vi.fn(),search:vi.fn(),review:vi.fn(),configured:vi.fn(()=>true),currentUser:vi.fn(),
}))
vi.mock('../../../../apps/web/lib/supabase/config',()=>({hostedAuthConfigured:fixtures.configured}))
vi.mock('../../../../apps/web/lib/supabase/session',()=>({currentHostedUser:fixtures.currentUser}))
vi.mock('../../../../apps/web/lib/supabase/admin',()=>({createSupabaseAdminClient:()=>({rpc:fixtures.rpc,
 from:()=>({select:()=>({eq:()=>({single:fixtures.single})})})})}))
vi.mock('../../../../scripts/sanity-kb-demo-agent.mjs',()=>({createKnowledgeBaseReader:()=>({searchKnowledgeBase:fixtures.search})}))
vi.mock('../../../../scripts/sanity-kb-native-demo.mjs',()=>({demoKnowledgeBaseId:'fixture-kb',
 createNativeKnowledgeBaseDemoAdapters:()=>({generateJson:fixtures.review})}))
import {POST as search} from '../../../../apps/web/app/api/poc/sanity/game/search/route'
import {POST as review} from '../../../../apps/web/app/api/poc/sanity/game/review/route'
import {initialEvidence} from '../../../../apps/web/app/poc/sanity/game/game-evidence'
describe('guided game HTTP boundary',()=>{
 const request=(action:string,body:unknown,headers:Record<string,string>={})=>new Request('https://demo.test/api/poc/sanity/game/'+action,{method:'POST',body:JSON.stringify(body),headers})
 const selection=()=>({hypothesisId:'timeout-latency',evidence:[initialEvidence[0]]})
 beforeEach(()=>{
  vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-04T20:00:00Z'))
  for(const key of ['SANITY_ORGANIZATION_TOKEN','OPENAI_API_KEY','SANITY_CONTEXT_EVIDENCE_MCP_URL'])vi.stubEnv(key,'offline-fixture')
  vi.stubEnv('TRAMA_DEMO_REQUIRE_JUDGE','true');fixtures.configured.mockReturnValue(true)
  fixtures.currentUser.mockResolvedValue(fixtures.user)
  fixtures.rpc.mockResolvedValue({data:'allowed',error:null})
  fixtures.single.mockResolvedValue({data:{total_requests:10,window_requests:1,window_started_at:'2026-10-04T20:00:00Z'},error:null})
  fixtures.search.mockImplementation(async arguments_=>({arguments:arguments_,text:'# Clue\nComplete generated section.'}))
  fixtures.review.mockResolvedValue({text:JSON.stringify({verdict:'partial',rationale:'This suggests a contribution.',limitations:'No sole cause proof.',nextCheck:'Compare timings.',evidenceIds:[initialEvidence[0]!.id]}),model:'offline-model',usage:null,latencyMs:3})
 })
 afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.restoreAllMocks()})
 it('search needs no OpenAI key, preserves response, and makes no model call',async()=>{
  vi.stubEnv('OPENAI_API_KEY','');vi.stubEnv('OPEN_API_KEY','')
  const response=await search(request('search',{questionId:'timeline'})),body=await response.json()
  expect(response.status).toBe(200);expect(body.modelCalls).toBe(0)
  expect(body.clues[0].receipt).toMatch(/^\d{13}\.[a-f0-9]{64}$/)
  expect(body.clues.map((item:{text:string})=>item.text).join('')).toBe(body.search.text)
  expect(fixtures.review).not.toHaveBeenCalled()
 })
 it('only selected host-owned evidence reaches rationale generation; no search or Delta apply',async()=>{
  const response=await review(request('review',{...selection(),evidence:[{...initialEvidence[0],text:'CLIENT FORGERY'}]}))
  expect(response.status).toBe(200)
  const body=JSON.parse(fixtures.review.mock.calls[0]![0].user)
  expect(body.selectedClues).toEqual([initialEvidence[0]])
  expect(body.selectedClues[0].text).not.toContain('CLIENT FORGERY')
  expect(fixtures.search).not.toHaveBeenCalled();expect((await response.json()).delta).toBeUndefined()
 })
 it('rejects undefined questions, missing selections and unverified KB clues before spending quota',async()=>{
  expect((await search(request('search',{questionId:'anything'}))).status).toBe(400)
  expect((await review(request('review',{hypothesisId:'timeout-latency',evidence:[]}))).status).toBe(400)
  expect((await review(request('review',{...selection(),evidence:[{id:'KB-forged',kind:'generated-context',text:'invented'}]}))).status).toBe(400)
  expect(fixtures.rpc).not.toHaveBeenCalled();expect(fixtures.search).not.toHaveBeenCalled();expect(fixtures.review).not.toHaveBeenCalled()
 })
 it('requires trusted authentication and refuses ordinary accounts',async()=>{
  fixtures.currentUser.mockResolvedValue(null)
  expect((await search(request('search',{questionId:'timeline'}))).status).toBe(401)
  fixtures.currentUser.mockResolvedValue({id:'ordinary',app_metadata:{}})
  expect((await review(request('review',selection()))).status).toBe(403)
  expect(fixtures.rpc).not.toHaveBeenCalled()
 })
 it('enforces same-origin against forwarded Host and rejects cross-origin calls',async()=>{
  expect((await search(request('search',{questionId:'timeline'},{origin:'https://evil.test'}))).status).toBe(403)
  const proxied=new Request('http://127.0.0.1:3000/api/poc/sanity/game/search',{method:'POST',body:JSON.stringify({questionId:'timeline'}),headers:{host:'demo.test',origin:'https://demo.test'}})
  expect((await search(proxied)).status).toBe(200)
 })
 it('returns exact shared quota retry metadata without providers',async()=>{
  fixtures.rpc.mockResolvedValue({data:'rate_limited',error:null})
  fixtures.single.mockResolvedValue({data:{total_requests:20,window_requests:6,window_started_at:'2026-10-04T19:59:40Z'},error:null})
  const response=await review(request('review',selection())),body=await response.json()
  expect(response.status).toBe(429);expect(response.headers.get('Retry-After')).toBe('40')
  expect(body.access.remainingTotal).toBe(580);expect(body.retryAt).toBe('2026-10-04T20:00:40.000Z')
  expect(fixtures.review).not.toHaveBeenCalled()
 })
 it('fails closed on exhausted total or missing quota metadata',async()=>{
  fixtures.rpc.mockResolvedValue({data:'rate_limited',error:null})
  fixtures.single.mockResolvedValue({data:{total_requests:600,window_requests:0,window_started_at:'2026-10-04T19:59:40Z'},error:null})
  const response=await search(request('search',{questionId:'timeline'}))
  expect(response.status).toBe(403);expect((await response.json()).code).toBe('quota_exhausted')
  fixtures.rpc.mockResolvedValue({data:'allowed',error:null});fixtures.single.mockResolvedValue({data:null,error:{message:'secret'}})
  expect((await review(request('review',selection()))).status).toBe(503)
  expect(fixtures.review).not.toHaveBeenCalled();expect(fixtures.search).not.toHaveBeenCalled()
 })
 it('reports provider timeout separately from a quota cooldown without leaking error text',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{})
  fixtures.review.mockRejectedValue(new DOMException('secret','TimeoutError'))
  const response=await review(request('review',selection())),body=await response.json()
  expect(response.status).toBe(504);expect(body.code).toBe('model_timeout');expect(body.error).toContain('90 seconds')
  expect(body.error).not.toContain('secret');expect(response.headers.get('Retry-After')).toBeNull()
 })
})
