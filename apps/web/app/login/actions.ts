"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "../../lib/supabase/server";
import { accountHome } from "../../lib/supabase/demo-judge";

export async function signIn(form: FormData) {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const { data, error } = await (await createSupabaseServerClient()).auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent("E-mail ou senha inválidos.")}`);
  redirect(accountHome(data.user));
}

export async function requestPasswordReset(form: FormData) {
  const email = String(form.get("email") ?? "").trim();
  // Keep the response generic so this route does not disclose beta membership.
  if (!email) redirect(`/login?error=${encodeURIComponent("Informe seu e-mail para receber o link de redefinição.")}`);
  const requestHeaders = await headers();
  const requestOrigin = requestHeaders.get("origin");
  const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const forwardedProtocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  // A temporary Cloudflare tunnel changes on every run; prefer the public origin
  // used for this request instead of a stale localhost development setting.
  const baseUrl = (requestOrigin
    ? requestOrigin
    : forwardedHost
    ? `${forwardedProtocol}://${forwardedHost}`
    : process.env.TRAMA_PUBLIC_URL ?? "http://localhost:3000").replace(/\/$/, "");
  await (await createSupabaseServerClient()).auth.resetPasswordForEmail(email, {
    redirectTo: `${baseUrl}/auth/callback`
  });
  redirect(`/login?error=${encodeURIComponent("Se houver uma conta para este e-mail, enviamos um link de redefinição.")}`);
}

export async function signOut() {
  await (await createSupabaseServerClient()).auth.signOut();
  redirect("/login");
}
