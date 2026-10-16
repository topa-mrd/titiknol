// Generate supabase/setup.sql dari schema.sql + katalog di src/lib/resources.ts.
//   npm run db:setup-sql            → tulis ulang setup.sql
//   npm run db:setup-sql -- --check → gagal jika setup.sql belum diperbarui
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RESOURCES } from "../src/lib/resources";
import { buildSetupSql } from "./setup-sql";

const root = fileURLToPath(new URL("..", import.meta.url));
const schemaPath = `${root}supabase/schema.sql`;
const setupPath = `${root}supabase/setup.sql`;

const next = buildSetupSql(readFileSync(schemaPath, "utf8"), RESOURCES);

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(setupPath, "utf8");
  } catch {
    // file belum ada → dianggap basi
  }
  if (current !== next) {
    console.error("supabase/setup.sql belum diperbarui. Jalankan: npm run db:setup-sql");
    process.exit(1);
  }
  console.log("supabase/setup.sql sudah sesuai.");
} else {
  writeFileSync(setupPath, next);
  console.log(`supabase/setup.sql ditulis (${RESOURCES.length} sumber).`);
}
