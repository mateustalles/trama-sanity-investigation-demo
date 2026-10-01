type Account = { app_metadata?: Record<string, unknown> };
export const judgeDemoPath = "/poc/sanity/investigate";
export function isDemoJudge(user: Account | null) {
  return user?.app_metadata?.trama_access === "sanity_demo_judge";
}
export function demoJudgeExpired(user: Account, now = Date.now()) {
  const expiry = user.app_metadata?.sanity_demo_expires_at;
  const timestamp = typeof expiry === "string" ? Date.parse(expiry) : NaN;
  return !Number.isFinite(timestamp) || timestamp <= now;
}
export function accountHome(user: Account | null) {
  return isDemoJudge(user) ? judgeDemoPath : "/";
}
export function judgeRouteAllowed(path: string, method: string) {
  if (["/login", "/auth/callback", "/set-password"].includes(path)) return true;
  if (path === judgeDemoPath) return method === "GET" || method === "HEAD";
  return path === "/api/poc/sanity/investigate" && method === "POST";
}
