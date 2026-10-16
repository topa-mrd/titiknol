// Jalankan supabase/setup.sql ke database Supabase:  npm run db:apply
// Membaca SUPABASE_DB_URL dari .env.local (hanya untuk mesin developer, tidak
// dipakai aplikasi). Nilainya tidak pernah dicetak. Memakai psql lokal bila
// ada, jika tidak lewat Docker (image postgres:17-alpine).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file tidak ada → lewati
  }
}

const dbUrl = process.env.SUPABASE_DB_URL?.trim();
if (!dbUrl) {
  console.error(
    "✗ SUPABASE_DB_URL belum diisi di .env.local.\n" +
      "  Ambil dari Supabase → Connect → Session pooler (bukan Direct connection), lalu ganti [YOUR-PASSWORD].",
  );
  process.exit(1);
}

let host = "";
try {
  const url = new URL(dbUrl);
  host = url.hostname;
  if (!/^postgres(ql)?:$/.test(url.protocol)) throw new Error("protokol");
  if (url.password === "" || /YOUR-PASSWORD/i.test(dbUrl)) {
    console.error("✗ Password database di SUPABASE_DB_URL belum diisi (masih [YOUR-PASSWORD]).");
    process.exit(1);
  }
} catch {
  console.error("✗ SUPABASE_DB_URL bukan connection string Postgres yang valid.");
  process.exit(1);
}
if (/^db\..+\.supabase\.co$/.test(host)) {
  console.warn(
    "⚠ Ini Direct connection (hanya IPv6). Kalau gagal tersambung, pakai string Session pooler (…pooler.supabase.com).",
  );
}

const setupSql = readFileSync(fileURLToPath(new URL("../supabase/setup.sql", import.meta.url)), "utf8");
const psqlArgs = ["-v", "ON_ERROR_STOP=1", "-q", "-X"];
const hasLocalPsql = spawnSync("psql", ["--version"], { stdio: "ignore" }).status === 0;

console.log(`Menjalankan supabase/setup.sql ke ${host} …`);
const result = hasLocalPsql
  ? spawnSync("psql", [...psqlArgs, "-d", dbUrl], { input: setupSql, stdio: ["pipe", "inherit", "inherit"] })
  : spawnSync(
      "docker",
      ["run", "--rm", "-i", "-e", "SUPABASE_DB_URL", "docker.io/library/postgres:17-alpine", "sh", "-c", `psql ${psqlArgs.join(" ")} -d "$SUPABASE_DB_URL"`],
      { input: setupSql, stdio: ["pipe", "inherit", "inherit"], env: { ...process.env, SUPABASE_DB_URL: dbUrl } },
    );

if (result.error) {
  console.error(`✗ Tidak bisa menjalankan ${hasLocalPsql ? "psql" : "docker"}: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error("✗ setup.sql gagal dijalankan (lihat pesan di atas). Database tidak berubah karena semuanya satu transaksi.");
  process.exit(result.status ?? 1);
}
console.log("✓ setup.sql selesai. Cek hasilnya: npm run db:verify");
