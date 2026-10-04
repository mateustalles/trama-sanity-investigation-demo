import {describe, expect, it} from "vitest";
import {accountHome, demoAccountAllowed, demoJudgeExpired, isDemoJudge, judgeRouteAllowed} from "../../../../../apps/web/lib/supabase/demo-judge";
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
    expect(judgeRouteAllowed("/poc/sanity/game", "GET")).toBe(true);
    expect(judgeRouteAllowed("/poc/sanity/game", "HEAD")).toBe(true);
    expect(judgeRouteAllowed("/poc/sanity/game", "POST")).toBe(false);
    expect(judgeRouteAllowed("/api/poc/sanity/investigate", "POST")).toBe(true);
  });
  it("allows only a current judge or the exact configured operator when the public gate is enabled", () => {
    const now = Date.parse("2026-10-01");
    const operatorId = "6ec7d301-3d8a-4ea8-9030-dc7567ecb2f0";
    const operator = {id:operatorId, app_metadata:{}};
    const ordinary = {id:"c877a806-8b98-4293-a87f-a0bfec0bf726", app_metadata:{}};
    expect(demoAccountAllowed(ordinary,{requireJudge:false})).toBe(true);
    expect(demoAccountAllowed(null,{requireJudge:true,operatorId,now})).toBe(false);
    expect(demoAccountAllowed({...judge,id:ordinary.id},{requireJudge:true,operatorId,now})).toBe(true);
    expect(demoAccountAllowed({...judge,id:ordinary.id},{requireJudge:true,operatorId,now:Date.parse("2026-10-11")})).toBe(false);
    expect(demoAccountAllowed(operator,{requireJudge:true,operatorId,now})).toBe(true);
    expect(demoAccountAllowed(ordinary,{requireJudge:true,operatorId,now})).toBe(false);
    expect(demoAccountAllowed(operator,{requireJudge:true,operatorId:"invalid",now})).toBe(false);
    expect(demoAccountAllowed({...judge,id:operatorId},{requireJudge:true,operatorId,now:Date.parse("2026-10-11")})).toBe(false);
  });
});
