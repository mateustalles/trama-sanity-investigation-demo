export function supabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function hostedAuthConfigured() {
  return process.env.TRAMA_HOSTED_TENANCY_READY === "true" && supabaseConfigured();
}

export function supabaseConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) throw new Error("A autenticação hospedada ainda não foi configurada.");
  return { url, publishableKey };
}
