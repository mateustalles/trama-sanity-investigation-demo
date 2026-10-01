import { redirect } from "next/navigation";
import { hostedAuthConfigured } from "../../lib/supabase/config";
import { currentHostedUser } from "../../lib/supabase/session";
import { requestPasswordReset, signIn } from "./actions";
import { accountHome, isDemoJudge, demoJudgeExpired } from "../../lib/supabase/demo-judge";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!hostedAuthConfigured()) redirect("/");
  const user = await currentHostedUser();
  if (user && !(isDemoJudge(user) && demoJudgeExpired(user))) redirect(accountHome(user));
  const { error } = await searchParams;
  return <main className="loginPage"><section className="loginPaper">
    <p className="kicker">Private demo access</p><h1>Sign in to Trama</h1>
    <p>Investigate the checkout incident and inspect the evidence behind each answer.</p>
    {error && <div className="loginError" role="alert">{error}</div>}
    <form action={signIn} className="paperForm"><label>Email<input name="email" type="email" autoComplete="email" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label><button type="submit">Sign in</button></form>
    <details className="closeOpenLoop"><summary>Forgot your password?</summary><form action={requestPasswordReset} className="paperForm"><label>Email<input name="email" type="email" autoComplete="email" required /></label><button type="submit">Send reset link</button></form></details>
    <small>Demo access is by invitation. Account limits apply.</small>
  </section></main>;
}
