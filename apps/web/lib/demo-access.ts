/** This distribution exposes read-only investigation and a browser-local game. */
export function demoRouteAllowed(path: string, method: string) {
  if (["/login", "/auth/callback", "/set-password"].includes(path)) return true;
  if (["/", "/poc/sanity/investigate", "/poc/sanity/game"].includes(path)) return ["GET", "HEAD"].includes(method);
  return path === "/api/poc/sanity/investigate" && method === "POST";
}
