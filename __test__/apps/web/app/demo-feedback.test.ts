import {describe, expect, it} from 'vitest'
import {clientRequestTimeoutMs, demoLimits, describeDemoFailure, readDemoAccess, retrySeconds, waitLabel} from '../../../../apps/web/app/poc/sanity/investigate/demo-feedback'

describe('investigation demo request feedback', () => {
  const now = Date.parse('2026-10-04T20:00:00Z')
  it('explains the six-question one-minute window and 600-question total', () => {
    expect(demoLimits).toEqual({requestsPerWindow: 6, windowSeconds: 60, totalRequests: 600})
    expect(clientRequestTimeoutMs).toBe(125_000)
  })
  it('prefers the exact server retry time and counts down without going negative', () => {
    const failure = describeDemoFailure({code:'rate_limited', retryAt:'2026-10-04T20:02:00Z', retryAfterSeconds:999}, 429, '500', now)
    expect(failure.retryAt).toBe(now + 120_000)
    expect(retrySeconds(failure.retryAt, now + 1_001)).toBe(119)
    expect(waitLabel(119)).toBe('1:59')
    expect(retrySeconds(failure.retryAt, now + 200_000)).toBe(0)
  })
  it('uses retry duration or HTTP header when an exact retry time is unavailable', () => {
    expect(describeDemoFailure({retryAfterSeconds:12},429,null,now).retryAt).toBe(now + 12_000)
    expect(describeDemoFailure({},429,'30',now).retryAt).toBe(now + 30_000)
    expect(describeDemoFailure({},429,'Sun, 04 Oct 2026 20:01:00 GMT',now).retryAt).toBe(now + 60_000)
    expect(describeDemoFailure({},429,null,now).message).toContain('retry time was not provided')
  })
  it('does not tell an exhausted account to wait for a reset', () => {
    const failure = describeDemoFailure({code:'quota_exhausted', retryAfterSeconds:60, limits:demoLimits},429,null,now)
    expect(failure.exhausted).toBe(true)
    expect(failure.retryAt).toBeNull()
    expect(failure.message).toContain('Waiting will not reset')
    expect(failure.access).toEqual(demoLimits)
  })
  it('distinguishes a search deadline from an answer deadline and never treats these as a quota', () => {
    const search = describeDemoFailure({code:'search_timeout'},504,null,now)
    const answer = describeDemoFailure({code:'model_timeout'},504,null,now)
    expect(search.message).toContain('30-second')
    expect(search.message).toContain('No answer was generated')
    expect(search.message).toContain('counts toward your allowance')
    expect(answer.message).toContain('90-second')
    expect(answer.message).toContain('Sanity returned context')
    expect(search.exhausted).toBe(false)
    expect(answer.retryAt).toBeNull()
  })
  it('validates allowance metadata, preserving an exact zero remaining', () => {
    expect(readDemoAccess({...demoLimits,remainingTotal:0,remainingInWindow:0})).toEqual({...demoLimits,remainingTotal:0,remainingInWindow:0})
    expect(readDemoAccess({requestsPerWindow:Infinity,windowSeconds:600,totalRequests:60})).toBeNull()
    expect(readDemoAccess(null)).toBeNull()
    expect(readDemoAccess({...demoLimits,remainingTotal:-2,retryAt:'invalid'})).toEqual(demoLimits)
  })
  it('prefers current access counts and does not invent an operator total quota', () => {
    const access = {requestsPerWindow:6, windowSeconds:60, remainingInWindow:0}
    const failure = describeDemoFailure({access, limits:demoLimits},429,'30',now)
    expect(failure.access).toEqual(access)
    expect(failure.access?.totalRequests).toBeUndefined()
    const current = {...demoLimits, remainingTotal:590}
    expect(describeDemoFailure({access:current,limits:demoLimits},504,null,now).access).toEqual(current)
  })
})
