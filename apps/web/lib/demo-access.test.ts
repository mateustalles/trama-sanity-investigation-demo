import {describe, expect, it} from "vitest";
import {demoRouteAllowed} from "./demo-access";
import {getTramaService, getRequestTramaService} from "./service";
describe("investigation MVP boundary", () => {
  it("allows investigation and authentication", () => {
    expect(demoRouteAllowed("/", "GET")).toBe(true);
    expect(demoRouteAllowed("/poc/sanity/investigate", "HEAD")).toBe(true);
    expect(demoRouteAllowed("/api/poc/sanity/investigate", "POST")).toBe(true);
    expect(demoRouteAllowed("/login", "POST")).toBe(true);
  });
  it("does not expose the operational product or write endpoints", () => {
    expect(demoRouteAllowed("/", "POST")).toBe(false);
    expect(demoRouteAllowed("/settings", "GET")).toBe(false);
    expect(demoRouteAllowed("/api/local-chat", "POST")).toBe(false);
    expect(demoRouteAllowed("/api/investigations/apply-approved-delta", "POST")).toBe(false);
  });
  it("fails closed even when an operational service is invoked directly", async () => {
    expect(() => getTramaService()).toThrow("read-only demo");
    await expect(getRequestTramaService()).rejects.toThrow("read-only demo");
  });
});
