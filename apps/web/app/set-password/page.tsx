import { redirect } from "next/navigation";
import { currentHostedUser } from "../../lib/supabase/session";
import { definePassword } from "./actions";

export default async function DefinePasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!await currentHostedUser()) redirect("/login");
  const { error } = await searchParams;
  return <main className="loginPage"><section className="loginPaper">
    <p className="kicker">Primeiro acesso</p><h1>Defina sua senha</h1><p>Use pelo menos 10 caracteres. A senha será enviada diretamente ao Supabase e nunca será armazenada pelo Trama.</p>
    {error && <div className="loginError" role="alert">{error}</div>}
    <form action={definePassword} className="paperForm"><label>Nova senha<input name="password" type="password" minLength={10} autoComplete="new-password" required /></label><label>Repita a senha<input name="confirmation" type="password" minLength={10} autoComplete="new-password" required /></label><button type="submit">Salvar e entrar</button></form>
  </section></main>;
}
