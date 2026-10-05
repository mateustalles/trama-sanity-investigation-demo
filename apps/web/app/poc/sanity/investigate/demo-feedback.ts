export interface DemoAccess {
  requestsPerWindow: number
  windowSeconds: number
  totalRequests?: number
  remainingTotal?: number
  remainingInWindow?: number
  retryAt?: string
}

export interface DemoFailure {
  message: string
  retryAt: number | null
  exhausted: boolean
  access: DemoAccess | null
}

export const demoLimits: DemoAccess = {requestsPerWindow: 6, windowSeconds: 60, totalRequests: 600}
export const clientRequestTimeoutMs = 125_000

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

export function readDemoAccess(value: unknown): DemoAccess | null {
  const source = record(value)
  const positive = (key: string) => typeof source[key] === 'number' && Number.isFinite(source[key]) && Number(source[key]) > 0
  if (!positive('requestsPerWindow') || !positive('windowSeconds')) return null
  const access: DemoAccess = {requestsPerWindow: Number(source.requestsPerWindow), windowSeconds: Number(source.windowSeconds)}
  if (positive('totalRequests')) access.totalRequests = Number(source.totalRequests)
  for (const key of ['remainingTotal', 'remainingInWindow'] as const) {
    const count = source[key]
    if (typeof count === 'number' && Number.isFinite(count) && count >= 0) access[key] = count
  }
  if (typeof source.retryAt === 'string' && Number.isFinite(Date.parse(source.retryAt))) access.retryAt = source.retryAt
  return access
}

export function retrySeconds(retryAt: number | null, now: number): number {
  return retryAt === null ? 0 : Math.max(0, Math.ceil((retryAt - now) / 1000))
}

export function waitLabel(seconds: number): string {
  const duration = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`
}

export function describeDemoFailure(payload: unknown, status: number, retryHeader: string | null, now: number): DemoFailure {
  const source = record(payload)
  const code = typeof source.code === 'string' ? source.code : ''
  const fallback = typeof source.error === 'string' ? source.error : 'The investigation could not be completed. Your question is still here.'
  const access = readDemoAccess(source.access) ?? readDemoAccess(source.limits)
  if (code === 'quota_exhausted') return {message: 'This demo account has used its total question allowance. Waiting will not reset it; contact the demo owner for access. Your question has been kept.', retryAt: null, exhausted: true, access}
  if (code === 'search_timeout') return {message: 'Sanity Knowledge Base search exceeded its 30-second time limit. No answer was generated. This accepted attempt counts toward your allowance. Your question has been kept; you can try again manually when your allowance permits.', retryAt: null, exhausted: false, access}
  if (code === 'model_timeout') return {message: 'Sanity returned context, but the answer model exceeded its 90-second time limit. This accepted attempt counts toward your allowance. Your question has been kept; you can try again manually when your allowance permits.', retryAt: null, exhausted: false, access}
  if (status === 429) {
    let retryAt = typeof source.retryAt === 'string' ? Date.parse(source.retryAt) : Number.NaN
    if (!Number.isFinite(retryAt) && typeof source.retryAfterSeconds === 'number' && Number.isFinite(source.retryAfterSeconds) && source.retryAfterSeconds >= 0) retryAt = now + source.retryAfterSeconds * 1000
    if (!Number.isFinite(retryAt) && retryHeader) {
      const headerSeconds = Number(retryHeader)
      retryAt = Number.isFinite(headerSeconds) && headerSeconds >= 0 ? now + headerSeconds * 1000 : Date.parse(retryHeader)
    }
    return {message: Number.isFinite(retryAt) ? 'The demo question rate limit has been reached. Your question is kept; wait for the countdown below, then send it yourself.' : `${fallback} A retry time was not provided. Your question has been kept; this is a request limit, not a processing timeout.`, retryAt: Number.isFinite(retryAt) ? Math.max(now, retryAt) : null, exhausted: false, access}
  }
  return {message: fallback, retryAt: null, exhausted: false, access}
}
