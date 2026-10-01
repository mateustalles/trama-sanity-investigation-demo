/** This distribution exposes only the read-only investigation MVP. */
export function demoRouteAllowed(path: string, method: string) {
  if (["/login", "/auth/callback", "/set-password"].includes(path)) return true;
  if (path === "/" || path === "/poc/sanity/investigate") return ["GET", "HEAD"].includes(method);
  return path === "/api/poc/sanity/investigate" && method === "POST";
}
