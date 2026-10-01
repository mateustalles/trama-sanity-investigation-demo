import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { requiresHostedPageSession } from "./lib/supabase/route-access";
import { demoJudgeExpired, isDemoJudge, judgeRouteAllowed, judgeDemoPath } from "./lib/supabase/demo-judge";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const client = createServerClient(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll: (values) => { values.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); }
  }});
  const { data: { user } } = await client.auth.getUser();
  const hostedMode = process.env.TRAMA_HOSTED_TENANCY_READY === "true";
  if (user && isDemoJudge(user) &&
      (!judgeRouteAllowed(request.nextUrl.pathname, request.method) ||
       (demoJudgeExpired(user) && !["/login", "/auth/callback"].includes(request.nextUrl.pathname)))) {
    if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({error:"Judge access is restricted or expired."}, {status:403});
    const target = request.nextUrl.clone();
    target.pathname = demoJudgeExpired(user) ? "/login" : judgeDemoPath;
    target.search = "";
    const result = NextResponse.redirect(target);
    response.cookies.getAll().forEach(cookie => result.cookies.set(cookie));
    return result;
  }
  if (hostedMode && !user && requiresHostedPageSession(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
