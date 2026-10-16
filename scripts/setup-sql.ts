import { ResourceSchema, type Resource } from "../src/lib/types";

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const textArray = (values: readonly string[]) =>
  values.length === 0 ? "'{}'::text[]" : `array[${values.map(literal).join(", ")}]::text[]`;

/**
 * Menyusun supabase/setup.sql = skema + seed katalog dalam satu transaksi.
 * Seed memakai upsert, jadi aman dijalankan ulang dan tidak menyentuh sumber
 * yang ditambahkan admin lewat dashboard.
 */
export function buildSetupSql(schemaSql: string, resources: readonly Resource[]): string {
  const ids = new Set<string>();
  const rows = resources.map((raw) => {
    const r = ResourceSchema.parse(raw);
    if (ids.has(r.id)) throw new Error(`Id sumber ganda: ${r.id}`);
    ids.add(r.id);
    const p = r.price;
    return `  (${[
      literal(r.id),
      literal(r.title),
      literal(r.provider),
      literal(r.type),
      literal(r.url),
      literal(r.cost),
      textArray(r.tags),
      literal(r.level),
      literal(r.note),
      p ? String(p.min) : "null",
      p ? String(p.max) : "null",
      p ? literal(p.unit) : "null",
      literal(p?.note ?? ""),
      p?.sourceUrl ? literal(p.sourceUrl) : "null",
      p ? `${literal(p.checkedAt)}::date` : "null",
    ].join(", ")})`;
  });

  return `-- ════════════════════════════════════════════════════════════════════
-- TitikNol — setup lengkap (skema + seed katalog)
-- FILE INI DI-GENERATE oleh \`npm run db:setup-sql\`. Jangan diedit manual;
-- ubah supabase/schema.sql atau src/lib/resources.ts lalu generate ulang.
--
-- Cara pakai: Supabase → SQL Editor → tempel seluruh isi file → Run.
-- Aman dijalankan berulang kali.
-- ════════════════════════════════════════════════════════════════════

begin;

${schemaSql.trim()}

-- Seed katalog (${rows.length} sumber)
insert into public.resources (id, title, provider, type, url, cost, tags, level, note,
  price_min_idr, price_max_idr, price_unit, price_note, price_source_url, price_checked_at)
values
${rows.join(",\n")}
on conflict (id) do update set
  title = excluded.title,
  provider = excluded.provider,
  type = excluded.type,
  url = excluded.url,
  cost = excluded.cost,
  tags = excluded.tags,
  level = excluded.level,
  note = excluded.note,
  price_min_idr = excluded.price_min_idr,
  price_max_idr = excluded.price_max_idr,
  price_unit = excluded.price_unit,
  price_note = excluded.price_note,
  price_source_url = excluded.price_source_url,
  price_checked_at = excluded.price_checked_at;

commit;
`;
}
