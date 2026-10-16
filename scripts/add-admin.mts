// Daftarkan akun Supabase sebagai admin katalog:  npm run admin:add -- email@contoh.com
// Hapus:  npm run admin:add -- --remove email@contoh.com
// Memakai SUPABASE_DB_URL dari .env.local (mesin developer saja). Akunnya harus
// sudah pernah daftar/masuk di aplikasi. Email dikirim sebagai parameter psql,
// bukan disisipkan ke teks SQL.
import { spawnSync } from "node:child_process";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file tidak ada → lewati
  }
}

const args = process.argv.slice(2);
const remove = args.includes("--remove");
const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error("✗ Pakai: npm run admin:add -- email@contoh.com   (atau --remove email@contoh.com)");
  process.exit(1);
}
const dbUrl = process.env.SUPABASE_DB_URL?.trim();
if (!dbUrl) {
  console.error("✗ SUPABASE_DB_URL belum diisi di .env.local.");
  process.exit(1);
}

const sql = remove
  ? `delete from public.admins a using auth.users u where a.user_id = u.id and lower(u.email) = lower(:'email') returning u.email;`
  : `insert into public.admins (user_id)
       select id from auth.users where lower(email) = lower(:'email')
     on conflict (user_id) do nothing
     returning user_id;
     select case when exists (select 1 from public.admins a join auth.users u on u.id = a.user_id where lower(u.email) = lower(:'email'))
       then 'ADMIN_OK' else 'AKUN_TIDAK_ADA' end as status;`;

const psqlArgs = ["-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A", "-v", `email=${email}`];
const hasLocalPsql = spawnSync("psql", ["--version"], { stdio: "ignore" }).status === 0;
const result = hasLocalPsql
  ? spawnSync("psql", [...psqlArgs, "-d", dbUrl], { input: sql, encoding: "utf8" })
  : spawnSync(
      "docker",
      ["run", "--rm", "-i", "-e", "SUPABASE_DB_URL", "docker.io/library/postgres:17-alpine", "psql", ...psqlArgs, "-d", dbUrl],
      { input: sql, encoding: "utf8", env: { ...process.env, SUPABASE_DB_URL: dbUrl } },
    );

if (result.error || result.status !== 0) {
  console.error(`✗ Gagal: ${result.error?.message ?? result.stderr?.trim() ?? "lihat pesan psql"}`);
  process.exit(1);
}
const out = result.stdout ?? "";
if (remove) {
  console.log(out.trim() ? `✓ ${email} bukan admin lagi.` : `• ${email} memang bukan admin.`);
} else if (out.includes("ADMIN_OK")) {
  console.log(`✓ ${email} sekarang admin. Buka /admin setelah masuk.`);
} else {
  console.error(`✗ Akun ${email} belum ada. Daftar/masuk dulu di aplikasi dengan email itu, lalu ulangi.`);
  process.exit(1);
}
