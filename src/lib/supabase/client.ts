import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

let client: SupabaseClient | null = null;

/** Client Supabase untuk browser (sesi di cookie, PKCE untuk OAuth). Null di mode demo. */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client) return client;
  const env = getSupabaseEnv();
  if (!env) return null;
  client = createBrowserClient(env.url, env.key);
  return client;
}
