import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

describe("public MVP presentation", () => {
  it("uses a single investigation entry and an English document shell", () => {
    const home = readFileSync(new URL("../../../../apps/web/app/page.tsx", import.meta.url), "utf8");
    const layout = readFileSync(new URL("../../../../apps/web/app/layout.tsx", import.meta.url), "utf8");
    expect(home).toContain('from "./poc/sanity/investigate/page"');
    expect(layout).toContain('lang="en"');
    expect(layout).not.toContain("LocalAgentChat");
  });
  it("keeps authentication labels and errors consistent", () => {
    const routes = ["login/page.tsx", "login/actions.ts", "set-password/page.tsx",
      "set-password/actions.ts", "auth/callback/route.ts"];
    for (const route of routes) {
      const content = readFileSync(new URL(`../../../../apps/web/app/${route}`, import.meta.url), "utf8");
      expect(content).not.toMatch(/Entre no|Senha|senha|Entrar|inválidos|redefinição|recupera%C3/);
    }
  });
});
