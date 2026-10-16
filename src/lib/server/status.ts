import { readAiConfig } from "../ai/providers";
import { getSupabaseEnv } from "../supabase/env";
import type { StatusResponse } from "../types";

export function getStatus(env: Record<string, string | undefined> = process.env): StatusResponse {
  return { ai: readAiConfig(env).provider, supabase: getSupabaseEnv() !== null };
}
