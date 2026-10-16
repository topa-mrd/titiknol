// Verifikasi project Supabase sungguhan dari sudut pandang client publik (anon).
//   npm run db:verify
// Membaca NEXT_PUBLIC_SUPABASE_* dari .env.local. Hanya memakai publishable/anon
// key, jadi aman dijalankan kapan saja dan tidak mengubah data.
import { createClient } from "@supabase/supabase-js";
import { RESOURCES } from "../src/lib/resources";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file tidak ada → lewati
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();

if (!url || !key) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY belum diisi di .env.local.");
  process.exit(1);
}
if (/^sb_secret_/.test(key) || /service_role/.test(Buffer.from(key.split(".")[1] ?? "", "base64url").toString())) {
  console.error("✗ Key yang dipakai adalah secret/service_role. Pakai publishable (anon) key; secret key tidak boleh ada di client.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
let failures = 0;
const pass = (msg: string) => console.log(`✓ ${msg}`);
const fail = (msg: string) => {
  failures += 1;
  console.log(`✗ ${msg}`);
};
const warn = (msg: string) => console.log(`⚠ ${msg}`);

type PgError = { code?: string; message: string } | null;
const isMissingTable = (e: PgError) => e?.code === "PGRST205" || e?.code === "42P01";
const isDenied = (e: PgError) => e?.code === "42501";

/** Anon harus ditolak (42501). Tabel hilang berarti setup.sql belum dijalankan. */
function expectDenied(label: string, error: PgError) {
  if (isDenied(error)) pass(`anon ditolak: ${label}`);
  else if (isMissingTable(error)) fail(`${label}: tabel belum ada. Jalankan supabase/setup.sql di SQL Editor.`);
  else fail(`${label}: seharusnya ditolak, ternyata ${error ? `${error.code} ${error.message}` : "berhasil"}`);
}

console.log(`Memeriksa ${new URL(url).host}\n`);

// 1. Katalog terbaca publik dan seed lengkap.
{
  // Bukan HEAD: respons HEAD tidak membawa kode error, jadi tabel hilang tak terbedakan.
  const { count, error } = await supabase.from("resources").select("id", { count: "exact" }).limit(1);
  if (isMissingTable(error)) fail("Tabel resources belum ada. Jalankan supabase/setup.sql di SQL Editor.");
  else if (error) fail(`Katalog tidak bisa dibaca anon: ${error.code} ${error.message}`);
  else if ((count ?? 0) < RESOURCES.length) fail(`Katalog berisi ${count}, seharusnya ≥ ${RESOURCES.length}. Jalankan ulang setup.sql.`);
  else pass(`Katalog terbaca publik: ${count} sumber`);
}

// 2. Data pribadi tertutup untuk anon.
expectDenied("membaca roadmaps", (await supabase.from("roadmaps").select("id").limit(1)).error);
expectDenied("membaca project_interests", (await supabase.from("project_interests").select("project_id").limit(1)).error);
expectDenied(
  "menulis roadmaps",
  (await supabase.from("roadmaps").insert({ title: "x", summary: "x", dream: "x", profile: {}, plan: {}, steps: [] })).error,
);
expectDenied("menulis katalog", (await supabase.from("resources").update({ url: "https://jahat.id" }).eq("id", "lpdp")).error);

// 2b. Perkiraan harga AI: publik boleh baca, hanya server yang menulis.
{
  const { error } = await supabase.from("price_estimates").select("resource_id").limit(1);
  if (isMissingTable(error)) fail("Tabel price_estimates belum ada. Jalankan ulang supabase/setup.sql.");
  else if (error) fail(`Perkiraan harga tidak bisa dibaca publik: ${error.code} ${error.message}`);
  else pass("Perkiraan harga AI terbaca publik");
}
expectDenied(
  "menulis perkiraan harga",
  (await supabase.from("price_estimates").insert({ resource_id: "lpdp", min_idr: 1, max_idr: 1, unit: "sekali", source_url: "https://x.id" })).error,
);

// 2c. Pencarian web & admin: kolom status ada, tabel admin/cache tertutup untuk anon.
{
  const { error } = await supabase.from("resources").select("id, origin, review_status").limit(1);
  if (error) fail(`Kolom origin/review_status belum ada: ${error.code} ${error.message}. Jalankan ulang setup.sql.`);
  else pass("Katalog punya kolom origin & review_status");
}
expectDenied("membaca daftar admin", (await supabase.from("admins").select("user_id").limit(1)).error);
expectDenied("membaca search_cache", (await supabase.from("search_cache").select("key").limit(1)).error);
expectDenied("menulis search_cache", (await supabase.from("search_cache").insert({ key: "x" })).error);
if (process.env.SUPABASE_SECRET_KEY?.trim()) pass("SUPABASE_SECRET_KEY terisi: hasil pencarian web bisa disimpan ke katalog");
else warn("SUPABASE_SECRET_KEY kosong: pencarian web Gemini dilewati (link web wajib tersimpan dulu).");
if (process.env.GEMINI_API_KEY?.trim()) pass("GEMINI_API_KEY terisi: pencarian web aktif");
else warn("GEMINI_API_KEY kosong: roadmap hanya memakai katalog yang ada.");

// 2d. Experience: lowongan publik hanya yang disetujui; mitra & lamaran tertutup untuk anon.
{
  const { error } = await supabase.from("opportunities").select("id, title, province").limit(1);
  if (isMissingTable(error)) fail("Tabel opportunities belum ada. Jalankan ulang supabase/setup.sql.");
  else if (error) fail(`Lowongan tidak bisa dibaca publik: ${error.code} ${error.message}`);
  else pass("Lowongan (yang disetujui) terbaca publik");
}
expectDenied("membaca organizations", (await supabase.from("organizations").select("id").limit(1)).error);
expectDenied("membaca applications", (await supabase.from("applications").select("id").limit(1)).error);
expectDenied(
  "membuat lowongan tanpa login",
  (await supabase.from("opportunities").insert({ org_id: "00000000-0000-4000-8000-000000000000", title: "xxx", category: "desain", kind: "magang", description: "x".repeat(30), stipend: "Rp1", duration: "1 bulan" })).error,
);

// 3. Cerita publik, tapi tanpa user_id dan tanpa hak tulis.
{
  const { data, error } = await supabase
    .from("stories")
    .select("id, author_name, kind, title, summary, body, tags, contact, status, published_at, created_at")
    .limit(20);
  if (isMissingTable(error)) fail("Tabel stories belum ada. Jalankan supabase/setup.sql di SQL Editor.");
  else if (error?.code === "42703" || error?.code === "PGRST204") fail("Kolom Blog & Komunitas belum ada. Jalankan npm run db:apply.");
  else if (error) fail(`Cerita tidak bisa dibaca publik: ${error.code} ${error.message}`);
  else if ((data ?? []).some((r) => r.status !== "terbit")) fail("Publik bisa membaca draf atau tulisan yang diturunkan");
  else pass("Tulisan terbit terbaca publik (kolom aman, draf tersembunyi)");
}
expectDenied("melihat user_id penulis cerita", (await supabase.from("stories").select("user_id").limit(1)).error);
expectDenied(
  "menulis cerita",
  (await supabase.from("stories").insert({ author_name: "x", kind: "artikel", title: "xxx", body: "x".repeat(30) })).error,
);

// 4. Pengaturan Auth yang memengaruhi demo.
try {
  const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
  const settings = (await res.json()) as { external?: Record<string, boolean>; mailer_autoconfirm?: boolean };
  if (settings.external?.email) pass("Login email aktif");
  else fail("Login email belum aktif (Authentication → Sign In / Providers → Email).");
  if (settings.mailer_autoconfirm) pass('"Confirm email" mati, daftar langsung bisa login');
  else warn('"Confirm email" masih menyala; SMTP bawaan Supabase dibatasi dan bisa macet saat demo.');
  if (settings.external?.google) pass("Login Google aktif");
  else warn("Login Google belum aktif (Authentication → Providers → Google).");
} catch (error) {
  warn(`Pengaturan Auth tidak bisa dibaca: ${error instanceof Error ? error.message : error}`);
}

console.log(failures === 0 ? "\nDatabase siap dipakai." : `\n${failures} pemeriksaan gagal.`);
process.exit(failures === 0 ? 0 : 1);
