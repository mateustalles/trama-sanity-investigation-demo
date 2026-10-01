import {describe, expect, it} from "vitest";
import {accountHome, demoJudgeExpired, isDemoJudge, judgeRouteAllowed} from "../../../../../apps/web/lib/supabase/demo-judge";
describe("limited judge access", () => {
  const judge = {app_metadata:{trama_access:"sanity_demo_judge", sanity_demo_expires_at:"2026-10-10T00:00:00Z"}};
  it("uses server-owned metadata and preserves normal accounts", () => {
    expect(isDemoJudge(judge)).toBe(true);
    expect(isDemoJudge({app_metadata:{}})).toBe(false);
    expect(accountHome(null)).toBe("/");
    expect(accountHome(judge)).toBe("/poc/sanity/investigate");
  });
  it("fails closed on missing, invalid and expired timestamps", () => {
    expect(demoJudgeExpired(judge, Date.parse("2026-10-01"))).toBe(false);
    expect(demoJudgeExpired(judge, Date.parse("2026-10-11"))).toBe(true);
    expect(demoJudgeExpired({app_metadata:{}})).toBe(true);
    expect(demoJudgeExpired({app_metadata:{sanity_demo_expires_at:"invalid"}})).toBe(true);
  });
  it("denies personal routes and non-demo APIs", () => {
    expect(judgeRouteAllowed("/settings", "GET")).toBe(false);
    expect(judgeRouteAllowed("/api/local-chat", "POST")).toBe(false);
    expect(judgeRouteAllowed("/poc/sanity/investigate", "POST")).toBe(false);
    expect(judgeRouteAllowed("/poc/sanity/investigate", "GET")).toBe(true);
    expect(judgeRouteAllowed("/api/poc/sanity/investigate", "POST")).toBe(true);
  });
});
