"use server";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient, isBetaAdministrator } from "../../lib/supabase/admin";
import { requireHostedUser } from "../../lib/supabase/session";

export async function inviteBetaUser(form: FormData) {
  const user = await requireHostedUser();
  if (!user || !isBetaAdministrator(user.email)) throw new Error("Acesso administrativo necessário.");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const displayName = String(form.get("displayName") ?? "").trim();
  const { error } = await createSupabaseAdminClient().auth.admin.inviteUserByEmail(email, { data: { display_name: displayName || email.split("@")[0] } });
  if (error) redirect(`/admin?error=${encodeURIComponent("Não foi possível enviar o convite.")}`);
  redirect(`/admin?success=${encodeURIComponent(`Convite enviado para ${email}.`)}`);
}
