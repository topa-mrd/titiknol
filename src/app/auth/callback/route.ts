import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { getSupabaseEnv } from "@/lib/supabase/env";

/** Tukar kode OAuth/konfirmasi email menjadi sesi (cookie), lalu lanjut ke `next`. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const code = searchParams.get("code");
  const env = getSupabaseEnv();

  const failed = () =>
    NextResponse.redirect(new URL(`/login?error=callback&next=${encodeURIComponent(next)}`, origin));

  if (!env || !code) return failed();

  const response = NextResponse.redirect(new URL(next, origin));
  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies, headers) => {
        for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
        // Header anti-cache dari @supabase/ssr: sesi tidak boleh di-cache CDN.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.warn("[auth/callback] gagal menukar kode:", error.code ?? error.message);
    return failed();
  }
  response.headers.set("cache-control", "private, no-store");
  return response;
}
