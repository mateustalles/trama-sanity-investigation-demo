"use server";
import { revalidatePath } from "next/cache";
import { requireHostedUser } from "../../lib/supabase/session";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export async function savePreferences(form: FormData) {
  const user = await requireHostedUser();
  if (!user) throw new Error("Configurações por usuário exigem o modo hospedado.");
  const contextMode = form.get("contextMode") === "focused" ? "focused" : "conversational";
  const enabled = (name: string) => form.get(name) === "on";
  const { error } = await (await createSupabaseServerClient()).from("user_preferences").update({
    context_mode: contextMode,
    guided_workflows: enabled("guidedWorkflows"),
    entity_memory: enabled("entityMemory"),
    global_memory: enabled("globalMemory"),
    voice_input: enabled("voiceInput"),
    updated_at: new Date().toISOString()
  }).eq("user_id", user.id);
  if (error) throw new Error("Não foi possível salvar as configurações.");
  revalidatePath("/settings");
}
