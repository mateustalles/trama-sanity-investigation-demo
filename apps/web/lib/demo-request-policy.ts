export const demoLimits = {requestsPerWindow:6,windowSeconds:60,totalRequests:600} as const
type Usage = {total_requests:number;window_requests:number;window_started_at:string}

/** Display the existing database quota; never replace its atomic enforcement. */
export function judgeUsageInfo(usage: Usage, now=Date.now()) {
  const start = Date.parse(usage.window_started_at)
  if (!Number.isFinite(start) || !Number.isInteger(usage.total_requests) || usage.total_requests < 0 ||
      !Number.isInteger(usage.window_requests) || usage.window_requests < 0) throw new Error('Invalid quota information.')
  const reset = start + demoLimits.windowSeconds * 1000
  return {...demoLimits,remainingTotal:Math.max(0,demoLimits.totalRequests-usage.total_requests),
    remainingInWindow:reset <= now ? demoLimits.requestsPerWindow : Math.max(0,demoLimits.requestsPerWindow-usage.window_requests),
    retryAt:new Date(Math.max(now,reset)).toISOString()}
}

export function rateLimitFailure(retryAt: string, now=Date.now()) {
  const retryAfterSeconds=Math.max(1,Math.ceil((Date.parse(retryAt)-now)/1000))
  if (!Number.isFinite(retryAfterSeconds)) throw new Error('Invalid retry time.')
  return {error:'You can ask 6 questions per minute. Please wait until the displayed retry time.',
    code:'rate_limited',retryAfterSeconds,retryAt,limits:demoLimits}
}

/** Operator/local guard. Judge limits are enforced by the database instead. */
export function consumeLocalAttempt(attempts: Map<string,number[]>, identity: string, now=Date.now()) {
  for (const [key,times] of attempts) if (!times.some(time=>now-time < 60_000)) attempts.delete(key)
  const recent=(attempts.get(identity) ?? []).filter(time=>now-time < 60_000)
  if (recent.length >= demoLimits.requestsPerWindow) {
    return {allowed:false as const,retryAt:new Date(recent[0]!+60_000).toISOString()}
  }
  attempts.set(identity,[...recent,now])
  return {allowed:true as const,access:{requestsPerWindow:6,windowSeconds:60,
    remainingInWindow:demoLimits.requestsPerWindow-recent.length-1,
    retryAt:new Date((recent[0] ?? now)+60_000).toISOString()}}
}

export function investigationFailure(error: unknown) {
  const stage=error && typeof error==='object' && 'stage' in error ? error.stage : undefined
  const cause=error instanceof Error ? error.cause : undefined
  const timedOut=cause instanceof Error && ['TimeoutError','AbortError'].includes(cause.name)
  if (timedOut && stage==='search') return {status:504,code:'search_timeout',
    error:'Sanity Knowledge Base search exceeded its 30-second time limit. No answer was generated. You may retry; this attempt still counts toward your demo allowance.'}
  if (timedOut && stage==='model') return {status:504,code:'model_timeout',
    error:'Sanity returned context, but the answer model exceeded its 90-second time limit. No answer was shown. You may retry; this attempt still counts toward your demo allowance.'}
  return {status:502,code:'investigation_failed',error:'The investigation could not be completed. No unsupported answer was shown. This attempt counts toward your demo allowance.'}
}
