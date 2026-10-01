import { describe, expect, it } from "vitest";
import { isPublicHostedPath, requiresHostedPageSession } from "./route-access";

describe("hosted route access", () => {
  it("keeps only English authentication routes public", () => {
    expect(isPublicHostedPath("/login")).toBe(true);
    expect(isPublicHostedPath("/auth/callback")).toBe(true);
    expect(isPublicHostedPath("/entrar")).toBe(false);
    expect(isPublicHostedPath("/definir-senha")).toBe(false);
  });

  it("requires a session for every application page", () => {
    expect(requiresHostedPageSession("/")).toBe(true);
    expect(requiresHostedPageSession("/settings")).toBe(true);
    expect(requiresHostedPageSession("/set-password")).toBe(true);
    expect(requiresHostedPageSession("/evals")).toBe(true);
    expect(requiresHostedPageSession("/login")).toBe(false);
    expect(requiresHostedPageSession("/api/local-chat")).toBe(false);
  });
});
