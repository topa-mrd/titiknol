import type { ZodType } from "zod";

/** Batas ukuran body request (byte). Input terbesar: profil + 3 plan + 20 pesan. */
const MAX_BODY_BYTES = 64 * 1024;

const NO_STORE = { "cache-control": "no-store" };

export function json(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, { ...init, headers: { ...NO_STORE, ...init.headers } });
}

/** Respons error: `error` selalu kalimat yang bisa ditampilkan langsung ke pengguna. */
export function jsonError(status: number, error: string, headers: HeadersInit = {}): Response {
  return json({ error }, { status, headers });
}

export type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

export async function readJson<T>(request: Request, schema: ZodType<T>, maxBytes = MAX_BODY_BYTES): Promise<Parsed<T>> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    return { ok: false, response: jsonError(413, "Isian terlalu panjang. Coba ringkas ceritamu lalu kirim lagi.") };
  }
  const text = await request.text().catch(() => "");
  if (text.length > maxBytes) {
    return { ok: false, response: jsonError(413, "Isian terlalu panjang. Coba ringkas ceritamu lalu kirim lagi.") };
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, response: jsonError(400, "Permintaan tidak bisa dibaca. Muat ulang halaman lalu coba lagi.") };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, response: jsonError(400, userMessage(parsed.error.issues[0]?.message)) };
  }
  return { ok: true, data: parsed.data };
}

/** Pesan bawaan zod (bahasa Inggris, teknis) diganti; pesan kustom di skema sudah untuk pengguna. */
const ZOD_DEFAULT = /^(Invalid|Too (?:big|small)|Expected|Unrecognized)/;

function userMessage(message: string | undefined): string {
  return message && !ZOD_DEFAULT.test(message)
    ? message
    : "Data yang dikirim tidak lengkap. Muat ulang halaman lalu coba lagi.";
}

/** IP klien di balik proxy Vercel. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}
