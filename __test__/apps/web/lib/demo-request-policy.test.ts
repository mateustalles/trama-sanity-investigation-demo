import {describe,it,expect} from 'vitest'
import {consumeLocalAttempt,judgeUsageInfo,rateLimitFailure,investigationFailure} from '../../../../apps/web/lib/demo-request-policy'

describe('demo limits and accurate failures',()=>{
  const now=Date.parse('2026-10-04T20:00:00Z')
  it('allows six attempts and returns the exact sliding retry boundary without charging rejected attempts',()=>{
    const attempts=new Map<string,number[]>()
    for(let i=0;i<6;i++) expect(consumeLocalAttempt(attempts,'operator',now+i*1000).allowed).toBe(true)
    const rejected=consumeLocalAttempt(attempts,'operator',now+30_000)
    expect(rejected).toEqual({allowed:false,retryAt:'2026-10-04T20:01:00.000Z'})
    expect(attempts.get('operator')).toHaveLength(6)
    expect(rateLimitFailure(rejected.allowed?'':rejected.retryAt,now+30_000).retryAfterSeconds).toBe(30)
    expect(consumeLocalAttempt(attempts,'operator',now+60_000).allowed).toBe(true)
  })
  it('separates total exhaustion from a renewing database time window',()=>{
    const usage={total_requests:600,window_requests:6,window_started_at:'2026-10-04T19:59:30Z'}
    expect(judgeUsageInfo(usage,now)).toMatchObject({remainingTotal:0,remainingInWindow:0,retryAt:'2026-10-04T20:00:30.000Z'})
    expect(judgeUsageInfo(usage,now+60_000)).toMatchObject({remainingTotal:0,remainingInWindow:6})
    expect(()=>judgeUsageInfo({...usage,window_started_at:'bad'},now)).toThrow()
  })
  it('reports actual search/model timeout stages and never exposes provider details',()=>{
    for(const stage of ['search','model']) {
      const error=Object.assign(new Error('secret endpoint',{cause:new DOMException('secret','TimeoutError')}),{stage})
      expect(investigationFailure(error)).toMatchObject({status:504,code:`${stage}_timeout`})
      expect(investigationFailure(error).error).not.toContain('secret')
    }
    expect(investigationFailure(new Error('timeout in user text'))).toMatchObject({status:502,code:'investigation_failed'})
  })
})
