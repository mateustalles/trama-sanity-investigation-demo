"use server";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { accountHome } from "../../lib/supabase/demo-judge";

export async function definePassword(form: FormData) {
  const password = String(form.get("password") ?? "");
  const confirmation = String(form.get("confirmation") ?? "");
  if (password.length < 10) redirect("/set-password?error=Use%20at%20least%2010%20characters.");
  if (password !== confirmation) redirect("/set-password?error=Passwords%20do%20not%20match.");
  const { data, error } = await (await createSupabaseServerClient()).auth.updateUser({ password });
  if (error) redirect("/set-password?error=Your%20password%20could%20not%20be%20saved.");
  redirect(accountHome(data.user));
}
