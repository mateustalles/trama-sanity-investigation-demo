"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { accountHome } from "../../lib/supabase/demo-judge";

export async function definePassword(form: FormData) {
  const password = String(form.get("password") ?? "");
  const confirmation = String(form.get("confirmation") ?? "");
  if (password.length < 10) redirect("/set-password?error=A%20senha%20precisa%20ter%20pelo%20menos%2010%20caracteres.");
  if (password !== confirmation) redirect("/set-password?error=As%20senhas%20n%C3%A3o%20coincidem.");
  const { data, error } = await (await createSupabaseServerClient()).auth.updateUser({ password });
  if (error) redirect("/set-password?error=N%C3%A3o%20foi%20poss%C3%ADvel%20salvar%20a%20senha.");
  redirect(accountHome(data.user));
}
