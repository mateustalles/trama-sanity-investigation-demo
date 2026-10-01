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
    <p className="kicker">Acesso privado</p><h1>Entre no Trama</h1>
    <p>Seu contexto, suas conversas e suas decisões ficam vinculados à sua conta.</p>
    {error && <div className="loginError" role="alert">{error}</div>}
    <form action={signIn} className="paperForm"><label>E-mail<input name="email" type="email" autoComplete="email" required /></label><label>Senha<input name="password" type="password" autoComplete="current-password" required /></label><button type="submit">Entrar</button></form>
    <details className="closeOpenLoop"><summary>Esqueci minha senha</summary><form action={requestPasswordReset} className="paperForm"><label>E-mail<input name="email" type="email" autoComplete="email" required /></label><button type="submit">Enviar link de redefinição</button></form></details>
    <small>O beta é fechado e funciona somente por convite.</small>
  </section></main>;
}
