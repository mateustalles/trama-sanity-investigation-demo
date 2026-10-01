import { redirect } from "next/navigation";
import { hostedAuthConfigured, supabaseConfigured } from "./config";
import { createSupabaseServerClient } from "./server";
import { demoJudgeExpired, isDemoJudge, judgeDemoPath } from "./demo-judge";

export async function currentHostedUser() {
  if (!supabaseConfigured()) return null;
  const { data, error } = await (await createSupabaseServerClient()).auth.getUser();
  return error ? null : data.user;
}

export async function requireHostedUser(options: {allowDemoJudge?: boolean} = {}) {
  if (!hostedAuthConfigured()) return null;
  const user = await currentHostedUser();
  if (!user) redirect("/login");
  if (isDemoJudge(user)) {
    if (demoJudgeExpired(user)) redirect("/login?error=Judge%20access%20expired");
    if (!options.allowDemoJudge) redirect(judgeDemoPath);
  }
  return user;
}
