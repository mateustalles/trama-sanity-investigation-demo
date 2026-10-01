const publicHostedPaths = new Set(["/login", "/auth/callback"]);

export function isPublicHostedPath(pathname: string): boolean {
  return publicHostedPaths.has(pathname);
}

export function requiresHostedPageSession(pathname: string): boolean {
  return !pathname.startsWith("/api/") && !isPublicHostedPath(pathname);
}
