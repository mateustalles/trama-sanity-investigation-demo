import Link from "next/link";
import { notFound } from "next/navigation";
import { isBetaAdministrator } from "../../lib/supabase/admin";
import { requireHostedUser } from "../../lib/supabase/session";
import { inviteBetaUser } from "./actions";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const user = await requireHostedUser();
  if (!user || !isBetaAdministrator(user.email)) notFound();
  const result = await searchParams;
  return <main className="settingsPage"><section className="settingsPaper"><Link href="/">← Voltar à Mesa</Link><p className="kicker">Beta fechado</p><h1>Convidar uma pessoa</h1><p>O convite expira conforme a política do Supabase e cria um Workspace pessoal no primeiro acesso.</p>
    {result.error && <div className="loginError">{result.error}</div>}{result.success && <div className="settingsSuccess">{result.success}</div>}
    <form action={inviteBetaUser} className="paperForm"><label>Nome<input name="displayName" /></label><label>E-mail<input name="email" type="email" required /></label><button type="submit">Enviar convite</button></form>
  </section></main>;
}
