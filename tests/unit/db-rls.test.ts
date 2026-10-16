import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RESOURCES } from "@/lib/resources";
import { buildSetupSql } from "../../scripts/setup-sql";
import { plans, profile, roadmap } from "../fixtures/data";

/**
 * Menjalankan supabase/setup.sql di Postgres lokal (PGlite) dengan stub
 * lingkungan Supabase: role anon/authenticated, tabel auth.users, dan
 * auth.uid() yang membaca klaim `sub` dari request.jwt.claims seperti aslinya.
 */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

const setupPath = new URL("../../supabase/setup.sql", import.meta.url);
const schemaPath = new URL("../../supabase/schema.sql", import.meta.url);
const setupSql = readFileSync(setupPath, "utf8");

const USER_A = "00000000-0000-4000-8000-00000000000a";
const USER_B = "00000000-0000-4000-8000-00000000000b";

const DENIED = /permission denied/;
const RLS_VIOLATION = /row-level security/;
/** Ditolak trigger applications_guard (errcode 42501) karena transisi status tidak sah. */
const STATUS_DENIED = /tidak diizinkan/;

let db: PGlite;

/** Menjalankan `fn` sebagai role Supabase tertentu, lalu kembali ke superuser. */
async function as<T>(role: "anon" | "authenticated", userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    userId ? JSON.stringify({ sub: userId, role }) : JSON.stringify({ role }),
  ]);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

const asUser = <T>(userId: string, fn: () => Promise<T>) => as("authenticated", userId, fn);
const asAnon = <T>(fn: () => Promise<T>) => as("anon", null, fn);

const roadmapValues = () => [
  roadmap.title,
  roadmap.summary,
  profile.dream,
  JSON.stringify(profile),
  JSON.stringify(plans[0]),
  JSON.stringify(roadmap.steps),
];
const INSERT_ROADMAP = `
  insert into public.roadmaps (title, summary, dream, profile, plan, steps)
  values ($1, $2, $3, $4, $5, $6) returning id, user_id`;

const count = async (sql: string, params: unknown[] = []) =>
  Number((await db.query<{ n: number | string }>(sql, params)).rows[0].n);

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(SUPABASE_STUB);
  await db.query("insert into auth.users (id) values ($1), ($2)", [USER_A, USER_B]);
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe("setup.sql", () => {
  it("sesuai dengan schema.sql + katalog terbaru (jalankan npm run db:setup-sql bila gagal)", () => {
    expect(setupSql).toBe(buildSetupSql(readFileSync(schemaPath, "utf8"), RESOURCES));
  });

  it("berjalan dua kali tanpa error dan tidak menggandakan seed", async () => {
    await db.exec(setupSql);
    await db.exec(setupSql);
    expect(await count("select count(*) as n from public.resources")).toBe(RESOURCES.length);
    const tables = await db.query<{ tablename: string; rowsecurity: boolean }>(
      "select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename",
    );
    expect(tables.rows).toEqual([
      { tablename: "admins", rowsecurity: true },
      { tablename: "applications", rowsecurity: true },
      { tablename: "opportunities", rowsecurity: true },
      { tablename: "organizations", rowsecurity: true },
      { tablename: "price_estimates", rowsecurity: true },
      { tablename: "project_interests", rowsecurity: true },
      { tablename: "resources", rowsecurity: true },
      { tablename: "roadmaps", rowsecurity: true },
      { tablename: "search_cache", rowsecurity: true },
      { tablename: "stories", rowsecurity: true },
    ]);
  });
});

