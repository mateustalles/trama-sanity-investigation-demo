import { redirect } from "next/navigation";
import { currentHostedUser } from "../../lib/supabase/session";
import { definePassword } from "./actions";

export default async function DefinePasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!await currentHostedUser()) redirect("/login");
  const { error } = await searchParams;
  return <main className="loginPage"><section className="loginPaper">
    <p className="kicker">Account setup</p><h1>Set your password</h1><p>Use at least 10 characters. Supabase Auth manages your password; Trama does not store the plaintext password.</p>
    {error && <div className="loginError" role="alert">{error}</div>}
    <form action={definePassword} className="paperForm"><label>New password<input name="password" type="password" minLength={10} autoComplete="new-password" required /></label><label>Confirm password<input name="confirmation" type="password" minLength={10} autoComplete="new-password" required /></label><button type="submit">Save and continue</button></form>
  </section></main>;
}
