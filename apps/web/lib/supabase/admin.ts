import { createClient } from "@supabase/supabase-js";
import { supabaseConfiguration } from "./config";

export function createSupabaseAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY não foi configurada no servidor.");
  const { url } = supabaseConfiguration();
  return createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function isBetaAdministrator(email: string | undefined) {
  const allowed = (process.env.TRAMA_ADMIN_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  return Boolean(email && allowed.includes(email.toLowerCase()));
}