describe("RLS resources", () => {
  it("anon dan pengguna login bisa membaca katalog aktif", async () => {
    expect(await asAnon(() => count("select count(*) as n from public.resources"))).toBe(RESOURCES.length);
    expect(await asUser(USER_A, () => count("select count(*) as n from public.resources"))).toBe(RESOURCES.length);
  });

  it("sumber nonaktif disembunyikan", async () => {
    await db.query("update public.resources set is_active = false where id = $1", [RESOURCES[0].id]);
    expect(await asAnon(() => count("select count(*) as n from public.resources"))).toBe(RESOURCES.length - 1);
    await db.query("update public.resources set is_active = true where id = $1", [RESOURCES[0].id]);
  });

  it("anon dan pengguna login tidak bisa menulis katalog", async () => {
    const insert = "insert into public.resources (id, title, provider, type, url, cost) values ('x', 'X', 'X', 'kursus', 'https://x.id', 'Gratis')";
    await expect(asAnon(() => db.query(insert))).rejects.toThrow(DENIED);
    await expect(asUser(USER_A, () => db.query(insert))).rejects.toThrow(DENIED);
    // Kolom isi boleh di-update oleh role authenticated, tapi RLS hanya meloloskan admin:
    // pengguna biasa mengenai 0 baris dan datanya tetap.
    const hijack = await asUser(USER_A, () =>
      db.query("update public.resources set url = 'https://jahat.id' where id = $1", [RESOURCES[0].id]),
    );
    expect(hijack.affectedRows).toBe(0);
    const url = await db.query<{ url: string }>("select url from public.resources where id = $1", [RESOURCES[0].id]);
    expect(url.rows[0].url).toBe(RESOURCES[0].url);
    await expect(
      asAnon(() => db.query("update public.resources set url = 'https://jahat.id' where id = $1", [RESOURCES[0].id])),
    ).rejects.toThrow(DENIED);
    await expect(asUser(USER_A, () => db.query("delete from public.resources"))).rejects.toThrow(DENIED);
  });

  it("menyimpan harga kurasi dari seed dan menolak harga yang tidak masuk akal", async () => {
    const aws = await db.query<{ price_min_idr: number; price_unit: string; price_source_url: string }>(
      "select price_min_idr, price_unit, price_source_url from public.resources where id = 'aws-cloud-practitioner'",
    );
    expect(aws.rows[0]).toMatchObject({ price_min_idr: 1600000, price_unit: "sekali" });
    expect(aws.rows[0].price_source_url).toMatch(/^https:\/\//);
    const free = await db.query<{ price_max_idr: number }>("select price_max_idr from public.resources where id = 'freecodecamp'");
    expect(free.rows[0].price_max_idr).toBe(0);
    await expect(
      db.query("update public.resources set price_min_idr = 500, price_max_idr = 100 where id = 'lpdp'"),
    ).rejects.toThrow(/check constraint/);
    await expect(db.query("update public.resources set price_unit = 'per abad' where id = 'lpdp'")).rejects.toThrow(
      /check constraint/,
    );
  });

  it("menolak URL non-https dari dashboard sekalipun", async () => {
    await expect(
      db.query("update public.resources set url = 'javascript:alert(1)' where id = $1", [RESOURCES[0].id]),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("RLS admins & pemeriksaan katalog", () => {
  const WEB_ID = "web-contoh-kursus";
  beforeAll(async () => {
    await db.query("insert into public.admins (user_id) values ($1) on conflict do nothing", [USER_B]);
    await db.query(
      `insert into public.resources (id, title, provider, type, url, cost, tags, origin, review_status, source_query)
       values ($1, 'Kursus Contoh', 'Penyelenggara Contoh', 'kursus', 'https://contoh.id/kursus', 'Gratis', '{kursus}', 'web', 'belum_dicek', 'kursus:contoh')
       on conflict (id) do nothing`,
      [WEB_ID],
    );
  });

  it("pengguna hanya bisa melihat baris admin miliknya; anon tidak bisa sama sekali", async () => {
    expect(await asUser(USER_A, () => count("select count(*) as n from public.admins"))).toBe(0);
    expect(await asUser(USER_B, () => count("select count(*) as n from public.admins"))).toBe(1);
    await expect(asAnon(() => db.query("select * from public.admins"))).rejects.toThrow(DENIED);
    await expect(asUser(USER_A, () => db.query("insert into public.admins (user_id) values ($1)", [USER_A]))).rejects.toThrow(DENIED);
  });

  it("is_admin() benar hanya untuk admin", async () => {
    const check = async (userId: string) =>
      (await asUser(userId, () => db.query<{ ok: boolean }>("select public.is_admin() as ok"))).rows[0].ok;
    expect(await check(USER_A)).toBe(false);
    expect(await check(USER_B)).toBe(true);
  });

  it("admin bisa merevisi dan menyetujui sumber web; pengguna lain tidak", async () => {
    const byA = await asUser(USER_A, () =>
      db.query("update public.resources set review_status = 'disetujui' where id = $1", [WEB_ID]),
    );
    expect(byA.affectedRows).toBe(0);

    const byB = await asUser(USER_B, () =>
      db.query(
        "update public.resources set url = 'https://contoh.id/kursus-baru', review_status = 'disetujui', reviewed_by = $2, reviewed_at = now() where id = $1",
        [WEB_ID, USER_B],
      ),
    );
    expect(byB.affectedRows).toBe(1);
    const row = await db.query<{ url: string; review_status: string; is_active: boolean }>(
      "select url, review_status, is_active from public.resources where id = $1",
      [WEB_ID],
    );
    expect(row.rows[0]).toEqual({ url: "https://contoh.id/kursus-baru", review_status: "disetujui", is_active: true });
  });

  it("admin tidak bisa mengatasnamakan admin lain atau mengubah id/asal/harga", async () => {
    await expect(
      asUser(USER_B, () => db.query("update public.resources set reviewed_by = $2 where id = $1", [WEB_ID, USER_A])),
    ).rejects.toThrow(RLS_VIOLATION);
    await expect(asUser(USER_B, () => db.query("update public.resources set origin = 'kurasi' where id = $1", [WEB_ID]))).rejects.toThrow(DENIED);
    await expect(asUser(USER_B, () => db.query("update public.resources set price_min_idr = 1 where id = $1", [WEB_ID]))).rejects.toThrow(DENIED);
  });

  it("sumber ditolak jadi nonaktif: hilang dari publik, tetap terlihat oleh admin", async () => {
    await asUser(USER_B, () => db.query("update public.resources set review_status = 'ditolak' where id = $1", [WEB_ID]));
    expect(await asAnon(() => count("select count(*) as n from public.resources where id = $1", [WEB_ID]))).toBe(0);
    expect(await asUser(USER_A, () => count("select count(*) as n from public.resources where id = $1", [WEB_ID]))).toBe(0);
    expect(await asUser(USER_B, () => count("select count(*) as n from public.resources where id = $1", [WEB_ID]))).toBe(1);
    await asUser(USER_B, () => db.query("update public.resources set review_status = 'belum_dicek' where id = $1", [WEB_ID]));
    expect(await asAnon(() => count("select count(*) as n from public.resources where id = $1", [WEB_ID]))).toBe(1);
  });

  it("search_cache hanya ditulis server; admin boleh membaca", async () => {
    await db.query("insert into public.search_cache (key, resource_ids) values ('kursus:contoh', $1) on conflict do nothing", [[WEB_ID]]);
    await expect(asAnon(() => db.query("select * from public.search_cache"))).rejects.toThrow(DENIED);
    expect(await asUser(USER_A, () => count("select count(*) as n from public.search_cache"))).toBe(0);
    expect(await asUser(USER_B, () => count("select count(*) as n from public.search_cache"))).toBe(1);
    await expect(
      asUser(USER_B, () => db.query("insert into public.search_cache (key) values ('x')")),
    ).rejects.toThrow(DENIED);
  });
});

describe("RLS experience: mitra, lowongan, lamaran", () => {
  const MITRA = "00000000-0000-4000-8000-00000000000c";
  const MITRA_LAIN = "00000000-0000-4000-8000-00000000000d";
  const ADMIN = USER_B; // dijadikan admin di blok "RLS admins"
  const TALENTA = USER_A;
  let orgId = "";
  let oppId = "";
  let appId = "";

  const ORG = "insert into public.organizations (name, kind, province, city, contact_name, contact) values ($1, 'umkm', 'Jawa Timur', 'Kediri', 'Bu Sri', '081234567890') returning id, owner_id";
  const OPP = `insert into public.opportunities (org_id, title, category, kind, province, city, description, stipend, duration, slots)
    values ($1, 'Desainer menu', 'desain', 'proyek', 'Jawa Timur', 'Kediri', 'Rancang ulang menu cetak dan media sosial kedai.', 'Rp400.000', '2 minggu', 2)
    returning id, review_status, org_name`;
  const APPLY = `insert into public.applications (opportunity_id, applicant_name, contact, motivation)
    values ($1, 'Rina', '081111111111', 'Saya ingin belajar desain menu untuk usaha kecil.') returning id, status, opportunity_title`;
  const visible = (who: string) =>
    asUser(who, () => count("select count(*) as n from public.applications where id = $1", [appId]));
  const setStatus = (who: string, status: string, note?: [string, string]) =>
    asUser(who, () =>
      db.query(`update public.applications set status = $2${note ? `, ${note[0]} = $3` : ""} where id = $1`, note ? [appId, status, note[1]] : [appId, status]),
    );
  const statusNow = async () =>
    (await db.query<{ status: string; admin_note: string; org_note: string }>("select status, admin_note, org_note from public.applications where id = $1", [appId])).rows[0];

  beforeAll(async () => {
    await db.query("insert into auth.users (id) values ($1), ($2) on conflict do nothing", [MITRA, MITRA_LAIN]);
    await db.query("insert into public.admins (user_id) values ($1) on conflict do nothing", [ADMIN]);
  });

  it("mitra membuat organisasinya sendiri; orang lain dan anon tidak bisa melihatnya, admin bisa", async () => {
    const org = await asUser(MITRA, () => db.query<{ id: string; owner_id: string }>(ORG, ["Kedai Kopi Senja"]));
    orgId = org.rows[0].id;
    expect(org.rows[0].owner_id).toBe(MITRA);
    expect(await asUser(TALENTA, () => count("select count(*) as n from public.organizations"))).toBe(0);
    expect(await asUser(ADMIN, () => count("select count(*) as n from public.organizations where id = $1", [orgId]))).toBe(1);
    await expect(asAnon(() => db.query("select * from public.organizations"))).rejects.toThrow(DENIED);
    const hijack = await asUser(MITRA_LAIN, () => db.query("update public.organizations set name = 'Diambil alih' where id = $1", [orgId]));
    expect(hijack.affectedRows).toBe(0);
    await expect(asUser(MITRA, () => db.query(ORG, ["Organisasi kedua"]))).rejects.toThrow(/duplicate key/);
  });

  it("lowongan baru selalu menunggu verifikasi dan tidak tampil sampai admin menyetujui", async () => {
    const opp = await asUser(MITRA, () => db.query<{ id: string; review_status: string; org_name: string }>(OPP, [orgId]));
    oppId = opp.rows[0].id;
    expect(opp.rows[0]).toMatchObject({ review_status: "menunggu", org_name: "Kedai Kopi Senja" });
    expect(await asAnon(() => count("select count(*) as n from public.opportunities where id = $1", [oppId]))).toBe(0);

    // Mitra tidak bisa menyetujui sendiri.
    await asUser(MITRA, () => db.query("update public.opportunities set review_status = 'disetujui' where id = $1", [oppId]));
    expect(await asAnon(() => count("select count(*) as n from public.opportunities where id = $1", [oppId]))).toBe(0);
    // Mitra lain tidak bisa membuat lowongan atas nama organisasi ini.
    await expect(asUser(MITRA_LAIN, () => db.query(OPP, [orgId]))).rejects.toThrow(RLS_VIOLATION);

    await asUser(ADMIN, () => db.query("update public.opportunities set review_status = 'disetujui' where id = $1", [oppId]));
    expect(await asAnon(() => count("select count(*) as n from public.opportunities where id = $1", [oppId]))).toBe(1);
  });

  it("mitra mengubah isi lowongan yang sudah disetujui → kembali menunggu verifikasi", async () => {
    await asUser(MITRA, () => db.query("update public.opportunities set stipend = 'Rp9.000.000' where id = $1", [oppId]));
    expect(await asAnon(() => count("select count(*) as n from public.opportunities where id = $1", [oppId]))).toBe(0);
    await asUser(ADMIN, () => db.query("update public.opportunities set review_status = 'disetujui' where id = $1", [oppId]));
    // Menutup lowongan tidak memicu verifikasi ulang, tapi menyembunyikannya.
    await asUser(MITRA, () => db.query("update public.opportunities set closed = true where id = $1", [oppId]));
    expect(await asAnon(() => count("select count(*) as n from public.opportunities where id = $1", [oppId]))).toBe(0);
    await asUser(MITRA, () => db.query("update public.opportunities set closed = false where id = $1", [oppId]));
    expect(await asAnon(() => count("select count(*) as n from public.opportunities where id = $1", [oppId]))).toBe(1);
  });

  it("talenta mendaftar: status awal dikirim, belum terlihat mitra; tidak bisa daftar dua kali", async () => {
    const app = await asUser(TALENTA, () => db.query<{ id: string; status: string; opportunity_title: string }>(APPLY, [oppId]));
    appId = app.rows[0].id;
    expect(app.rows[0]).toMatchObject({ status: "dikirim", opportunity_title: "Desainer menu" });
    expect(await visible(TALENTA)).toBe(1);
    expect(await visible(MITRA)).toBe(0);
    expect(await visible(MITRA_LAIN)).toBe(0);
    expect(await visible(ADMIN)).toBe(1);
    await expect(asUser(TALENTA, () => db.query(APPLY, [oppId]))).rejects.toThrow(/duplicate key/);
    await expect(asAnon(() => db.query("select * from public.applications"))).rejects.toThrow(DENIED);
  });

  it("tidak bisa mendaftar ke lowongan yang menunggu atau ditutup", async () => {
    const pending = await asUser(MITRA, () => db.query<{ id: string }>(OPP, [orgId]));
    await expect(asUser(TALENTA, () => db.query(APPLY, [pending.rows[0].id]))).rejects.toThrow(/ditutup atau belum dibuka/);
  });

  it("talenta tidak bisa menaikkan status lamarannya sendiri; mitra belum boleh menyentuhnya", async () => {
    await expect(setStatus(TALENTA, "diterima")).rejects.toThrow(STATUS_DENIED);
    await expect(setStatus(TALENTA, "diteruskan")).rejects.toThrow(STATUS_DENIED);
    const byOrg = await setStatus(MITRA, "diterima");
    expect(byOrg.affectedRows).toBe(0);
    expect((await statusNow()).status).toBe("dikirim");
  });

  it("admin meneruskan ke mitra dengan catatan; baru setelah itu mitra melihat pendaftar", async () => {
    await setStatus(ADMIN, "diproses");
    await setStatus(ADMIN, "diteruskan", ["admin_note", "Portofolio bagus, cocok untuk menu."]);
    expect(await statusNow()).toMatchObject({ status: "diteruskan", admin_note: "Portofolio bagus, cocok untuk menu." });
    expect(await visible(MITRA)).toBe(1);
    expect(await visible(MITRA_LAIN)).toBe(0);
    // Setelah diteruskan, talenta tidak bisa membatalkan sendiri.
    await expect(setStatus(TALENTA, "dibatalkan")).rejects.toThrow(STATUS_DENIED);
  });

  it("mitra mengelola talenta: diterima → bekerja → selesai; tidak bisa mengubah catatan admin", async () => {
    await setStatus(MITRA, "diterima", ["org_note", "Mulai Senin depan."]);
    await setStatus(MITRA, "bekerja");
    await asUser(MITRA, () => db.query("update public.applications set admin_note = 'dipalsukan' where id = $1", [appId]));
    expect(await statusNow()).toMatchObject({ status: "bekerja", org_note: "Mulai Senin depan.", admin_note: "Portofolio bagus, cocok untuk menu." });
    await expect(setStatus(MITRA, "diteruskan")).rejects.toThrow(STATUS_DENIED);
    await setStatus(MITRA, "selesai");
    expect((await statusNow()).status).toBe("selesai");
  });

  it("isi lamaran tidak bisa diubah siapa pun", async () => {
    await expect(
      asUser(TALENTA, () => db.query("update public.applications set motivation = 'diubah diam-diam sekali' where id = $1", [appId])),
    ).rejects.toThrow(DENIED);
  });

  it("talenta boleh membatalkan selama belum diteruskan", async () => {
    await asUser(ADMIN, () => db.query("update public.opportunities set review_status = 'disetujui' where org_id = $1", [orgId]));
    const other = await asUser(MITRA, () => db.query<{ id: string }>("select id from public.opportunities where id <> $1 limit 1", [oppId]));
    const app = await asUser(TALENTA, () => db.query<{ id: string }>(APPLY, [other.rows[0].id]));
    await asUser(TALENTA, () => db.query("update public.applications set status = 'dibatalkan' where id = $1", [app.rows[0].id]));
    const row = await db.query<{ status: string }>("select status from public.applications where id = $1", [app.rows[0].id]);
    expect(row.rows[0].status).toBe("dibatalkan");
  });
});

describe("RLS roadmaps", () => {
  let roadmapA: string;

  beforeAll(async () => {
    const res = await asUser(USER_A, () => db.query<{ id: string; user_id: string }>(INSERT_ROADMAP, roadmapValues()));
    roadmapA = res.rows[0].id;
    expect(res.rows[0].user_id).toBe(USER_A);
  });

  it("pemilik melihat roadmap-nya, pengguna lain tidak", async () => {
    expect(await asUser(USER_A, () => count("select count(*) as n from public.roadmaps"))).toBe(1);
    expect(await asUser(USER_B, () => count("select count(*) as n from public.roadmaps"))).toBe(0);
  });

  it("pengguna B tidak bisa mengubah atau menghapus roadmap A", async () => {
    const update = await asUser(USER_B, () =>
      db.query("update public.roadmaps set title = 'dibajak' where id = $1", [roadmapA]),
    );
    expect(update.affectedRows).toBe(0);
    const del = await asUser(USER_B, () => db.query("delete from public.roadmaps where id = $1", [roadmapA]));
    expect(del.affectedRows).toBe(0);
    const row = await db.query<{ title: string }>("select title from public.roadmaps where id = $1", [roadmapA]);
    expect(row.rows[0].title).toBe(roadmap.title);
  });

  it("pengguna B tidak bisa membuat roadmap atas nama A", async () => {
    await expect(
      asUser(USER_B, () =>
        db.query(
          `insert into public.roadmaps (user_id, title, summary, dream, profile, plan, steps)
           values ($7, $1, $2, $3, $4, $5, $6)`,
          [...roadmapValues(), USER_A],
        ),
      ),
    ).rejects.toThrow(RLS_VIOLATION);
  });

  it("pemilik bisa memperbarui progres, tapi tidak bisa memindahkan kepemilikan", async () => {
    const progress = JSON.stringify({ doneSteps: ["s1"], doneTodos: ["s2#0"] });
    const res = await asUser(USER_A, () =>
      db.query("update public.roadmaps set progress = $1 where id = $2", [progress, roadmapA]),
    );
    expect(res.affectedRows).toBe(1);
    await expect(
      asUser(USER_A, () => db.query("update public.roadmaps set user_id = $1 where id = $2", [USER_B, roadmapA])),
    ).rejects.toThrow(DENIED);
  });

  it("pemilik bisa menyimpan pilihan kalkulator biaya; pengguna lain tidak", async () => {
    const costs = JSON.stringify({ items: { ielts: { included: true, amount: 3500000, qty: 1, estimate: null } } });
    const own = await asUser(USER_A, () => db.query("update public.roadmaps set costs = $1 where id = $2", [costs, roadmapA]));
    expect(own.affectedRows).toBe(1);
    const other = await asUser(USER_B, () => db.query("update public.roadmaps set costs = '{}' where id = $1", [roadmapA]));
    expect(other.affectedRows).toBe(0);
    await expect(
      asUser(USER_A, () => db.query("update public.roadmaps set costs = '[]' where id = $1", [roadmapA])),
    ).rejects.toThrow(/check constraint/);
  });

  it("anon tidak bisa membaca maupun membuat roadmap", async () => {
    await expect(asAnon(() => db.query("select * from public.roadmaps"))).rejects.toThrow(DENIED);
    await expect(asAnon(() => db.query(INSERT_ROADMAP, roadmapValues()))).rejects.toThrow(DENIED);
  });

  it("menolak roadmap dengan jumlah langkah di luar 4–10", async () => {
    const values = roadmapValues();
    values[5] = JSON.stringify(roadmap.steps.slice(0, 3));
    await expect(asUser(USER_A, () => db.query(INSERT_ROADMAP, values))).rejects.toThrow(/check constraint/);
  });

  it("pemilik bisa menghapus roadmap-nya", async () => {
    const { rows } = await asUser(USER_A, () => db.query<{ id: string }>(INSERT_ROADMAP, roadmapValues()));
    const del = await asUser(USER_A, () => db.query("delete from public.roadmaps where id = $1", [rows[0].id]));
    expect(del.affectedRows).toBe(1);
  });
});

describe("RLS project_interests", () => {
  const UPSERT = `
    insert into public.project_interests (project_id, status) values ($1, $2)
    on conflict (user_id, project_id) do update set status = excluded.status
    returning user_id, status`;

  it("pemilik bisa menerima lalu memperbarui penugasan (upsert)", async () => {
    const first = await asUser(USER_A, () => db.query<{ user_id: string }>(UPSERT, ["desain-menu-umkm", "diterima"]));
    expect(first.rows[0].user_id).toBe(USER_A);
    const second = await asUser(USER_A, () => db.query<{ status: string }>(UPSERT, ["desain-menu-umkm", "selesai"]));
    expect(second.rows[0].status).toBe("selesai");
  });

  it("pengguna lain dan anon tidak bisa melihat penugasan A", async () => {
    expect(await asUser(USER_B, () => count("select count(*) as n from public.project_interests"))).toBe(0);
    await expect(asAnon(() => db.query("select * from public.project_interests"))).rejects.toThrow(DENIED);
    await expect(asAnon(() => db.query(UPSERT, ["proyek-anon", "diterima"]))).rejects.toThrow(DENIED);
  });

  it("menolak status di luar daftar", async () => {
    await expect(asUser(USER_A, () => db.query(UPSERT, ["proyek-lain", "iseng"]))).rejects.toThrow(/check constraint/);
  });
});

describe("RLS stories", () => {
  const INSERT_STORY = `
    insert into public.stories (author_name, kind, title, body) values ($1, $2, $3, $4) returning id`;
  const story = ["Rina", "artikel", "Dari Kediri ke remote", "Cerita perjalananku belajar desain dari nol."];
  let storyA: string;

  beforeAll(async () => {
    const res = await asUser(USER_A, () => db.query<{ id: string }>(INSERT_STORY, story));
    storyA = res.rows[0].id;
  });

  it("semua orang bisa membaca cerita, tapi anon tidak melihat user_id", async () => {
    const anonRows = await asAnon(() =>
      db.query<{ title: string }>("select id, author_name, kind, title, body, created_at from public.stories"),
    );
    expect(anonRows.rows.map((r) => r.title)).toContain(story[2]);
    await expect(asAnon(() => db.query("select user_id from public.stories"))).rejects.toThrow(DENIED);
    expect(await asUser(USER_B, () => count("select count(*) as n from public.stories"))).toBe(1);
  });

  it("hanya pemilik yang bisa mengubah dan menghapus; admin hanya memoderasi status", async () => {
    const OTHER = "00000000-0000-4000-8000-00000000000e";
    await db.query("insert into auth.users (id) values ($1) on conflict do nothing", [OTHER]);
    const update = await asUser(OTHER, () => db.query("update public.stories set title = 'dibajak' where id = $1", [storyA]));
    expect(update.affectedRows).toBe(0);
    // USER_B adalah admin (blok "RLS admins"): baris terkena, tapi isinya tidak berubah.
    await asUser(USER_B, () => db.query("update public.stories set title = 'diubah admin' where id = $1", [storyA]));
    const title = await db.query<{ title: string }>("select title from public.stories where id = $1", [storyA]);
    expect(title.rows[0].title).toBe(story[2]);
    const delOther = await asUser(OTHER, () => db.query("delete from public.stories where id = $1", [storyA]));
    expect(delOther.affectedRows).toBe(0);
    const delB = await asUser(USER_B, () => db.query("delete from public.stories where id = $1", [storyA]));
    expect(delB.affectedRows).toBe(0);
    const delA = await asUser(USER_A, () => db.query("delete from public.stories where id = $1", [storyA]));
    expect(delA.affectedRows).toBe(1);
  });

  it("anon tidak bisa menulis cerita", async () => {
    await expect(asAnon(() => db.query(INSERT_STORY, story))).rejects.toThrow(DENIED);
  });

  it("menegakkan batas panjang dan jenis cerita", async () => {
    await expect(
      asUser(USER_A, () => db.query(INSERT_STORY, ["Rina", "artikel", "Judul", "terlalu pendek"])),
    ).rejects.toThrow(/check constraint/);
    await expect(
      asUser(USER_A, () => db.query(INSERT_STORY, ["Rina", "puisi", "Judul ok", story[3]])),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("RLS blog & komunitas", () => {
  const PENULIS = "00000000-0000-4000-8000-0000000000f1";
  const LAIN = "00000000-0000-4000-8000-0000000000f2";
  const ADMIN = USER_B;
  const INSERT = `insert into public.stories (author_name, kind, title, body, summary, tags, contact, status)
    values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, status, published_at`;
  const BODY = "Aku belajar desain dari HP sampai dapat klien pertama dari warung tetangga.";
  const publicCount = (id: string) => asAnon(() => count("select count(*) as n from public.stories where id = $1", [id]));
  let draft = "";

  beforeAll(async () => {
    await db.query("insert into auth.users (id) values ($1), ($2) on conflict do nothing", [PENULIS, LAIN]);
  });

  it("draf hanya terlihat penulis (dan admin); terbit terlihat publik dengan tanggal terbit", async () => {
    const res = await asUser(PENULIS, () =>
      db.query<{ id: string; status: string; published_at: string | null }>(INSERT, ["Rina", "artikel", "Draf ceritaku", BODY, "Ringkas", ["desain"], null, "draf"]),
    );
    draft = res.rows[0].id;
    expect(res.rows[0]).toMatchObject({ status: "draf", published_at: null });
    expect(await publicCount(draft)).toBe(0);
    expect(await asUser(LAIN, () => count("select count(*) as n from public.stories where id = $1", [draft]))).toBe(0);
    expect(await asUser(ADMIN, () => count("select count(*) as n from public.stories where id = $1", [draft]))).toBe(1);

    await asUser(PENULIS, () => db.query("update public.stories set status = 'terbit' where id = $1", [draft]));
    expect(await publicCount(draft)).toBe(1);
    const row = await db.query<{ published_at: string | null }>("select published_at from public.stories where id = $1", [draft]);
    expect(row.rows[0].published_at).not.toBeNull();
  });

  it("anon bisa membaca tag & kontak publik tapi tidak user_id", async () => {
    const rows = await asAnon(() => db.query<{ tags: string[] }>("select tags, contact, summary from public.stories where id = $1", [draft]));
    expect(rows.rows[0].tags).toEqual(["desain"]);
    await expect(asAnon(() => db.query("select user_id from public.stories"))).rejects.toThrow(DENIED);
  });

  it("mentor/komunitas yang terbit wajib punya kontak", async () => {
    await expect(
      asUser(PENULIS, () => db.query(INSERT, ["Rina", "mentor", "Siap bantu belajar desain", BODY, "", [], null, "terbit"])),
    ).rejects.toThrow(/wajib mencantumkan kontak/);
    const ok = await asUser(PENULIS, () =>
      db.query<{ id: string }>(INSERT, ["Rina", "komunitas", "Komunitas desain Malang", BODY, "", ["desain"], "https://instagram.com/desainmalang", "terbit"]),
    );
    expect(await publicCount(ok.rows[0].id)).toBe(1);
  });

  it("admin menurunkan; penulis tidak bisa menerbitkannya ulang, dan statusnya tetap terlihat oleh penulis", async () => {
    await asUser(ADMIN, () => db.query("update public.stories set status = 'diturunkan' where id = $1", [draft]));
    expect(await publicCount(draft)).toBe(0);
    await asUser(PENULIS, () => db.query("update public.stories set status = 'terbit' where id = $1", [draft]));
    expect(await publicCount(draft)).toBe(0);
    const own = await asUser(PENULIS, () => count("select count(*) as n from public.stories where id = $1 and status = 'diturunkan'", [draft]));
    expect(own).toBe(1);
    await asUser(ADMIN, () => db.query("update public.stories set status = 'terbit' where id = $1", [draft]));
    expect(await publicCount(draft)).toBe(1);
  });

  it("penulis tidak bisa membuat cerita langsung berstatus diturunkan atau atas nama orang lain", async () => {
    const res = await asUser(PENULIS, () =>
      db.query<{ status: string }>(INSERT, ["Rina", "artikel", "Status aneh", BODY, "", [], null, "diturunkan"]),
    );
    expect(res.rows[0].status).toBe("draf");
    await expect(
      asUser(PENULIS, () =>
        db.query("insert into public.stories (user_id, author_name, kind, title, body) values ($1, 'X', 'artikel', 'Atas nama lain', $2)", [LAIN, BODY]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("RLS price_estimates", () => {
  const INSERT = `insert into public.price_estimates (resource_id, min_idr, max_idr, unit, source_url)
    values ('azure-fundamentals', 900000, 1200000, 'sekali', 'https://contoh.example/harga')`;

  it("hanya server (role pemilik/secret key) yang bisa menulis; semua orang bisa membaca", async () => {
    await expect(asAnon(() => db.query(INSERT))).rejects.toThrow(DENIED);
    await expect(asUser(USER_A, () => db.query(INSERT))).rejects.toThrow(DENIED);
    await db.query(INSERT); // superuser ≈ service role
    expect(await asAnon(() => count("select count(*) as n from public.price_estimates"))).toBe(1);
    expect(await asUser(USER_B, () => count("select count(*) as n from public.price_estimates"))).toBe(1);
    await expect(
      asUser(USER_A, () => db.query("update public.price_estimates set min_idr = 1 where resource_id = 'azure-fundamentals'")),
    ).rejects.toThrow(DENIED);
  });

  it("menolak sumber non-https dan rentang terbalik", async () => {
    await expect(
      db.query(`insert into public.price_estimates (resource_id, min_idr, max_idr, unit, source_url)
        values ('bnsp-sertifikasi-kompetensi', 1, 2, 'sekali', 'http://tidak-aman.example')`),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(`insert into public.price_estimates (resource_id, min_idr, max_idr, unit, source_url)
        values ('bnsp-sertifikasi-kompetensi', 5, 2, 'sekali', 'https://contoh.example')`),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("idempotensi dengan data yang sudah ada", () => {
  it("setup.sql dijalankan ulang tanpa menghapus data pengguna maupun sumber web", async () => {
    const before = await count("select count(*) as n from public.roadmaps");
    const resourcesBefore = await count("select count(*) as n from public.resources");
    const webBefore = await count("select count(*) as n from public.resources where origin = 'web'");
    expect(webBefore).toBeGreaterThan(0);
    await db.exec(setupSql);
    expect(await count("select count(*) as n from public.roadmaps")).toBe(before);
    expect(await count("select count(*) as n from public.resources")).toBe(resourcesBefore);
    expect(await count("select count(*) as n from public.resources where origin = 'kurasi'")).toBe(RESOURCES.length);
    expect(await count("select count(*) as n from public.resources where origin = 'web'")).toBe(webBefore);
  });

  it("menghapus akun ikut menghapus datanya (cascade)", async () => {
    await db.query("delete from auth.users where id = $1", [USER_A]);
    expect(await count("select count(*) as n from public.roadmaps where user_id = $1", [USER_A])).toBe(0);
    expect(await count("select count(*) as n from public.project_interests where user_id = $1", [USER_A])).toBe(0);
  });
});
