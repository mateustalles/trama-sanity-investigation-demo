import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfiguration } from "./config";

export async function createSupabaseServerClient() {
  const store = await cookies();
  const { url, publishableKey } = supabaseConfiguration();
  return createServerClient(url, publishableKey, { cookies: {
    getAll: () => store.getAll(),
    setAll: (values) => { try { values.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* proxy refresh */ } }
  }});
}
